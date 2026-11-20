// Findings from the first run on a real host with a real model (0.8.0-alpha.1),
// each pinned by a test, followed by what the user can say directly.
import test from "node:test";
import assert from "node:assert/strict";
import { Log } from "../src/log.mjs";
import { Asteme, TUNING, sameEntity } from "../src/core.mjs";
import { world, scripted, scope, DIRECTOR } from "./helpers.mjs";

const HANDOVER = { text: "Took over the XTool ad project from Mika", about: "XTool handover", concrete: "Preparing a pitch for the board", general: "Writing a report for a busy decision maker", entities: ["A", "Mika"] };

test("finding 1: an empty answer to a strong match is asked once more, about those candidates only; the model is given reasons, not scores", async t => {
  const { core, say, learn } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);
  const weak = learn(say("The team wants meeting notes in order", "seed"), { text: "Keep team notes in order", about: "team notes", concrete: "Writing meeting notes for the team", general: "Drafting minutes of a team discussion" });
  const request = say("Wrap up that memo for the director", "ask");
  const calls = [];
  const pass = { decisions: [{ id: a.id, use: "silent", reason: "It changes the opening", anchor: "memo for the director" }] };
  const run = second => core.prepare({ request, recent: [request], infer: scripted({
    scene: { scene: "Writing a memo for the director", need: "", entities: [] },
    select: input => input.required ? second : { decisions: [] },
  }, calls) });

  const trace = await run(pass);
  const [first, again] = calls.filter(c => c.purpose === "asteme-select").map(c => c.input);
  assert.deepEqual(first.candidates.map(c => [c.id, c.calledBy.fit]), [[a.id, "strong"], [weak.id, "moderate"]]);
  assert.equal(first.candidates[0].calledBy.because, "the present scene resembles the scene it was learned in");
  assert.ok(!("score" in first.candidates[0]), "a bare number is not what admission is asked to judge");
  assert.equal(first.required, undefined);
  assert.deepEqual([again.required, again.candidates.map(c => c.id)], [true, [a.id]], "the second question is about the strong match only");
  assert.deepEqual([trace.askedTwice, trace.delivered.map(i => i.id)], [true, [a.id]]);

  // Still nothing: admission stays the only path to delivery, and the gap is on record.
  calls.length = 0;
  const silent = await run({ decisions: [] });
  assert.deepEqual([silent.delivered.length, silent.undecided.includes(a.id)], [0, true]);
  // An explicit "not now" is an answer and is not asked again.
  calls.length = 0;
  const held = await core.prepare({ request, recent: [request], infer: scripted({ scene: { scene: "Writing a memo for the director", need: "", entities: [] },
    select: { decisions: [{ id: a.id, use: "not-now", reason: "The memo is already written" }] } }, calls) });
  assert.equal(calls.filter(c => c.purpose === "asteme-select").length, 1);
  // Every candidate is owed an answer: the one that got none is on record as such.
  assert.deepEqual([held.askedTwice, (held.undecided ?? []).includes(a.id)], [undefined, false]);
});

test("finding 2: a sensitive memory the user asks about directly is used in the open, not dropped", async t => {
  const { core, say, learn, attend } = world(t);
  const s = learn(say("My bank loan is 40,000 and the salary review is in March", "seed"), { text: "Has a bank loan and a salary review in March", about: "money",
    concrete: "Planning a budget", general: "Anything that depends on the user's income", sensitive: ["money"] });
  assert.deepEqual(s.sensitive, ["money"]);
  const scene = "Planning a budget";
  // The scene fits, so the record is put before admission, marked. Whether the
  // message raises the matter is the reader's call, and here it does not.
  const calls = [];
  const elsewhere = await attend("Help me plan the week", { session: "week", scene, admit: [{ id: s.id, use: "not-now", reason: "The message does not raise it" }], calls });
  assert.equal(calls.find(c => c.purpose === "asteme-select").input.candidates[0].sensitive, true);
  assert.equal(elsewhere.trace.delivered.length, 0, "never brought up when the user did not raise it");

  const asked = await attend("What did I tell you about my bank loan?", { session: "ask", scene, admit: [{ id: s.id, anchor: "my bank loan" }] });
  assert.equal(asked.trace.delivered[0].use, "mention");
  assert.equal(asked.trace.decisions[0].adjusted, "mention: a sensitive record is only used in the open");
  assert.match(asked.trace.text, /^- mention: [^\n]*\n[^\n]*\n  Sensitive: the user raised this themselves/m);
});

