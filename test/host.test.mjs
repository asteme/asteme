// What the host tells memory, read from the host's own event contract: which
// events are stored, how a turn ended, the marks a user leaves on a message,
// the agent preset of a session, and why a model call failed.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { projectEvent, record, toolOutcome } from "../plugin/events.mjs";
import { failed } from "../src/mind.mjs";
import { guardedCall, REST_LIMIT } from "../plugin/calls.mjs";
import { backupNow, listBackups, reclaim } from "../plugin/files.mjs";
import { isRead } from "../src/mind.mjs";
import { world, scripted, scope, DIRECTOR } from "./helpers.mjs";

const text = value => [{ type: "text", text: value }];
const user = (seq, value) => ({ seq, time: 1000 + seq, type: "user/message", data: { id: `m${seq}`, source: { kind: "user" }, content: text(value) } });
const assistant = (seq, value, extra = {}) => ({ seq, time: 1000 + seq, type: "assistant/message", data: { message: { id: `m${seq}`, content: text(value) }, ...extra } });
const turnEnd = (seq, reason) => ({ seq, time: 1000 + seq, type: "turn/end", data: { turn: 1, reason } });

test("only the events memory reads are stored; the rest move the cursor and leave no row", t => {
  const w = world(t);
  const events = [
    { seq: 0, time: 1, type: "turn/start", data: { turn: 1 } },
    { seq: 1, time: 2, type: "request/header", data: { reason: "initial" } },
    user(2, "Deploys go out on Thursdays"),
    { seq: 3, time: 4, type: "step/start", data: { turn: 1, step: 1 } },
    assistant(4, "Noted."),
    { seq: 5, time: 6, type: "step/end", data: { turn: 1, step: 1 } },
    turnEnd(6, { kind: "completed" }),
    { seq: 7, time: 8, type: "job/registered", data: {} },
  ];
  assert.deepEqual(events.map(e => isRead(e.type)), [false, false, true, false, true, false, true, false]);
  const next = w.log.ingest(scope, "h1", events.map(e => record(e)));
  assert.equal(next, 8, "the cursor passes every event, stored or not");
  const stored = w.log.events(scope, "h1");
  assert.deepEqual(stored.map(e => [e.seq, e.kind, e.role]), [[2, "user/message", "user"], [4, "assistant/message", "assistant"], [6, "turn/end", "unknown"]]);
  // The next batch continues from the cursor even though the last event left no row.
  assert.equal(w.log.ingest(scope, "h1", [record(user(8, "And never on a Friday"))]), 9);
  assert.throws(() => w.log.ingest(scope, "h1", [record(user(11, "out of order"))]), /sequence gap/);
  assert.equal(w.log.pending(w.core.identity, "experienced").length, 1, "a turn is still found by its end");
});

test("how a turn ended is stored with it, and a private conversation keeps the order but not the words", () => {
  assert.deepEqual(projectEvent(turnEnd(3, { kind: "completed" })).metadata.ended, { kind: "completed" });
  assert.deepEqual(projectEvent(turnEnd(3, { kind: "aborted", reason: { kind: "user" } })).metadata.ended, { kind: "aborted", by: "user" });
  assert.deepEqual(projectEvent(turnEnd(3, { kind: "error", error: { message: "boom", code: "X" } })).metadata.ended, { kind: "error" });
  assert.equal(projectEvent({ seq: 3, time: 1, type: "turn/end", data: { turn: 1 } }).metadata.ended, undefined, "an older host says nothing, and nothing is made up");
  // Marks left on a message arrive in a shape this code does not know yet: kept as they came.
  const mark = record({ seq: 4, time: 1, type: "feedback/record", data: { messageId: "m2", rating: "down" } });
  assert.deepEqual([mark.kind, mark.role, JSON.parse(mark.content)], ["feedback/record", "unknown", { messageId: "m2", rating: "down" }]);
  const refused = record({ seq: 4, time: 1, type: "approval/decided", data: { callId: "c1", decision: "denied" } });
  assert.deepEqual([refused.kind, JSON.parse(refused.content).decision], ["approval/decided", "denied"]);
  assert.equal(record({ seq: 4, time: 1, type: "approval/asked", data: { callId: "c1" } }).skip, true, "the question is the host's business; the answer is the person's");
  const hidden = record({ seq: 4, time: 1, type: "feedback/record", data: { messageId: "m2", rating: "down" } }, { quiet: true });
  assert.deepEqual([hidden.kind, hidden.content], ["feedback/record", ""]);
  const said = record(user(5, "off the record"), { quiet: true, preset: "writer" });
  assert.deepEqual([said.content, said.metadata.preset, said.metadata.messageId], ["", undefined, "m5"]);
  // The session's preset is carried on what the user said, and on nothing else.
  assert.equal(record(user(5, "hello"), { preset: "writer" }).metadata.preset, "writer");
  assert.equal(record(assistant(6, "hi"), { preset: "writer" }).metadata.preset, undefined);
  assert.equal(record(user(5, "hello")).metadata.preset, undefined);
  // An event from before a fork is somebody else's turn and is never read as the user's.
  assert.deepEqual([projectEvent(user(1, "inherited"), 2).role, projectEvent(user(1, "inherited"), 2).content], ["unknown", ""]);
  assert.equal(record(user(1, "inherited"), { inherited: 2 }).skip, true, "and with nothing to keep, it leaves no row");
  // Messages the host writes in the user's place, and the stubs this plugin leaves for retired results, are not records of anything said or done.
  assert.equal(record({ seq: 2, time: 1, type: "user/message", data: { id: "x", source: { kind: "runtime-context" }, content: [{ type: "text", text: "cwd: /tmp" }] } }).skip, true);
  assert.equal(record({ seq: 3, time: 1, type: "tool/result", data: { message: { toolCallId: "c", content: [{ type: "text", text: '{"asteme":"prior-task-result-retired","originalSeq":20}' }] } } }).skip, true);
  assert.equal(record({ seq: 3, time: 1, type: "tool/result", data: { message: { toolCallId: "c", content: [{ type: "text", text: "real output" }] } } }).skip, undefined);
});

