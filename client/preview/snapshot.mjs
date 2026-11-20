import { DEFAULTS } from "../../plugin/tunables.mjs";
// Writes preview/engine.snapshot.json: what the panel would receive after the
// two weeks in sandbox/story.mjs plus a few more days, produced by the real
// core through the same code path the plugin uses (plugin/settings.mjs).
// Nothing in it is hand-written; change the story and run this again.
//
//   node client/preview/snapshot.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { operations } from "../../plugin/settings.mjs";
import { story } from "../../sandbox/story.mjs";
import { scope, scripted, DIRECTOR } from "../../test/helpers.mjs";

const DAY = 86400000;
const w = await story();
const { core, log, say, end, tick, quote, learn, attend, settle, a, lesson } = w;

// A few more days, so every state the panel can show is present.
// A second success in a different situation: close to becoming a rule, then made one.
tick(DAY);
await attend("Write the brief for the board", { session: "board", scene: "Writing a brief for the board", admit: [{ id: a.id, anchor: "brief for the board", reason: "The board decides from the first paragraph" }] });
say("Decision first: fund the second team.", "board", "assistant"); tick(120000);
await settle(say("The board agreed at once", "board"), { kind: "helped", applied: "yes", reply_quote: "Decision first" });
await core.consolidate({ infer: scripted({ habit: { habits: [{ op: "set", key: "decision-first", text: "For a reader who will not read on, open with the decision",
  reason: "It worked for a one-pager and for a board brief", from: [a.id], tested: "An investor one-pager and a board brief", hypothesis: "Other hurried readers", evidence: a.evidence }] } }) });

// What the team wants, learned from the complaint on day 4.
const complaint = log.events(scope, "thu").find(e => e.content.startsWith("No. The team"));
const notes = learn(complaint, { text: "Keep team meeting notes in the order things were discussed", about: "team notes", reason: "The team said so after notes were reordered",
  concrete: "Writing meeting notes for the team", general: "Drafting minutes of a team discussion" });

// Two memories that disagree, and nobody has settled it.
tick(DAY);
const tea = learn(say("I drink tea, never coffee", "drinks"), { text: "Drinks tea, not coffee", about: "drinks", concrete: "Cooking dinner with a recipe", general: "Planning a meal" });
const order = say("Order me a coffee for the 3pm call", "drinks-2");
core.apply([{ op: "put", kind: "understanding", certainty: "observed", reason: "Asked for one", tested: "One order", hypothesis: "May be an exception", entities: [], evidence: quote(order),
  text: "Orders coffee for afternoon calls", about: "what the user orders", concrete: "Planning a meal out", general: "Cooking or ordering a meal", conflicts: [tea.id] }], [order]);

// A promise with an ending.
const promise = say("Remind me to send the contract to legal before Friday", "promise");
core.apply([{ op: "put", kind: "concern", certainty: "explicit", reason: "Asked to be reminded", text: "Send the contract to legal", about: "contract",
  concrete: "Writing an email about the contract", general: "Preparing a document for legal review", tested: "Asked once", hypothesis: "", entities: ["legal"],
  closure: { when: "The contract is sent, or the user says it is no longer needed" }, evidence: quote(promise) }], [promise]);

