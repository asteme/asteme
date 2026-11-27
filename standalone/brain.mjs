// ASTEME without a host: the same core, opened on a file, for any agent.
//
//   const brain = openBrain({ path, infer, embed, judge });
//   const { note } = await brain.recall({ session, message });   // before the agent answers
//   brain.observe({ session, reply });                            // after it answered
//   await brain.rest();                                           // when idle: read turns in, outcomes, sleep
//
// infer(purpose, prompt, maxTokens) -> parsed JSON, embed(texts, kind) -> vectors
// and the optional judge(state, questions) -> answers are the only ports. With
// a judge and no generative model, recall still works (the message is the cue
// and the judge admits); learning from turns needs infer.
import { Log } from "../src/log.mjs";
import { Asteme, plain } from "../src/core.mjs";
import { standingLines } from "../src/charter.mjs";

const STAGE = "experienced";
export function openBrain({ path = ":memory:", identity = { userId: "local", agentId: "assistant" }, project = "default",
  infer = null, embed = null, judge = null, admission = judge && !infer ? "judge" : "shadow", now } = {}) {
  const log = new Log(path, now), core = new Asteme({ log, identity, embed });
  const scope = { ...identity, projectId: project };
  const none = async () => { throw new Error("No generative model is configured"); };
  const ask = infer ?? none;
  const model = async (purpose, prompt, tokens) => {
    const started = Date.now();
    try { const value = await ask(purpose, prompt, tokens); core.note("call", { purpose, ok: true, ms: Date.now() - started }); return value; }
    catch (e) { if (infer) core.note("call", { purpose, ok: false, ms: Date.now() - started, error: String(e.message).slice(0, 200), ...(e.name === "TimeoutError" ? { timeout: true } : {}) }); throw e; }
  };
  const add = (session, role, content, kind = `${role}/message`, metadata) => {
    const seq = log.cursor(scope, session);
    log.ingest(scope, session, [{ seq, role, kind, content, occurredAt: log.now(), ...(metadata ? { metadata } : {}) }]);
    return log.events(scope, session).at(-1);
  };
  const open = new Set();   // sessions with a turn in progress
  return {
    core, log,
    /** Records the user's message and returns what memory adds to the reply. */
    async recall({ session = "default", message }) {
      if (typeof message !== "string" || !message.trim()) throw new Error("A message is required");
      const request = add(session, "user", message);
      open.add(session);
      const recent = log.events(scope, session).filter(e => e.content && ["user", "assistant", "tool"].includes(e.role)).slice(-8);
      // One model call before the reply, or none when a judge decides.
      const trace = await core.prepare({ request, recent, infer: model, judge, admission, reading: "later" });
      // What the user asked to be held to does not wait to be recalled, and this host has no persona of ours to carry it: it comes with every
      // note, ahead of what was recalled. Not in a conversation the user keeps out of memory.
      const standing = core.quiet(session, project) ? [] : core.standingAsks({ here: project });
      return plain({ request: request.id, note: [standingLines(standing).join("\n"), trace.text].filter(Boolean).join("\n\n"), standing,
        items: trace.delivered.map(i => ({ id: i.id, text: i.text, use: i.use })),
        rounds: (trace.passages ?? []).map(p => ({ id: p.id, at: p.at, use: p.use, said: p.said, replied: p.replied, ...(p.sensitive ? { sensitive: true } : {}) })), error: trace.error ?? null });
    },
    /** Records what the agent said or did, and ends the turn unless told otherwise. */
    observe({ session = "default", reply, tool, end = true }) {
      if (typeof tool === "string" && tool) add(session, "tool", tool, "tool/result");
      if (typeof reply === "string" && reply) add(session, "assistant", reply);
      if (end && open.delete(session)) add(session, "unknown", "", "turn/end");
      return { recorded: true };
    },
    /** Idle work: read finished turns into memory, read outcomes, sleep. Each step is skipped if it cannot run. */
    async rest({ budget = 6 } = {}) {
      const report = { reflected: 0, outcomes: 0, slept: null, errors: [] };
      for (const session of [...open]) { open.delete(session); add(session, "unknown", "", "turn/end"); }
      // The record is searched with or without a model to read turns: what was said is made findable here, needing only the embedder.
      try { report.indexed = await core.indexRecord(); } catch (e) { report.errors.push(`record: ${e.message}`); }
      if (infer) for (const turn of log.pending(identity, STAGE)) {
        try { await core.reflect(turn, model); report.reflected++; } catch (e) { report.errors.push(`reflect: ${e.message}`); }
      }
      try { if (infer) await core.sceneLater({ infer: model }); } catch (e) { report.errors.push(`scene: ${e.message}`); }
      try { if (infer || judge) report.outcomes = (await core.outcomes({ infer: model, judge, mode: infer ? "shadow" : "judge", delay: 0 })).applied.length; } catch (e) { report.errors.push(`outcomes: ${e.message}`); }
      try { if (infer && await core.sleepDue()) report.slept = (await core.sleep({ infer: model, budget })).ran.length; } catch (e) { report.errors.push(`sleep: ${e.message}`); }
      return report;
    },
    /** Looks on purpose through what is remembered and through the record, by meaning and by words. */
    search: async query => plain(await core.seek(query, { here: project })),
    why: id => { const why = core.why(id); if (!why) throw new Error("Unknown memory"); return plain(why); },
    /** The agent's user said how a recalled memory did: helped, irrelevant, wrong or missed. */
    feedback: ({ request, item, kind, note }) => plain(core.userOutcome(request, item, kind, note)),
    diagnose: () => plain(core.diagnose()),
    exportArchive: () => core.exportArchive(),
    importArchive: source => core.importArchive(source),
    diary: options => core.diary(options),
    close: () => log.close(),
  };
}
