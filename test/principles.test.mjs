// One test per behavior the system is built for. Each drives the real loop
// (prepare, reflect, outcomes, sleep) with a scripted model and an embedder
// that knows situations, so the assertions are about what the code does with
// the model's answers, never about the model.
import test from "node:test";
import assert from "node:assert/strict";
import { TUNING } from "../src/core.mjs";
import { world, scripted, scope, DIRECTOR } from "./helpers.mjs";

const DAY = 86400000;
const pending = log => log.pending(scope, "experienced");
const understanding = (evidence, fields) => ({ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated by the user",
  tested: "One occasion", hypothesis: "Other occasions are untested", entities: [], evidence, ...fields });
const PITCH = { text: "Put the ask first in a pitch", about: "how investors read", concrete: "Preparing a pitch for the investor", general: "Preparing a pitch for an investor who skims" };

test("1. the present scene recalls a memory that shares none of its words; an unrelated scene and a greeting recall nothing", async t => {
  const { core, say, learn, attend } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);

  const ask = "Draft a one-pager for the investor who skims", scene = "Preparing a one-pager for an investor who skims";
  const far = await attend(ask, { session: "pitch", scene, admit: [{ id: a.id, anchor: "investor who skims" }] });
  assert.equal(far.trace.delivered[0].id, a.id);
  assert.equal(far.trace.delivered[0].matched.scene, DIRECTOR.concrete, "called by the scene it was learned in");

  // The rule this replaces: the quoted words had to occur in the memory too.
  TUNING.requireSharedTerms = true;
  try {
    const worded = await attend(ask, { session: "pitch-old", scene, admit: [{ id: a.id, anchor: "investor who skims" }] });
    assert.equal(worded.trace.delivered.length, 0);
    assert.equal(worded.trace.decisions[0].dropped, "no exact anchor");
  } finally { TUNING.requireSharedTerms = false; }

  // Grounding is kept: the quote must be in the present input and carry content.
  const invented = await attend(ask, { session: "pitch-2", scene, admit: [{ id: a.id, anchor: "the busy director" }] });
  assert.equal(invented.trace.decisions[0].dropped, "no exact anchor");

  for (const [text, where] of [["Fix the bug in the database migration", "Fixing a bug in a database migration"], ["Hello again", "A greeting with no task"]]) {
    const calls = [];
    const off = await attend(text, { session: text, scene: where, admit: [{ id: a.id, anchor: text }], calls });
    assert.equal(off.trace.candidates.length, 0, where);
    assert.equal(off.trace.heldBack.belowFloor, 1, "recorded as held back, not lost");
    assert.deepEqual(calls.map(c => c.purpose), ["asteme-scene"], "nothing to admit, so no admission call");
  }
});

test("2. what happened after a memory was used rewrites it: where it did not belong it goes quiet, and when it was wrong it is corrected", async t => {
  const { core, say, tick, quote, learn, attend, settle } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);

  // Used in a scene where it did not belong.
  const notes = await attend("Write up the notes from today's team meeting", { session: "notes", scene: "Writing meeting notes for the team", admit: [{ id: a.id, anchor: "team meeting", expect: "The notes are accepted as written" }] });
  assert.equal(notes.trace.delivered.length, 1);
  say("Here are the notes, decision first.", "notes", "assistant");
  tick(120000);
  const complaint = say("No. The team wants the discussion in order, not the decision first", "notes");
  const first = await settle(complaint, { kind: "irrelevant", applied: "yes", reply_quote: "decision first" });
  assert.equal(first.applied.length, 1);

  const there = await core.activate({ scene: "Drafting minutes of the team discussion", need: "", entities: [] });
  assert.deepEqual(there.candidates, [], "a scene like the one where it failed no longer calls it");
  assert.equal(there.suppressed[0].id, a.id);
  const here = await core.candidates({ scene: "Writing a brief for the board", need: "", entities: [] });
  assert.equal(here[0].item.id, a.id, "the scenes it belongs to still do");
  assert.ok(core.why(a.id).recall.accessibility < 0.5);
  assert.equal(core.item(a.id).revision, a.revision, "learning where it belongs does not change what it says");

  // Used where it belongs, and shown to be wrong.
  tick();
  await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director", expect: "The director approves the memo" }] });
  say("Memo drafted with the decision in the first line.", "memo", "assistant");
  tick(120000);
  const news = say("That is out of date: the director reads every page now and wants the background first", "memo");
  await settle(news, { kind: "wrong", surprise: true });
  const doubted = core.item(a.id);
  assert.equal(doubted.status, "doubtful");
  assert.equal(doubted.against[0].id, news.id, "the record that showed it is kept beside it");
  assert.ok(doubted.salience >= 0.2, "a failed expectation makes it stand out");
  assert.ok(core.jobs().some(j => j.type === "revise" && j.target === a.id));

  const night = await core.sleep({ infer: scripted({ revise: input => {
    assert.equal(input.item.id, a.id);
    assert.ok(input.outcomes.some(o => o.kind === "wrong") && input.RAW.some(r => r.id === news.id), "it is rewritten with the outcome and its record in view");
    return { reason: "The director's reading habit changed", changes: [understanding(quote(news), { ...DIRECTOR, id: a.id,
      text: "Give this director the background first; they now read every page", reason: "Corrected after a memo" })] };
  } }) });
  assert.deepEqual(night.ran.map(r => r.type), ["revise"]);
  const revised = core.item(a.id), why = core.why(a.id);
  assert.equal(revised.status, "active");
  assert.equal(revised.revision, a.revision + 2, "doubted, then rewritten: two revisions on");
  assert.match(revised.text, /background first/);
  assert.deepEqual(why.history.filter(h => h.text).map(h => h.status), ["active", "doubtful", "active"], "every state it passed through is kept");
  assert.deepEqual(why.recall.staysOutOf.map(c => c.because), ["irrelevant"], "the scene where the old wording was wrong no longer counts against the new one");
});