test("what is private is said by whoever read the turn, in any language; code checks the names and knows the shape of a secret", async t => {
  const { core, say, learn } = world(t);
  // Found in a real run: the model's own wording ("before background or
  // diagnosis") tagged a memo preference as a health matter, and it could never come up again.
  const memo = learn(say("Lead with the decision when you write to my director", "a"), { text: "Lead with the decision for this director",
    concrete: "Writing a memo for the director: the decision before background or diagnosis", general: "Writing for a busy decision maker" });
  assert.deepEqual(memo.sensitive, []);
  // Said plainly by the reader, the word list is not consulted at all.
  const debt = learn(say("We carry a lot of technical debt in the bank module", "b"), { text: "The bank module carries technical debt",
    concrete: "Planning work on the bank module", general: "Estimating work in old code", sensitive: [] });
  assert.deepEqual(debt.sensitive, []);
  // A turn in a language the word list does not know ("I take pills for my
  // blood pressure every morning", in Spanish).
  const other = learn(say("Tomo pastillas para la tension cada manana", "c"), { text: "Toma pastillas para la tension cada manana",
    concrete: "Planning the user's morning", general: "Plans that depend on the user's condition", sensitive: ["health", "astrology"] });
  assert.deepEqual(other.sensitive, ["health"], "a name code does not know is dropped");
  // The reader named nothing: the word list reads the user's own words, as before.
  assert.deepEqual(learn(say("My salary review is in March", "d"), { text: "Has a review in March", concrete: "Planning the spring", general: "Scheduling around reviews" }).sensitive, ["money"]);
  // A secret is recognised by its shape whatever anyone said about it.
  assert.deepEqual(learn(say("The staging token = abcd1234efgh for now", "e"), { text: "Staging uses a temporary token", concrete: "Deploying to staging",
    general: "Using a test environment", sensitive: [] }).sensitive, ["credentials"]);
  // A revision that names nothing keeps what the record carried.
  const again = say("Si, son para la tension", "c");
  core.apply([{ op: "put", id: other.id, kind: "understanding", certainty: "explicit", reason: "Confirmed", text: other.text, concrete: other.concrete, general: other.general,
    tested: "One occasion", hypothesis: "Other occasions are untested", entities: [], evidence: [{ id: again.id, quote: again.content }] }], [again]);
  assert.deepEqual(core.item(other.id).sensitive, ["health"]);

  // A name alone, or an association, never brings a private record up.
  const named = learn(say("Mika told me in confidence that she is leaving the XTool project", "f"), { text: "Mika is leaving the XTool project, told in confidence",
    concrete: "Staffing the XTool project", general: "Planning who does what", entities: ["XTool"], sensitive: ["privacy"] });
  const called = (sceneText, entities, text, session) => core.candidates({ scene: sceneText, need: "", entities }, undefined, say(text, session));
  const plain = learn(say("I took over the XTool ad project from Mika", "h"), { text: "Took over the XTool ad project from Mika", concrete: "Running the XTool ads",
    general: "Picking up someone else's project", entities: ["XTool"], sensitive: [] });
  const ids = (await called("Fixing a bug in a database migration", ["XTool"], "Fix it", "g")).map(c => c.item.id);
  assert.deepEqual([ids.includes(plain.id), ids.includes(named.id)], [true, false], "the name calls the ordinary record and not the private one");
});

test("finding 3: a name matches across phrase and word forms, and never through the article", async t => {
  for (const [a, b, same] of [["project A", "A", true], ["Director Tanaka", "Tanaka", true], ["the director", "director", true], ["XTool ad project", "XTool", true],
    ["a director", "A", false], ["project a", "a", false], ["onboarding", "board", false], ["XTool", "Tool", false], ["", "A", false]])
    assert.equal(sameEntity(a, b), same, `${a} / ${b}`);
  const { core, say, learn } = world(t);
  const h = learn(say("I took over the XTool ad project from Mika", "seed"), HANDOVER);
  const called = scene => core.candidates({ scene: "Fixing a bug in a database migration", need: "", entities: scene }, undefined, say("Fix it", "s" + scene.length));
  assert.deepEqual((await called(["project A"])).map(c => [c.item.id, c.entity]), [[h.id, true]], "an unrelated scene that names it still calls it");
  assert.deepEqual(await called(["a database"]), []);
  assert.deepEqual(await called([]), []);
});

