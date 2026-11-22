// The panel's RPC surface, driven against the core without DeepSeek Harness.
// plugin/settings.mjs imports nothing from the host, so a small stand-in for
// the host object is enough to check what the panel reads and what it can do.
import test from "node:test";
import assert from "node:assert/strict";
import { operations } from "../plugin/settings.mjs";
import { personaPrompt } from "../plugin/prompt.mjs";
import { story } from "../sandbox/story.mjs";
import { scope, scripted } from "./helpers.mjs";

async function panel(t) {
  const state = await story();
  t.after(() => state.log.close());
  const host = {
    ctx: { llm: { listProviders: () => [{ id: "example", name: "Example" }], listModels: async () => [{ id: "small", name: "Small" }] } },
    log: state.log, core: state.core, identity: scope, stage: "experienced",
    config: { enabled: true, learningProvider: "", learningModel: "" },
    settings() { const { enabled, learningProvider, learningModel } = this.config; return { enabled, learningProvider, learningModel }; },
    notice: "", lastError: "", retryAt: 0, retries: new Map(), background: null, run: p => p, drain: async () => {},
  };
  return { ...state, request: operations(host) };
}

test("the snapshot carries what the panel shows: items with how easily they come to mind, the last delivery, the charter and the sleep queue", async t => {
  const { request, a, lesson, tokyo, osaka } = await panel(t);
  const s = await request("snapshot", { projectId: "p" });
  const item = id => s.memory.state.items.find(i => i.id === id);
  assert.deepEqual([item(a.id).level, item(lesson.id).level, item(tokyo.id).status], ["case", "lesson", "superseded"]);
  assert.equal(item(a.id).accessibility, 0.605);
  assert.deepEqual(item(a.id).stats, { helped: 1, missed: 0, irrelevant: 1, wrong: 0, unused: 0 });
  assert.equal(item(tokyo.id).supersededBy, osaka.id);
  assert.equal(s.memory.delivery.delivered[0].id, lesson.id, "the newest delivery in this project");
  assert.equal(s.memory.delivery.delivered[0].matched.kind, "imagined");
  assert.equal(s.charter.isDefault, true);
  assert.match(s.prompt, /^You are the user's companion[^\n]*\nPurpose: Help this person/);
  assert.ok(s.learning.sleep.last.ran.some(r => r.type === "integrate"));
  assert.deepEqual([s.learning.sleep.episodes[0].salience, s.learning.sleep.episodes[0].signals], [0.55, ["correction"]], "episodes are listed by how much they stood out");
  assert.deepEqual(s.models, [{ provider: "example", id: "small", label: "Small — Example" }]);
});

test("the panel can ask why, pause a memory so that what was drawn from it is re-read, and edit the charter", async t => {
  const { request, core, a, lesson, patch } = await panel(t);
  const why = await request("why", { item: lesson.id });
  assert.equal(why.drawnFrom.length, 2);
  const told = await request("explain", { request: patch.request.id });
  assert.equal(told.readings[0].delivered[0].id, lesson.id);
  await assert.rejects(request("why", { item: "nope" }), /Unknown memory/);

  const before = (await request("snapshot", { projectId: "p" })).memory.state.items.find(i => i.id === a.id);
  const after = await request("memory", { projectId: "p", item: a.id, revision: before.revision, operation: "pause" });
  assert.equal(after.memory.state.items.find(i => i.id === a.id).paused, true);
  const queued = after.learning.sleep.queued.find(j => j.type === "revise" && j.target === lesson.id);
  assert.ok(queued.reasons.some(r => /was paused by the user/.test(r)));
  assert.ok(!(await core.candidates({ scene: "Writing a brief for the board", need: "", entities: [] })).some(c => c.item.id === a.id), "a paused memory is not recalled");

  // The charter is the user's to write. What they write replaces the defaults everywhere.
  const edited = await request("profile", { patch: { purpose: "Keep me honest about my own plans", values: ["Tell me when a plan will not work"] } });
  assert.deepEqual([edited.charter.isDefault, edited.charter.purpose], [false, "Keep me honest about my own plans"]);
  assert.match(personaPrompt(core.core()), /Purpose: Keep me honest about my own plans\n[^\n]*\n- Tell me when a plan will not work/);
  await assert.rejects(request("profile", { patch: { mood: "cheerful" } }), /Unknown profile field/);
});

test("a habit the user removed can be put back with its provenance", async t => {
  const { request, core, say, tick, attend, settle, a, quote, log } = await panel(t);
  // The first case has helped once; one more scene makes it promotable.
  await attend("Write the brief for the board", { session: "board", scene: "Writing a brief for the board", admit: [{ id: a.id, anchor: "brief for the board" }] });
  say("Decision first: fund it.", "board", "assistant"); tick(120000);
  await settle(say("The board agreed at once", "board"), { kind: "helped", applied: "yes", reply_quote: "Decision first" });
  const source = log.event(a.evidence[0].id);
  await core.consolidate({ infer: scripted({ habit: { habits: [{ op: "set", key: "decision-first", text: "For a reader who will not read on, open with the decision",
    reason: "Worked in two different scenes", from: [a.id], tested: "A one-pager and a board brief", hypothesis: "Other readers", evidence: quote(source) }] } }) });
  assert.equal((await request("snapshot", {})).learning.habits.length, 1);
  const removed = await request("habit", { key: "decision-first" });
  assert.deepEqual([removed.learning.habits.length, removed.learning.history[0].key], [0, "decision-first"]);
  const restored = await request("habit", { key: "decision-first", restore: true });
  assert.equal(restored.learning.habits[0].from[0], a.id);
  assert.equal(core.core().habits["decision-first"], "For a reader who will not read on, open with the decision");
});

test("the panel is a way to teach it: a verdict, a confirmation and a settled disagreement all go through the same RPC surface", async t => {
  const { request, core, say, tick, learn, attend, a, lesson, patch, quote } = await panel(t);
  // The last reply used the lesson. The user says it did not belong; the snapshot carries that back.
  const said = await request("feedback", { request: patch.request.id, item: lesson.id, kind: "irrelevant", note: "The maintainer wanted the full diff" });
  assert.deepEqual(said.memory.delivery.outcomes.find(o => o.item === lesson.id), { item: lesson.id, kind: "irrelevant", by: "user", reason: "The maintainer wanted the full diff" });
  assert.equal(said.memory.delivery.asked, "Describe this patch for the maintainer");
  assert.equal(core.why(lesson.id).recall.staysOutOf[0].scene, "Describing a patch for a maintainer with little time");
  const undone = await request("feedback", { request: patch.request.id, item: lesson.id, undo: true });
  assert.ok(!undone.memory.delivery.outcomes.some(o => o.item === lesson.id && o.by === "user"));
  await assert.rejects(request("feedback", { request: patch.request.id, item: a.id, kind: "helped" }), /was not used in this reply/);

  // Something in doubt, something out of date and a disagreement show up as waiting, and each can be answered.
  const tea = learn(say("I drink tea, never coffee", "p"), { text: "Drinks tea, not coffee", about: "drinks", concrete: "Cooking dinner with a recipe", general: "Planning a meal" });
  const noted = say("Order me a coffee", "q");
  const put = core.apply([{ op: "put", kind: "understanding", certainty: "observed", reason: "Ordered once", tested: "Once", hypothesis: "", entities: [], evidence: quote(noted),
    text: "Orders coffee", about: "what the user orders", concrete: "Planning a meal out", general: "Cooking or ordering a meal", conflicts: [tea.id] }], [noted]);
  const coffee = put.applied[0].id;
  await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  let s = await request("feedback", { request: core.traces().find(x => x.delivered?.some(i => i.id === a.id) && x.scene.scene === "Writing a memo for the director").request, item: a.id, kind: "wrong", note: "She reads everything now" });
  assert.deepEqual(s.review, { unsure: [a.id], stale: [], disputes: [{ a: coffee, b: tea.id }] });
  assert.deepEqual(s.memory.state.items.find(i => i.id === a.id).doubt, { reason: "She reads everything now", at: core.log.now(), by: "user" });
  assert.equal(s.diagnosis.sleep.queued.revise, 2);

  const item = id => s.memory.state.items.find(i => i.id === id);
  s = await request("memory", { projectId: "p", item: a.id, revision: item(a.id).revision, operation: "confirm" });
  assert.deepEqual([s.review.unsure, item(a.id).status, item(a.id).doubt], [[], "active", undefined]);
  s = await request("dispute", { a: coffee, b: tea.id, keep: tea.id });
  assert.deepEqual([s.review.disputes, item(coffee).status, item(coffee).supersededBy], [[], "superseded", tea.id]);
  s = await request("memory", { projectId: "p", item: tea.id, revision: item(tea.id).revision, operation: "retire", note: "Coffee now" });
  assert.equal(item(tea.id).closeReason, "Coffee now");
  s = await request("memory", { projectId: "p", item: tea.id, revision: item(tea.id).revision, operation: "reopen" });
  assert.equal(item(tea.id).status, "active");
});

test("a failure reaches the panel in the shape the host's client reads: a code, a message and details; and no model yet has a code of its own", async () => {
  const { registerSettings } = await import("../plugin/settings.mjs");
  const routes = new Map();
  const child = { effect: fn => fn(), connection: { fetch: { register: r => routes.set(r.path, r) } }, settings: { configure() {} } };
  const noModel = Object.assign(new Error("No model has been used yet. Send one message first."), { code: "asteme/NO_MODEL" });
  const host = { config: {}, openBrain: async () => { throw noModel; }, log: { state: () => null } };
  registerSettings({ inject: (_needs, fn) => fn(child), fiber: null }, host);
  const ask = async (action, payload) => (await routes.get(`/api/asteme.${action}`).fetch(new Request("http://127.0.0.1/api", { method: "POST", body: JSON.stringify({ type: "client-request", method: `asteme.${action}`, rpcId: "r1", payload }) }))).json();
  const brain = await ask("brain", {});
  assert.deepEqual(brain, { type: "server-response", rpcId: "r1", result: { ok: false, error: { code: "asteme/NO_MODEL", message: noModel.message, details: {} } } });
  // Any other failure keeps the general code, and a code that is not Asteme's own is not passed on.
  const other = await ask("why", {});
  assert.equal(other.result.ok, false);
  assert.deepEqual([other.result.error.code, typeof other.result.error.message, other.result.error.details], ["asteme/INVALID_INPUT", "string", {}]);
});
