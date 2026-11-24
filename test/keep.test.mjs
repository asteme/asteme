// What was found in real use after alpha.2, and what keeps the record safe:
// tool output that survives JSON, the judge port, one reading per message, the
// call policy, a complete copy out and back in, the diary, and growth without loss.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plain, JUDGE } from "../src/core.mjs";
import { guardedCall, keepReading, noteReading, waitLimit } from "../plugin/calls.mjs";
import { writeExport, importFrom, backupNow, listBackups, publicConfig } from "../plugin/files.mjs";
import { jevJudge } from "../src/jev.mjs";
import { judgeAdmission } from "../src/judge.mjs";
import { world, scripted, DIRECTOR, scope } from "./helpers.mjs";

// Text in the user's own script, written as escapes so the file stays ASCII.
const ZH_BIRTHDAY = "\u6211\u7684\u751f\u65e5\u662f10\u670829\u53f7";      // "my birthday is October 29"
const ZH_ASK = "\u4f60\u77e5\u9053\u6211\u7684\u751f\u65e5\u662f\u51e0\u53f7\u5417"; // "do you know my birthday"
const failing = message => async () => { throw Object.assign(new Error(message), { name: "TimeoutError" }); };
/** A judge that answers every question with the given option probabilities, by candidate text. */
const judgeWith = (pick, asked = []) => async (state, questions) => {
  asked.push({ state, questions });
  return Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, { type: "choice", probabilities: pick(q.instructions, state) }]));
};

test("search returns values that survive JSON unchanged, for a query in the user's own script", t => {
  const w = world(t);
  w.say(ZH_BIRTHDAY);
  w.say("ok", "s", "tool", { tool: { phase: "result", name: "bash", execution: "completed" } });
  const found = w.core.search("\u751f\u65e5");
  assert.equal(found.sources.length, 1, "the user's own statement is found");
  assert.deepEqual(plain(found), found, "nothing in it is undefined");
  assert.equal("tool" in found.sources[0], false, "a field with no value is left out, not set to undefined");
});

test("when the model does not answer, a judge still lets the right memory through, and says it was the judge", async t => {
  const w = world(t), asked = [];
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const request = w.say("Writing a memo for the director about the budget", "s2");
  const judge = judgeWith(() => ({ mention: 0.1, silent: 0.85, leave: 0.05 }), asked);
  const trace = await w.core.prepare({ request, recent: [request], infer: failing("The operation was aborted due to timeout"), judge });
  assert.equal(trace.error, undefined);
  assert.deepEqual([trace.scene.from, trace.admittedBy, trace.sceneError], ["message", "judge", "The operation was aborted due to timeout"]);
  assert.deepEqual(trace.delivered.map(i => [i.id, i.use, i.by, i.confidence]), [[item.id, "silent", "judge", 0.95]]);
  assert.match(asked[0].state.notes.note_1, /Lead with the decision/);
  assert.equal(asked[0].state.message, request.content);
  // Without a judge the same failure delivers nothing and is recorded as a failure.
  const alone = await w.core.prepare({ request, recent: [request], infer: failing("The operation was aborted due to timeout") });
  assert.deepEqual([alone.delivered.length, alone.error], [0, "The operation was aborted due to timeout"]);
});

test("a judge beside the model is recorded for comparison; in judge mode the model is not asked to choose", async t => {
  const w = world(t), calls = [];
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const request = w.say("Writing a memo for the director about the budget", "s2");
  const infer = scripted({ scene: { scene: "Writing a memo for the director", need: "", entities: [] },
    select: { decisions: [{ id: item.id, use: "silent", reason: "The memo is for the director", anchor: "memo for the director" }] } }, calls);
  const judge = judgeWith(() => ({ mention: 0, silent: 0.1, leave: 0.9 }));
  const shadow = await w.core.prepare({ request, recent: [request], infer, judge, admission: "shadow" });
  assert.deepEqual([shadow.delivered.length, shadow.admittedBy], [1, undefined], "the model's decision stands");
  assert.deepEqual(shadow.shadow.decisions, [{ id: item.id, use: "not-now", confidence: 0.9 }], "the judge's answer is kept beside it");
  const report = w.core.report();
  assert.deepEqual(report.data.preparation.shadow, { compared: 1, agree: 0, rate: 0 });
  calls.length = 0;
  const judged = await w.core.prepare({ request, recent: [request], infer, judge, admission: "judge" });
  assert.deepEqual([calls.map(c => c.purpose), judged.admittedBy, judged.delivered.length], [["asteme-scene"], "judge", 0]);
  // A sensitive memory admitted quietly by a judge is still raised to a mention.
  assert.ok(JUDGE.admit >= 0.5 && JUDGE.outcome > 0.5);
});

test("a judge reads an outcome from what the user wrote next; the evidence is that message, and an unclear reading records nothing", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const { request } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  w.say("Decision first: option B.", "s2", "assistant");
  w.tick();
  const later = w.say("That is not how this director wants it any more", "s2");
  const unclear = await w.core.outcomes({ infer: failing("timeout"), judge: judgeWith(() => ({ helped: 0.3, irrelevant: 0.2, wrong: 0.1, unclear: 0.4 })), mode: "judge" });
  assert.equal(unclear.applied.length, 0);
  w.tick();
  const later2 = w.say("To be clear: that rule about the director is wrong now", "s2");
  const report = await w.core.outcomes({ infer: failing("timeout"), judge: judgeWith(() => ({ helped: 0.02, irrelevant: 0.05, wrong: 0.9, unclear: 0.03 })) });
  assert.equal(report.applied.length, 1, "the model failed, the judge was asked instead");
  const f = w.core.feedback().find(x => x.request === request.id);
  assert.deepEqual([f.kind, f.by, f.confidence, f.evidence[0].id], ["wrong", "judge", 0.9, later2.id]);
  assert.equal(w.core.item(item.id).status, "doubtful", "it teaches the same way a model's reading does");
  assert.ok(later.id !== later2.id);
});

test("the judge adapter sends state and questions and returns the answers; a refusal is an error without the key in it", async () => {
  const sent = [];
  const judge = jevJudge({ key: "k-test", fetch: async (url, init) => { sent.push({ url, init }); return { ok: true, json: async () => ({ answers: { c1: { probabilities: { leave: 1 } } } }) }; } });
  assert.deepEqual(await judge({ message: "hi" }, { c1: { type: "choice", instructions: "?", criteria: { leave: "no" } } }), { c1: { probabilities: { leave: 1 } } });
  assert.deepEqual(JSON.parse(sent[0].init.body), { model: "jev-1.13.0", state: { message: "hi" }, questions: { c1: { type: "choice", instructions: "?", criteria: { leave: "no" } } } });
  const refused = jevJudge({ key: "k-test", fetch: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(refused({}, {}), e => /403/.test(e.message) && !e.message.includes("k-test"));
  assert.throws(() => jevJudge({}), /key/);
});

test("the call policy: a cut-off answer is asked again with more room, and after two timeouts the reply stops waiting", async () => {
  const notes = [], breaker = { failures: 0, until: 0 };
  let clock = 1000;
  const opts = (purpose, call) => ({ purpose, tokens: 6000, timeouts: { waiting: 30000, background: 90000 }, call, note: n => notes.push(n), now: () => clock });
  // Reflection cut off at the output limit: tried again with twice the room.
  const seen = [];
  const value = await guardedCall(breaker, opts("asteme-reflect", async (tokens, timeout) => {
    seen.push([tokens, timeout]);
    if (tokens < 12000) throw Object.assign(new Error("Incomplete memory response (max-tokens)"), { incomplete: "max-tokens" });
    return { changes: [] };
  }));
  assert.deepEqual([value, seen], [{ changes: [] }, [[6000, 90000], [12000, 90000]]]);
  assert.deepEqual(notes.map(n => [n.ok, n.incomplete, n.again]), [[false, "max-tokens", true], [true, undefined, undefined]], "the cut-off attempt is recorded as asked again, not as a call that failed");
  // Two timeouts while the reply waits: the third call is not made at all.
  const timeout = async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); };
  await assert.rejects(guardedCall(breaker, opts("asteme-scene", timeout)));
  await assert.rejects(guardedCall(breaker, opts("asteme-scene", timeout)));
  let made = 0;
  await assert.rejects(guardedCall(breaker, opts("asteme-select", async () => { made++; })), e => e.skipped === true);
  assert.equal(made, 0);
  // Background work is not stopped by it, and after five minutes the model is asked again.
  assert.equal(await guardedCall(breaker, opts("asteme-reflect", async () => "ok")), "ok");
  clock += 300001;
  assert.equal(await guardedCall(breaker, opts("asteme-scene", async (_t, ms) => ms)), 30000);
  assert.equal(breaker.until, 0);
});