test("finding 4: a marginal fit does not pass the floor on its own; it passes when the message also shares content words", async t => {
  // An embedder in which the scene fits the memory 0.001 better than an empty scene does.
  const at = { null: [1, 0, 0], cue: [0.8, 0.6, 0], scene: [0.8, 0.26833, 0.53666], close: [0.8, 0.58, 0.153] };
  const embed = async texts => texts.map(text => TUNING.nullScenes.includes(text) ? at.null : text.startsWith("SCENE") ? at.scene : text.startsWith("CLOSE") ? at.close : at.cue);
  embed.model = "margins";
  const { core, say, learn } = world(t, { embed });
  const h = learn(say("I took over the XTool ad project from Mika", "seed"), { ...HANDOVER, entities: [] });
  const candidate = async (scene, text) => (await core.activate({ scene, need: "", entities: [] }, undefined, say(text, text)));

  const bare = await candidate("SCENE an instruction with no subject", "Take over this session");
  assert.deepEqual([bare.candidates.length, bare.below], [0, 1], "an instruction alone calls nothing");
  const worded = await candidate("SCENE an instruction with no subject", "Take over the XTool work");
  assert.deepEqual(worded.candidates.map(c => [c.item.id, c.words, c.fit, Number(c.closeness.toFixed(3))]), [[h.id, true, "weak", 0.005]], "two weak signals that agree are enough to be considered");
  const clear = await candidate("CLOSE a scene that resembles it", "Do the usual");
  assert.deepEqual(clear.candidates.map(c => [c.words, c.fit]), [[false, "strong"]], "a clear fit needs no shared word");
});

test("finding 5: the core can say why background work is idle, and what each waiting delivery is waiting for", async t => {
  const { core, say, tick, learn, attend } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);
  assert.deepEqual(core.diagnose().sleep.idleBecause, ["no turn has been reflected on yet", "a lesson needs two cases from different conversations",
    "no memory has a recorded success yet, so nothing is imagined or promoted"]);
  await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  const because = () => core.diagnose().outcomes.waiting.map(w => w.because);
  assert.deepEqual(because(), ["too recent to judge"]);
  tick(120000);
  assert.deepEqual(because(), ["the user has not written again in that conversation"]);
  assert.equal(core.outcomeCandidates().length, 0);
  say("Thanks", "memo");
  assert.deepEqual(because(), ["ready to be read"]);
  await core.outcomes({ infer: scripted({ outcome: { feedback: [] } }) });
  assert.deepEqual(because(), ["the later message was read and said nothing about it"]);
  // A host can shorten the wait for a test run.
  await attend("Write another memo for the director", { session: "memo-2", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  tick(1000); say("Good", "memo-2");
  const calls = [];
  await core.outcomes({ delay: 500, infer: scripted({ outcome: { feedback: [] } }, calls) });
  assert.equal(calls.length, 1);
});

test("what the user says directly counts as an outcome, teaches recall, and is not overruled by a later reading", async t => {
  const { core, say, tick, learn, attend, settle } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);
  const notes = learn(say("The team wants meeting notes in order", "seed"), { text: "Keep team notes in order", about: "team notes", concrete: "Writing meeting notes for the team", general: "Drafting minutes of a team discussion" });

  // Out of place, said with one click instead of waiting for a later message.
  const sync = await attend("Write up the notes from the team meeting", { session: "sync", scene: "Writing meeting notes for the team", admit: [{ id: a.id, anchor: "team meeting" }] });
  const said = core.userOutcome(sync.request.id, a.id, "irrelevant");
  assert.deepEqual([said.by, said.reason, said.evidence], ["user", "The user said this did not belong here", []]);
  assert.equal((await core.activate({ scene: "Drafting minutes of the team discussion", need: "", entities: [] })).suppressed[0].id, a.id);
  assert.throws(() => core.userOutcome(sync.request.id, notes.id, "helped"), /was not used in this reply/);

  // "It should have been used": the scene becomes one the memory answers to.
  const pitch = await attend("Summarize the code migration for the maintainer", { session: "pitch", scene: "Describing a patch for a maintainer with little time" });
  core.userOutcome(pitch.request.id, a.id, "missed", "The maintainer skims too");
  assert.deepEqual(core.why(a.id).recall.answersTo.at(-1), { scene: "Describing a patch for a maintainer with little time", because: "missed" });
  assert.throws(() => core.userOutcome(sync.request.id, a.id, "missed"), /was used in this reply/);

  // A model reading the next message does not overrule the user, and the user can take it back.
  say("Notes, decision first.", "sync", "assistant"); tick(120000);
  const later = say("Fine, thanks", "sync");
  assert.equal(core.outcomeCandidates().length, 0, "already answered by the user");
  assert.equal(core.assess([{ trace: sync.trace.id, item: a.id, kind: "helped", reason: "They said thanks", evidence: [{ id: later.id, quote: "Fine, thanks" }] }], [later], [a], [sync.trace]).applied.length, 0);
  assert.equal(core.feedback().find(f => f.request === sync.request.id).kind, "irrelevant");
  core.userOutcomeUndo(sync.request.id, a.id);
  assert.ok(!core.feedback().some(f => f.request === sync.request.id));

  // "This is wrong" sends it to be rewritten, like any wrong outcome.
  const memo = await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  core.userOutcome(memo.request.id, a.id, "wrong", "She reads everything now");
  assert.equal(core.item(a.id).status, "doubtful");
  assert.match(core.jobs().find(j => j.type === "revise").reasons[0], /She reads everything now/);
});