test("a cancelled tool call is not a failed one, and a refusal keeps the host's code", () => {
  const done = toolOutcome("read", { isError: false, value: { text: "ok" } });
  assert.deepEqual(done, { name: "read", execution: "completed" });
  const cancelled = toolOutcome("bash", { isError: true, error: { message: "aborted", info: { name: "AbortError", code: "ABORTED" } } });
  assert.deepEqual(cancelled, { name: "bash", execution: "cancelled", code: "ABORTED" });
  assert.equal(toolOutcome("write", { isError: true, error: { message: "never ran", info: { name: "AbortError", code: "ABORTED_BEFORE_DISPATCH" } } }).execution, "cancelled");
  const denied = toolOutcome("write", { isError: true, error: { message: "not allowed", info: { name: "ToolDenied", code: "DENIED" } } });
  assert.deepEqual(denied, { name: "write", execution: "error", code: "DENIED" });
  assert.deepEqual(toolOutcome("bash", { isError: false, value: { kind: "foreground", exitCode: 2, timedOut: false, aborted: false } }),
    { name: "bash", execution: "error", exitCode: 2, timedOut: false, aborted: false });
  const stored = outcome => projectEvent({ seq: 1, time: 1, type: "tool/result", data: { message: { toolCallId: "c", isError: true, content: [{ type: "text", text: "x" }] } } }, 0, outcome);
  assert.deepEqual([failed(stored(cancelled)), failed(stored(denied))], [false, true]);
});

test("a reply the user stopped is told to whoever reads the outcome, model or judge", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const { request } = await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  w.say("Decision first: opt", "s2", "assistant", { interrupted: true });
  w.log.ingest(scope, "s2", [{ seq: 2, role: "unknown", kind: "turn/end", content: "", occurredAt: w.now(), metadata: { ended: { kind: "aborted", by: "user" } } }]);
  w.tick();
  w.log.ingest(scope, "s2", [{ seq: 3, role: "user", kind: "user/message", content: "Stop, shorter please", occurredAt: w.now(), metadata: { messageId: "later" } }]);
  const later = w.log.events(scope, "s2").at(-1);
  const calls = [], asked = [];
  const judge = async (state, questions) => { asked.push(state); return Object.fromEntries(Object.keys(questions).map(k => [k, { probabilities: { helped: 0.1, irrelevant: 0.1, wrong: 0.1, unclear: 0.7 } }])); };
  await w.core.outcomes({ judge, mode: "shadow", infer: scripted({ outcome: { feedback: [] } }, calls) });
  assert.deepEqual(calls[0].input.turnEnded, { kind: "aborted", by: "user" });
  assert.equal(asked[0].reply_note, "The user stopped this reply before it finished.");
  assert.deepEqual(w.log.state(`outcome-check:${w.core.traces(request.id).at(-1).id}`).ended, { kind: "aborted", by: "user" }, "and it is on record that the reading knew");
  assert.ok(later.id);
  // A turn that simply finished says nothing extra.
  const w2 = world(t);
  const item2 = w2.learn(w2.say(DIRECTOR.text), DIRECTOR);
  w2.tick();
  await w2.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item2.id, anchor: "memo for the director" }] });
  w2.say("Decision first: option B.", "s2", "assistant");
  w2.log.ingest(scope, "s2", [{ seq: 2, role: "unknown", kind: "turn/end", content: "", occurredAt: w2.now(), metadata: { ended: { kind: "completed" } } }]);
  w2.tick();
  w2.log.ingest(scope, "s2", [{ seq: 3, role: "user", kind: "user/message", content: "Thanks, sent it", occurredAt: w2.now(), metadata: { messageId: "later" } }]);
  const calls2 = [];
  await w2.core.outcomes({ infer: scripted({ outcome: { feedback: [] } }, calls2) });
  assert.equal("turnEnded" in calls2[0].input, false);
});