test("2b. credit needs use: a memory the reply ignored earns nothing, and being ignored costs it a little", async t => {
  const { core, say, tick, learn, attend, settle } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);
  await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  say("Here is a long memo that opens with the history of the project.", "memo", "assistant");
  tick(120000);
  const thanks = say("Thanks, that works", "memo");
  const credited = await settle(thanks, { kind: "helped", applied: "no" });
  assert.equal(credited.applied.length, 0);
  assert.match(credited.rejected[0].reason, /credit needs use/);
  tick();
  const more = say("Now shorten the second section", "memo");
  const ignored = await settle(more, { kind: "unused", applied: "no", evidence: [] });
  assert.equal(ignored.applied[0].kind, "unused");
  const recall = core.why(a.id).recall;
  assert.equal(recall.accessibility, 0.4, "a small cost: down from 0.5, far from forgotten");
});

test("3. asleep, the record is read across exchanges: the same correction on different days becomes one lesson that cites both", async t => {
  const { core, log, say, end, tick, quote } = world(t);
  const day = async (session, reply, correction, fields, scene) => {
    say(reply, session, "assistant");
    const said = say(correction, session); end(session);
    await core.reflect(pending(log)[0], scripted({ reflect: { changes: [understanding(quote(said), fields)], feedback: [],
      episode: { scene, signals: [{ kind: "correction", strength: "strong", evidence: quote(said) }] } } }));
    tick(DAY);
    return said;
  };
  const one = await day("mon", "Here is the memo.", "Put the decision first, the director only reads three lines", DIRECTOR, "Writing a memo for a busy director");
  const two = await day("wed", "Here is the pitch.", "Start with the ask, the investor skims everything else", PITCH, "Preparing a pitch for an investor who skims");
  const [a, b] = core.items();
  assert.equal(core.items().filter(i => i.level === "lesson").length, 0, "awake, each turn only saw its own exchange");

  const calls = [];
  const lesson = cite => ({ lesson: { text: "Open with what the reader has to decide when they will not read past the start",
    reason: "Both readers stopped after the opening", concrete: "Writing a summary for an executive", general: "Writing for a reader with little time who must decide",
    tested: "A memo to one director and a pitch to one investor", hypothesis: "Other hurried readers and other formats", about: "hurried readers",
    from: [a.id, b.id], evidence: cite } });
  const answers = { replay: { changes: [], reason: "Nothing the records add" }, imagine: { scenes: [] }, lesson: lesson(quote(one)) };
  const first = await core.sleep({ infer: scripted(answers, calls) });
  assert.match(first.failed.find(f => f.type === "integrate").reason, /cites every case/, "a lesson that can only cite one case is that case");
  const replay = calls.find(c => c.purpose === "asteme-replay");
  assert.equal(replay.input.earlier.length, 1, "replay puts an earlier exchange next to the one being read");
  assert.notEqual(replay.input.earlier[0].id, replay.input.episode.id);

  const second = await core.sleep({ infer: scripted({ ...answers, lesson: lesson([...quote(one), ...quote(two)]) }) });
  const made = core.item(second.ran.find(r => r.type === "integrate").lesson);
  assert.equal(made.level, "lesson");
  assert.deepEqual([...made.premises].sort(), [a.id, b.id].sort());
  assert.deepEqual(made.evidence.map(e => e.id).sort(), [one.id, two.id].sort());
  assert.equal(core.why(made.id).drawnFrom.length, 2);
  assert.equal(core.why(a.id).usedBy[0].id, made.id, "the cases stay, with the lesson above them");
  const third = await core.sleep({ infer: scripted({}) });
  assert.deepEqual(third.ran, [], "the same question is not asked twice");
});

