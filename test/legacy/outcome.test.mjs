import test from "node:test";
import assert from "node:assert/strict";
import { Log } from "../../src/log.mjs";
import { Asteme } from "../../src/core.mjs";

const scope = { userId: "u", agentId: "a", projectId: "p" };
function fixture(t) {
  let clock = Date.parse("2026-11-16T09:00:00Z");
  const log = new Log(":memory:", () => clock);
  t.after(() => log.close());
  const embed = async (texts) => texts.map(() => [1, 0]);
  embed.model = "fixture";
  const core = new Asteme({ log, identity: scope, embed });
  const seqs = new Map();
  const say = (text, session = "s", role = "user") => {
    const seq = seqs.get(session) ?? 0;
    seqs.set(session, seq + 1);
    log.ingest(scope, session, [{ seq, role, kind: `${role}/message`, content: text, occurredAt: clock }]);
    return log.events(scope, session).find((e) => e.content === text);
  };
  const tick = (ms = 3600000) => (clock += ms);
  return { log, core, say, tick };
}
const put = (e) => ({
  op: "put", kind: "understanding", text: "Lead with the decision for this director",
  reason: "Explicit correction with reason", concrete: "Writing to director",
  general: "Document for a busy decision maker", tested: "One report to this director",
  hypothesis: "Other decision makers not yet tested", certainty: "explicit",
  entities: ["director", "board", "investment", "brief"], evidence: [{ id: e.id, quote: e.content }],
});
function prepared(core, say, item, requestText = "Prepare a board investment brief") {
  const request = say(requestText, "conv");
  const trace = core.trace({
    request: request.id,
    scene: { scene: "Writing for a busy decision maker", need: "audience", entities: [] },
    delivered: [{ ...item, use: "silent", relevance: "changes the structure", anchor: "board investment brief" }],
    text: "Selected experience",
  });
  return { request, trace };
}

test("a delivery without an exact anchor in the present input is dropped", async (t) => {
  const { core, say } = fixture(t), e = say("Director only reads the first three lines", "seed");
  core.apply([put(e)], [e]);
  const item = core.items()[0];
  const run = (decision) => core.prepare({
    request: say("Prepare a board investment brief", "ask-" + decision.anchor + decision.use),
    recent: [],
    embed: undefined,
    infer: async (purpose) => purpose === "asteme-scene"
      ? { scene: "Writing for a busy decision maker", need: "", entities: [] }
      : { decisions: [decision] },
  });
  const base = { id: item.id, use: "silent", reason: "changes the structure" };
  assert.equal((await run({ ...base })).delivered.length, 0, "no anchor");
  assert.equal((await run({ ...base, anchor: "something else entirely" })).delivered.length, 0, "wrong anchor");
  const ok = await run({ ...base, anchor: "board investment brief" });
  assert.equal(ok.delivered.length, 1);
  assert.equal(ok.delivered[0].anchor, "board investment brief");
});

test("outcomes are read from later records only, and a silent continuation is not evidence", async (t) => {
  const { core, say, tick } = fixture(t), e = say("Director only reads the first three lines", "seed");
  core.apply([put(e)], [e]);
  const item = core.items()[0];
  const { trace } = prepared(core, say, item);
  tick(1000);
  assert.equal(core.outcomeCandidates().length, 0, "too recent to review");
  tick(120000);
  const later = say("That worked; the director approved it immediately", "conv");
  assert.equal(core.outcomeCandidates().length, 1);
  const prompts = [];
  const report = await core.outcomes({ infer: async (purpose, prompt) => {
    prompts.push([purpose, prompt]);
    return { feedback: [{ item: item.id, kind: "helped", reason: "The director approved it", evidence: [{ id: later.id, quote: later.content }] }] };
  } });
  assert.equal(prompts[0][0], "asteme-outcome");
  assert.match(prompts[0][1], /That worked/);
  assert.equal(report.applied.length, 1);
  assert.equal(core.feedback().length, 1);
  assert.equal(core.feedback()[0].request, trace.request);
  assert.equal(core.outcomeCandidates().length, 0, "the same later record is not reviewed twice");
  // A further message is new evidence, so the trace becomes reviewable again.
  tick();
  say("Second thought, it was too short", "conv");
  assert.equal(core.outcomeCandidates().length, 0, "already assessed for this item");
});

test("an outcome must cite the later record that produced it", async (t) => {
  const { core, say, tick } = fixture(t), e = say("Director only reads the first three lines", "seed");
  core.apply([put(e)], [e]);
  const item = core.items()[0];
  prepared(core, say, item);
  tick(); tick();
  say("That worked", "conv");
  const report = await core.outcomes({ infer: async () => ({ feedback: [
    { item: item.id, kind: "helped", reason: "no quote", evidence: [{ id: "not-a-record", quote: "nope" }] },
    { item: "not-delivered", kind: "helped", reason: "wrong item", evidence: [] },
  ] }) });
  assert.equal(report.applied.length, 0);
  assert.equal(core.feedback().length, 0);
  assert.equal(report.rejected.length, 2);
});


