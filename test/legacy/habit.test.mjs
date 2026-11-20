import test from "node:test";
import assert from "node:assert/strict";
import { Log } from "../../src/log.mjs";
import { Asteme } from "../../src/core.mjs";
import { personaPrompt } from "../../plugin/prompt.mjs";

const scope = { userId: "u", agentId: "a", projectId: "p" };
function fixture(t) {
  let clock = Date.parse("2026-11-16T09:00:00Z");
  const log = new Log(":memory:", () => clock);
  t.after(() => log.close());
  const embed = async (texts) => texts.map(() => [1, 0]);
  embed.model = "fixture";
  const core = new Asteme({ log, identity: scope, embed });
  const seq = new Map();
  const say = (text, session = "s", role = "user") => {
    const n = seq.get(session) ?? 0;
    seq.set(session, n + 1);
    log.ingest(scope, session, [{ seq: n, role, kind: `${role}/message`, content: text, occurredAt: log.now() }]);
    return log.events(scope, session).find((e) => e.content === text);
  };
  const tick = (ms = 3600000) => (clock += ms);
  return { log, core, say, tick };
}
const put = (evidence) => ({
  op: "put", kind: "understanding", text: "Lead with the decision for this director",
  reason: "Explicit correction with reason", concrete: "Writing to director",
  general: "Document for a busy decision maker", tested: "One report to this director",
  hypothesis: "Other decision makers not yet tested", certainty: "explicit",
  entities: ["director", "board", "investment", "brief"], evidence: evidence.map((e) => ({ id: e.id, quote: e.content })),
});
// One scene-level outcome. assess() sets the timestamp from the raw evidence,
// so advancing the fixture clock between rounds is what makes it "later".
function outcome(core, say, item, { session, asked, scene, kind = "helped", reason = "The reader found the decision", quote = "found it" }) {
  const request = say(asked, session);
  const trace = core.trace({ request: request.id, scene: { scene, need: "", entities: [] }, delivered: [item] });
  const result = say(`${session}: ${quote}`, `${session}-result`);
  const feedback = { trace: trace.id, item: item.id, kind, reason, evidence: [{ id: result.id, quote: result.content }] };
  const report = core.assess([feedback], [result], [item], [trace]);
  assert.equal(report.applied.length, 1);
  return result;
}
const habit = (item, evidence, extra = {}) => ({
  op: "set", key: "lead-with-decision", text: "Open with the decision, then the reasoning",
  reason: "Worked, or was asked for, in different situations",
  from: [item.id], tested: "Reports and memos to this director",
  hypothesis: "Unclear whether other readers want the same order",
  evidence: evidence.map((e) => ({ id: e.id, quote: e.content })),
  ...extra,
});

test("promotion requires repeated evidence the program can see, not one success", async (t) => {
  const { core, say, tick } = fixture(t);
  const source = say("Director only reads the first three lines", "source");
  core.apply([put([source])], [source]);
  const item = core.items()[0];
  assert.deepEqual(core.promotable(), []);
  outcome(core, say, item, { session: "memo", asked: "Write the decision memo", scene: "Decision memo" });
  assert.deepEqual(core.promotable(), [], "one scene is a case, not a habit");
  outcome(core, say, item, { session: "mail", asked: "Draft the client email", scene: "Client email" });
  assert.equal(core.promotable().length, 1);
  // A revised understanding has no history with the earlier scenes yet.
  tick();
  core.write({ ...item, revision: item.revision + 1 }, "User edit");
  assert.deepEqual(core.promotable(), []);
});

test("explicit corrections in different exchanges satisfy the same gate, and a later dissatisfaction vetoes helped outcomes", async (t) => {
  const { core, say, tick } = fixture(t);
  say("Here is the memo", "a", "assistant");
  const first = say("Put the decision first in every memo, not only this one", "a");
  say("Here is the mail", "b", "assistant");
  const second = say("Decision first again, you keep burying it", "b");
  core.apply([put([first, second])], [first, second]);
  const item = core.items()[0];
  assert.equal(core.promotable()[0].basis, "corrected in distinct exchanges");
  // The same gate is closed when the understanding is inferred rather than explicit.
  core.write({ ...item, certainty: "observed", revision: item.revision + 1 }, "Weaker certainty");
  assert.deepEqual(core.promotable(), []);

  // A second understanding depends on outcomes instead. One later
  // dissatisfaction reopens it, even though the first two scenes agreed.
  const plain = say("Reports and memos read better with the conclusion first", "c");
  const judged = { ...put([plain]), text: "Lead with the conclusion in every report", concrete: "Report opening", general: "Report for a busy reader" };
  core.apply([judged], [plain]);
  const second_item = core.items().find((i) => i.text === judged.text);
  outcome(core, say, second_item, { session: "memo", asked: "Write the memo", scene: "Decision memo" });
  outcome(core, say, second_item, { session: "mail", asked: "Draft the email", scene: "Client email" });
  assert.ok(core.promotable().some((c) => c.item.id === second_item.id));
  tick();
  outcome(core, say, second_item, { session: "notes", asked: "Write the notes", scene: "Meeting notes", kind: "irrelevant", reason: "Wrong for this audience" });
  assert.ok(!core.promotable().some((c) => c.item.id === second_item.id), "later dissatisfaction reopens the question");
});

