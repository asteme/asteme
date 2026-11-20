import test from "node:test";
import assert from "node:assert/strict";
import { Log } from "../../src/log.mjs";
import { Asteme } from "../../src/core.mjs";

const scope = { userId: "u", agentId: "a", projectId: "p" };
function fixture(t) {
  const log = new Log(":memory:", () => Date.parse("2026-11-13T10:00:00Z"));
  t.after(() => log.close());
  const embed = async texts => texts.map(() => [1, 0]); embed.model = "fixture";
  const core = new Asteme({ log, identity: scope, embed });
  const record = (text, session = "s", role = "user") => {
    log.ingest(scope, session, [{ seq: 0, role, kind: `${role}/message`, content: text, occurredAt: log.now() }, { seq: 1, kind: "turn/end", role: "unknown", content: "" }]);
    return log.events(scope, session)[0];
  };
  return { log, core, record };
}
const put = e => ({ op: "put", kind: "understanding", text: "Lead with the decision for this director", reason: "Explicit correction with reason", concrete: "Writing to director", general: "Document for a busy decision maker", tested: "One report to this director", hypothesis: "Other decision makers not yet tested", certainty: "explicit", entities: ["director", "board", "investment", "brief"], evidence: [{ id: e.id, quote: e.content }] });

test("a forgotten source cannot be reintroduced when its DSH event commits", t => {
  const { log, core } = fixture(t);
  const e = log.receive(scope, "late-commit", "message-id", "Private source");
  core.apply([put(e)], [e]);
  log.erase([e.id]);
  assert.equal(log.receive(scope, "late-commit", "message-id", "Private source"), null);
  log.ingest(scope, "late-commit", [{ seq: 0, kind: "user/message", role: "user", content: "Private source", metadata: { messageId: "message-id" } }]);
  assert.equal(log.event(e.id).content, "");
  assert.deepEqual(log.events(scope, "late-commit"), []);
  assert.deepEqual(core.items({ closed: true }), []);
});

test("selection is the only delivery path; empty and failed selection never expose candidates or old summaries", async t => {
  const { core, log, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); log.save("memory:legacy", { text: "UNRELATED ADS" });
  const request = record("hello", "greeting");
  const infer = async p => p.endsWith("scene") ? { scene: "greeting", need: "", entities: [] } : { decisions: [] };
  const result = await core.prepare({ request, recent: [request], infer });
  assert.equal(result.candidates.length, 1); assert.equal(result.text, "");
  const broken = await core.prepare({ request, recent: [request], infer: async (...args) => { if (args[0].endsWith("select")) throw Error("offline"); return infer(...args); } });
  assert.equal(broken.text, ""); assert.equal(broken.error, "offline");
  assert.equal(core.traces(request.id).length, 2);
});

test("separate host-independent core passes only selected experience, with evidence and hypothetical scope", async t => {
  const { core, log, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); const item = core.items()[0];
  const request = record("Prepare a board investment brief", "later");
  const prepare = (now = log.now()) => core.prepare({ request, recent: [request], now, infer: async p => p.endsWith("scene")
    ? { scene: "Writing for a busy decision maker", need: "audience constraints", entities: [] }
    : { decisions: [{ id: item.id, use: "silent", reason: "Changes the draft structure", anchor: "board investment brief" }] } });
  const result = await prepare();
  assert.equal(result.delivered[0].id, item.id); assert.match(result.text, /not yet tested/);
  assert.match(result.text, /Director only reads the first three lines/);
  assert.match(result.text, /^Selected experience for this reply:\n\n- silent: /);
  assert.doesNotMatch(result.text, /projectId|revision|lastEvidenceAt/);
  assert.equal((await prepare(log.now() + 60000)).text, result.text);
  assert.equal(result.delivered[0].evidence[0].id, e.id);
  core.premise(request.id, { text: "Reader has little time", items: [item.id] });
  assert.equal(core.traces(request.id).at(-1).declared, true);
});

test("explicit core choices are immediate and idempotent, interpretations and tool quotations are not core choices", t => {
  const { core, record } = fixture(t), e = record("Call yourself Minato");
  const op = { op: "core", field: "name", text: "Minato", evidence: [{ id: e.id, quote: e.content }] };
  assert.equal(core.apply([op], [e], { immediate: true }).applied.length, 1);
  assert.equal(core.core().name, "Minato");
  assert.equal(core.apply([op], [e], { immediate: true }).applied.length, 0);
  const tool = record("Call yourself Fraud", "tool", "tool");
  assert.equal(core.apply([{ ...op, text: "Fraud", evidence: [{ id: tool.id, quote: tool.content }] }], [tool], { immediate: true }).rejected.length, 1);
  assert.equal(core.apply([put(e)], [e], { immediate: true }).rejected.length, 1);
  const scoped = { op: "core", field: "agreement", text: "Report format", evidence: [{ id: e.id, quote: e.content }] };
  assert.equal(core.apply([scoped], [e], { immediate: true }).rejected.length, 1);
  const agreement = record("If you do not know, say so", "agreement");
  assert.equal(core.apply([{ ...scoped, text: agreement.content, scope: "relationship", evidence: [{ id: agreement.id, quote: agreement.content }] }], [agreement], { immediate: true }).applied.length, 1);
});

