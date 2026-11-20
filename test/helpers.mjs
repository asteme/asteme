// Shared fixtures for the behavior tests and the scripted eval.
//
// Two stand-ins replace the model ports, so the loop can be exercised without
// a network: an embedder that knows a small vocabulary of situations, and a
// model whose answers are scripted per purpose.
import { Log } from "../src/log.mjs";
import { Asteme } from "../src/core.mjs";

// Words that belong to the same situation. Two texts are close when they touch
// the same situations, whatever words they use to do it.
export const SITUATIONS = {
  hurried_reader: ["busy", "decision", "maker", "director", "board", "executive", "investor", "skims", "skim", "little", "time", "maintainer"],
  writing: ["writing", "write", "document", "memo", "brief", "report", "pager", "pitch", "preparing", "drafting", "summary"],
  team_notes: ["notes", "minutes", "meeting", "team", "discussion"],
  code: ["code", "refactor", "bug", "migration", "database", "diff", "pull", "patch"],
  home: ["lives", "living", "moved", "city", "tokyo", "osaka", "commute", "office", "relocating"],
  cooking: ["recipe", "dinner", "cooking", "allergy", "peanut", "meal"],
};

/**
 * A deterministic embedder. Every text shares a baseline component, as real
 * sentence embeddings do, so unrelated texts are not orthogonal and the null
 * floor has something to measure against.
 */
export function situationEmbedder(situations = SITUATIONS) {
  const names = Object.keys(situations), spare = 24, dims = 1 + names.length + spare;
  const bucket = text => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % spare;
  const embed = async texts => texts.map(text => {
    const v = new Array(dims).fill(0);
    v[0] = 0.6;
    const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
    let known = false;
    names.forEach((name, n) => { if (situations[name].some(w => words.has(w))) { v[1 + n] = 1; known = true; } });
    if (!known) v[1 + names.length + bucket(text)] = 1;
    const length = Math.hypot(...v);
    return v.map(x => x / length);
  });
  embed.model = "situations";
  return embed;
}

/** A model whose answer to each purpose is scripted: a value, or a function of the prompt's INPUT. */
export function scripted(answers, calls = []) {
  return async (purpose, prompt) => {
    const at = prompt.lastIndexOf("INPUT:");
    const input = at >= 0 ? JSON.parse(prompt.slice(at + 6)) : null;
    calls.push({ purpose, input });
    const answer = answers[purpose.replace("asteme-", "")];
    if (answer === undefined) throw Error(`no scripted answer for ${purpose}`);
    return typeof answer === "function" ? answer(input) : answer;
  };
}

export const scope = { userId: "u", agentId: "a", projectId: "p" };

export function world(t, { embed = situationEmbedder(), start = "2026-11-10T09:00:00Z" } = {}) {
  let clock = Date.parse(start);
  const log = new Log(":memory:", () => clock);
  t?.after(() => log.close());
  const core = new Asteme({ log, identity: scope, embed });
  const seqs = new Map();
  /** Records one message and returns the stored event. */
  const say = (text, session = "s", role = "user", metadata) => {
    const seq = seqs.get(session) ?? 0;
    seqs.set(session, seq + 1);
    log.ingest(scope, session, [{ seq, role, kind: `${role}/message`, content: text, occurredAt: clock, ...(metadata ? { metadata } : {}) }]);
    return log.events(scope, session).at(-1);
  };
  /** Closes the turn, so it becomes pending for reflection. */
  const end = (session = "s") => {
    const seq = seqs.get(session) ?? 0;
    seqs.set(session, seq + 1);
    log.ingest(scope, session, [{ seq, role: "unknown", kind: "turn/end", content: "", occurredAt: clock }]);
  };
  const tick = (ms = 3600000) => (clock += ms);
  const quote = e => [{ id: e.id, quote: e.content }];
  /** Stores an understanding directly from one record. */
  const learn = (e, fields) => {
    const report = core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated by the user",
      tested: "One occasion", hypothesis: "Other occasions are untested", entities: [], evidence: quote(e), ...fields }], [e]);
    if (report.rejected.length) throw Error(report.rejected[0].reason);
    return core.item(report.applied[0].id);
  };
  /** One attended request: the scene is read as given and the listed items are admitted. */
  const attend = async (text, { session = "s", scene, admit = [], calls } = {}) => {
    const request = say(text, session);
    const trace = await core.prepare({ request, recent: [request], infer: scripted({
      scene: { scene, need: "", entities: [] },
      select: { decisions: admit.map(a => ({ use: "silent", reason: "It changes this reply", ...a })) },
    }, calls) });
    return { request, trace };
  };
  /** Reads the outcome of the newest unassessed delivery from the user's later words. */
  const settle = (later, feedback) => core.outcomes({ infer: scripted({
    outcome: input => ({ feedback: input.delivered.map(d => ({ item: d.id, reason: "The later message shows it", evidence: quote(later), ...feedback })) }),
  }) });
  return { log, core, say, end, tick, quote, learn, attend, settle, now: () => clock };
}

export const DIRECTOR = {
  text: "Lead with the decision for this director", about: "how this director reads",
  concrete: "Writing a memo for the director", general: "Writing a document for a busy decision maker",
};