test("one reading per message: a reading that passed nothing is kept, a failed one is tried once more and then left", () => {
  const at = { routeKey: "r", erased: 0, now: 1000 };
  const empty = noteReading(undefined, { delivered: [] }, at);
  assert.equal(keepReading(empty, { ...at, now: 999999 }), true, "an empty reading is not made again for the same message");
  const failed = noteReading(undefined, { error: "timeout", delivered: [] }, at);
  assert.deepEqual([keepReading(failed, { ...at, now: 5000 }), keepReading(failed, { ...at, now: 30000 })], [true, false], "not sooner than twenty seconds");
  const twice = noteReading(failed, { error: "timeout", delivered: [] }, { ...at, now: 30000 });
  assert.equal(keepReading(twice, { ...at, now: 999999 }), true, "two failures are enough for one message");
  assert.equal(keepReading(empty, { ...at, erased: 1 }), false, "an erasure makes every earlier reading void");
  assert.equal(keepReading(noteReading(undefined, { delivered: [{}] }, at), at), false, "a reading that delivered is checked by the caller against the memory's revision");
});

test("the diagnosis says how the model calls went and which turns are still unread", async t => {
  const w = world(t);
  w.core.note("call", { purpose: "asteme-scene", ok: false, ms: 45000, timeout: true, error: "The operation was aborted due to timeout" });
  w.core.note("call", { purpose: "asteme-scene", ok: true, ms: 2100 });
  w.core.note("call", { purpose: "asteme-reflect", ok: false, ms: 9000, incomplete: "max-tokens", error: "Incomplete memory response (max-tokens)" });
  w.say("Actually my birthday is the 30th"); w.end();
  const d = w.core.diagnose();
  assert.deepEqual(d.health.purposes["asteme-scene"], { calls: 2, failed: 1, timeouts: 1, cut: 0, again: 0, median: 2100, slow: 2100 });
  assert.deepEqual([d.health.calls, d.health.failed, d.health.timeouts, d.health.cut], [3, 2, 1, 1]);
  assert.equal(d.reflection.unread, 1, "a turn that ended and was not read into memory is counted");
  assert.deepEqual(d.sleep.idle.map(i => i.code), ["no-reflection", "few-cases", "no-success"], "reasons come as codes a panel can translate");
  assert.equal(d.sleep.idle.length, d.sleep.idleBecause.length);
});

async function filled(t) {
  const w = world(t);
  const first = w.say(DIRECTOR.text);
  const item = w.learn(first, DIRECTOR);
  const birthday = w.learn(w.say(ZH_BIRTHDAY), { text: "The user's birthday is October 29", about: "birthday", concrete: "The user asks about their birthday", general: "A question about a personal date" });
  w.tick();
  const { request } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  w.say("Decision first: option B.", "s2", "assistant");
  w.core.userOutcome(request.id, item.id, "helped");
  w.core.note("call", { purpose: "asteme-scene", ok: true, ms: 1200 });
  w.log.save("secret:judge", "must never leave");
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const host = { log: w.log, core: w.core, directory: dir, config: { enabled: true, judgeKey: "k-secret", backupKeep: 2, timeoutMs: 90000 }, judge: null };
  return { w, host, item, birthday, request, first, dir };
}

test("a complete copy goes out and comes back: memories, conversations, outcomes and history, and nothing twice", async t => {
  const { w, host, item, birthday, request } = await filled(t);
  const out = await writeExport(host, "archive");
  const text = await readFile(join(out.path, "archive.json"), "utf8");
  assert.equal(text.includes("must never leave"), false, "private state is not exported");
  const other = world(t);
  const target = { log: other.log, core: other.core, directory: join(host.directory, "second"), config: {} };
  const result = await importFrom(target, { path: join(out.path, "archive.json") });
  assert.ok(result.total > 0 && result.backup.endsWith("-before-import.sqlite.gz"), "a copy is made before anything is added");
  assert.deepEqual(other.core.items().map(i => i.id).sort(), [item.id, birthday.id].sort());
  assert.equal(other.core.item(birthday.id).evidence[0].quote, ZH_BIRTHDAY, "the user's own words arrive intact");
  assert.equal(other.log.event(request.id).content, "Writing a memo for the director", "the conversation is part of it");
  assert.deepEqual(other.core.feedback().map(f => [f.kind, f.by]), [["helped", "user"]]);
  assert.ok(other.core.revisions(item.id).length >= w.core.revisions(item.id).length, "its history comes with it");
  assert.equal(other.core.journal({ kind: "call" }).length, 1);
  const again = await importFrom(target, { content: text });
  assert.equal(again.total, 0, "importing the same archive again adds nothing");
});

test("an import never brings back what was forgotten, keeps the later revision of a memory, and reads a backup file", async t => {
  const { w, host, item, birthday } = await filled(t);
  const copy = w.core.exportArchive();
  // After the export: the birthday is forgotten at its source, and the other memory is confirmed (a new revision).
  w.log.erase(birthday.evidence.map(e => e.id));
  w.core.userConfirm(item.id, w.core.item(item.id).revision);
  const revised = w.core.item(item.id).revision;
  const result = w.core.importArchive(plain(copy));
  assert.ok(!w.core.item(birthday.id), "the forgotten memory stays forgotten");
  assert.equal(w.log.event(birthday.evidence[0].id)?.content ?? "", "", "and so do the words it came from");
  assert.equal(w.core.item(item.id).revision, revised, "the older copy does not overwrite the later revision");
  assert.equal(w.log.db.prepare("SELECT COUNT(*) AS n FROM experience WHERE id=?").get(birthday.id).n, 0, "nothing of it is left in the store");
  assert.ok(result.total >= 0);
  // A backup file is read the same way as an archive.
  const backup = await backupNow(host, "manual");
  const other = world(t);
  await importFrom({ log: other.log, core: other.core, directory: join(host.directory, "third"), config: {} }, { path: backup.path });
  assert.deepEqual(other.core.items().map(i => i.id), [item.id]);
  assert.throws(() => w.core.importArchive({ format: "something-else", tables: {} }), /not an ASTEME archive/);
});

test("backups are copies: old automatic ones are thinned out, the memory never is", async t => {
  const { w, host } = await filled(t);
  for (let n = 0; n < 4; n++) { w.tick(); await backupNow(host); }
  await backupNow(host, "manual");
  const list = await listBackups(host);
  assert.deepEqual([list.filter(b => b.name.endsWith("-auto.sqlite.gz")).length, list.filter(b => b.name.endsWith("-manual.sqlite.gz")).length], [2, 1]);
  assert.equal(w.core.items().length, 2);
  assert.deepEqual(publicConfig(host.config), { enabled: true, backupKeep: 2, timeoutMs: 90000 }, "credentials are left out of anything written for others");
});