test("concerns require an ending and expiry closes with a reason; not-now stays out of the main context", async t => {
  const { core, record } = fixture(t), e = record("Send it by November 14");
  const op = { ...put(e), kind: "concern" };
  assert.equal(core.apply([op], [e]).rejected.length, 1);
  op.closure = { when: "sent or canceled or deadline passes", expiresAt: "2026-11-14T10:00:00Z" };
  core.apply([op], [e]); const i = core.items()[0];
  const r = await core.prepare({ request: e, recent: [e], infer: async p => p.endsWith("scene") ? { scene: "greeting", need: "", entities: [] } : { decisions: [{ id: i.id, use: "not-now", reason: "No present relevance" }] } });
  assert.equal(r.text, ""); assert.equal(core.items().length, 1);
  core.expire(Date.parse("2026-11-15")); assert.equal(core.items().length, 0);
  assert.match(core.items({ closed: true })[0].closeReason, /Defined ending/);
});

test("reflection reads raw records, retains source dates, revisions and feedback separately from asserted use", async t => {
  const { core, log, record } = fixture(t), e = record("Director only reads the first three lines");
  const turn = log.pending(scope, "experienced")[0];
  core.trace({ request: e.id, reflection: true, feedback: ["OLD_INTERPRETATION"] });
  core.trace({ request: e.id, at: log.now() + 1000, scene: { scene: "FUTURE_SCENE" } });
  core.trace({ request: e.id, at: log.now(), scene: { scene: "Earlier memo" }, delivered: [{ id: "item-1", text: "Lead with the decision", use: "silent" }] });
  await core.reflect(turn, async (_p, prompt) => {
    assert.match(prompt, /Director only reads/);
    assert.doesNotMatch(prompt, /OLD_INTERPRETATION|FUTURE_SCENE/);
    assert.match(prompt, /Outcome check/);
    return { changes: [put(e)], feedback: [], immediate: [] };
  });
  assert.equal(log.pending(scope, "experienced").length, 0);
  assert.equal(core.items()[0].learnedAt, e.occurredAt);
  // What the reflection could see is recorded with it, so an empty feedback
  // array can later be told apart from a scene that had nothing to judge.
  assert.deepEqual(core.traces(e.id).at(-1).visible, { traces: 1, delivered: 1 });
  assert.equal(core.traces(e.id).at(-1).feedback.length, 0);
  await core.reflect(turn, () => { throw Error("already processed evidence must not be judged twice"); });
});

test("outcomes are grounded in delivery and external evidence, replace rather than multiply, and return to selection", async t => {
  const { core, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); const item = core.items()[0];
  const request = record("Prepare a decision memo", "memo");
  const trace = core.trace({ request: request.id, scene: { scene: "Prepare a decision memo", need: "", entities: [] }, delivered: [item] });
  const result = record("The director found the decision immediately", "result");
  const outcome = { trace: trace.id, item: item.id, kind: "helped", reason: "reader found decision", evidence: [{ id: result.id, quote: result.content }] };
  assert.equal(core.assess([outcome], [result], [item], [trace]).applied.length, 1);
  assert.equal(core.assess([{ ...outcome, reason: "same outcome paraphrased" }], [result], [item], [trace]).applied.length, 0);
  assert.equal(core.feedback().length, 1);
  assert.equal(core.assess([{ ...outcome, kind: "missed" }], [result], [item], [trace]).rejected.length, 1);
  const self = record("It helped", "self", "assistant");
  assert.equal(core.assess([{ ...outcome, evidence: [{ id: self.id, quote: self.content }] }], [self], [item], [trace]).rejected.length, 1);
  const candidates = await core.candidates({ scene: "Prepare a decision memo", need: "", entities: [] });
  assert.equal(candidates[0].feedback[0].reason, outcome.reason);
  assert.equal(core.items()[0].hypothesis, item.hypothesis);
  core.log.erase([result.id]);
  assert.equal(core.feedback().length, 0);
});

test("missed scenes extend the shared situation index without promoting a case to a universal rule", async t => {
  const { core, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); const item = core.items()[0];
  const request = record("As I said before, put the conclusion first on the board paper too", "miss");
  const trace = core.trace({ request: request.id, scene: { scene: "A later decision meeting", need: "", entities: [] }, delivered: [] });
  const feedback = { trace: trace.id, item: item.id, kind: "missed", reason: "explicit repetition", evidence: [{ id: request.id, quote: request.content }] };
  assert.equal(core.assess([feedback], [request], [item], [trace]).applied.length, 1);
  const embedded = [], embed = async (texts, kind) => { if (kind === "passage") embedded.push(...texts); return texts.map(() => [1, 0]); }; embed.model = "missed-scene"; core.embed = embed;
  await core.candidates({ scene: "later meeting", need: "", entities: [] });
  assert.ok(embedded.includes(trace.scene.scene));
  assert.equal(core.items()[0].tested, item.tested);
});