test("reflection is told when the turn did not finish, and which reply was cut short", async t => {
  const w = world(t);
  w.say("Draft the memo for the director", "s3");
  w.say("Here is the first half", "s3", "assistant", { interrupted: true });
  w.log.ingest(scope, "s3", [{ seq: 2, role: "unknown", kind: "turn/end", content: "", occurredAt: w.now(), metadata: { ended: { kind: "max-tokens" } } }]);
  const calls = [];
  const turn = w.log.pending(w.core.identity, "experienced").find(x => x.sessionId === "s3");
  await w.core.reflect(turn, scripted({ reflect: { changes: [], feedback: [], episode: { scene: "Drafting a memo", signals: [] } } }, calls));
  const input = calls.find(c => c.purpose === "asteme-reflect").input;
  assert.deepEqual(input.turnEnded, { kind: "max-tokens" });
  assert.deepEqual(input.RAW.map(e => [e.role, e.interrupted === true]), [["user", false], ["assistant", true]]);
});

test("what was learned records the agent preset it was learned under", t => {
  const w = world(t);
  w.log.ingest(scope, "s4", [{ seq: 0, role: "user", kind: "user/message", content: DIRECTOR.text, occurredAt: w.now(), metadata: { messageId: "m0", preset: "writer" } }]);
  const first = w.log.events(scope, "s4").at(-1);
  const item = w.learn(first, DIRECTOR);
  assert.equal(item.preset, "writer");
  const plainItem = w.learn(w.say("Deploys go out on Thursdays"), { text: "Deploys go out on Thursdays", about: "deploys", concrete: "Planning a release", general: "Scheduling work around a fixed day" });
  assert.equal("preset" in plainItem, false, "no preset, no field");
});

test("host bookkeeping stored by older versions is removed on request; anything with words, or that something rests on, stays", async t => {
  const w = world(t);
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const host = { log: w.log, core: w.core, directory: dir, config: {} };
  const said = w.say(DIRECTOR.text, "old");
  const item = w.learn(said, DIRECTOR);
  w.log.ingest(scope, "old", [
    { seq: 1, role: "unknown", kind: "step/start", content: "", occurredAt: w.now() },
    { seq: 2, role: "unknown", kind: "job/registered", content: "", occurredAt: w.now() },
    { seq: 3, role: "unknown", kind: "tool/call", content: "{\"command\":\"ls\"}", occurredAt: w.now() },
    { seq: 4, role: "unknown", kind: "something/else", content: "words that were stored", occurredAt: w.now() },
    { seq: 5, role: "unknown", kind: "turn/end", content: "", occurredAt: w.now() },
    { seq: 6, role: "unknown", kind: "step/end", content: "", occurredAt: w.now() },
  ]);
  const before = w.log.cursor(scope, "old");
  const result = await reclaim(host);
  assert.equal(result.dropped, 3);
  assert.deepEqual(w.log.events(scope, "old").map(e => e.kind), ["user/message", "tool/call", "something/else", "turn/end"]);
  assert.equal(w.log.cursor(scope, "old"), before, "the place in the host's log is not lost");
  assert.equal(w.log.ingest(scope, "old", [{ seq: 7, role: "user", kind: "user/message", content: "next", occurredAt: w.now(), metadata: { messageId: "m7" } }]), 8);
  assert.deepEqual([w.core.items().length, w.core.item(item.id).text], [1, DIRECTOR.text]);
  assert.equal((await reclaim(host)).dropped, 0, "running it again finds nothing");
});