test("the diary can be read back in English, Japanese or Chinese, in the user's own words", async t => {
  const { host } = await filled(t);
  const en = host.core.diary({ locale: "en", timeZone: "UTC" });
  assert.deepEqual(en.map(f => f.name), ["2026-11.md", "memories.md"]);
  const month = en[0].text;
  assert.match(month, /^# ASTEME diary/);
  assert.match(month, /## Tuesday, November 10, 2026/);
  assert.ok(month.includes(`> ${ZH_BIRTHDAY}`), "what the user wrote is quoted as written");
  assert.match(month, /### What it took from the day\n\n- Remembered: Lead with the decision for this director/);
  assert.match(month, /### How that went\n\n- It helped: Lead with the decision for this director \(you said so\)/);
  assert.match(en[1].text, /## Noted\n\n- Lead with the decision/);
  const ja = host.core.diary({ locale: "ja-JP", timeZone: "UTC" })[0].text, zh = host.core.diary({ locale: "zh-CN", timeZone: "UTC" })[0].text;
  assert.ok(ja.includes("\u65e5\u8a18") && ja.includes("\u3042\u306a\u305f"), "Japanese headings");
  assert.ok(zh.includes("\u65e5\u8bb0") && zh.includes("\u8bb0\u4f4f\u4e86"), "Chinese headings");
  const out = await writeExport(host, "diary", { locale: "ja" });
  assert.deepEqual(out.files.map(f => f.name), ["2026-11.md", "memories.md"]);
});

test("the developer report is complete and counts what went wrong", async t => {
  const { w, host } = await filled(t);
  const request = w.say("hello again", "s3");
  await w.core.prepare({ request, recent: [request], infer: failing("The operation was aborted due to timeout") });
  await w.core.prepare({ request, recent: [request], infer: failing("The operation was aborted due to timeout") });
  const out = await writeExport(host, "report");
  assert.deepEqual(out.files.map(f => f.name), ["report.md", "report.json", "evidence.json"]);
  const md = await readFile(join(out.path, "report.md"), "utf8"), data = JSON.parse(await readFile(join(out.path, "report.json"), "utf8"));
  assert.deepEqual([data.preparation.messages, data.preparation.most, data.preparation.failed], [2, 2, 2]);
  assert.match(md, /2 × The operation was aborted due to timeout/);
  assert.equal(JSON.stringify(data).includes("k-secret"), false);
  const evidence = JSON.parse(await readFile(join(out.path, "evidence.json"), "utf8"));
  assert.equal(JSON.stringify(evidence).includes("hello again"), true, "what the user said is there whole");
  assert.equal(evidence.reduced, true);
  assert.throws(() => w.core.importArchive(evidence), /reduced copy/, "it is not a copy to bring back in");
});

test("nothing is removed because the store grew: two thousand memories are all still there and still reachable", async t => {
  const w = world(t);
  const source = w.say("A long list of things said over the years");
  const special = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.log.transaction(() => {
    for (let n = 0; n < 2000; n++) w.learn(source, { text: `Fact number ${n} about topic ${n % 50}`, about: `fact ${n}`, concrete: `Someone asks about topic ${n % 50} item ${n}`, general: `A question about an unrelated list entry ${n}` });
  });
  assert.equal(w.core.items().length, 2001);
  // The list is parsed once and kept until the store changes; what is handed out cannot be changed in place.
  const once = w.core.items(), again = w.core.items();
  assert.ok(once !== again && once[0] === again[0] && Object.isFrozen(once[0]) && Object.isFrozen(once[0].evidence));
  w.core.write({ ...once[5], revision: once[5].revision + 1, text: "Changed" }, "test");
  assert.equal(w.core.items().find(i => i.id === once[5].id).text, "Changed", "a write is seen at once");
  w.tick(86400000 * 400);
  assert.equal(w.core.items().length, 2001, "age removes nothing");
  assert.equal(w.core.search("Fact number 1999").understanding.length > 0, true);
  const started = Date.now();
  const { trace } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: special.id, anchor: "memo for the director" }] });
  assert.equal(trace.delivered[0]?.id, special.id, "the one that fits is still found among them");
  assert.ok(Date.now() - started < 20000);
  assert.equal(w.log.db.prepare("SELECT COUNT(*) AS n FROM experience").get().n, 2001);
});

test("the assistant can correct or close a memory when the user asks, on the user's own message, and the old text stays on record", t => {
  const w = world(t);
  const item = w.learn(w.say("My birthday is October 30"), { text: "The user's birthday is October 30", about: "birthday", concrete: "The user asks about their birthday", general: "A question about a personal date" });
  w.tick();
  const ask = w.say("Change my birthday to the 29th", "s2");
  const done = w.core.userAmend(item.id, { action: "correct", text: "The user's birthday is October 29" }, ask.id);
  assert.equal(done.corrected, true);
  const live = w.core.items();
  assert.deepEqual(live.map(i => i.text), ["The user's birthday is October 29"]);
  assert.equal(live[0].evidence.at(-1).id, ask.id, "the ground is the message that asked");
  assert.equal(w.core.item(item.id).status, "superseded", "the old one is closed, not erased");
  w.tick();
  const again = w.say("Actually just drop the birthday", "s2");
  assert.equal(w.core.userAmend(live[0].id, { action: "close" }, again.id).closed, true);
  assert.equal(w.core.items().length, 0);
  assert.throws(() => w.core.userAmend(live[0].id, { action: "close" }, again.id), /Already closed/);
  const reply = w.say("Done.", "s2", "assistant");
  assert.throws(() => w.core.userAmend(item.id, { action: "close" }, reply.id), /No current message from the user/);
});

test("settings from the panel are checked against their bounds; exports go where the user chose; a backup carries no key", async t => {
  const { checkSettings, DEFAULTS } = await import("../plugin/tunables.mjs");
  assert.deepEqual(checkSettings({ prepareTimeoutMs: 8000.4, judgeMode: "judge", judgeUrl: " https://example.com/v1 " }), { prepareTimeoutMs: 8000, judgeMode: "judge", judgeUrl: "https://example.com/v1" });
  assert.throws(() => checkSettings({ prepareTimeoutMs: 10 }), /between 3000 and 120000/);
  assert.throws(() => checkSettings({ judgeMode: "other" }), /Invalid/);
  assert.throws(() => checkSettings({ judgeUrl: "http://example.com" }), /https/);
  assert.throws(() => checkSettings({ judgeKey: "x" }), /Invalid/, "the key is not an ordinary setting");
  assert.ok(DEFAULTS.timeoutMs > DEFAULTS.prepareTimeoutMs);
  const { host, dir } = await filled(t);
  const elsewhere = join(dir, "my copies");
  const out = await writeExport(host, "diary", { locale: "en", to: elsewhere });
  assert.ok(out.path.startsWith(elsewhere));
  host.config.exportDirectory = join(dir, "saved place");
  assert.ok((await writeExport(host, "archive")).path.startsWith(host.config.exportDirectory));
  const backup = await backupNow(host, "manual");
  const { DatabaseSync } = await import("node:sqlite");
  // Closed before the test ends: Windows will not remove a folder with an open file in it.
  const { gunzipSync } = await import("node:zlib"), { writeFile: put } = await import("node:fs/promises");
  const unpacked = join(dir, "unpacked.sqlite");
  await put(unpacked, gunzipSync(await readFile(backup.path)));
  const copy = new DatabaseSync(unpacked, { readOnly: true });
  let secrets;
  try { secrets = copy.prepare("SELECT COUNT(*) AS n FROM state WHERE key LIKE 'secret:%'").get().n; } finally { copy.close(); }
  assert.equal(secrets, 0);
  assert.equal(host.log.state("secret:judge"), "must never leave", "the store itself keeps it");
});

test("one call before the reply reads the scene and decides; a second is made only when the scene calls up something the message did not", async t => {
  const w = world(t), calls = [];
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  const tea = w.learn(w.say("I have a peanut allergy"), { text: "The user has a peanut allergy", about: "allergy", concrete: "Choosing a recipe for dinner", general: "Cooking a meal for the user" });
  w.tick();
  // The message itself calls the memory up: one call, no second.
  const request = w.say("Writing a memo for the director about the budget", "s2");
  const infer = scripted({
    read: input => ({ scene: "Writing a memo for the director", need: "", entities: [],
      decisions: input.candidates.map(c => ({ id: c.id, use: c.id === item.id ? "silent" : "not-now", reason: "The memo is for the director", anchor: "memo for the director" })) }),
    select: input => ({ decisions: input.candidates.map(c => ({ id: c.id, use: "mention", reason: "Food is being chosen", anchor: "the usual" })) }),
  }, calls);
  const trace = await w.core.prepare({ request, recent: [request], infer, reading: "one" });
  assert.deepEqual([calls.map(c => c.purpose), trace.reading, trace.scene.scene, trace.delivered.map(i => i.id)], [["asteme-read"], "one", "Writing a memo for the director", [item.id]]);
  // The message alone calls nothing; the scene read from it does: that one is asked about afterwards.
  calls.length = 0;
  const vague = w.say("Get me the usual for tonight", "s3");
  const reads = scripted({ read: { scene: "Choosing a recipe for dinner", need: "", entities: [], decisions: [] },
    select: input => ({ decisions: input.candidates.map(c => ({ id: c.id, use: "mention", reason: "Food is being chosen", anchor: "the usual" })) }) }, calls);
  const second = await w.core.prepare({ request: vague, recent: [vague], infer: reads, reading: "one" });
  assert.deepEqual([calls.map(c => c.purpose), second.askedMore, second.delivered.map(i => i.id)], [["asteme-read", "asteme-select"], 1, [tea.id]]);
});

test("when the judge decides, the reply waits for no model at all, and the scene is read afterwards", async t => {
  const w = world(t), calls = [];
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const request = w.say("Writing a memo for the director about the budget", "s2");
  const infer = scripted({ scene: { scene: "Writing a memo for the director", need: "", entities: [] } }, calls);
  const judge = judgeWith(() => ({ mention: 0.1, silent: 0.85, leave: 0.05 }));
  const trace = await w.core.prepare({ request, recent: [request], infer, judge, admission: "judge", reading: "later" });
  assert.deepEqual([calls.length, trace.scene.from, trace.sceneLater, trace.delivered.map(i => i.id), trace.error], [0, "message", true, [item.id], undefined]);
  assert.equal(await w.core.sceneLater({ infer }), 1);
  const stored = w.core.traces().find(x => x.id === trace.id);
  assert.deepEqual([stored.scene.scene, stored.scene.from, stored.sceneLater, calls.map(c => c.purpose)], ["Writing a memo for the director", "later", false, ["asteme-scene"]]);
  assert.equal(await w.core.sceneLater({ infer }), 0, "and only once");
  // Without a judge, "later" is a one-call reading: something has to decide.
  const plain = await w.core.prepare({ request, recent: [request], reading: "later",
    infer: scripted({ read: input => ({ scene: "Writing a memo for the director", need: "", entities: [], decisions: [] }) }) });
  assert.equal(plain.reading, "one");
});

test("a name that nearly every memory carries pairs nothing and calls nothing; tool output is trimmed for reflection; a call that needed more room gets it next time", async t => {
  const { commonNames } = await import("../src/memory.mjs");
  const { reflectionBatch } = await import("../src/mind.mjs");
  const items = [1, 2, 3, 4, 5, 6].map(n => ({ entities: ["Boss", n === 1 ? "Kim" : `thing ${n}`] }));
  assert.deepEqual([...commonNames(items)], ["boss"]);
  assert.deepEqual([...commonNames(items.slice(0, 3))], [], "with only a few memories nothing is common yet");
  const w = world(t);
  for (let n = 0; n < 5; n++) w.learn(w.say(`Boss likes thing ${n}`), { text: `Boss likes thing ${n}`, about: `thing ${n}`, concrete: `Choosing thing ${n}`, general: `Picking item ${n} for someone`, entities: ["Boss"] });
  w.tick();
  const hello = w.say("Boss here", "s2");
  const called = await w.core.activate({ scene: "A greeting with no task", need: "", entities: ["Boss"] }, w.log.now(), hello);
  assert.equal(called.candidates.filter(c => c.entity).length, 0, "the user's own name does not call memories up");
  const turn = { events: [{ id: "u", role: "user", content: "Fix it" }, ...Array.from({ length: 40 }, (_, n) => ({ id: `t${n}`, role: "tool", content: "x".repeat(5000) })), { id: "a", role: "assistant", content: "Done" }] };
  const whole = reflectionBatch(turn, 0, 24000), trimmed = reflectionBatch(turn, 0, 24000, { toolChars: 600 });
  assert.deepEqual([whole.done, trimmed.events.length < 42, trimmed.events.find(e => e.id === "t0").content.length < 700], [false, true, true]);
  let pages = 0; for (let b = trimmed; ; b = reflectionBatch(turn, b.next, 24000, { toolChars: 600 })) { pages++; if (b.done) break; }
  let before = 0; for (let b = whole; ; b = reflectionBatch(turn, b.next, 24000)) { before++; if (b.done) break; }
  assert.ok(pages <= 2 && before >= 8, `pages ${pages}, before ${before}`);
  const breaker = { failures: 0, until: 0 }, seen = [];
  const run = () => guardedCall(breaker, { purpose: "asteme-reflect", tokens: 6000, timeouts: { waiting: 1, background: 1 },
    call: async tokens => { seen.push(tokens); if (tokens < 12000) throw Object.assign(new Error("cut"), { incomplete: "max-tokens" }); return "ok"; } });
  await run(); await run();
  assert.deepEqual(seen, [6000, 12000, 12000], "the second time it starts where the first one succeeded");
});

test("a project can keep its memories to itself, one memory can be kept to its project, and a private conversation is neither read nor given anything", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const home = w.core.item(item.id).projectId;
  const elsewhere = w.say("Writing a memo for the director about hiring", "s2");
  elsewhere.scope = { ...elsewhere.scope, projectId: "another-project" };
  const scene = { scene: "Writing a memo for the director", need: "", entities: [] };
  const found = async request => (await w.core.activate(scene, w.log.now(), request)).candidates.length;
  assert.equal(await found(elsewhere), 1, "by default a memory comes to mind wherever the situation fits");
  w.core.userConfine(item.id, w.core.item(item.id).revision, true);
  assert.equal(await found(elsewhere), 0, "kept to its project, it is not recalled in another");
  const same = w.say("Writing a memo for the director again", "s3");
  assert.equal(await found(same), 1, "and still is in its own");
  w.core.userConfine(item.id, w.core.item(item.id).revision, false);
  assert.equal(await found(elsewhere), 1);
  w.core.setWall(home, true);
  assert.deepEqual([await found(elsewhere), await found(same), w.core.items().length], [0, 1, 1], "a walled project keeps everything in, and nothing is deleted");
  w.core.setWall(home, false);
  // A private conversation.
  const calls = [];
  const infer = scripted({ scene: { ...scene }, select: { decisions: [] }, read: { ...scene, decisions: [] }, reflect: { changes: [], feedback: [] } }, calls);
  const secret = w.say("Writing a memo for the director, off the record", "s9");
  w.core.setQuiet("s9", true);
  const trace = await w.core.prepare({ request: secret, recent: [secret], infer });
  assert.deepEqual([trace.private, trace.delivered.length, calls.length], [true, 0, 0], "nothing is brought in and no model is asked");
  w.end("s9");
  const turn = w.log.pending(w.core.identity, "experienced").find(x => x.sessionId === "s9");
  assert.deepEqual(await w.core.reflect(turn, infer), { private: true });
  assert.equal(w.log.pending(w.core.identity, "experienced").some(x => x.sessionId === "s9"), false, "the turn is passed over, not left waiting");
  assert.equal(calls.length, 0);
});