test("3b. a quiet exchange is read again when the same kind of situation already came up in another conversation", async t => {
  const { core, log, say, end, tick } = world(t);
  const exchange = async (session, text) => {
    const said = say(text, session); end(session);
    const result = await core.reflect(pending(log)[0], scripted({ reflect: { changes: [], feedback: [], episode: { scene: text, signals: [] } } }));
    tick(DAY);
    return result.episode;
  };
  const first = await exchange("mon", "Draft the memo for the director");
  await exchange("tue", "Plan dinner around the peanut allergy");
  const again = await exchange("thu", "Prepare a brief for the board");
  assert.deepEqual([first.salience, again.salience], [0.1, 0.1], "nothing stood out in either");
  assert.deepEqual(core.diagnose().sleep.idleBecause.slice(0, 1), ["no exchange stood out (highest salience 0.1, replay starts at 0.3)"]);

  await core.plan();
  const recurred = core.episode(again.id);
  assert.deepEqual(recurred.signals.map(s => [s.kind, s.by]), [["recurrence", "code"]], "seen by the program, not claimed by a model");
  assert.equal(recurred.salience, 0.3);
  assert.equal(core.episode(first.id).salience, 0.1, "the earlier one had nothing before it to recur from");
  assert.deepEqual(core.jobs().map(j => [j.type, j.target]), [["replay", again.id]]);
  const calls = [];
  await core.sleep({ infer: scripted({ replay: { changes: [] } }, calls) });
  assert.deepEqual(calls[0].input.earlier.map(e => e.id), [first.id, core.episodes().find(e => e.sessionId === "tue").id].slice(0, calls[0].input.earlier.length));
  assert.equal(calls[0].input.earlier[0].id, first.id, "and it is read next to the exchange it resembles");
});

test("4. forgetting is not deletion, and age is not a reason: a memory gets harder to recall from how its use went, never from time", async t => {
  const { core, say, tick, learn, attend, settle } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), { ...DIRECTOR, volatility: "stable" });
  const office = learn(say("I am in the Tokyo office this month", "seed"), { text: "Is working from the Tokyo office", about: "where the user is working",
    concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in", volatility: "state" });
  const scene = { scene: "Writing a brief for the board", need: "", entities: [] };
  const fresh = (await core.candidates(scene))[0];

  tick(2 * 365 * DAY);
  const old = (await core.candidates(scene))[0];
  assert.equal(old.item.id, a.id);
  assert.equal(old.accessibility, fresh.accessibility, "two years change nothing about how easily it comes to mind");
  assert.equal(old.stale, false, "and a lesson does not go out of date by itself");

  // A changeable fact is still recalled after that long, but asked about, not asserted.
  const commute = await attend("Plan my commute to the office", { session: "commute", scene: "Planning a commute to the office", admit: [{ id: office.id, anchor: "commute to the office" }] });
  assert.equal(commute.trace.delivered[0].use, "check");
  assert.equal(commute.trace.decisions[0].adjusted, "check: may be out of date");
  assert.match(commute.trace.text, /May be out of date/);

  // Three scenes where it did not belong.
  for (const n of [1, 2, 3]) {
    const session = `notes-${n}`, where = ["Writing meeting notes for the team", "Drafting minutes of the team discussion", "Writing the team meeting summary"][n - 1];
    TUNING.negativeMargin = 1; // let it be delivered there again, so the outcome can be recorded
    try { await attend(`Write the team notes, round ${n}`, { session, scene: where, admit: [{ id: a.id, anchor: "team notes" }] }); } finally { TUNING.negativeMargin = 0; }
    say("Notes with the decision first.", session, "assistant");
    tick(120000);
    await settle(say(`Not like this, round ${n}`, session), { kind: "irrelevant" });
  }
  const faded = core.why(a.id);
  assert.ok(faded.recall.accessibility < fresh.accessibility / 2 && faded.recall.accessibility > 0, "harder to recall, not gone");
  assert.equal(faded.recall.staysOutOf.length, 3);
  assert.equal((await core.candidates(scene))[0].item.id, a.id, "a scene it belongs to still reaches it");
  assert.equal(core.search("director decision").understanding[0].id, a.id, "and a deliberate search always does");
  assert.equal(core.item(a.id).status, "active");
});