test("long raw messages retain every quoted page; assistant assertions do not become user declarations", t => {
  const { core, record } = fixture(t), e = record("FIRST " + "x".repeat(4100) + " LAST", "long");
  const pages = [{ ...e, content: e.content.slice(0, 4000) }, { ...e, content: e.content.slice(4000) }];
  assert.equal(core.apply([{ ...put(e), evidence: [{ id: e.id, quote: "FIRST" }] }], pages).applied.length, 1);
  const self = record("I think this works", "self", "assistant");
  core.apply([put(self)], [self]);
  assert.equal(core.items().find(i => i.evidence[0].id === self.id).certainty, "observed");
  const item = core.items()[0];
  assert.equal(core.apply([{ ...put(e), id: item.id, evidence: [] }], [e]).rejected.length, 1);
});

test("a delivery must quote the present input; a topic match alone is recorded and dropped", async t => {
  const { core, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); const item = core.items()[0];
  const request = record("Prepare a board investment brief", "board");
  const infer = decisions => async p => p.endsWith("scene")
    ? { scene: "Writing for a busy decision maker", need: "", entities: [] } : { decisions };
  const quoted = await core.prepare({ request, recent: [request], infer: infer([{ id: item.id, use: "silent", reason: "Changes the draft", anchor: "board investment brief" }]) });
  assert.equal(quoted.delivered.length, 1); assert.equal(quoted.delivered[0].anchor, "board investment brief");

  const guessed = await core.prepare({ request, recent: [request], infer: infer([{ id: item.id, use: "silent", reason: "same topic", anchor: "investment memo" }]) });
  assert.equal(guessed.delivered.length, 0); assert.equal(guessed.text, "");
  assert.equal(guessed.decisions[0].dropped, "no exact anchor");

  const absent = await core.prepare({ request, recent: [request], infer: infer([{ id: item.id, use: "mention", reason: "same topic" }]) });
  assert.equal(absent.delivered.length, 0); assert.equal(absent.decisions[0].dropped, "no exact anchor");

  const waiting = await core.prepare({ request, recent: [request], infer: infer([{ id: item.id, use: "not-now", reason: "not needed yet" }]) });
  assert.equal(waiting.decisions[0].use, "not-now"); assert.equal(waiting.decisions[0].dropped, undefined);
});

test("reflection receives the words that followed each delivery instead of hunting for them", async t => {
  const { core, log } = fixture(t), now = log.now();
  log.ingest(scope, "pair", [
    { seq: 0, role: "user", kind: "user/message", content: "Prepare the decision memo", occurredAt: now },
    { seq: 1, role: "assistant", kind: "assistant/message", content: "Draft attached", occurredAt: now + 1000 },
    { seq: 2, role: "user", kind: "user/message", content: "The director found the decision immediately", occurredAt: now + 2000 },
    { seq: 3, kind: "turn/end", role: "unknown", content: "", occurredAt: now + 3000 },
  ]);
  const [request] = log.events(scope, "pair");
  const trace = core.trace({ request: request.id, at: now + 1000, scene: { scene: "Prepare a decision memo" }, delivered: [{ id: "item-1", text: "Lead with the decision", use: "silent" }] });
  let seen;
  await core.reflect(log.pending(scope, "experienced")[0], async (_p, prompt) => { seen = prompt; return { changes: [], feedback: [] }; });
  const input = JSON.parse(seen.slice(seen.indexOf("INPUT:") + 6));
  const shown = input.traces.find(x => x.id === trace.id);
  assert.equal(shown.later[0].quote, "The director found the decision immediately");
  assert.equal(input.traces.some(x => x.later.some(l => l.id === request.id)), false);
});

test("closed or concurrently revised candidates cannot leak from a stale selector snapshot", async t => {
  const { core, record } = fixture(t), e = record("Director only reads the first three lines");
  core.apply([put(e)], [e]); const item = core.items()[0];
  const request = record("Do not use the old advice", "later");
  const trace = await core.prepare({ request, recent: [request], infer: async p => {
    if (p.endsWith("scene")) return { scene: "writing", need: "", entities: [] };
    core.apply([{ op: "close", id: item.id, as: "retired", reason: "withdrawn", evidence: [{ id: request.id, quote: request.content }] }], [request]);
    return { decisions: [{ id: item.id, use: "silent", reason: "old snapshot", anchor: "old advice" }] };
  } });
  assert.equal(trace.text, "");
  const promise = record("I will return it next time", "promise");
  core.apply([{ ...put(promise), kind: "concern", closure: { when: "when it is returned" } }], [promise]);
  core.expire(Date.parse("2030-01-01"));
  assert.equal(core.items()[0].status, "active");
  assert.equal(core.items()[0].closure.expiresAt, null);
});