test("removing a memory scrubs it out of the readings that considered it instead of deleting them, so the last reply is still on record", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  const other = w.learn(w.say("I have a peanut allergy"), { text: "The user has a peanut allergy", about: "allergy", concrete: "Choosing a recipe for dinner", general: "Cooking a meal for the user" });
  w.tick();
  const { trace, request } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  assert.equal(trace.delivered.length, 1);
  // Forget the memory together with the message it came from.
  w.log.erase(item.evidence.map(e => e.id));
  const kept = w.core.traces().find(x => x.id === trace.id);
  assert.ok(kept, "the reading is still there");
  assert.deepEqual([kept.scrubbed, kept.delivered.length, kept.text, kept.scene.scene, kept.request], [true, 0, "", "Writing a memo for the director", request.id]);
  assert.equal(JSON.stringify(kept).includes(item.id), false, "nothing of the removed memory is left in it");
  assert.equal(JSON.stringify(kept).includes("Lead with the decision"), false);
  // A reading whose own request is forgotten goes entirely.
  w.log.erase([request.id]);
  assert.equal(w.core.traces().some(x => x.id === trace.id), false);
  assert.equal(w.core.items().length, 1); assert.ok(other.id);
});

test("space: copies are compressed and thinned, exports are thinned, old tool output is shortened only on request and never where a memory rests on it", async t => {
  const { w, host, dir } = await filled(t);
  const { usage, reclaim } = await import("../plugin/files.mjs");
  const long = "x".repeat(9000);
  const old = w.say(long, "s5", "tool", { tool: { phase: "result", name: "bash", execution: "completed" } });
  const cited = w.say(`The build log says: deploys go out on Thursdays. ${long}`, "s5", "tool", { tool: { phase: "result", name: "bash", execution: "completed" } });
  w.learn(cited, { text: "Deploys go out on Thursdays", about: "deploys", concrete: "Planning a release", general: "Scheduling work around a fixed day", quote: "deploys go out on Thursdays" });
  const said = w.say(`A long message from the user. ${long}`, "s5");
  w.tick(86400000 * 40);
  const recent = w.say(long, "s6", "tool", { tool: { phase: "result", name: "bash", execution: "completed" } });
  const result = await reclaim(host, { trim: true });
  assert.equal(result.rows, 2, "tool results nothing rests on are shortened");
  assert.ok(w.log.event(old.id).content.length < 2100 && /removed to save space/.test(w.log.event(old.id).content));
  assert.deepEqual([w.log.event(cited.id).content.length > 9000, w.log.event(said.id).content.length > 9000, w.log.event(recent.id).content.length < 2100], [true, true, true],
    "what a memory rests on and what the user said stay whole");
  // New records are stored at that length from the start.
  const { capRecord } = await import("../plugin/calls.mjs");
  assert.ok(capRecord({ role: "tool", content: long }).content.length < 2100 && /not stored/.test(capRecord({ role: "tool", content: long }).content));
  assert.equal(capRecord({ role: "user", content: long }).content.length, 9000);
  assert.equal(capRecord({ role: "assistant", content: long }).content.length, 9000);
  assert.equal(w.core.items().length, 3, "nothing remembered is touched");
  // Copies: compressed, readable again, thinned.
  const backup = await backupNow(host, "manual");
  assert.match(backup.name, /\.sqlite\.gz$/);
  const other = world(t);
  await importFrom({ log: other.log, core: other.core, directory: join(dir, "restored"), config: {} }, { path: backup.path });
  assert.equal(other.core.items().length, 3);
  host.config.exportKeep = 2;
  for (let n = 0; n < 4; n++) { w.tick(1000); await writeExport(host, "diary"); }
  const { readdir } = await import("node:fs/promises");
  assert.equal((await readdir(join(dir, "exports"))).filter(n => n.startsWith("asteme-diary-")).length, 2);
  const u = await usage(host);
  assert.ok(u.backups > 0 && u.exports > 0);
  assert.ok(w.core.search(long.slice(0, 5)).sources.every(s => s.text.length <= 400), "search answers stay small");
});