test("consolidation grounds every habit in cited evidence, is idempotent, and reaches the always-present persona", async (t) => {
  const { core, say, tick } = fixture(t);
  const source = say("Director only reads the first three lines", "source");
  core.apply([put([source])], [source]);
  const item = core.items()[0];
  outcome(core, say, item, { session: "memo", asked: "Write the decision memo", scene: "Decision memo" });
  outcome(core, say, item, { session: "mail", asked: "Draft the client email", scene: "Client email" });
  tick();
  const prompts = [];
  const infer = async (purpose, prompt) => {
    prompts.push([purpose, prompt]);
    return { habits: [habit(item, [source]), habit(item, [source])] };
  };
  const report = await core.consolidate({ infer });
  assert.equal(prompts[0][0], "asteme-habit");
  assert.match(prompts[0][1], /helped in distinct scenes/);
  assert.deepEqual(report.applied.map((a) => a.op), ["set"]);
  assert.equal(core.core().habits["lead-with-decision"], "Open with the decision, then the reasoning");
  assert.match(personaPrompt(core.core()), /Established habits \(confirmed by repeated experience[^)]*\):\n- Open with the decision/);
  assert.equal(core.habitSummary()[0].from[0], item.id);
  assert.equal(core.promotable().length, 0, "an active habit is not promoted twice");
  const again = await core.consolidate({ infer: async () => assert.fail("no candidates, no call") });
  assert.deepEqual(again.applied, []);
});

test("consolidation rejects ungrounded, duplicated, or oversized habits", async (t) => {
  const { core, say, tick } = fixture(t);
  const source = say("Director only reads the first three lines", "source");
  core.apply([put([source])], [source]);
  const item = core.items()[0];
  outcome(core, say, item, { session: "memo", asked: "Write the decision memo", scene: "Decision memo" });
  outcome(core, say, item, { session: "mail", asked: "Draft the client email", scene: "Client email" });
  tick();
  core.apply([{ op: "core", field: "userName", text: "Respected Director", evidence: [{ id: source.id, quote: source.content }] }], [source], { immediate: true });
  const unrelated = say("Something else entirely", "other");
  const report = await core.consolidate({ infer: async () => ({ habits: [
    habit(item, [source], { evidence: [{ id: unrelated.id, quote: unrelated.content }] }),
    habit(item, [source], { text: "x" }),
    habit(item, [source], { text: "Respected Director", key: "user-name-copy" }),
    habit(item, [source], { hypothesis: "", tested: "" }),
  ] }) });
  assert.equal(report.applied.length, 0);
  assert.deepEqual(report.rejected.map((r) => r.reason), [
    "habit evidence is outside the cited understanding",
    "a habit is one short sentence",
    "this is already an explicit core choice",
    "a habit states where it applies and what remains untested",
  ]);
  assert.deepEqual(core.core().habits, {});
});

test("a habit leaves the core when its use proves unhelpful, when the user removes it, or when its source is erased", async (t) => {
  const { core, say, tick } = fixture(t);
  const source = say("Director only reads the first three lines", "source");
  core.apply([put([source])], [source]);
  const item = core.items()[0];
  outcome(core, say, item, { session: "memo", asked: "Write the decision memo", scene: "Decision memo" });
  outcome(core, say, item, { session: "mail", asked: "Draft the client email", scene: "Client email" });
  tick();
  await core.consolidate({ infer: async () => ({ habits: [habit(item, [source])] }) });
  assert.equal(Object.keys(core.core().habits).length, 1);
  // Two later scenes, not one, are needed to demote it again.
  tick();
  outcome(core, say, item, { session: "plan", asked: "Write the plan", scene: "Project plan", kind: "irrelevant", reason: "Order did not matter" });
  assert.deepEqual(core.demotable(), []);
  const evidence = outcome(core, say, item, { session: "notes", asked: "Write the notes", scene: "Meeting notes", kind: "irrelevant", reason: "Order did not matter" });
  assert.equal(core.demotable()[0].basis, "unhelpful in distinct scenes");
  await core.consolidate({ infer: async () => ({ habits: [{ op: "drop", key: "lead-with-decision", reason: "Unhelpful twice", evidence: [{ id: evidence.id, quote: evidence.content }] }] }) });
  assert.deepEqual(core.core().habits, {});
  assert.equal(core.habitSummary()[0].status, "demoted");

  // The source no longer existing removes it even without a model call.
  const survivor = fixture(t);
  const src = survivor.say("Keep replies short", "short");
  survivor.core.apply([put([src])], [src]);
  const short = survivor.core.items()[0];
  outcome(survivor.core, survivor.say, short, { session: "one", asked: "Summarize this", scene: "Summary" });
  outcome(survivor.core, survivor.say, short, { session: "two", asked: "Summarize that", scene: "Digest" });
  survivor.tick();
  await survivor.core.consolidate({ infer: async () => ({ habits: [habit(short, [src], { key: "short-replies", text: "Keep replies short by default" })] }) });
  assert.equal(Object.keys(survivor.core.core().habits).length, 1);
  survivor.log.erase([src.id]);
  assert.deepEqual(survivor.core.core().habits, {});
  assert.deepEqual(survivor.core.habitLog(), {});

  const removed = fixture(t);
  const keep = removed.say("Call me by my role", "role");
  removed.core.apply([put([keep])], [keep]);
  const kept = removed.core.items()[0];
  outcome(removed.core, removed.say, kept, { session: "one", asked: "Draft this", scene: "Draft" });
  outcome(removed.core, removed.say, kept, { session: "two", asked: "Draft that", scene: "Sketch" });
  removed.tick();
  await removed.core.consolidate({ infer: async () => ({ habits: [habit(kept, [keep], { key: "role-address" })] }) });
  removed.core.forgetHabit("role-address");
  assert.deepEqual(removed.core.core().habits, {});
  assert.equal(removed.core.habitSummary()[0].demoteReason, "Removed by the user");
  assert.ok(removed.log.state(`habits:${removed.core.owner}`));
});

