import test from "node:test";
import assert from "node:assert/strict";
import { Log } from "../../src/log.mjs";
import { Asteme } from "../../src/core.mjs";
import { classify, isSpecificAnchor } from "../../src/policy.mjs";

const scope = { userId: "u", agentId: "a", projectId: "p" };
function fixture(t) {
  const log = new Log(":memory:", () => Date.parse("2026-11-16T09:00:00Z"));
  t.after(() => log.close());
  const embed = async (texts) => texts.map(() => [1, 0]);
  embed.model = "fixture";
  const core = new Asteme({ log, identity: scope, embed });
  const seqs = new Map();
  const say = (text, session = "s") => {
    const seq = seqs.get(session) ?? 0;
    seqs.set(session, seq + 1);
    log.ingest(scope, session, [{ seq, role: "user", kind: "user/message", content: text, occurredAt: log.now() }]);
    return log.events(scope, session).find((e) => e.content === text);
  };
  return { log, core, say };
}
const put = (e, over = {}) => ({
  op: "put", kind: "understanding", text: "Assessed credential extraction and UAC bypass",
  reason: "Security review asked about it", concrete: "Security assessment request",
  general: "Permission-related assessment", tested: "One assessment",
  hypothesis: "Other environments are untested", certainty: "explicit",
  evidence: [{ id: e.id, quote: e.content }], ...over,
});

test("the screen recognises the English categories it promises", () => {
  assert.equal(classify("write the password and private key into the config"), "credentials");
  assert.equal(classify("privilege escalation and UAC bypass"), "security");
  assert.equal(classify("diagnosis and medication schedule"), "health");
  assert.equal(classify("salary, loan and debt"), "money");
  assert.equal(classify("home address and phone number"), "privacy");
  assert.equal(classify("refactor the memory plugin"), null);
});

test("an anchor made only of the instruction is not specific", () => {
  assert.equal(isSpecificAnchor("take over this session"), false);
  assert.equal(isSpecificAnchor("please continue the task"), false);
  assert.equal(isSpecificAnchor("restart and look"), false);
  assert.equal(isSpecificAnchor("board investment brief"), true);
  assert.equal(isSpecificAnchor("XTool ad budget"), true);
});

test("a sensitive record is remembered but not brought up unless the request speaks about it", async (t) => {
  const { core, say } = fixture(t), e = say("Assessed credential extraction and UAC bypass");
  core.apply([put(e)], [e]);
  const item = core.items()[0];
  assert.ok(item.sensitive.includes("security") || item.sensitive.includes("credentials"));
  const scene = { scene: "Refactor the memory plugin", need: "", entities: [] };
  const unrelated = say("Help me refactor the memory plugin", "task");
  assert.equal((await core.candidates(scene, core.log.now(), unrelated)).length, 0);
  const matching = say("Review the UAC bypass assessment again", "ask");
  assert.equal((await core.candidates(scene, core.log.now(), matching)).length, 1);
  assert.equal(core.search("UAC bypass").understanding.length, 1);
});

test("a delivery whose anchor is only the instruction is dropped", async (t) => {
  const { core, say } = fixture(t), e = say("User asked to take over the XTool ad project", "ops");
  core.apply([put(e, {
    text: "User asked to take over the XTool ad project",
    concrete: "Ad operations handover", general: "Project handover",
    tested: "One handover", hypothesis: "Other projects are untested",
  })], [e]);
  const item = core.items()[0];
  const run = async (requestText, anchor) => core.prepare({
    request: say(requestText, "ask-" + anchor),
    recent: [],
    infer: async (purpose) => purpose === "asteme-scene"
      ? { scene: "handover", need: "", entities: [] }
      : { decisions: [{ id: item.id, use: "silent", reason: "looks related", anchor }] },
  });
  const instruction = await run("Take over this session", "Take over this session");
  assert.equal(instruction.delivered.length, 0);
  assert.equal(instruction.decisions[0].dropped, "no exact anchor");
  const restart = await run("Restart and look", "Restart and look");
  assert.equal(restart.delivered.length, 0);
  const content = await run("Wrap up the XTool ad project", "XTool ad project");
  assert.equal(content.delivered.length, 1);
});