test("the scenario harness runs with any model ports and reports per scenario; a history row says what kind of change it was", async t => {
  const { runAll } = await import("../eval/harness.mjs");
  const { scenarios } = await import("../eval/scenarios.mjs");
  const purposes = [];
  const infer = async (purpose, prompt) => { purposes.push(purpose);
    if (prompt.startsWith("Do two things in one answer")) return { scene: "A person asks for help with a piece of work", need: "", entities: [], immediate: [], decisions: [], corrections: [] };
    if (prompt.startsWith("Reflect independently")) return { changes: [], feedback: [], episode: { scene: "A piece of work was discussed", signals: [] } };
    return { feedback: [], decisions: [], changes: [], scenes: [], habits: [] }; };
  const embed = async texts => texts.map(x => { const v = new Array(16).fill(0.2); for (const ch of x) v[ch.charCodeAt(0) % 16] += 1; return v; });
  embed.model = "test";
  const seen = [];
  const out = await runAll(scenarios.slice(0, 2), { infer, embed, chat: async () => "Understood." }, { onScenario: r => seen.push(r.name) });
  assert.deepEqual([out.scenarios.length, seen.length, out.total > 0, out.passed <= out.total], [2, 2, true, true]);
  // This scripted model never learns anything, so there is nothing to recall and the reply never waits for a reading.
  assert.ok(!purposes.includes("asteme-read") && !purposes.includes("asteme-scene") && purposes.includes("asteme-reflect"), "with nothing remembered no reading is made before a reply");
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.core.write({ ...w.core.item(item.id), paused: true, revision: 2 }, "User pause");
  w.core.userRetire(item.id, 2);
  const actions = w.log.db.prepare("SELECT data FROM experience_history WHERE id=? ORDER BY seq").all(item.id).map(r => JSON.parse(r.data).action);
  assert.deepEqual(actions, ["created", "paused", "closed"]);
});

test("a project switched off is neither read into memory nor given anything, and what was learned there before stays", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  assert.equal(w.core.setProjectOff(scope.projectId, true), true);
  assert.equal(w.core.quiet("any-session", scope.projectId), true);
  assert.equal(w.core.quiet("any-session", "another-project"), false);
  w.tick();
  const { trace } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  assert.deepEqual([trace.private, trace.delivered.length], [true, 0]);
  const turn = w.log.pending(w.core.identity, "experienced").find(x => x.sessionId === "s2");
  if (turn) assert.deepEqual(await w.core.reflect(turn, async () => { throw new Error("no model call in a project that is switched off"); }), { private: true });
  assert.equal(w.core.items().length, 1, "what was learned before is kept");
  w.core.setProjectOff(scope.projectId, false);
  assert.equal(w.core.quiet("any-session", scope.projectId), false);
});

test("with nothing remembered the reply does not wait for a reading; once something is, it does", async t => {
  const w = world(t);
  const calls = [];
  const first = await w.core.prepare({ request: w.say("Hello there", "s1"), recent: [], reading: "one", infer: async purpose => { calls.push(purpose); return {}; } });
  assert.deepEqual([calls.length, first.reading, first.text, first.delivered.length], [0, "none", "", 0]);
  const item = w.learn(w.say(DIRECTOR.text, "s1"), DIRECTOR);
  w.tick();
  const { trace } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  assert.equal(trace.delivered.length, 1);
});

test("a candidate the model left unanswered is not asked about again when a judge beside it is sure it does not belong", async t => {
  const w = world(t);
  const a = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  const b = w.learn(w.say("The director's assistant is called Mika", "s1b"), { text: "The director's assistant is called Mika", about: "the director's assistant", concrete: "Writing a memo for the director", general: "Writing to a senior reader" });
  w.tick();
  const request = w.say("Writing a memo for the director", "s2");
  const run = async judgeSays => {
    const purposes = [];
    const judge = async (state, questions) => Object.fromEntries(Object.keys(questions).map((k, n) => {
      const note = state.notes[`note_${n + 1}`], other = /Mika/.test(note);
      return [k, { probabilities: other ? judgeSays : { mention: 0.05, silent: 0.9, leave: 0.05 } }]; }));
    const trace = await w.core.prepare({ request, recent: [request], reading: "one", judge, admission: "shadow", infer: async purpose => { purposes.push(purpose);
      if (purpose === "asteme-read") return { scene: "Writing a memo for the director", need: "how the director reads", entities: ["director"], immediate: [], corrections: [],
        decisions: [{ id: a.id, use: "silent", reason: "It says how the director reads", anchor: "memo for the director", expect: "the memo opens with the decision" }] };
      return { decisions: [{ id: b.id, use: "not-now", reason: "The assistant is not involved" }], corrections: [] }; } });
    return { purposes, trace };
  };
  const sure = await run({ mention: 0.02, silent: 0.03, leave: 0.95 });
  assert.deepEqual(sure.purposes, ["asteme-read"], "one call, and the reply goes on");
  assert.deepEqual([sure.trace.delivered.map(i => i.id), sure.trace.settledByJudge], [[a.id], 1]);
  assert.equal(sure.trace.decisions.find(d => d.id === b.id).by, "judge");
  // A judge that is not sure, or that would pass it, does not decide: the model is asked.
  const unsure = await run({ mention: 0.2, silent: 0.15, leave: 0.65 });
  assert.deepEqual(unsure.purposes, ["asteme-read", "asteme-select"]);
  const would = await run({ mention: 0.1, silent: 0.8, leave: 0.1 });
  assert.deepEqual(would.purposes, ["asteme-read", "asteme-select"]);
  assert.deepEqual(would.trace.delivered.map(i => i.id), [a.id], "the judge's yes passes nothing by itself");
});

test("a judge is asked a stricter question about a private record: whether the message itself raises it", async () => {
  const asked = [];
  const judge = async (state, questions) => { asked.push(questions); return Object.fromEntries(Object.keys(questions).map(k => [k, { probabilities: { mention: 0.1, silent: 0.1, leave: 0.8 } }])); };
  const item = { id: "x", text: "Takes medication every morning", concrete: "A", general: "B" };
  await judgeAdmission(judge, { request: { id: "r", content: "Plan my week" }, candidates: [{ item }, { item: { ...item, id: "y", sensitive: ["health"] } }] });
  assert.doesNotMatch(asked[0].c1.instructions, /private matter/);
  assert.match(asked[0].c2.instructions, /note_2 is about a private matter\. Does the message itself raise that matter, or does the note say the user wants it/);
});