test("the user can confirm, close, and settle; each is recorded as theirs and reaches what depends on it", async t => {
  const { core, say, tick, learn } = world(t);
  const tea = learn(say("I drink tea, never coffee", "p"), { text: "Drinks tea, not coffee", about: "drinks", concrete: "Cooking dinner with a recipe", general: "Planning a meal" });
  const noted = say("Order me a coffee", "q");
  const put = core.apply([{ op: "put", kind: "understanding", certainty: "observed", reason: "Ordered once", tested: "Once", hypothesis: "", entities: [], evidence: [{ id: noted.id, quote: noted.content }],
    text: "Orders coffee", about: "what the user orders", concrete: "Planning a meal out", general: "Cooking or ordering a meal", conflicts: [tea.id] }], [noted]);
  const coffee = core.item(put.applied[0].id);
  const office = learn(say("I am in the Tokyo office this month", "r"), { text: "Working from the Tokyo office", about: "where the user works", volatility: "state",
    concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in" });
  core.apply([{ op: "doubt", id: office.id, reason: "Said something else", evidence: [{ id: noted.id, quote: "Order" }] }], [noted]);
  tick(40 * 86400000);
  const review = core.review();
  assert.deepEqual(review.disputes, [{ a: coffee.id, b: tea.id }]);
  assert.deepEqual(review.unsure, [office.id]);
  assert.deepEqual(review.stale, [], "what is already in doubt is not listed twice");

  // Still true: doubt cleared, the clock for "out of date" starts again.
  const confirmed = core.userConfirm(office.id, core.item(office.id).revision);
  assert.deepEqual([confirmed.status, confirmed.lastCheckedAt, core.why(office.id).history.at(-1).reason], ["active", core.log.now(), "Confirmed by the user"]);
  assert.deepEqual(core.review().unsure, []);
  assert.throws(() => core.userConfirm(office.id, 1), /Memory changed/);

  // Settle the disagreement: tea stays, coffee is kept on record as set aside.
  core.userSettle(coffee.id, tea.id, tea.id);
  assert.deepEqual([core.item(coffee.id).status, core.item(coffee.id).supersededBy, core.review().disputes], ["superseded", tea.id, []]);
  assert.equal(core.why(tea.id).disputes[0].reason, "Settled by the user");
  await core.plan();
  assert.ok(!core.jobs().some(j => j.type === "reconcile"), "sleep does not reopen what the user settled");

  // Not true any more: closed with a date, still searchable.
  const closed = core.userRetire(tea.id, core.item(tea.id).revision, "Switched to coffee after all");
  assert.deepEqual([closed.status, closed.closeReason], ["retired", "Switched to coffee after all"]);
  assert.equal(core.search("tea coffee").understanding.length, 2);
  assert.equal(core.items().length, 1);
  // And that can be taken back.
  const back = core.userReopen(tea.id, closed.revision);
  assert.deepEqual([back.status, back.closeReason, core.why(tea.id).history.at(-1).reason], ["active", undefined, "Put back in use by the user"]);
  assert.throws(() => core.userReopen(coffee.id, core.item(coffee.id).revision), /Only a memory that was closed/);
});

test("an old database with the degenerate fixture embedder still behaves as before: no floor, no second question", async t => {
  const log = new Log(":memory:", () => Date.parse("2026-11-13T10:00:00Z"));
  t.after(() => log.close());
  const embed = async texts => texts.map(() => [1, 0]); embed.model = "fixture";
  const core = new Asteme({ log, identity: scope, embed });
  log.ingest(scope, "s", [{ seq: 0, role: "user", kind: "user/message", content: "Director only reads the first three lines", occurredAt: log.now() }]);
  const e = log.events(scope, "s")[0];
  core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "r", tested: "t", hypothesis: "h", entities: [], evidence: [{ id: e.id, quote: e.content }], ...DIRECTOR }], [e]);
  const calls = [];
  log.ingest(scope, "later", [{ seq: 0, role: "user", kind: "user/message", content: "Write the memo", occurredAt: log.now() }]);
  const ask = log.events(scope, "later")[0];
  const trace = await core.prepare({ request: ask, recent: [ask], infer: scripted({ scene: { scene: "anything", need: "", entities: [] }, select: { decisions: [] } }, calls) });
  assert.deepEqual([trace.candidates.length, trace.candidates[0].fit, trace.askedTwice, calls.length], [1, null, undefined, 2]);
});