test("a provider that says when to come back is not asked before then, and its code is on record", async () => {
  let clock = 1000;
  const notes = [], breaker = { failures: 0, until: 0 };
  const opts = (purpose, call) => ({ purpose, tokens: 1000, timeouts: { waiting: 30000, background: 240000 }, call, note: row => notes.push(row), now: () => clock });
  const refused = async () => { throw Object.assign(new Error("Incomplete memory response (error: rate_limited 429)"), { incomplete: "error", failure: { code: "rate_limited", status: 429, retryAfterMs: 40000 } }); };
  await assert.rejects(guardedCall(breaker, opts("asteme-reflect", refused)));
  assert.deepEqual([notes[0].code, notes[0].status, notes[0].ok], ["rate_limited", 429, false]);
  let made = 0;
  await assert.rejects(guardedCall(breaker, opts("asteme-read", async () => { made++; })), e => e.skipped === true);
  await assert.rejects(guardedCall(breaker, opts("asteme-outcome", async () => { made++; })), e => e.skipped === true);
  assert.equal(made, 0, "neither a waiting call nor a background call is made during the pause");
  clock += 40001;
  assert.equal(await guardedCall(breaker, opts("asteme-read", async () => "ok")), "ok");
  // A provider cannot silence memory for hours.
  const long = async () => { throw Object.assign(new Error("refused"), { failure: { code: "quota", status: 429, retryAfterMs: 86400000 } }); };
  await assert.rejects(guardedCall(breaker, opts("asteme-reflect", long)));
  assert.equal(breaker.rest, clock + REST_LIMIT);
  // A failure without a retry-after pauses nothing.
  const w = { failures: 0, until: 0 };
  await assert.rejects(guardedCall(w, opts("asteme-reflect", async () => { throw Object.assign(new Error("boom"), { failure: { code: "server_error", status: 500 } }); })));
  assert.equal(await guardedCall(w, opts("asteme-reflect", async () => "ok")), "ok");
});

test("the developer report says what the host sent: kinds, turn endings, presets and the shape of marks", t => {
  const w = world(t);
  w.log.save("session:a", { id: "a", agentPreset: "writer" });
  w.log.save("session:b", { id: "b" });
  w.log.ingest(scope, "a", [
    record(user(0, "hello"), { preset: "writer" }),
    record(assistant(1, "hi")),
    record(turnEnd(2, { kind: "aborted", reason: { kind: "user" } })),
    record({ seq: 3, time: 5, type: "feedback/record", data: { messageId: "m1", rating: "down", tags: ["wrong"] } }),
    record({ seq: 4, time: 6, type: "feedback/record", data: { messageId: "m1", rating: "up", tags: [] } }),
    record({ seq: 5, time: 7, type: "feedback/message-delete", data: { messageId: "m1" } }),
    record(turnEnd(6, { kind: "completed" })),
  ]);
  w.core.note("call", { purpose: "asteme-reflect", ok: false, code: "rate_limited", status: 429 });
  const { data, markdown } = w.core.report();
  assert.deepEqual(data.host.kinds, { "feedback/record": 2, "turn/end": 2, "assistant/message": 1, "feedback/message-delete": 1, "user/message": 1 });
  assert.deepEqual(data.host.endings, { "aborted by user": 1, completed: 1 });
  assert.deepEqual(data.host.presets, { writer: 1, none: 1 });
  assert.deepEqual(data.host.marks["feedback/record"], { count: 2, shapes: { "messageId:string, rating:string, tags:array": 2 } });
  assert.deepEqual(data.host.refusals, { "rate_limited 429": 1 });
  assert.match(markdown, /## From the host/);
  assert.doesNotMatch(JSON.stringify(data.host), /"down"|"wrong"/, "shapes are names and types, not what was marked");
});

test("two copies made at the same instant are two files", async t => {
  const w = world(t);
  w.learn(w.say(DIRECTOR.text), DIRECTOR);
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const host = { log: w.log, core: w.core, directory: dir, config: { backupKeep: 5 } };
  const a = await backupNow(host, "manual"), b = await backupNow(host, "manual");
  assert.notEqual(a.name, b.name);
  assert.equal((await listBackups(host)).length, 2);
});

// Forgetting, checked on the bytes: the store file, its write-ahead file, every
// copy and every export beside it.
test("what is forgotten is gone from the store's bytes and from every copy made before", async t => {
  const { Log } = await import("../src/log.mjs");
  const { Asteme } = await import("../src/core.mjs");
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { gunzipSync } = await import("node:zlib");
  const { operations } = await import("../plugin/settings.mjs");
  const { writeExport, forgetCopies } = await import("../plugin/files.mjs");
  const { situationEmbedder } = await import("./helpers.mjs");
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  // Closed before it is removed: Windows will not delete a file that is open.
  t.after(async () => { try { log.close(); } catch {} await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let clock = Date.parse("2026-11-10T09:00:00Z");
  const log = new Log(join(dir, "memory.sqlite"), () => clock);
  t.after(() => { try { log.close(); } catch {} });
  const core = new Asteme({ log, identity: scope, embed: situationEmbedder() });
  const SECRET = "zebra-quartz-0451 is the door code at my mother's flat";
  log.ingest(scope, "s", [{ seq: 0, role: "user", kind: "user/message", content: SECRET, occurredAt: clock, metadata: { messageId: "m0" } },
    { seq: 1, role: "user", kind: "user/message", content: DIRECTOR.text, occurredAt: clock, metadata: { messageId: "m1" } }]);
  const [secret, other] = log.events(scope, "s");
  const learn = (e, fields) => core.item(core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated by the user", tested: "Once", hypothesis: "",
    entities: [], evidence: [{ id: e.id, quote: e.content }], ...fields }], [e]).applied[0].id);
  const item = learn(secret, { text: "The door code at the user's mother's flat is zebra-quartz-0451", about: "door code", concrete: "Visiting the flat", general: "Entering a place that needs a code" });
  learn(other, DIRECTOR);
  const host = { log, core, directory: dir, config: { enabled: true }, identity: scope, judge: null,
    settings() { return { enabled: true }; }, ctx: { llm: { listProviders: () => [], listModels: async () => [] } }, run: p => p, drain: async () => {} };
  await backupNow(host, "auto"); await backupNow(host, "manual");
  await writeExport(host, "archive"); await writeExport(host, "diary"); await writeExport(host, "report");
  const bytes = async () => {
    const found = [];
    const walk = async folder => { for (const name of await readdir(folder)) {
      const path = join(folder, name), s = await stat(path);
      if (s.isDirectory()) { await walk(path); continue; }
      let data = await readFile(path);
      if (name.endsWith(".gz")) data = gunzipSync(data);
      if (data.includes("zebra-quartz-0451")) found.push(path.slice(dir.length + 1));
    } };
    await walk(dir);
    return found;
  };
  assert.ok((await bytes()).length >= 4, "before forgetting it is in the store and in each copy");
  clock += 60000;
  await operations(host)("memory", { operation: "forget", item: item.id, projectId: scope.projectId, revision: item.revision });
  assert.deepEqual(await bytes(), [], "afterwards it is in none of them");
  assert.equal(core.items().length, 1, "what did not rest on it is still there");
  const copies = await listBackups(host);
  assert.deepEqual([copies.length, /after-forget/.test(copies[0].name)], [1, true], "one new copy stands in for the removed ones");
  assert.equal(typeof forgetCopies, "function");
});