test("with a judge beside it, a weak match the model said nothing about is asked about again unless the judge is sure it does not belong", async t => {
  // Seen with a real model: the lesson was a candidate with a weak fit, the
  // one-call answer carried no decision for it, and nothing was delivered.
  const embed = async texts => texts.map(text => /greeting|small talk|acknowledgement|continue whatever/i.test(text) ? [1, 0, 0] : /CUE/.test(text) ? [0.8, 0.6, 0] : [0.8, 0.3, 0.5196]);
  embed.model = "weak-match";
  const w = world(t, { embed });
  const a = w.learn(w.say("Lead with the decision for readers who only read the opening"), { text: "CUE lead with the decision", about: "opening lines", concrete: "CUE writing for the director", general: "CUE writing for a reader who reads only the opening" });
  w.tick();
  const run = async (judge) => {
    const request = w.say("Draft a one-page summary for the CFO, he has a minute", "s" + Math.random());
    const purposes = [];
    const trace = await w.core.prepare({ request, recent: [request], reading: "one", judge, admission: "shadow", infer: async purpose => { purposes.push(purpose);
      if (purpose === "asteme-read") return { scene: "A summary for a reader with a minute", need: "", entities: [], immediate: [], corrections: [], decisions: [] };
      return { decisions: [{ id: a.id, use: "silent", reason: "Same constraint in another setting", anchor: "he has a minute", expect: "the summary opens with the point" }], corrections: [] }; } });
    return { purposes, trace };
  };
  const says = p => async (state, questions) => Object.fromEntries(Object.keys(questions).map(k => [k, { probabilities: p }]));
  const none = await run(undefined);
  assert.equal(none.trace.candidates[0].fit, "weak");
  assert.deepEqual([none.purposes, none.trace.delivered.length], [["asteme-read"], 0], "without a judge a weak match left unanswered is let go");
  const open = await run(says({ mention: 0.1, silent: 0.8, leave: 0.1 }));
  assert.deepEqual([open.purposes, open.trace.delivered.map(i => i.id)], [["asteme-read", "asteme-select"], [a.id]], "the judge does not rule it out, so the model is asked, and the model's answer is what delivers");
  const shut = await run(says({ mention: 0.02, silent: 0.03, leave: 0.95 }));
  assert.deepEqual([shut.purposes, shut.trace.delivered.length, shut.trace.settledByJudge], [["asteme-read"], 0, 1]);
  // A weak match the judge would not use either, only not surely enough to settle it, does not keep the reply waiting for a second call.
  const away = await run(says({ mention: 0.2, silent: 0.15, leave: 0.65 }));
  assert.deepEqual([away.purposes, away.trace.delivered.length, away.trace.letGo], [["asteme-read"], 0, 1]);
});

test("the diary is what was said: tool runs, wordless turns and conversations with no words in them are not written into it", async t => {
  const w = world(t);
  w.say("Lead with the decision for this director", "talk");
  w.say("", "talk", "assistant");
  w.say("read_file: memo.md", "talk", "tool");
  w.say("Understood: decision first.", "talk", "assistant");
  // A conversation that was not to be remembered leaves only wordless records.
  w.say("", "private"); w.say("", "private", "assistant"); w.say("something read", "private", "tool");
  const text = w.core.diary({ locale: "en", timeZone: "UTC" })[0].text;
  assert.match(text, /Lead with the decision for this director/);
  assert.match(text, /Understood: decision first\./);
  assert.doesNotMatch(text, /tool|read_file|something read/i);
  assert.doesNotMatch(text, /\*\*[^*]+\*\* · \d\d:\d\d\n\n>\s*\n/, "no heading over an empty quote");
  assert.equal(text.split("\n---\n").length - 1, 1, "one conversation is written, not two");
});

test("a call the reply waits on gets twice its usual time, between the configured limit and twice that; an answer asked again is not counted as failed", async t => {
  assert.equal(waitLimit(30000, []), 30000, "nothing is known yet");
  assert.equal(waitLimit(30000, [12000, 13000, 12500, 16000]), 30000, "a quick call keeps the limit: a stall is given up when it was before");
  assert.equal(waitLimit(30000, [21000, 22400, 24500]), 44800, "a call that usually takes most of the limit is given room to finish");
  assert.equal(waitLimit(30000, [50000, 52000, 51000]), 60000, "never more than twice the limit");
  // The limit a call is made with follows what the same kind of call took before.
  const breaker = { failures: 0, until: 0 }, limits = []; let clock = 0;
  for (let i = 0; i < 4; i++) await guardedCall(breaker, { purpose: "asteme-select", tokens: 1600, timeouts: { waiting: 30000, background: 90000 }, note: () => {}, now: () => clock,
    call: async (_tokens, limit) => { limits.push(limit); clock += 22000; return {}; } });
  assert.deepEqual(limits, [30000, 30000, 30000, 44000]);
  const w = world(t);
  w.core.note("call", { purpose: "asteme-select", ok: false, again: true, ms: 29000, incomplete: "max-tokens", error: "Incomplete memory response (max-tokens)" });
  w.core.note("call", { purpose: "asteme-select", ok: true, ms: 31000, attempt: 1 });
  const h = w.core.diagnose().health;
  assert.deepEqual([h.calls, h.failed, h.cut, h.again, h.lastError], [2, 0, 0, 1, null]);
  assert.deepEqual(w.core.report().data.concerns.map(c => c.code).filter(c => c.startsWith("calls")), ["calls-asked-again"], "said once, as a cost, and not as a failure");
});

test("a session Asteme hands work to is given DSH's own identity and nothing of Asteme's; every other session is Asteme", async () => {
  const { withoutAsteme, withoutDefaultIdentity } = await import("../plugin/prompt.mjs");
  const sections = [{ name: "harness:identity", text: "You are DSH." }, { name: "asteme:adopted-persona", text: "You are Mira." }, { name: "asteme:use-notes", text: "Use notes." }, { name: "tools", text: "..." }];
  assert.deepEqual(withoutAsteme(sections).map(s => s.name), ["harness:identity", "tools"]);
  assert.deepEqual(withoutDefaultIdentity(sections).map(s => s.name), ["asteme:adopted-persona", "asteme:use-notes", "tools"]);
});

test("inside a host the embedding model runs in a process of its own: it answers in order, is let go when idle, starts again when needed, and a program that never says it is ready is stopped", async t => {
  const { apartEmbeddings } = await import("../src/embedding.mjs");
  const { spawn } = await import("node:child_process"), { fileURLToPath } = await import("node:url");
  const worker = fileURLToPath(new URL("./fixtures/fake-embedder.mjs", import.meta.url));
  const started = [];
  const spy = (cmd, args, opts) => { started.push([cmd === process.execPath, opts.env.ELECTRON_RUN_AS_NODE, opts.windowsHide]); return spawn(cmd, args, opts); };
  const embed = apartEmbeddings("/nowhere", { spawn: spy, worker, idleMs: 60 }); t.after(() => embed.close());
  assert.equal(embed.model, "Xenova/multilingual-e5-small:q8:mean:v1", "the same index as the model run in-process: nothing is embedded again");
  const [a, b] = await Promise.all([embed(["one", "three"]), embed(["q"], "query")]);
  assert.deepEqual([a.map(v => v.slice(0, 2)), b.map(v => v.slice(0, 2))], [[[3, 0], [5, 0]], [[1, 1]]]);
  assert.deepEqual(started, [[true, "1", true]], "one process, started by the program that runs this one, told to behave as Node");
  await assert.rejects(embed(["fail"]), /no model here/);
  // Idle: the process is let go, and the next use starts another.
  const first = a[0][2]; await new Promise(r => setTimeout(r, 200));
  const again = await embed(["x"]);
  assert.ok(again[0][2] !== first && started.length === 2);
  // It dies in the middle of a call: that call fails, the next one works.
  await assert.rejects(embed(["die"]), /stopped \(code 3\)/);
  assert.equal((await embed(["back"]))[0][0], 4);
  embed.close(); await assert.rejects(embed(["x"]), /closed/);
  // A program that does not answer as the worker does is not left running.
  const kills = [];
  const mute = apartEmbeddings("/nowhere", { worker, startMs: 150, spawn: (cmd, args, opts) => { const p = spawn(cmd, [...args, "silent"], opts); p.on("exit", () => kills.push(p.pid)); return p; } });
  await assert.rejects(mute(["x"]), /did not start/);
  await new Promise(r => setTimeout(r, 150));
  assert.equal(kills.length, 1);
});

test("the report says which native libraries are in the host's own process, and calls two copies of the image library what it is", async t => {
  const { nativeLoaded } = await import("../plugin/files.mjs");
  const here = nativeLoaded();
  assert.deepEqual([Array.isArray(here.sharp), Array.isArray(here.onnxruntime), here.copiesOfSharp], [true, true, 0], "this test process loads neither");
  // A library's file name carries its version on Windows; one copy is one copy.
  assert.match("@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node", /sharp-[^/]*\.node$/i);
  const w = world(t);
  const clean = w.core.report(undefined, { native: here });
  assert.match(clean.markdown, /native libraries in this process: image library none \(0 copies\); inference runtime none/);
  const bad = w.core.report(undefined, { native: { sharp: ["sharp@0.34.5/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node", "@img/sharp-win32-x64/lib/sharp-win32-x64.node"], onnxruntime: ["onnxruntime-node/bin/onnxruntime_binding.node"], copiesOfSharp: 2 } });
  assert.deepEqual(bad.data.concerns.map(c => c.code).filter(c => /native|image/.test(c)), ["native-in-host", "two-image-libraries"]);
});