// A fact about a changeable state, then enough time for it to need confirming.
const office = learn(say("I am working from the Osaka office this month", "office"), { text: "Working from the Osaka office", about: "where the user works", volatility: "state",
  reason: "Mentioned in passing", concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in" });
// Something that was read in a tool's output, not said by the user.
const readme = say("Releases are cut from the release branch every second Tuesday.", "repo", "tool", { tool: { phase: "result", name: "read", execution: "completed" } });
core.apply([{ op: "put", kind: "understanding", certainty: "observed", reason: "Read in the repository's release notes", text: "Releases are cut from the release branch every second Tuesday",
  about: "release schedule", concrete: "Planning when a change can ship", general: "Scheduling work around a fixed release day", tested: "Read once in the repository",
  hypothesis: "Whether the schedule is still followed", entities: [], evidence: quote(readme) }], [readme]);
// Something that turned out wrong and is waiting to be looked at.
await attend("Plan the commute to the office", { session: "commute", scene: "Planning a commute to the office", admit: [{ id: w.osaka.id, anchor: "commute to the office", reason: "The route starts from where they live" }] });
say("From Osaka station, take the loop line.", "commute", "assistant"); tick(120000);
core.userOutcome(log.events(scope, "commute")[0].id, w.osaka.id, "wrong", "I am staying in Kyoto this week");
tick(40 * DAY);

// The last reply: one memory used, one held back, one considered and left out, one a clear match with no answer.
const last = say("Write up the notes from this morning's team meeting", "today");
await core.prepare({ request: last, recent: [last], infer: scripted({
  scene: { scene: "Writing meeting notes for the team", need: "how this team wants its notes", entities: [] },
  select: input => ({ decisions: [
    { id: notes.id, use: "silent", reason: "The team wants the discussion in order", anchor: "team meeting", expect: "The notes are accepted without reordering" },
    ...input.candidates.filter(c => c.id === lesson.id).map(c => ({ id: c.id, use: "not-now", reason: "These notes are a record, not something to decide from" })),
  ] }),
}) });
say("Notes, in the order discussed: caching, API naming, rollout.", "today", "assistant"); end("today");

const host = {
  ctx: { llm: { listProviders: () => [{ id: "example-provider", name: "Example Provider" }], listModels: async () => [{ id: "example-model", name: "Example Model" }] } },
  log, core, identity: scope, stage: "experienced",
  config: { enabled: true, learningProvider: "", learningModel: "" },
  settings() { const { enabled, learningProvider, learningModel } = this.config; return { enabled, learningProvider, learningModel }; },
  notice: "", lastError: "", retryAt: 0, retries: new Map(), background: null, run: p => p, drain: async () => {},
};
// A few model calls on record, as a host would leave them, so the health
// lines have something to show.
for (const ms of [2100, 1800, 3900, 2600]) core.note("call", { purpose: "asteme-scene", ok: true, ms });
core.note("call", { purpose: "asteme-select", ok: true, ms: 3100 });
const request = operations(host);
const snapshot = await request("snapshot", { projectId: "p" });
// What a real host adds: where copies are kept, and an example of each.
snapshot.keeping = { directory: "~/.dsh/data/dsh-asteme/3f9a", every: 24, last: { at: snapshot.diagnosis.at - 5 * 3600000, name: "memory-auto.sqlite" },
  backups: [5, 29, 53].map(h => ({ name: `memory-${h}-auto.sqlite`, at: snapshot.diagnosis.at - h * 3600000, bytes: 412000 + h * 900 })) };
snapshot.keeping.saved = [30, 200].map(h => ({ name: `asteme-archive-${h}`, path: `~/.dsh/data/dsh-asteme/3f9a/exports/asteme-archive-${h}/archive.json`, at: snapshot.diagnosis.at - h * 3600000, bytes: 96000 + h * 40, kind: "archive" }));
snapshot.keeping.usage = { store: 19.2e6, backups: 26.4e6, exports: 8.1e6 };
snapshot.judge = null;
snapshot.judgeKeySet = false;
snapshot.selfcheck = { running: null, last: null };
snapshot.settings = { ...DEFAULTS, ...snapshot.settings };
const why = {}, sources = {};
for (const item of snapshot.memory.state.items) {
  why[item.id] = await request("why", { item: item.id });
  sources[item.id] = (await request("sources", { item: item.id, projectId: "p" })).events;
}
writeFileSync(fileURLToPath(new URL("./engine.snapshot.json", import.meta.url)), JSON.stringify({ snapshot, why, sources }, null, 1) + "\n");
const r = snapshot.review;
console.log(`wrote client/preview/engine.snapshot.json: ${snapshot.memory.state.items.length} memories, ${snapshot.learning.habits.length} rule, ` +
  `waiting for the user: ${r.unsure.length} unsure, ${r.stale.length} out of date, ${r.disputes.length} dispute; last reply used ${snapshot.memory.delivery.delivered.length}, held back ${snapshot.memory.delivery.heldBack?.suppressed.length ?? 0}`);
log.close();