test("a store written by a later version is refused untouched, and this version marks what it writes", async t => {
  const { Log, STORE_FORMAT } = await import("../src/log.mjs");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.sqlite");
  const log = new Log(path); log.save("kept", 1); log.close();
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare("PRAGMA user_version").get().user_version, STORE_FORMAT);
  raw.exec(`PRAGMA user_version=${STORE_FORMAT + 1}`); raw.close();
  assert.throws(() => new Log(path), /newer version of Asteme/);
  const again = new DatabaseSync(path);
  assert.equal(again.prepare("PRAGMA user_version").get().user_version, STORE_FORMAT + 1, "nothing was changed");
  again.close();
});

test("saved copies are listed for one-click import, and only Asteme's own folders can be opened", async t => {
  const { listSaved, reveal, writeExport, importFrom } = await import("../plugin/files.mjs");
  const { mkdir } = await import("node:fs/promises");
  const w = world(t);
  w.learn(w.say(DIRECTOR.text), DIRECTOR);
  const dir = await mkdtemp(join(tmpdir(), "asteme-")), other = await mkdtemp(join(tmpdir(), "asteme-out-")), outside = await mkdtemp(join(tmpdir(), "elsewhere-"));
  t.after(() => Promise.all([dir, other, outside].map(d => rm(d, { recursive: true, force: true }))));
  const host = { log: w.log, core: w.core, directory: dir, config: {} };
  await writeExport(host, "archive"); await writeExport(host, "diary");
  host.config.exportDirectory = other;
  await writeExport(host, "report");
  const saved = await listSaved(host);
  assert.deepEqual(saved.map(c => c.kind).sort(), ["archive"], "a diary is for reading, and the copy beside a report is a reduced one: neither is for bringing back");
  const fresh = world(t);
  const into = { log: fresh.log, core: fresh.core, directory: await mkdtemp(join(tmpdir(), "asteme-")), config: {} };
  t.after(() => rm(into.directory, { recursive: true, force: true }));
  assert.ok((await importFrom(into, { path: saved[0].path })).total > 0, "the listed path is what import takes");
  // Opening a folder: the system's file manager, on a folder of ours, and nothing else.
  const ran = [];
  const spawn = (command, args) => { ran.push([command, ...args]); return { unref() {} }; };
  assert.deepEqual(await reveal(host, undefined, { spawn, platform: "win32" }), { opened: dir });
  assert.deepEqual(await reveal(host, saved.find(c => c.kind === "archive").path, { spawn, platform: "darwin" }), { opened: dirname(saved.find(c => c.kind === "archive").path) });
  assert.deepEqual(await reveal(host, other, { spawn, platform: "linux" }), { opened: other });
  assert.deepEqual(ran.map(r => r[0]), ["explorer.exe", "open", "xdg-open"]);
  await assert.rejects(reveal(host, outside, { spawn }), /own folders/);
  await assert.rejects(reveal(host, join(dir, "..", "..", "etc"), { spawn }), /own folders/);
  await assert.rejects(reveal(host, `${dir}-sibling`, { spawn }), /own folders/);
  await mkdir(join(dir, "exports"), { recursive: true });
  await assert.rejects(reveal(host, join(dir, "exports", "missing", "file.json"), { spawn }), /does not exist/);
  assert.equal(ran.length, 3, "a refused request starts nothing");
});