test("a name that hundreds of memories carry does not flood one reading: the best are given, the rest are counted as left out", async t => {
  const { fitCandidates } = await import("../src/recall.mjs");
  const w = world(t);
  const source = w.say("Years of notes about the Orion project");
  w.log.transaction(() => {
    for (let n = 0; n < 1200; n++) w.learn(source, { text: `Note ${n}: ` + "a particular of some length ".repeat(12), about: `note ${n}`, concrete: `Working on part ${n} of a build`, general: `A step in a long piece of work, number ${n}`, entities: n % 4 === 0 ? ["Orion"] : [`part${n}`] });
  });
  const request = w.say("What is next for Orion?", "s2");
  const called = await w.core.activate({ scene: "Planning the next step of the Orion project", need: "", entities: ["Orion"] }, w.now(), request);
  assert.ok(called.candidates.length <= 40 && called.candidates.length >= 8, `one reading is given ${called.candidates.length}`);
  assert.ok(called.crowded >= 200, `and ${called.crowded} that the name also called are counted as left out`);
  assert.ok(JSON.stringify(called.candidates.map(c => [c.item.text, c.item.concrete, c.item.general])).length < 34000);
  // By size alone: long memories fill the room before the number is reached; eight are kept whatever their size.
  const long = Array.from({ length: 30 }, (_, n) => ({ item: { id: `i${n}`, text: "x".repeat(900), concrete: "y".repeat(400), general: "z".repeat(400), tested: "t".repeat(300), hypothesis: "h".repeat(300) }, cue: "c".repeat(200) }));
  assert.equal(fitCandidates(long, { chars: 9000 }).length, 8);
  assert.deepEqual(fitCandidates(long, { chars: 6000 }).map(c => c.item.id), long.slice(0, 8).map(c => c.item.id), "in rank order");
  // What has come due goes before what a name merely called.
  const mixed = [...Array.from({ length: 24 }, (_, n) => ({ item: { id: `b${n}`, text: "t" } })), { item: { id: "named", text: "t" }, entity: true }, { item: { id: "due", text: "t" }, due: true }];
  assert.deepEqual(fitCandidates(mixed, { beside: 1 }).map(c => c.item.id).slice(-1), ["due"]);
});

test("a conversation that is not remembered says so once for a message, and the report counts it apart from readings", async t => {
  const w = world(t);
  w.core.setQuiet("quiet-session", true);
  const request = w.say("Do not keep this", "quiet-session");
  const infer = async () => { throw new Error("no model is asked"); };
  for (let step = 0; step < 4; step++) assert.equal((await w.core.prepare({ request, recent: [request], infer })).private, true);
  const rows = w.log.db.prepare("SELECT data FROM attention").all().map(r => JSON.parse(r.data)).filter(a => a.private);
  assert.equal(rows.length, 1, "four steps of one turn leave one row");
  const { data, markdown } = w.core.report();
  assert.deepEqual([data.preparation.readings, data.preparation.notRemembered], [0, 1]);
  assert.match(markdown, /conversations not remembered[^:]*: 1 message/);
  assert.ok(!("tuning" in data) && Array.isArray(data.failures) && "store" in data, "the constants of the version are not repeated; failures are grouped; the store is sized");
});

test("beside a report goes what a diagnosis reads, not the whole store; and what tools did in a conversation that is not remembered is not stored at all", async t => {
  const { record } = await import("../plugin/events.mjs");
  const call = { seq: 4, type: "tool/call", data: { message: { toolCallId: "c1", name: "bash", arguments: { command: "ls" } } } };
  const quietCall = record(call, { quiet: true });
  assert.deepEqual([quietCall.seq, quietCall.skip], [4, true], "not even an empty row: only the place in the order moves on");
  assert.notEqual(record(call, {}).skip, true, "in a remembered conversation it is recorded as before");
  const w = world(t);
  const said = w.say("The supplier answers on Thursdays, " + "and here is all the detail of it ".repeat(60));
  w.say("A long reply. " + "word ".repeat(600), "s", "assistant");
  w.say("x".repeat(3000), "s", "tool"); w.say("", "s", "tool");
  w.log.save("brain:face", "data:image/png;base64," + "A".repeat(4000));
  const whole = w.core.exportArchive(), evidence = w.core.exportEvidence(), text = JSON.stringify(evidence);
  assert.ok(text.includes(said.content), "what the user said is whole");
  assert.ok(text.length < JSON.stringify(whole).length / 2 && !text.includes("A".repeat(100)) && !text.includes("x".repeat(400)) && !text.includes("word ".repeat(300)));
  // What tools did that nothing rests on is counted, with how much it held; a row of it that a memory rests on stays.
  assert.deepEqual([evidence.reduced, evidence.leftOut.toolRows, evidence.counts.events], [true, { rows: 2, chars: 3000, conversations: 1 }, whole.counts.events - 2]);
  assert.match(text, /more characters left out of this reduced copy/);
  const seen = w.say("The invoice says net 30", "t", "tool");
  w.learn(seen, { text: "Invoices are net 30", about: "invoices", concrete: "Paying an invoice", general: "Paying a supplier" });
  const again = w.core.exportEvidence(), rows = again.tables.events.rows.map(r => r[again.tables.events.columns.indexOf("id")]);
  assert.ok(rows.includes(seen.id) && again.leftOut.toolRows.rows === 2, "the one a memory rests on is listed");
  assert.equal(Object.keys(again.scopes).length, 1, "whose it is, written once");
});

const DIRECTOR_LIKE = { text: "Lead with the decision for this director", about: "how this director reads", concrete: "Writing a memo for the director", general: "Writing a document for a busy decision maker" };

test("a kept reading still knows what its words were drawn from: taking back the message a scene was learned from takes the scene out of why a reply was given", async t => {
  const w = world(t);
  const said = w.say("Put the decision first for the director", "a");
  const item = w.learn(said, DIRECTOR_LIKE);
  const later = w.say("The board pack: lead with the ask, they skim", "b");
  const scene = "Preparing the board pack for members who skim";
  const candidate = { item: w.core.item(item.id), score: 0.8, fit: "strong", cue: scene, origin: "helped",
    feedback: [{ kind: "helped", request: later.id, reason: "It helped", scene: { scene, need: "" }, evidence: [{ id: later.id, quote: later.content }] }], stats: {}, entity: false, due: false };
  const ask = w.say("Draft the board summary", "c");
  w.core.trace({ request: ask.id, scene: { scene: "Writing for the board", need: "", entities: [] }, candidates: [candidate], decisions: [], delivered: [] });
  assert.ok(JSON.stringify(w.core.explain(ask.id)).includes(scene), "the scene it was found by is shown");
  w.log.erase([later.id]);
  assert.ok(!JSON.stringify(w.core.explain(ask.id) ?? {}).includes(scene), "taken back, it is gone from why the reply was given");
});

test("taking back the record a use was read from takes its scene out of every reading: what was considered, what was used and what was held back, from the oldest use too", async t => {
  const w = world(t);
  const item = w.learn(w.say("Put the decision first for the director", "a"), DIRECTOR_LIKE);
  // Thirteen uses, each read from what the user said next; a candidate carries only the latest twelve of them.
  const laters = [];
  for (let n = 0; n < 13; n++) {
    w.tick(86400000);
    await w.attend(`Write brief number ${n} for the board`, { session: `s${n}`, scene: `Writing brief number ${n} for a board that skims`, admit: [{ id: item.id, anchor: `brief number ${n}` }] });
    w.say("Decision first: fund it.", `s${n}`, "assistant"); w.tick(120000);
    const later = w.say(`The board agreed to brief ${n} at once`, `s${n}`); laters.push(later);
    await w.settle(later, { kind: "helped", applied: "yes", reply_quote: "Decision first" });
  }
  const oldest = "Writing brief number 0 for a board that skims";
  // A reading now, where the oldest use's scene is the one the memory is found by, delivered, and also held back elsewhere.
  const ask = w.say("Draft the board summary", "z");
  const entry = { item: w.core.item(item.id), score: 0.8, fit: "strong", cue: oldest, origin: "helped", feedback: w.core.feedback().filter(f => f.item === item.id).slice(0, 12), stats: {}, entity: false, due: false };
  w.core.trace({ request: ask.id, scene: { scene: "Writing for the board", need: "", entities: [] }, candidates: [entry],
    decisions: [{ id: item.id, use: "silent", reason: "It changes this reply" }],
    delivered: [{ id: item.id, use: "silent", text: item.text, matched: { scene: oldest, because: "helped" }, revision: item.revision, evidence: [] }],
    heldBack: { suppressed: [{ id: "other", cue: oldest }] } });
  assert.ok(JSON.stringify(w.core.explain(ask.id)).includes(oldest));
  w.log.erase([laters[0].id]);
  const after = JSON.stringify(w.core.explain(ask.id) ?? {});
  assert.ok(!after.includes(oldest), "the scene of the use that was taken back is nowhere in why the reply was given");
  // The reading of the first brief itself is kept: its own message was not taken back, though its scene is the one that use was filed under.
  const first = w.log.events(scope, "s0").find(e => e.content === "Write brief number 0 for the board");
  assert.ok(w.core.explain(first.id).readings.length >= 1, "the reading of a message that was not taken back stays");
});