test("what the conversation in view already holds is not recalled into it; the same memory comes up once its source is out of view", async t => {
  // Seen in a real store: every delivery of a day was a memory learned
  // earlier in the same conversation, and each cost the reply a second call.
  const { core, say, learn } = world(t);
  const told = say("Lead with the decision for this director", "talk");
  const a = learn(told, DIRECTOR);
  const calls = [];
  const infer = scripted({ read: input => ({ scene: "Writing a memo for the director", need: "", entities: [], immediate: [], corrections: [],
    decisions: input.candidates.map(c => ({ id: c.id, use: "silent", reason: "It says how she reads", anchor: "memo for the director", expect: "decision first" })) }) }, calls);
  const here = say("Write the memo for the director", "talk");
  const same = await core.prepare({ request: here, recent: [told, here], infer, reading: "one" });
  assert.deepEqual([same.reading, same.delivered.length, same.inView, calls.length], ["none", 0, [a.id], 0], "the only memory is a few lines up: nothing is read and nothing waits");
  // The host can say what the replying model sees; it is not only the last few messages.
  const far = say("Write the memo for the director", "talk");
  const viewed = await core.prepare({ request: far, recent: [far], view: [told.id, far.id], infer, reading: "one" });
  assert.deepEqual([viewed.reading, viewed.delivered.length], ["none", 0]);
  // In another conversation the source is not in view, and the memory is what makes the difference.
  const elsewhere = say("Write the memo for the director", "next week");
  const other = await core.prepare({ request: elsewhere, recent: [elsewhere], infer, reading: "one" });
  assert.deepEqual([other.reading, other.delivered.map(i => i.id), other.inView], ["one", [a.id], undefined]);
  // A memory that also rests on something outside the view still comes up.
  const again = say("Yes, decision first for her, always", "next week");
  core.apply([{ op: "put", id: a.id, kind: "understanding", certainty: "explicit", reason: "Confirmed", tested: "Two occasions", hypothesis: "Others untested", entities: [], ...DIRECTOR, evidence: [{ id: again.id, quote: again.content }] }], [again]);
  const mixed = say("Write the memo for the director", "next week");
  const both = await core.prepare({ request: mixed, recent: [again, mixed], infer, reading: "one" });
  assert.equal(both.delivered.length, 1, "one of its sources is in another conversation");
});