test("starting over erases everything from the store's bytes and its copies, keeps the settings, and does not read old conversations again", async t => {
  const { Log } = await import("../src/log.mjs");
  const { Asteme } = await import("../src/core.mjs");
  const { resetAll, writeExport } = await import("../plugin/files.mjs");
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { gunzipSync } = await import("node:zlib");
  const { situationEmbedder } = await import("./helpers.mjs");
  const dir = await mkdtemp(join(tmpdir(), "asteme-"));
  // Closed before it is removed: Windows will not delete a file that is open.
  t.after(async () => { try { log.close(); } catch {} await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const log = new Log(join(dir, "memory.sqlite"));
  t.after(() => { try { log.close(); } catch {} });
  const core = new Asteme({ log, identity: scope, embed: situationEmbedder() });
  const host = { log, core, directory: dir, config: {}, readings: new Map([["r", 1]]) };
  log.save("settings", { enabled: true, language: "ja" }); log.save("secret:judgeKey", "k"); log.save("session:s", { id: "s", cwd: "/x" });
  log.ingest(scope, "s", [{ seq: 0, role: "user", kind: "user/message", content: "cobalt-heron-3141 is the alarm code", occurredAt: Date.now(), metadata: { messageId: "m0" } }]);
  const said = log.events(scope, "s")[0];
  core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated", text: "The alarm code is cobalt-heron-3141", about: "alarm", concrete: "Arming the alarm",
    general: "Using a code", tested: "Once", hypothesis: "", entities: [], evidence: [{ id: said.id, quote: said.content }] }], [said]);
  await backupNow(host, "auto"); await writeExport(host, "archive");
  const result = await resetAll(host);
  assert.deepEqual([result.memories, result.records, result.copies], [1, 1, 2]);
  const found = [];
  const walk = async folder => { for (const name of await readdir(folder)) {
    const path = join(folder, name), s = await stat(path);
    if (s.isDirectory()) { await walk(path); continue; }
    let data = await readFile(path); if (name.endsWith(".gz")) data = gunzipSync(data);
    if (data.includes("cobalt-heron-3141")) found.push(name);
  } };
  await walk(dir);
  assert.deepEqual(found, [], "no file under the store's folder still holds it");
  assert.deepEqual([core.items().length, log.events(scope, "s").length, host.readings.size], [0, 0, 0]);
  assert.deepEqual([log.state("settings").language, log.state("secret:judgeKey"), log.state("session:s", null)], ["ja", "k", null], "settings stay; what described a conversation goes");
  // The same conversation, offered again by the host, is not read in a second time.
  assert.equal(log.ingest(scope, "s", [{ seq: 0, role: "user", kind: "user/message", content: "cobalt-heron-3141 is the alarm code", occurredAt: Date.now() }]), 1);
  assert.equal(log.events(scope, "s").length, 0);
  // What is said from now on is recorded as usual.
  log.ingest(scope, "s", [{ seq: 1, role: "user", kind: "user/message", content: "a new start", occurredAt: Date.now(), metadata: { messageId: "m1" } }]);
  assert.equal(log.events(scope, "s").length, 1);
});

test("the system's own file chooser is asked for a path; closing it is an answer, and a computer without one says so", async () => {
  const { pick } = await import("../plugin/files.mjs");
  const calls = [];
  const answering = (out, error = null) => (command, args, _options, done) => { calls.push([command, args]); done(error, out); };
  const host = {};
  assert.deepEqual(await pick(host, "folder", { platform: "win32", execFile: answering("C:\\Users\\me\\Documents\\copies\r\n") }), { path: "C:\\Users\\me\\Documents\\copies" });
  assert.equal(calls[0][0], "powershell.exe");
  assert.match(calls[0][1].at(-1), /FolderBrowserDialog/);
  assert.deepEqual(await pick(host, "file", { platform: "darwin", execFile: answering("/Users/me/archive.json\n") }), { path: "/Users/me/archive.json" });
  assert.deepEqual(calls[1], ["osascript", ["-e", "POSIX path of (choose file)"]]);
  assert.deepEqual(await pick(host, "folder", { platform: "linux", execFile: answering("", { code: 1 }) }), { path: null }, "closed without choosing");
  await assert.rejects(pick(host, "file", { platform: "linux", execFile: answering("", { code: "ENOENT" }) }), /Type the path instead/);
  await assert.rejects(pick(host, "anything", { execFile: answering("x") }), /Unknown kind/);
  assert.equal(host.picking, false, "a failed chooser does not leave the next one blocked");
  // Nothing from the panel reaches the command line: the arguments are fixed.
  assert.ok(calls.every(([, args]) => !args.join(" ").includes("anything")));
});