test("5. a contradiction is noticed, settled from the records, and what was drawn from the old belief is looked at again", async t => {
  const { core, log, say, end, tick, quote, learn, attend } = world(t);
  const home = { about: "home city", concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in" };
  const tokyo = learn(say("I live in Tokyo", "spring"), { ...home, text: "Lives in Tokyo" });
  const habit = learn(say("Book my trains from Tokyo station", "spring"), { text: "Books trains from Tokyo station", about: "train bookings",
    concrete: "Booking a train from the city the user lives in", general: "Planning travel that starts from the user's home city" });
  core.write({ ...habit, premises: [tokyo.id], revision: habit.revision + 1 }, "Drawn from where the user lives");
  core.link(habit.id, tokyo.id, "derived");

  // The world changed. The new fact takes the old one's place; the old one keeps its place in time.
  tick(120 * DAY);
  const moved = say("I moved to Osaka last month", "autumn"); end("autumn");
  const result = await core.reflect(pending(log)[0], scripted({ reflect: { changes: [{ ...understanding(quote(moved), { ...home, text: "Lives in Osaka" }), op: "supersede", id: tokyo.id, reason: "The user moved" }], feedback: [] } }));
  const osaka = core.item(result.report.applied[0].id), past = core.item(tokyo.id);
  assert.equal(past.status, "superseded");
  assert.equal(past.supersededBy, osaka.id);
  assert.equal(past.validUntil, new Date(moved.occurredAt).toISOString(), "it stopped holding when the record says, not when it was noticed");
  assert.ok(!core.items().some(i => i.id === tokyo.id), "no longer recalled");
  assert.equal(core.search("Tokyo").understanding.find(i => i.id === tokyo.id).text, "Lives in Tokyo", "still on record");
  assert.equal(core.why(osaka.id).replaced.id, tokyo.id);
  assert.ok(result.episode.signals.some(s => s.kind === "correction" && s.by === "code"), "being corrected makes the exchange stand out");
  const again = core.jobs().find(j => j.type === "revise" && j.target === habit.id);
  assert.match(again.reasons[0], /was superseded/, "what rested on the old belief is queued to be read again");

  // Two memories about the same subject are put side by side while asleep.
  const short = learn(say("Keep your answers short", "x"), { text: "Wants short answers", about: "Answer length", concrete: "Writing a summary for this user", general: "Writing a report for this user" });
  const full = learn(say("For contracts I need every clause spelled out", "y"), { text: "Wants every detail", about: "answer length", concrete: "Writing a report on a contract", general: "Writing a document about a contract" });
  assert.equal(short.about.toLowerCase(), full.about);
  const night = await core.sleep({ infer: scripted({
    revise: { reason: "Still true of the past; nothing to change", changes: [] }, replay: { changes: [] },
    reconcile: input => ({ verdict: "split", reason: "Each holds under its own condition", changes: [
      understanding([...quote(log.event(short.evidence[0].id))], { id: short.id, text: "Wants short answers, except about contracts", about: "answer length", concrete: short.concrete, general: short.general, tested: "Everyday questions" }),
      // Out of bounds: a third memory. It must not be touched.
      { op: "close", id: osaka.id, as: "retired", reason: "unrelated", evidence: quote(log.event(short.evidence[0].id)) },
    ] }),
  }) });
  const settled = night.ran.find(r => r.type === "reconcile");
  assert.equal(settled.verdict, "split");
  assert.deepEqual(settled.applied.map(x => x.id), [short.id]);
  assert.equal(core.item(osaka.id).status, "active", "reconciliation may only change the two memories on the table");
  assert.equal(core.why(short.id).disputes[0].state, "resolved");
  await core.plan();
  assert.ok(!core.jobs().some(j => j.type === "reconcile"), "a repair is not a new dispute");

  // While a disagreement is still open, neither side is asserted.
  const tea = learn(say("I drink tea, never coffee", "p"), { text: "Drinks tea, not coffee", about: "drinks", concrete: "Cooking dinner with a recipe", general: "Planning a meal" });
  const noted = say("Order me a coffee", "q");
  core.apply([{ ...understanding(quote(noted), { text: "Orders coffee", about: "what the user orders", concrete: "Planning a meal out", general: "Cooking or ordering a meal" }), conflicts: [tea.id] }], [noted]);
  const meal = await attend("Plan the dinner menu and drinks", { session: "meal", scene: "Planning a meal with a recipe", admit: [{ id: tea.id, anchor: "dinner menu and drinks" }] });
  assert.equal(meal.trace.delivered[0].use, "check");
  assert.equal(meal.trace.decisions[0].adjusted, "check: another record disagrees");
});

test("6. a lesson reaches a scene it never met, because sleep imagined where else it would matter", async t => {
  const { core, say, tick, learn, attend, settle } = world(t);
  const a = learn(say("The director only reads the first three lines", "seed"), DIRECTOR);
  await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director", admit: [{ id: a.id, anchor: "memo for the director" }] });
  say("Decision: approve. Reasons follow.", "memo", "assistant");
  tick(120000);
  await settle(say("Perfect, approved in one read", "memo"), { kind: "helped", applied: "yes", reply_quote: "Decision: approve" });

  const patch = { scene: "Describing a patch for a maintainer with little time", need: "", entities: [] };
  assert.equal((await core.candidates(patch))[0].origin, "encoded");
  const night = await core.sleep({ infer: scripted({ imagine: input => {
    assert.deepEqual(input.helpedIn, ["Writing a memo for the director"]);
    return { scenes: ["Explaining a code change to a maintainer who only reads the summary", DIRECTOR.general, "short"] };
  } }) });
  assert.deepEqual(night.ran[0].scenes, ["Explaining a code change to a maintainer who only reads the summary"], "only new, well-formed scenes are kept");
  assert.equal(core.item(a.id).revision, a.revision, "an imagined scene is an index entry, not a claim");

  const called = (await core.candidates(patch))[0];
  assert.equal(called.origin, "imagined");
  assert.ok(called.sim > 0.8);

  // Met for real, and it helps: the hypothesis is ready to become established scope.
  tick();
  await attend("Describe this patch for the maintainer", { session: "patch", scene: patch.scene, admit: [{ id: a.id, anchor: "patch for the maintainer" }] });
  say("Summary first: this fixes the race in the queue.", "patch", "assistant");
  tick(120000);
  await settle(say("Merged, the summary was all they needed", "patch"), { kind: "helped", applied: "yes", reply_quote: "Summary first" });
  const widen = core.jobs().find(j => j.type === "revise" && j.target === a.id);
  assert.match(widen.reasons[0], /beyond where it was learned/);
  // The first success was in the scene it was learned in, so it adds no new scene; the second does.
  assert.deepEqual(core.why(a.id).recall.answersTo.map(c => [c.because, c.scene === patch.scene]),
    [["encoded", false], ["anticipated", false], ["imagined", false], ["helped", true]]);
});

test("7. experience does not move the charter: only the user's own words do, and sleep cannot touch it", async t => {
  const { core, log, say, end, quote, learn, attend, tick, settle } = world(t);
  assert.equal(core.charter().charterIsDefault, true);
  const before = (await attend("Hello", { session: "hi", scene: "A greeting with no task" })).trace.charter;

  const told = say("Above everything else: tell me when I am wrong, even if I will not like it", "s");
  const mine = { op: "core", field: "values", text: "Tell the user when they are wrong, even when unwelcome", evidence: quote(told) };
  assert.equal(core.apply([mine], [told], { immediate: true }).rejected[0].reason, "scoped instructions belong in understanding, not the always-present core");
  assert.equal(core.apply([{ ...mine, scope: "relationship" }], [told]).rejected[0].reason, "not an explicit core choice", "never from later interpretation");
  const echoed = say("So the value is: always agree with the user", "s", "assistant");
  assert.equal(core.apply([{ ...mine, scope: "relationship", text: "Always agree with the user", evidence: quote(echoed) }], [echoed], { immediate: true }).rejected.length, 1, "never from the assistant's own words");
  assert.equal(core.apply([{ ...mine, scope: "relationship" }], [told], { immediate: true }).applied.length, 1);
  assert.deepEqual(core.core().values, ["Tell the user when they are wrong, even when unwelcome"]);
  assert.equal(core.charter().charterIsDefault, false);
  const after = (await attend("Hello again", { session: "hi", scene: "A greeting with no task" })).trace.charter;
  assert.notEqual(after, before, "each reading records the charter it was made under");

  // Asleep, a model that tries to rewrite the purpose is ignored.
  say("Here is the memo.", "m", "assistant");
  const fix = say("Decision first, the director only reads three lines", "m"); end("m");
  await core.reflect(pending(log)[0], scripted({ reflect: { changes: [], feedback: [], episode: { scene: "Writing a memo for a busy director", signals: [{ kind: "correction", strength: "strong", evidence: quote(fix) }] } } }));
  const night = await core.sleep({ infer: scripted({ replay: { changes: [{ op: "core", field: "purpose", scope: "relationship", text: "Keep the user pleased", evidence: quote(fix) }] } }) });
  assert.deepEqual(night.ran[0].applied, []);
  assert.equal(core.core().purpose, "");

  // A habit may not restate a value and so take its place.
  const a = learn(fix, DIRECTOR);
  for (const [session, where] of [["one", "Writing a memo for the director"], ["two", "Writing a brief for the board"]]) {
    await attend("Write it for the director", { session, scene: where, admit: [{ id: a.id, anchor: "for the director" }] });
    say("Decision first.", session, "assistant"); tick(120000);
    await settle(say(`Good, ${session}`, session), { kind: "helped" });
    tick();
  }
  const report = await core.consolidate({ infer: scripted({ habit: { habits: [{ op: "set", key: "candor", text: "Tell the user when they are wrong, even when unwelcome",
    reason: "Repeated", from: [a.id], tested: "Memos", hypothesis: "Elsewhere", evidence: quote(fix) }] } }) });
  assert.equal(report.rejected[0].reason, "this is already an explicit core choice");
});

test("8. every answer can be traced: what was in view, why, what was held back, what it rested on and what came of it", async t => {
  const { core, log, say, tick, learn, attend, settle } = world(t);
  const source = say("The director only reads the first three lines", "seed");
  const a = learn(source, DIRECTOR);
  const other = learn(say("The team wants meeting notes in the order things were said", "seed"), { text: "Keep team notes in order", about: "team notes", concrete: "Writing meeting notes for the team", general: "Drafting minutes of a team discussion" });
  const { request } = await attend("Write the memo for the director", { session: "memo", scene: "Writing a memo for the director",
    admit: [{ id: a.id, anchor: "memo for the director", reason: "It changes the opening", expect: "The director approves it" }, { id: other.id, anchor: "not in the request" }] });
  const reply = say("Decision: approve. Reasons follow.", "memo", "assistant");
  core.premise(request.id, { text: "The reader stops after the opening", items: [a.id] });
  tick(120000);
  const later = say("Approved in one read", "memo");
  await settle(later, { kind: "helped", applied: "yes", reply_quote: "Decision: approve" });

  const told = core.explain(request.id), reading = told.readings[0];
  assert.equal(told.reply.id, reply.id);
  assert.equal(reading.scene.scene, "Writing a memo for the director");
  assert.deepEqual(reading.considered.map(c => c.id).sort(), [a.id, other.id].sort());
  const used = reading.delivered[0];
  assert.deepEqual([used.id, used.because, used.expect, used.matched.kind], [a.id, "It changes the opening", "The director approves it", "encoded"]);
  assert.ok(log.event(used.evidence[0].id).content.includes(used.evidence[0].quote), "the chain ends at the user's own words");
  assert.equal(reading.decisions.find(d => d.id === other.id).dropped, "no exact anchor", "what was not passed is on record with the reason");
  assert.deepEqual(told.premises[0].items, [a.id]);
  assert.deepEqual([told.outcomes[0].kind, told.outcomes[0].evidence[0].id], ["helped", later.id]);

  const why = core.why(a.id);
  assert.deepEqual(why.supports, [{ id: source.id, quote: source.content, role: "user", at: new Date(source.occurredAt).toISOString() }]);
  assert.equal(why.outcomes[0].scene, "Writing a memo for the director");
  assert.equal(why.recall.accessibility, 0.6667);
  assert.equal(core.explain("no-such-request"), null);
});

test("9. what stood out is read first and is harder to forget; a signal without the words that show it does not count", async t => {
  const { core, log, say, end, tick, quote, learn } = world(t);
  const exchange = async (session, text, signals) => {
    say("Done.", session, "assistant");
    const said = say(text, session); end(session);
    const result = await core.reflect(pending(log)[0], scripted({ reflect: { changes: [], feedback: [], episode: { scene: text, signals: signals(said) } } }));
    tick();
    return { said, episode: result.episode };
  };
  const quiet = await exchange("a", "Thanks, the dinner recipe is sorted", () => []);
  const claimed = await exchange("b", "The commute plan looks fine to me", () => [{ kind: "correction", strength: "strong", evidence: [{ id: "nowhere", quote: "you got it wrong" }] }]);
  const corrected = await exchange("c", "No, the team meeting notes are wrong again", said => [{ kind: "correction", strength: "mild", evidence: quote(said) }]);
  const sharp = await exchange("d", "Never send a memo to the director without asking me first. Remember that.", said => [
    { kind: "correction", strength: "strong", evidence: quote(said) }, { kind: "explicit", strength: "strong", evidence: quote(said) }]);
  assert.deepEqual([quiet, claimed, corrected, sharp].map(x => x.episode.salience), [0.1, 0.1, 0.4, 0.85]);

  // A tool failure stands out without any model saying so.
  say("Run the migration", "e");
  say("exit 1: relation already exists", "e", "tool", { tool: { execution: "error" } }); end("e");
  const broke = await core.reflect(pending(log)[0], scripted({ reflect: { changes: [], feedback: [] } }));
  assert.deepEqual(broke.episode.signals.map(s => [s.kind, s.by]), [["failure", "code"]]);

  const calls = [];
  const night = await core.sleep({ budget: 1, infer: scripted({ replay: { changes: [] } }, calls) });
  assert.equal(calls[0].input.episode.id, sharp.episode.id, "the sharpest episode is read first, not the latest");
  assert.equal(night.left, 2);
  assert.ok(!core.jobs().some(j => [quiet.episode.id, claimed.episode.id].includes(j.target)), "an ordinary exchange is not replayed");

  // The same history of use costs a salient memory less.
  const plain = learn(say("Use metric units", "u"), { text: "Use metric units", about: "units", concrete: "Writing a report with measurements", general: "Writing a document with numbers" });
  const vivid = learn(sharp.said, { text: "Ask before sending anything", about: "sending", concrete: "Writing an email to send", general: "Drafting a message on the user's behalf" });
  core.raiseSalience(vivid.id, 0.85, "Learned in an episode that stood out");
  const stats = { helped: 0, missed: 0, irrelevant: 2, wrong: 0, unused: 0 };
  const { accessibility } = await import("../src/core.mjs");
  assert.ok(accessibility(core.item(vivid.id), stats) > accessibility(core.item(plain.id), stats));
});

test("erasing a source removes everything built on it, in every table, and scrubs its words from what survives", async t => {
  const { core, log, say, end, tick, quote, learn, attend, settle } = world(t);
  say("Here is the memo.", "mon", "assistant");
  const one = say("Put the decision first, the director only reads three lines", "mon"); end("mon");
  await core.reflect(pending(log)[0], scripted({ reflect: { changes: [understanding(quote(one), DIRECTOR)], feedback: [], episode: { scene: "Writing a memo for a busy director", signals: [{ kind: "correction", strength: "strong", evidence: quote(one) }] } } }));
  const a = core.items()[0];
  const b = learn(say("Start with the ask, the investor skims", "wed"), PITCH);
  await core.sleep({ infer: scripted({ replay: { changes: [] }, imagine: { scenes: ["Explaining a code change to a maintainer who only reads the summary"] },
    lesson: { lesson: { text: "Open with what the reader has to decide", reason: "Both stopped early", concrete: "Writing a summary for an executive", general: "Writing for a reader with little time",
      tested: "A memo and a pitch", hypothesis: "Other readers", from: [a.id, b.id], evidence: [...quote(one), ...b.evidence] } } }) });
  const lesson = core.items().find(i => i.level === "lesson");
  // A surviving memory that only holds the record as evidence against it.
  const keep = learn(say("The board reads everything", "fri"), { text: "The board reads the whole paper", about: "board", concrete: "Writing a report for the board", general: "Writing for a board" });
  tick();
  core.apply([{ op: "counter", id: keep.id, reason: "A director said otherwise", evidence: quote(one) }], [one]);
  assert.equal(core.item(keep.id).against[0].quote, one.content);
  assert.ok(lesson && core.episodes().length && core.dynamics(a.id).salience);

  log.erase([one.id]);
  const tables = name => log.db.prepare(`SELECT * FROM ${name}`).all().map(r => JSON.stringify(r));
  assert.deepEqual(core.items({ closed: true }).map(i => i.id).sort(), [b.id, keep.id].sort(), "the case and the lesson drawn from it are gone");
  for (const name of ["experience", "experience_history", "experience_feedback", "attention", "dynamics", "link", "episode", "job"])
    for (const row of tables(name)) {
      assert.ok(!row.includes(one.id) && !row.includes(a.id) && !row.includes(lesson.id), `${name} still refers to what was erased`);
      assert.ok(!row.includes("only reads three lines"), `${name} still holds the erased words`);
    }
  assert.deepEqual(core.item(keep.id).against, []);
  assert.equal(tables("vector").length, 0);
});

test("a database written by 0.7 opens as it is: old items become cases and keep their history", async t => {
  const { core, log, say } = world(t);
  const e = say("The director only reads the first three lines", "seed");
  const old = { id: "old-1", kind: "understanding", status: "active", text: "Lead with the decision", reason: "Explicit correction", concrete: DIRECTOR.concrete, general: DIRECTOR.general,
    certainty: "explicit", tested: "One memo", hypothesis: "Others untested", entities: [], trigger: { at: null, until: null }, learnedAt: e.occurredAt, projectId: "p", sensitive: [],
    revision: 2, lastCheckedAt: e.occurredAt, lastEvidenceAt: e.occurredAt, evidence: [{ id: e.id, quote: e.content }] };
  log.db.prepare("INSERT INTO experience VALUES (?,?,?)").run(old.id, core.owner, JSON.stringify(old));
  log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(core.owner, old.id, JSON.stringify({ at: e.occurredAt, reason: "written by 0.7", item: old }));
  const item = core.items()[0];
  assert.deepEqual([item.level, item.revision, item.text], ["case", 2, "Lead with the decision"]);
  assert.equal((await core.candidates({ scene: "Writing a brief for the board", need: "", entities: [] }))[0].item.id, "old-1");
  assert.equal(core.why("old-1").history[0].reason, "written by 0.7");
});

test("the same thing noted twice in other words is put side by side while asleep, and merged; what only shares a few words is not", async t => {
  const { core, log, say, learn, tick, quote } = world(t);
  // Filed under different subjects and naming no one: neither the subject nor a name brings these two together.
  const first = learn(say("Put the decision first, the director only reads the opening", "mon"), { text: "Lead with the decision for the director", about: "memo style", concrete: "Writing a memo for the director", general: "Writing for a busy decision maker" });
  const cooking = learn(say("I am allergic to peanuts", "mon"), { text: "Allergic to peanuts", about: "food", concrete: "Cooking dinner", general: "Planning a meal" });
  await core.plan();
  tick(DAY);
  const again = learn(say("The board reads one line; give them the decision", "fri"), { text: "The board wants the decision up front", about: "how the board reads", concrete: "Preparing a summary for the board", general: "Writing a brief for an executive" });
  await core.plan();
  const jobs = core.jobs().filter(j => j.type === "reconcile");
  assert.deepEqual(jobs.map(j => j.target), [[first.id, again.id].sort().join("|")], "the two that mean the same, and nothing else");
  assert.match(jobs[0].reasons[0], /same thing in other words/);
  const night = await core.sleep({ infer: scripted({
    replay: { changes: [] }, revise: { reason: "Nothing to change", changes: [] }, integrate: { changes: [] }, imagine: { scenes: [] },
    reconcile: () => ({ verdict: "merge", reason: "One preference said twice", changes: [
      { op: "put", id: first.id, kind: "understanding", certainty: "explicit", reason: "Said twice", tested: "Two occasions", hypothesis: "Other readers are untested", entities: [], text: "Leads with the decision for busy readers", about: "memo style",
        concrete: "Writing for the director or the board", general: "Writing for a busy decision maker", evidence: [...quote(log.event(first.evidence[0].id)), ...quote(log.event(again.evidence[0].id))] },
      { op: "close", id: again.id, as: "retired", reason: "Said in the other one", evidence: quote(log.event(again.evidence[0].id)) },
    ] }),
  }) });
  const merged = night.ran.find(r => r.type === "reconcile");
  assert.equal(merged.verdict, "merge");
  const live = core.items().filter(i => i.kind === "understanding").map(i => i.text).sort();
  assert.deepEqual(live, ["Allergic to peanuts", "Leads with the decision for busy readers"], "two became one; the unrelated one is untouched");
  assert.equal(core.item(cooking.id).status, "active");
});