test("a reading keeps what it decided and how each memory was found, not copies of the memories; readings kept the old way are brought down, and say the same", async t => {
  const w = world(t);
  const e = w.say("Put the decision first for the director", "a");
  const item = w.learn(e, DIRECTOR_LIKE);
  const old = { id: "old-1", request: e.id, at: w.now(), scene: { scene: "Writing for the director", need: "", entities: [] },
    candidates: [{ item: w.core.item(item.id), score: 0.9, fit: "strong", cue: "Writing a memo for the director", origin: "concrete", feedback: Array.from({ length: 12 }, (_, n) => ({ kind: "helped", request: "r" + n, reason: "x".repeat(200), scene: { scene: "y".repeat(200), need: "z".repeat(200) } })), stats: {}, entity: false, due: false }],
    decisions: [{ id: item.id, use: "silent", reason: "It changes this reply" }], delivered: [] };
  w.log.db.prepare("INSERT INTO attention VALUES (?,?,?,?)").run(old.id, w.core.owner, e.id, JSON.stringify(old));
  const before = w.core.explain(e.id).readings[0].considered;
  const size = () => w.log.db.prepare("SELECT length(data) AS n FROM attention WHERE id=?").get(old.id).n, was = size();
  assert.deepEqual(w.core.keepTraces(), { rows: 1, bytes: was - size(), more: false });
  assert.ok(size() < was / 4, `${was} -> ${size()}`);
  assert.deepEqual(w.core.explain(e.id).readings[0].considered, before, "why a reply was given reads the same");
  assert.deepEqual(w.core.keepTraces().rows, 0, "once is enough");
  // A new reading is kept small from the start.
  const fresh = w.core.trace({ request: e.id, scene: old.scene, candidates: old.candidates, decisions: [], delivered: [] });
  assert.equal(fresh.candidates[0].feedback.length, 12, "the one in hand is whole");
  const stored = JSON.parse(w.log.db.prepare("SELECT data FROM attention WHERE id=?").get(fresh.id).data);
  assert.deepEqual([stored.candidates[0].feedback, stored.candidates[0].item.evidence, stored.candidates[0].item.text], [undefined, undefined, item.text]);
});

test("a reading aloud is sent with what DSH already holds: the account's token when thinking with the account, otherwise the key in its credentials, and nothing when there is neither", async () => {
  const { dshVoiceAuth } = await import("../plugin/voice.mjs");
  const base = "https://api.deepseek.com/v1/tools", asked = [];
  const ctx = (services) => ({ get: (name) => { if (name in services) return services[name]; return undefined; } });
  const account = { resolveToken: async (b) => { asked.push(b); return "tok"; } }, credentials = { resolve: async (ref) => ref === "DEEPSEEK_API_KEY" ? { value: "sk-1" } : null };
  assert.deepEqual(await dshVoiceAuth(ctx({ deepseekAccount: account, credentials }), () => ({ provider: "deepseek-account" }))(base), { "x-dsh-auth-token": "tok" });
  assert.deepEqual(asked, [base]);
  assert.deepEqual(await dshVoiceAuth(ctx({ deepseekAccount: account, credentials }), () => ({ provider: "deepseek" }))(base), { authorization: "Bearer sk-1" });
  assert.equal(await dshVoiceAuth(ctx({ credentials: { resolve: async () => null } }), () => null, { DEEPSEEK_API_KEY: "sk-env" })(base), null, "where DSH keeps credentials, the environment is not looked at behind its back");
  assert.deepEqual(await dshVoiceAuth(ctx({}), () => null, { DEEPSEEK_API_KEY: "sk-env" })(base), { authorization: "Bearer sk-env" });
  assert.equal(await dshVoiceAuth({ get() { throw new Error("no such service"); } }, () => null, {})(base), null);
});


test("whether a conversation is remembered goes by what was chosen for it, and otherwise by the user's default", async t => {
  const w = world(t);
  assert.deepEqual([w.core.quietByDefault(), w.core.quiet("a")], [false, false]);
  w.core.setQuiet("b", true);
  assert.equal(w.core.setQuietByDefault(true), true);
  assert.deepEqual([w.core.quiet("a"), w.core.quiet("b")], [true, true], "nothing chosen: not remembered now");
  w.core.setQuiet("a", false);
  assert.equal(w.core.quiet("a"), false, "switched on for this one, it is remembered whatever the default");
  w.core.setQuietByDefault(false);
  assert.deepEqual([w.core.quiet("a"), w.core.quiet("b"), w.core.quiet("c")], [false, true, false]);
});

test("the user's own name and the assistant's are common names from the first memory on", async () => {
  const { commonNames } = await import("../src/memory.mjs");
  const items = [{ entities: ["Boss", "memo"] }, { entities: ["Boss"] }, { entities: ["Kyoto"] }];
  assert.deepEqual([...commonNames(items)], [], "too few to tell by counting");
  assert.deepEqual([...commonNames(items, ["Boss", "", undefined, "Mina"])].sort(), ["boss", "mina"]);
});

test("a reflection is sent the readings of its own conversation: this turn's whole, earlier ones that passed something on, and none of another conversation's", async t => {
  const w = world(t), calls = [];
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.end(); w.tick();
  const admit = [{ id: item.id, anchor: "memo for the director" }];
  // Another conversation, with a reading of its own that passed the memory on.
  const other = await w.attend("Writing a memo for the director about hiring", { session: "other", scene: "Writing a memo for the director", admit });
  w.say("Here is the memo.", "other", "assistant"); w.end("other"); w.tick();
  // This conversation: an earlier turn that passed it on, and one that passed nothing.
  const first = await w.attend("Writing a memo for the director about the budget", { session: "mine", scene: "Writing a memo for the director", admit });
  w.say("Here is the memo.", "mine", "assistant"); w.end("mine"); w.tick();
  const idle = await w.attend("Writing a memo for the director about travel", { session: "mine", scene: "Writing a memo for the director", admit: [] });
  w.say("Done.", "mine", "assistant"); w.end("mine"); w.tick();
  const now = await w.attend("Writing a memo for the director about the offsite", { session: "mine", scene: "Writing a memo for the director", admit });
  w.say("Here it is.", "mine", "assistant"); w.end("mine");
  assert.deepEqual([other, first, now].map(x => x.trace.delivered.length), [1, 1, 1]);
  const turn = w.log.pending(scope, "experienced").find(x => x.sessionId === "mine" && x.events.some(e => e.id === now.request.id));
  await w.core.reflect(turn, scripted({ reflect: { scene: "Writing a memo for the director", changes: [], feedback: [] } }, calls));
  const sent = calls.find(c => c.purpose === "asteme-reflect").input.traces;
  const ids = sent.map(x => x.id);
  assert.ok(ids.includes(now.trace.id) && ids.includes(first.trace.id), "its own reading, and the earlier one that passed something on");
  assert.equal(ids.includes(other.trace.id), false, "not another conversation's");
  assert.equal(ids.includes(idle.trace.id), false, "not one that passed nothing on");
  const earlier = sent.find(x => x.id === first.trace.id), own = sent.find(x => x.id === now.trace.id);
  assert.deepEqual(earlier.decisions.map(d => d.id), [item.id], "of an earlier reading, only what was passed");
  assert.equal(own.decisions.length, now.trace.decisions.length, "its own decisions whole");
});