test("the user's own rating of a reply reaches whoever reads the outcome; a rating taken back does not", async t => {
  const { ratingOf } = await import("../src/mind.mjs");
  const put = (seq, messageId, rating, note) => record({ seq, time: 1, type: "feedback/message-put",
    data: { sessionId: "s", item: { messageId, rating, ...(note ? { note } : {}), version: "v", createdAt: 1, updatedAt: 1 } } });
  const gone = (seq, messageId) => record({ seq, time: 1, type: "feedback/message-delete", data: { sessionId: "s", messageId } });
  assert.deepEqual(ratingOf([put(1, "m1", "negative", "  too long  ")], "m1"), { rating: "negative", note: "too long" });
  assert.deepEqual(ratingOf([put(1, "m1", "negative"), put(2, "m1", "positive")], "m1"), { rating: "positive" }, "the latest one counts");
  assert.equal(ratingOf([put(1, "m1", "negative"), gone(2, "m1")], "m1"), null);
  assert.equal(ratingOf([put(1, "m2", "negative")], "m1"), null, "another message's rating is not this one's");
  assert.equal(ratingOf([record({ seq: 1, time: 1, type: "feedback/message-put", data: { item: { messageId: "m1", rating: "meh" } } })], "m1"), null, "an unknown rating is not guessed at");
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  await w.attend("Writing a memo for the director", { session: "s2", scene: "Writing a memo for the director", admit: [{ id: item.id, anchor: "memo for the director" }] });
  w.log.ingest(scope, "s2", [{ seq: 1, role: "assistant", kind: "assistant/message", content: "Decision first: option B.", occurredAt: w.now(), metadata: { messageId: "reply-1" } }]);
  w.tick();
  w.log.ingest(scope, "s2", [{ ...put(2, "reply-1", "negative", "buried the decision"), occurredAt: w.now() },
    { seq: 3, role: "user", kind: "user/message", content: "Try again", occurredAt: w.now(), metadata: { messageId: "later" } }]);
  const calls = [], asked = [];
  const judge = async (state, questions) => { asked.push(state); return Object.fromEntries(Object.keys(questions).map(k => [k, { probabilities: { helped: 0.1, irrelevant: 0.1, wrong: 0.1, unclear: 0.7 } }])); };
  await w.core.outcomes({ judge, mode: "shadow", infer: scripted({ outcome: { feedback: [] } }, calls) });
  assert.deepEqual(calls[0].input.replyRated, { rating: "negative", note: "buried the decision" });
  assert.match(asked[0].reply_rating, /rated this reply negative, with the note: buried the decision/);
});

test("the composer's control reads and switches whether one conversation is remembered", async t => {
  const { operations } = await import("../plugin/settings.mjs");
  const w = world(t);
  const host = { log: w.log, core: w.core, config: { enabled: true }, identity: scope, sessions: new Map([["dsh-1", { sessionId: "dsh-1", scope }]]),
    settings() { return { enabled: true }; }, ctx: { llm: { listProviders: () => [], listModels: async () => [] } }, run: p => p, drain: async () => {} };
  const ask = operations(host);
  assert.deepEqual(await ask("session", { session: "dsh-1" }), { enabled: true, remembered: true, projectOff: false, manner: "", manners: [] });
  assert.deepEqual(await ask("session", { session: "dsh-1", remember: false }), { enabled: true, remembered: false, projectOff: false, manner: "", manners: [] });
  assert.equal(w.core.quiet("dsh-1"), true);
  assert.equal((await ask("session", { session: "dsh-1", remember: true })).remembered, true);
  w.core.setProjectOff(scope.projectId, true);
  assert.deepEqual(await ask("session", { session: "dsh-1" }), { enabled: true, remembered: false, projectOff: true, manner: "", manners: [] });
  // The way of speaking for now is picked here too, and it is the one every session is told.
  const { mannerPrompt } = await import("../plugin/prompt.mjs");
  assert.equal((await ask("session", { session: "dsh-1", manner: " cool and brief " })).manner, "cool and brief");
  assert.match(mannerPrompt(host.log), /spoken to this way: "cool and brief"\. It changes the voice only/);
  assert.equal((await ask("session", { session: "dsh-1", manner: "" })).manner, "");
  assert.equal(mannerPrompt(host.log), "");
  await assert.rejects(ask("session", {}), /conversation is required/);
});

test("work under way when everything is erased does not write the erased memories back", async t => {
  const w = world(t);
  const item = w.learn(w.say(DIRECTOR.text), DIRECTOR);
  w.tick();
  const request = w.say("Writing a memo for the director", "s2");
  let release; const held = new Promise(r => { release = r; });
  // A reading whose model call is still out when the user presses "Erase everything".
  const reading = w.core.prepare({ request, recent: [], reading: "one", infer: async purpose => { await held;
    return JSON.stringify(purpose === "asteme-read" ? { scene: "Writing a memo for the director", need: "how the director reads", entities: [], decisions: [{ id: item.id, decision: "silent", anchor: "memo for the director", expect: "leads with the decision" }] } : {}); } });
  await new Promise(r => setTimeout(r, 20));
  w.log.wipe({ keep: ["settings"] });
  assert.equal(w.core.items().length, 0);
  release();
  const trace = await reading;
  assert.deepEqual([trace.text, trace.delivered.length, trace.stale], ["", 0, true], "nothing erased reaches the reply");
  const left = JSON.stringify(w.log.db.prepare("SELECT data FROM attention").all());
  assert.doesNotMatch(left, /director/i, "and nothing erased is left in what was recorded of the reading");
  // Work that starts after the reset is not disturbed by it.
  const fresh = w.learn(w.say(DIRECTOR.text, "s3"), DIRECTOR);
  w.tick();
  const again = await w.attend("Writing a memo for the director", { session: "s4", scene: "Writing a memo for the director", admit: [{ id: fresh.id, anchor: "memo for the director" }] });
  assert.equal(again.trace.delivered.length, 1);
});

test("background work is paced: a set number of pieces per round, then a pause", async () => {
  const { startRound, ROUND } = await import("../plugin/calls.mjs");
  const state = {};
  let round = startRound(state, 1000, { calls: 1, every: 30000 });
  assert.deepEqual([round.left, round.take(1), round.take(1), round.left], [1, 1, 0, 0]);
  round.end(2000);
  assert.equal(startRound(state, 20000, { calls: 1, every: 30000 }).left, 0, "inside the pause nothing is asked");
  assert.equal(startRound(state, 32000, { calls: 1, every: 30000 }).left, 1);
  // A round that did nothing does not start a pause.
  const idle = {}; startRound(idle, 0).end(5); assert.equal(startRound(idle, 6).left, 1);
  // The bounds hold whatever is asked for.
  assert.equal(startRound({}, 0, { calls: 50 }).left, ROUND.calls.max);
  assert.equal(startRound({}, 0, { calls: 0 }).left, 1);
  const fast = {}; const r = startRound(fast, 0, { calls: 5, every: 1 }); r.take(5); r.end(0);
  assert.equal(startRound(fast, 9999, { calls: 5, every: 1 }).left, 0, "no faster than the shortest pause");
  assert.equal(startRound(fast, 10000, { calls: 5, every: 1 }).left, 5);
});

test("the developer report opens with its version and with what in it deserves a look", t => {
  const w = world(t);
  w.log.save("selfcheck", { at: 1, ms: 2, error: "Cannot find module 'eval/harness.mjs'", passed: 0, total: 0, scenarios: [] });
  for (let i = 0; i < 3; i++) w.core.note("call", { purpose: "asteme-read", ok: true, ms: 11000 + i });
  w.core.note("call", { purpose: "asteme-reflect", ok: false, timeout: true, ms: 240000 });
  const { data, markdown } = w.core.report(w.now(), { hostVersion: "DSH 0.2.2-rc.5" });
  assert.match(data.version, /^\d+\.\d+\.\d+/);
  assert.equal(data.storeFormat, 1);
  assert.deepEqual(data.concerns.map(c => c.code), ["check-failed", "slow-before-reply", "calls-failing"]);
  assert.match(markdown, /^# ASTEME developer report\n\nAsteme \d+\.\d+\.\d+(?:-[a-z0-9.]+)? in DSH 0\.2\.2-rc\.5, written /);
  assert.match(markdown, /## Worth a look\n\n- the model check could not run: Cannot find module/);
  assert.match(markdown, /the reply waits on memory: asteme-read takes 11 s/);
  assert.match(markdown, /model check: could not run at/);
  const quiet = world(t).core.report();
  assert.deepEqual(quiet.data.concerns, []);
  assert.match(quiet.markdown, /nothing stands out in the numbers below/);
});
