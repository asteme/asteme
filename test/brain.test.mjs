// The brain: awake and asleep without a heartbeat, one door to workers, and
// one call that reads, remembers, speaks and acts.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Wakefulness } from "../brain/wake.mjs";
import { openWorker } from "../brain/acp.mjs";
import { openMind, DEFAULTS } from "../brain/mind.mjs";
import { composePage } from "../brain/page.mjs";
import { situationEmbedder } from "./helpers.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-worker.mjs", import.meta.url));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const until = async (ok, ms = 8000) => { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) throw Error("timed out waiting"); await new Promise(r => setTimeout(r, 15)); } };
function fakeClock(start = Date.parse("2026-11-20T09:00:00Z")) {
  let t = start; const timers = [];
  return { now: () => t, timers, set: (v) => { t = v; },
    setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms) { const end = t + ms; for (;;) { const next = timers.filter(h => h.at <= end).sort((a, b) => a.at - b.at)[0]; if (!next) break; timers.splice(timers.indexOf(next), 1); t = Math.max(t, next.at); next.fn(); await settle(); } t = end; await settle(); } };
}

test("nothing is polled: with nothing due there is one timer for falling asleep, and asleep with nothing left there is none", async () => {
  const c = fakeClock(), seen = [], rests = [];
  let more = 2;
  const w = new Wakefulness({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, drowsyAfterMs: 300000, restEveryMs: 30000, settleMs: 20000 })
    .on({ attend: async e => { seen.push(e.kind); }, rest: async depth => { rests.push(depth); return --more > 0; } }).start();
  w.stimulus({ kind: "user" }); await settle();
  assert.deepEqual([seen, w.state], [["user"], "awake"]);
  // A quiet moment: what just happened is read in, paced, while still awake.
  await c.advance(20000); assert.deepEqual(rests, ["light"]);
  await c.advance(30000); assert.deepEqual(rests, ["light", "light"]);
  await c.advance(200000); assert.deepEqual([rests.length, w.state, c.timers.length], [2, "awake", 1], "nothing left to read: only the timer for falling asleep remains");
  await c.advance(60000);
  assert.equal(w.state, "asleep");
  assert.equal(rests.at(-1), "deep");
  await c.advance(3600000 * 5);
  assert.deepEqual([rests.filter(d => d === "deep").length, c.timers.length], [1, 0], "asleep with nothing left: no timer, no call, for five hours");
  w.stimulus({ kind: "user" }); await settle();
  assert.deepEqual([w.state, seen], ["awake", ["user", "user"]]);
});

test("a round of rest does not hold attention up: what arrives meanwhile is attended at once", async () => {
  // Seen in a real run: a worker's result waited a minute behind a reflection.
  const c = fakeClock(), order = []; let release;
  const w = new Wakefulness({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, settleMs: 1000, restEveryMs: 1000 })
    .on({ attend: async e => { order.push(e.kind); }, rest: async () => { order.push("rest starts"); await new Promise(r => { release = r; }); order.push("rest ends"); return false; } }).start();
  w.stimulus({ kind: "user" }); await settle();
  await c.advance(1000);
  w.stimulus({ kind: "worker" }); await settle();
  assert.deepEqual(order, ["user", "rest starts", "worker"]);
  release(); await settle();
  assert.equal(order.at(-1), "rest ends");
  w.stop();
});

test("an intention is one alarm for its own time; what came due while the process was off is attended first and said to be late", async () => {
  const c = fakeClock(); let kept = null; const seen = [];
  const make = () => new Wakefulness({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, load: () => kept, save: v => { kept = structuredClone(v); } }).on({ attend: async e => { seen.push(e); }, rest: async () => false });
  const w = make().start();
  w.intend(c.now() + 7200000, "look at the build"); w.intend(c.now() + 86400000, "ask about the memo", "memo");
  await c.advance(7199000); assert.equal(seen.length, 0);
  await c.advance(1000); assert.deepEqual(seen.map(e => [e.kind, e.why, e.late]), [["alarm", "look at the build", undefined]]);
  w.forget("memo"); assert.equal(w.next(), null);
  w.intend(c.now() + 3600000, "call back"); w.stop();
  // The process is off for a day.
  c.timers.length = 0; c.set(c.now() + 86400000);
  const again = make().start(); await settle();
  const late = seen.at(-1);
  assert.deepEqual([late.kind, late.why, late.late > 80000000, !!late.away], ["alarm", "call back", true, true]);
  again.stop();
});

test("a worker is given words and answers in words; permission is asked of whoever started it, and silence is a refusal", async t => {
  const worker = openWorker({ name: "fake", command: process.execPath, args: [FAKE] });
  t.after(() => worker.close());
  const updates = [];
  const task = await worker.start({ text: "write the file", onUpdate: u => updates.push(u.kind) });
  assert.deepEqual(await task.done, { stopReason: "end_turn", said: "Did: write the file", did: [{ title: "write", status: "completed" }] });
  assert.deepEqual(updates, ["doing", "said"]);
  assert.equal((await task.tell("and one more")).said, "Did: and one more", "the same session takes a follow-up");
  const asked = [];
  const yes = await worker.start({ text: "this needs permission", onPermission: ask => { asked.push(ask.title); ask.answer(true); } });
  assert.deepEqual([(await yes.done).said, asked], ["Done after permission.", ["delete build/"]]);
  const silent = await worker.start({ text: "this needs permission" });
  assert.equal((await silent.done).said, "Not done: permission was refused.");
  const broken = await worker.start({ text: "crash now" });
  await assert.rejects(broken.done, /fake stopped/);
});

const answerFor = (script) => async (purpose, prompt) => {
  const input = JSON.parse(prompt.slice(prompt.lastIndexOf("INPUT:") + 6));
  const value = script(purpose, input, prompt);
  if (value === undefined) throw Error(`no scripted answer for ${purpose}`);
  return value;
};
// A recording of `samples` 16-bit mono samples at 16 kHz under the plainest header: 44 bytes and the sound.
const wavOf = (samples, { fmt = 16, list = false, rate = 16000 } = {}) => {
  const extra = fmt - 16, junk = list ? 8 + 10 : 0, out = new Uint8Array(28 + fmt + junk + samples * 2), v = new DataView(out.buffer), put = (at, t) => { for (let i = 0; i < 4; i++) out[at + i] = t.charCodeAt(i); };
  put(0, "RIFF"); v.setUint32(4, out.length - 8, true); put(8, "WAVE"); put(12, "fmt "); v.setUint32(16, fmt, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  let at = 36 + extra; if (list) { put(at, "LIST"); v.setUint32(at + 4, 10, true); at += 18; }
  put(at, "data"); v.setUint32(at + 4, samples * 2, true); for (let i = 0; i < samples; i++) v.setInt16(at + 8 + i * 2, (i * 37) % 2000 - 1000, true);
  return out;
};
const base = { scene: "The user wants a piece of work done", need: "", entities: [], immediate: [], decisions: [], corrections: [] };

test("the user speaks once; the brain hands the work over, reads what comes back, and reports. The worker's words are stored as read, not said", async t => {
  const calls = [];
  const mind = openMind({ embed: situationEmbedder(), workers: { fake: { ...openWorker({ name: "fake", command: process.execPath, args: [FAKE] }), about: "does file work" } },
    infer: answerFor((purpose, input, prompt) => { calls.push([purpose, input.present?.kind]);
      if (purpose !== "asteme-think") return { changes: [], feedback: [], episode: { scene: "work was handed over", signals: [] } };
      assert.match(prompt, /THIRD, speak and act/);
      if (input.present.kind === "the user wrote") return { ...base, reply: "I have asked the worker to do it.", acts: [{ act: "delegate", to: "fake", task: "build the release notes file" }] };
      assert.equal(input.tasks.at(-1).state, "done");
      return { ...base, reply: "It is done: the notes file was written.", acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Please get the release notes written.");
  await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === 2);
  await mind.idle();
  assert.deepEqual(calls, [["asteme-think", "the user wrote"], ["asteme-think", "a worker came back"]], "two calls in all: nothing was asked while the worker worked");
  const thread = mind.log.events({ userId: "local", agentId: "assistant", projectId: "asteme" }, "thread");
  assert.deepEqual(thread.map(e => [e.role, e.kind]), [["user", "user/message"], ["tool", "tool/call"], ["assistant", "assistant/message"], ["tool", "tool/result"], ["assistant", "assistant/message"], ["unknown", "turn/end"]]);
  assert.match(thread[3].content, /^fake finished "build the release notes file"\.\nIt said: Did: build the release notes file\nIt did: write \[completed\]$/);
  assert.equal(mind.wake.state, "awake");
  assert.equal(mind.snapshot().tasks[0].state, "done");
});

test("permission goes to the user and never to the model; the leash stops work going out without the user", async t => {
  let thinks = 0;
  const mind = openMind({ embed: situationEmbedder(), config: { leash: 2 }, workers: { fake: { ...openWorker({ name: "fake", command: process.execPath, args: [FAKE] }), about: "" } },
    infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return { changes: [], feedback: [], episode: { scene: "s", signals: [] } };
      thinks++;
      if (input.present.kind === "the user wrote") return { ...base, reply: "Asking.", acts: [{ act: "delegate", to: "fake", task: "clean up, this needs permission" }] };
      // Whatever comes back, it tries to send more work out.
      return { ...base, reply: "", acts: [{ act: "delegate", to: "fake", task: "another task entirely" }, { act: "delegate", to: "nobody", task: "another task entirely" }] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Clean the build folder.");
  await until(() => heard.some(e => e.type === "ask"));
  const ask = heard.find(e => e.type === "ask").ask;
  assert.deepEqual([ask.title, ask.to, thinks], ["delete build/", "fake", 1], "the model was not asked about the permission");
  mind.answer(ask.id, false);
  await until(() => mind.snapshot().tasks.filter(x => x.state === "done").length >= 2 && !mind.snapshot().thinking);
  await mind.idle();
  const thread = mind.log.events({ userId: "local", agentId: "assistant", projectId: "asteme" }, "thread");
  assert.match(thread.find(e => e.kind === "tool/result").content, /Not done: permission was refused/);
  assert.ok(thread.some(e => e.kind === "approval/decided" && /"denied"/.test(e.content)));
  const refusals = thread.filter(e => /^Not done:/.test(e.content)).map(e => e.content).join("\n");
  assert.match(refusals, /there is no worker named nobody/);
  assert.match(refusals, /the limit of 2 hand-offs since the user last spoke is reached/);
  assert.equal(mind.snapshot().tasks.length, 2, "two hand-offs went out, the third did not");
});

test("recall is part of the same call: a memory is a candidate in it, the decision is recorded, and the reply says what was used", async t => {
  let seen = null;
  const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose, input) => {
    if (purpose !== "asteme-think") return undefined;
    seen = input;
    return { ...base, scene: "Writing a memo for the director", decisions: input.candidates.map(c => ({ id: c.id, use: "silent", reason: "It says how she reads", anchor: "memo for the director", expect: "the memo opens with the decision" })),
      reply: "Decision first: we ship Tuesday.", acts: [] }; }) });
  t.after(() => mind.close());
  const scope = { userId: "local", agentId: "assistant", projectId: "asteme" };
  mind.log.ingest(scope, "seed", [{ seq: 0, role: "user", kind: "user/message", content: "Lead with the decision for this director", occurredAt: mind.log.now() }]);
  const e = mind.log.events(scope, "seed")[0];
  mind.core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated", text: "Lead with the decision for this director", about: "how this director reads",
    concrete: "Writing a memo for the director", general: "Writing a document for a busy decision maker", tested: "One occasion", hypothesis: "Others untested", entities: [], evidence: [{ id: e.id, quote: e.content }] }], [e]);
  const heard = []; mind.listen(x => heard.push(x));
  mind.start().say("Write the memo for the director about the slip.");
  await until(() => heard.some(x => x.type === "message" && x.role === "assistant"));
  await mind.idle();
  assert.equal(seen.candidates.length, 1);
  assert.deepEqual(seen.workers, []);
  const said = heard.find(x => x.type === "message" && x.role === "assistant");
  assert.deepEqual([said.text, said.used.map(u => u.use)], ["Decision first: we ship Tuesday.", ["silent"]]);
});

test("the page is served to this computer only, and to nobody without the token", async t => {
  const { serve } = await import("../brain/server.mjs");
  const said = [];
  const mind = { listen: () => () => {}, snapshot: () => ({ state: "awake", messages: [] }), say: text => said.push(text), answer: () => {}, memory: id => ({ id, text: "x", private: false }) };
  const door = await serve(mind, { port: 0, token: "tok-123", language: "ja" });
  t.after(() => door.close());
  const at = `http://127.0.0.1:${door.port}`, get = (path, headers = {}) => fetch(at + path, { headers, redirect: "manual" });
  assert.equal((await get("/api/state")).status, 401);
  assert.equal((await get("/?token=wrong")).status, 401);
  const entry = await get("/?token=tok-123");
  assert.equal(entry.status, 303);
  const cookie = entry.headers.get("set-cookie").split(";")[0];
  assert.match(entry.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  // A page elsewhere that points a name at 127.0.0.1 is refused by its Host, cookie or not.
  const http = await import("node:http");
  const foreign = await new Promise(resolve => http.get({ host: "127.0.0.1", port: door.port, path: "/api/state", headers: { host: "evil.example", cookie } }, r => resolve(r.statusCode)));
  assert.equal(foreign, 403);
  const page = await (await get("/", { cookie })).text();
  assert.match(page, /<html lang="ja" data-theme="">/);
  assert.match(page, /const TOKEN = ""/, "with the cookie, the token is not written into the page");
  // Inside a frame a cookie may not travel: the token on the address is enough, and only that token.
  const framed = await (await get("/?token=tok-123&embed=1&theme=dark")).text();
  assert.match(framed, /data-theme="dark"/); assert.match(framed, /const TOKEN = "tok-123"/);
  assert.equal((await get("/api/state?token=tok-123")).status, 200);
  assert.equal((await get("/api/state?token=nope")).status, 401);
  assert.doesNotMatch(page, /__WORDS__|__ICON__|__LANG__/);
  assert.equal((await fetch(at + "/api/say", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ text: "hello" }) })).status, 200);
  assert.deepEqual(said, ["hello"]);
  assert.equal((await fetch(at + "/api/say", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "no cookie" }) })).status, 401);
});

test("from the page a memory can be opened with what it rests on, confirmed, set aside, paused and forgotten; a stale look is refused; the names are the user's to set", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: async () => { throw Error("not asked"); } });
  t.after(() => mind.close());
  const scope = { userId: "local", agentId: "assistant", projectId: "asteme" };
  const teach = (text, session) => { mind.log.ingest(scope, session, [{ seq: 0, role: "user", kind: "user/message", content: text, occurredAt: mind.log.now() }]); const e = mind.log.events(scope, session)[0];
    return mind.core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated", text, about: text.slice(0, 20), concrete: "Writing a memo for the director", general: "Writing for a busy decision maker",
      tested: "One occasion", hypothesis: "Others untested", entities: [], evidence: [{ id: e.id, quote: text }] }], [e]).applied[0].id; };
  const a = teach("Lead with the decision for this director", "s1"), b = teach("Meeting notes follow the order of discussion", "s2");
  const seen = mind.memory(a);
  assert.deepEqual([seen.text, seen.grounds, seen.sources[0].quote, seen.sources[0].role, seen.kind], ["Lead with the decision for this director", "said", "Lead with the decision for this director", "user", "noted"]);
  assert.deepEqual(mind.find("meeting").map(m => m.id), [b]);
  assert.equal(mind.find("").length, 2);
  await mind.change(a, seen.revision, "pause");
  assert.equal(mind.memory(a).paused, true);
  await assert.rejects(mind.change(a, seen.revision, "resume"), /has changed/, "the page was looking at an older version");
  await mind.change(a, mind.memory(a).revision, "resume");
  await mind.change(a, mind.memory(a).revision, "confirm");
  await mind.change(b, mind.memory(b).revision, "forget");
  assert.throws(() => mind.memory(b), /Unknown memory/);
  assert.equal(mind.log.events(scope, "s2").filter(e => e.content).length, 0, "the message it rested on is gone with it");
  assert.equal(mind.snapshot().sky.length, 1);
  assert.deepEqual([mind.self({ name: " Shii ", userName: "Boss", purpose: "ignored here" }).name, mind.snapshot().name, mind.snapshot().you], ["Shii", "Shii", "Boss"]);
  assert.equal(mind.activity().state, "awake");
});

test("a way of speaking for now is a mood with an end: it reaches the next reply, leaves the charter alone, and is gone when its time is up; a person goes out whole and comes back whole", async t => {
  let seen = null, t0 = Date.parse("2026-11-20T09:00:00Z");
  const mind = openMind({ now: () => t0, embed: situationEmbedder(), infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; seen = input;
    return { ...base, reply: "Sure.", acts: /cool/.test(JSON.stringify(input.RAW ?? "")) && !input.manner ? [{ act: "manner", text: "cool and brief", until: "2026-11-20T23:59:00Z" }] : [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Be cool today.");
  await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === 1); await mind.idle();
  assert.deepEqual([mind.snapshot().manner, mind.self().manner.text, mind.core.core().style], ["cool and brief", "cool and brief", {}], "the charter was not rewritten");
  mind.say("And the memo?");
  await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === 2); await mind.idle();
  assert.equal(seen.manner, "cool and brief");
  t0 = Date.parse("2026-11-21T08:00:00Z");
  assert.equal(mind.snapshot().manner, "", "the day is over and the usual voice is back");
  // The whole person: names, the conversation, everything, into another store.
  mind.self({ name: "Shii", userName: "Boss" });
  const copy = mind.core.exportArchive();
  const other = openMind({ embed: situationEmbedder(), infer: async () => ({}) });
  t.after(() => other.close());
  other.core.importArchive(JSON.parse(JSON.stringify(copy)));
  assert.deepEqual([other.snapshot().name, other.snapshot().you, other.snapshot().messages.map(m => m.text)], ["Shii", "Boss", ["Be cool today.", "Sure.", "And the memo?", "Sure."]]);
});

test("the look and the kept ways of speaking belong to the person: checked on the way in, and carried in the copy", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: async () => ({}) });
  t.after(() => mind.close());
  const picture = "data:image/jpeg;base64," + "A".repeat(400);
  assert.deepEqual(mind.look({ wall: picture, dim: 5, blur: -3, accent: "#2F6FED", size: "l" }), { wall: picture, dim: 0.9, blur: 0, accent: "#2F6FED", size: "l" });
  assert.equal(mind.look({ wall: "javascript:alert(1)", accent: "red", size: "huge" }).wall, picture, "what is not a picture, a colour or a size is ignored");
  assert.deepEqual([mind.look().accent, mind.look().size], ["#2F6FED", "l"]);
  mind.self({ manner: "cool and brief" }); mind.self({ keepManner: "cool and brief" }); mind.self({ keepManner: "like a pirate" });
  assert.deepEqual(mind.self().manners, ["like a pirate", "cool and brief"]);
  assert.deepEqual(mind.self({ dropManner: "like a pirate" }).manners, ["cool and brief"]);
  const other = openMind({ embed: situationEmbedder(), infer: async () => ({}) });
  t.after(() => other.close());
  other.core.importArchive(JSON.parse(JSON.stringify(mind.core.exportArchive())));
  assert.deepEqual([other.snapshot().look.accent, other.self().manners, other.snapshot().manner], ["#2F6FED", ["cool and brief"], "cool and brief"]);
});

test("inside DSH the worker is a DSH session started through DSH: kept out of memory, read back from its own record, and said to be waiting when DSH asks its user", async () => {
  const { dshWorker } = await import("../plugin/worker.mjs");
  const saved = new Map(), prompts = [], records = [];
  const host = { abort: new AbortController(), log: { state: (k, d) => saved.get(k) ?? d, save: (k, v) => saved.set(k, v) },
    ctx: { get(name) { return this[name]; }, agents: { list: () => [{ session: { header: { cwd: "/work" } } }] },
      sessionController: { create: async r => ({ sessionId: "session-abc", cwd: r.cwd }), prompt: async r => { prompts.push(r);
        records.push({ seq: records.length, type: "user/message", data: {} }, { seq: records.length + 1, type: "approval/asked", data: {} }); } },
      sessionPersistence: { open: async () => ({ read: async from => ({ events: records.filter(e => e.seq >= from).slice(0, 128) }), close: async () => {} }) } } };
  const updates = [];
  const task = await dshWorker(host, { pollMs: 5 }).start({ text: "write the file", onUpdate: u => updates.push(u.kind) });
  assert.deepEqual([task.sessionId, prompts[0].sessionId, prompts[0].mode, prompts[0].content, saved.get("excluded-sessions")], ["session-abc", "session-abc", "queue", [{ type: "text", text: "write the file" }], ["session-abc"]]);
  await until(() => updates.includes("waiting"), 2000);
  const n = records.length;
  records.push({ seq: n, type: "approval/decided", data: {} }, { seq: n + 1, type: "tool/call", data: { message: { name: "write" } } },
    { seq: n + 2, type: "assistant/message", data: { message: { content: [{ type: "text", text: "Done: the file is written." }] } } }, { seq: n + 3, type: "turn/end", data: { reason: { kind: "completed" } } });
  assert.deepEqual(await task.done, { stopReason: "end_turn", said: "Done: the file is written.", did: [{ title: "write", status: "completed" }] });
  assert.ok(updates.includes("doing"));
  host.ctx.sessionController = undefined;
  await assert.rejects(dshWorker(host).start({ text: "x" }), /does not offer sessions/);
});

test("a file handed over is kept on this computer and reaches the thinking as what it is: text that was read, or something not seen, with its path for a worker", async t => {
  const { mkdtempSync, rmSync, readFileSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const folder = mkdtempSync(join(tmpdir(), "asteme-files-")); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const inputs = [], prompts = [];
  const mind = openMind({ embed: situationEmbedder(), config: { files: folder, fileText: 40 },
    infer: answerFor((purpose, input, prompt) => { if (purpose !== "asteme-think") return { changes: [], feedback: [], episode: { scene: "a file was handed over", signals: [] } };
      inputs.push(input); prompts.push(prompt); return { ...base, reply: "I have the table.", acts: [] }; }) });
  t.after(() => mind.close());
  const csv = mind.keep({ name: "../orders:2026.csv", type: "text/csv", bytes: new TextEncoder().encode("name,qty\nA,1\nB,2\n" + "C,3\n".repeat(30)) });
  const pic = mind.keep({ name: "desk.png", type: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]) });
  assert.equal(csv.name, "_orders_2026.csv", "a name cannot leave the folder");
  assert.throws(() => mind.keep({ name: "x", type: "text/plain", bytes: new Uint8Array(0) }), /empty/);
  assert.equal(mind.file("../../etc/passwd"), null);
  assert.deepEqual(new TextDecoder().decode(readFileSync(mind.file(csv.id).path)).slice(0, 8), "name,qty");
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Total these for me.", [csv.id, pic.id, "not-an-id"]);
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  const files = inputs[0].present.files;
  assert.deepEqual(files.map(f => [f.name, f.type, "text" in f, f.cut === true]), [["_orders_2026.csv", "text/csv", true, true], ["desk.png", "image/png", false, false]], "the picture is named and not described: it was not seen");
  assert.ok(files[0].text.startsWith("name,qty") && files[0].text.length <= 41 && files.every(f => f.path.startsWith(folder)));
  assert.match(prompts[0], /A file with neither "text" nor "seen"[^.]*you have not seen: say nothing about what is in it/);
  const snap = mind.snapshot();
  assert.deepEqual(snap.messages[0].files.map(f => f.name), ["_orders_2026.csv", "desk.png"]);
  assert.deepEqual(snap.can, { files: true, hear: null, model: false, speak: null });
  assert.equal(mind.log.events({ userId: "local", agentId: "assistant", projectId: "asteme" }, "thread")[0].content, "Total these for me.", "what is stored as said is what the user said");
  // Files alone are a message too, recorded by their names; a later moment is told what came with the earlier one.
  mind.say("", [pic.id]);
  await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === 2); await mind.idle();
  assert.equal(mind.snapshot().messages.at(-2).text, "[desk.png]");
  assert.match(prompts.at(-1), /Total these for me\.\\n\[handed over: _orders_2026\.csv, desk\.png\]/);
  assert.throws(() => mind.say("   ", []), /Say something/);
});

test("a host lends the model that speaks and its hearing; alone there is neither, and a session stopped for running too long is said to be stopped", async t => {
  let chosen = null; const heardBytes = [];
  const lent = { now: async () => ({ provider: "p", model: chosen ?? "chat-model", name: chosen ?? "Chat model", follows: !chosen }), list: async () => [{ provider: "p", providerName: "P", model: "other", name: "Other" }], choose: async (sel) => { chosen = sel?.model ?? null; } };
  const slow = { name: "slow", about: "", start: async () => ({ sessionId: "session-slow", done: Promise.reject(Object.assign(new Error("The DSH session did not finish in 30 minutes and was stopped"), { stopped: true })), tell() {}, cancel() {}, close() {} }), close() {} };
  const mind = openMind({ embed: situationEmbedder(), workers: { slow }, models: lent, hear: { state: () => "ready", transcribe: async (bytes) => { heardBytes.push(bytes.length); return { text: "move the review" }; } },
    infer: answerFor((purpose, input) => purpose !== "asteme-think" ? { changes: [], feedback: [], episode: { scene: "s", signals: [] } }
      : input.present.kind === "the user wrote" ? { ...base, reply: "Asked.", acts: [{ act: "delegate", to: "slow", task: "do the long thing" }] } : { ...base, reply: "It was stopped.", acts: [] }) });
  t.after(() => mind.close());
  assert.deepEqual(mind.snapshot().can, { files: true, hear: "ready", model: true, speak: null });
  assert.deepEqual((await mind.models()).now, { provider: "p", model: "chat-model", name: "Chat model", follows: true, window: null });
  assert.equal((await mind.model({ provider: "p", model: "other" })).now.follows, false);
  assert.equal((await mind.model({})).now.follows, true, "nothing chosen is the host's own chat model again");
  assert.deepEqual([await mind.hear(wavOf(1978)), heardBytes], [{ text: "move the review" }, [4000]]);
  await assert.rejects(mind.hear(new Uint8Array(4000)), /not a WAV/);
  await assert.rejects(mind.hear(new Uint8Array(10)), /Nothing was recorded/);
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Do the long thing.");
  await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === 2); await mind.idle();
  assert.equal(mind.snapshot().tasks[0].state, "stopped");
  assert.deepEqual(mind.core.journal({ kind: "work" }).map(w => [w.state, w.ok, w.session]), [["stopped", false, "session-slow"]]);
  const alone = openMind({ embed: situationEmbedder(), infer: async () => ({}) }); t.after(() => alone.close());
  await assert.rejects(alone.model({ provider: "p", model: "other" }), /set where Asteme was started/);
  await assert.rejects(alone.hear(wavOf(1978)), /no speech recognition/);
});

test("the door takes a file as it is and gives it back as a picture or a download, passes a recording through, and says what the page reported being drawn in", async t => {
  const { serve } = await import("../brain/server.mjs");
  const { mkdtempSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const folder = mkdtempSync(join(tmpdir(), "asteme-door-")); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const mind = openMind({ embed: situationEmbedder(), config: { files: folder }, infer: async () => ({ ...base, reply: "ok", acts: [] }), hear: { state: () => "ready", transcribe: async (b) => ({ text: `heard ${b.length}` }) } });
  const door = await serve(mind, { port: 0, token: "tok" }); t.after(async () => { await door.close(); mind.close(); });
  const at = `http://127.0.0.1:${door.port}`, auth = { cookie: "asteme=tok" };
  assert.equal((await fetch(at + "/api/file", { method: "POST", body: "x" })).status, 401);
  const up = async (name, type, body) => (await fetch(at + "/api/file", { method: "POST", headers: { ...auth, "content-type": type, "x-file-name": encodeURIComponent(name) }, body })).json();
  const page = await up("ページ.html", "text/html", "<script>alert(1)</script>"), pic = await up("a.png", "image/png", new Uint8Array([137, 80, 78, 71]));
  assert.deepEqual([page.name, page.type, page.size, pic.type], ["ページ.html", "text/html", 25, "image/png"]);
  const back = await fetch(`${at}/api/file?id=${page.id}`, { headers: auth });
  assert.deepEqual([back.headers.get("content-type"), back.headers.get("content-disposition").startsWith("attachment"), back.headers.get("x-content-type-options"), await back.text()], ["application/octet-stream", true, "nosniff", "<script>alert(1)</script>"], "a page handed over is given back as a download, never opened as a page of this origin");
  const shownPic = await fetch(`${at}/api/file?id=${pic.id}`, { headers: auth });
  assert.deepEqual([shownPic.headers.get("content-type"), shownPic.headers.get("content-disposition").startsWith("inline")], ["image/png", true]);
  assert.equal((await fetch(`${at}/api/file?id=nope`, { headers: auth })).status, 404);
  assert.deepEqual(await (await fetch(at + "/api/hear", { method: "POST", headers: { ...auth, "content-type": "audio/wav" }, body: wavOf(978) })).json(), { text: "heard 2000" });
  assert.equal((await (await fetch(at + "/api/state", { headers: auth })).json()).shown, undefined);
  await fetch(at + "/api/shown", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ theme: "dark", bg: "#151517", ink: "not a colour", from: "host" }) });
  const shown = (await (await fetch(at + "/api/state", { headers: auth })).json()).shown;
  assert.deepEqual([shown.theme, shown.bg, shown.ink, shown.from], ["dark", "#151517", "", "host"]);
  assert.equal((await fetch(at + "/api/say", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ text: "", files: [pic.id] }) })).status, 200);
  await mind.idle();
  assert.deepEqual(mind.snapshot().messages[0].files.map(f => f.name), ["a.png"]);
});

test("the page's script is one that a browser will run: it parses, and no name is declared twice", async () => {
  const { readFile } = await import("node:fs/promises"), vm = await import("node:vm");
  const page = await composePage();
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  // What the server puts in before sending it.
  for (const code of scripts) new vm.Script(code.replace("__WORDS__", "{}").replace("__HOST__", "{}").replace("__MARK__", '""'), { filename: "page.html" });
});

test("the page's styles do not name two motions alike, and every element its script reaches for by id is in the page", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await composePage();
  // A second motion of the same name silently replaces the first wherever it is used.
  const motions = [...page.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
  assert.deepEqual(motions.filter((name, i) => motions.indexOf(name) !== i), []);
  const ids = new Set([...page.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]));
  const asked = new Set([...page.matchAll(/\$\("([\w-]+)"\)/g)].map(m => m[1]));
  assert.deepEqual([...asked].filter(id => !ids.has(id)), []);
  // Among the stars the wheel takes you on through the sky. A change to what else the wheel does once left it doing nothing.
  const wheel = /addEventListener\(\s*"wheel"[\s\S]*?\{ passive: false \},?\s*\);/.exec(page)?.[0] ?? "";
  assert.match(wheel, /goOn\(/);
  // Going on has no end short of the sky's own: it moves the place looked at, and falls back on nearer and further only at the two ends.
  const going = /const goOn = [\s\S]*?\n};/.exec(page)?.[0] ?? "";
  assert.match(going, /aim = hold\(/);
  assert.equal((going.match(/zoomAt\(/g) ?? []).length, 2);
});

test("a long conversation is not summarised away: the message being answered is read whole, older ones briefly, and exchanges before those are known by one line each", async t => {
  const prompts = [], inputs = [];
  const infer = answerFor((purpose, input, prompt) => {
    if (purpose !== "asteme-think") return { changes: [], feedback: [], episode: { scene: `They talked about ${input.RAW.find(r => r.role === "user")?.text.slice(0, 12)}`, signals: [] } };
    prompts.push(prompt); inputs.push(input); return { ...base, reply: `Answer ${inputs.length}.`, acts: [] }; });
  const mind = openMind({ embed: situationEmbedder(), infer, config: { recent: 2, settleMs: 3600000 } });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  const turn = async (text) => { const n = heard.filter(e => e.type === "message" && e.role === "assistant").length; mind.say(text); await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === n + 1); await mind.idle(); };
  const readIn = async () => { for (let p; (p = mind.log.pending({ userId: "local", agentId: "assistant" }, "experienced")[0]);) await mind.core.reflect(p, infer); };
  mind.start();
  const long = `the trip: ${"x".repeat(5000)} and the last word is zebra`;
  await turn(long);
  assert.ok(prompts[0].includes("and the last word is zebra") && !/\[truncated \d+ chars\]/.test(prompts[0]), "what the user has just written is read whole");
  assert.equal(inputs[0].earlier, undefined, "nothing came before");
  await readIn();
  await turn("the budget for next year");
  await readIn();
  await turn("and what did we say about the trip?");
  const third = inputs[2];
  assert.deepEqual(third.earlier.map(e => e.about), ["They talked about the trip: xx"], "the exchange that has left the window is known by its line; the one still in view is not repeated");
  assert.match(third.earlier[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.ok(!prompts[2].includes("zebra"), "its words are not carried: they are in the store, to be searched for");
  assert.match(prompts[2], /INPUT\.earlier, when present, says where this conversation has been/);
  assert.equal(mind.log.events({ userId: "local", agentId: "assistant", projectId: "asteme" }, "thread").find(e => e.role === "user").content, long, "and every word of it is still stored");
});

test("what the DSH worker can do is read from a live DSH session, so a tool added to DSH is known without anything changed here; with no session to read it from, nothing is claimed", async () => {
  const { dshWorker } = await import("../plugin/worker.mjs");
  const saved = new Map(), session = { id: "a" }, tools = [{ name: "bash" }, { name: "read" }, { name: "web_search" }, { name: "web_fetch" }, { name: "asteme_search" }];
  // As in DSH: everyone sees one tool, a session sees them all.
  const host = { abort: new AbortController(), log: { state: (k, d) => saved.get(k) ?? d, save: (k, v) => saved.set(k, v) },
    ctx: { get: (name) => name === "tools" ? { definitions: (agent) => agent === session ? tools : [{ name: "working_directory" }] } : undefined, agents: { list: () => [] } } };
  const worker = dshWorker(host);
  assert.doesNotMatch(worker.about, /Among its tools/, "one tool seen by everyone is not the worker's list");
  host.ctx.agents.list = () => [session];
  assert.match(worker.about, /Among its tools when last looked: bash, read, web_search, web_fetch\. There may be more\.$/, "Asteme's own memory tools are not offered as the worker's");
  // What repeats is Asteme's own to keep: the worker's scheduler is not put forward among what the worker is for.
  tools.push({ name: "schedule_create" }, { name: "schedule_list" }); assert.doesNotMatch(worker.about, /schedule_/); tools.splice(-2);
  tools.push({ name: "read_image" }); assert.match(worker.about, /web_fetch, read_image\./);
  host.ctx.agents.list = () => [];
  assert.match(worker.about, /web_fetch, read_image\./, "with no session open, what the last one saw is remembered");
});

test("what is set aside for the fixed part of a speaking call is at least its real size: the rules cannot grow past it unnoticed", async t => {
  // The room left for what the user says is worked out from this number. When the rules were lengthened and the number was not, the fit to a small window was off by the difference, and only the systems with longer file paths showed it.
  const sizes = [];
  const mind = openMind({ now: () => Date.parse("2026-03-10T12:00:00Z"), embed: situationEmbedder(), infer: answerFor((purpose, input, prompt) => { if (purpose !== "asteme-think") return undefined; sizes.push(prompt.length); return { ...base, reply: "ok", acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("hi");
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  assert.ok(sizes[0] <= DEFAULTS.fixedChars, `the smallest speaking call (${sizes[0]}) fits in fixedChars (${DEFAULTS.fixedChars})`);
  assert.ok(sizes[0] > DEFAULTS.fixedChars - 3000, `and fixedChars is not far above it (${sizes[0]} of ${DEFAULTS.fixedChars}): room set aside and never used is room taken from what the user says`);
});

test("the conversation's length adds nothing to a call, and what arrives at once is fitted to the model that speaks: what was cut is marked, not guessed past", async t => {
  const { mkdtempSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
  const folder = mkdtempSync(join(tmpdir(), "asteme-fit-")); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const sizes = [], inputs = []; let window = null;
  const mind = openMind({ embed: situationEmbedder(), config: { files: folder, settleMs: 3600000 }, models: { now: async () => ({ model: "m", name: "m", follows: false }), window: async () => window },
    infer: answerFor((purpose, input, prompt) => { if (purpose !== "asteme-think") return { changes: [], feedback: [], episode: { scene: "s", signals: [] } }; sizes.push(prompt.length); inputs.push(input); return { ...base, reply: "ok ".repeat(200), acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); mind.start();
  const turn = async (text, files) => { const n = heard.filter(e => e.type === "message" && e.role === "assistant").length; mind.say(text, files); await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length === n + 1); await mind.idle(); };
  for (let i = 0; i < 30; i++) await turn("あ".repeat(3000));
  assert.ok(Math.abs(sizes[29] - sizes[14]) < 200, `the thirtieth call is as large as the fifteenth (${sizes[14]}, ${sizes[29]})`);
  // Everything at once, for a model with a large window: under the ceiling of one call.
  const keep = () => Array.from({ length: 6 }, (_, i) => mind.keep({ name: `f${i}.txt`, type: "text/plain", bytes: new TextEncoder().encode("字".repeat(20000)) }).id);
  await turn("字".repeat(20000), keep());
  assert.ok(sizes.at(-1) <= 80000, `one call stays under its ceiling (${sizes.at(-1)})`);
  const big = inputs.at(-1);
  assert.ok(/\[truncated \d+ chars\]$/.test(big.RAW.at(-1).text) && big.present.files.every(f => f.cut === true), "the message and the files say they were cut");
  // The same for a model that holds little: fitted to it.
  window = 32000;
  await turn("字".repeat(20000), keep());
  const small = inputs.at(-1);
  assert.ok(sizes.at(-1) < 32000 * 0.7 + DEFAULTS.fixedChars && sizes.at(-1) < sizes.at(-2), `fitted to seven tenths of its window (${sizes.at(-1)})`);
  assert.ok(small.present.files.every(f => f.text.length <= 401 && f.path), "each file keeps its beginning and its path, for a worker to open whole");
});

test("the sky itself is every memory in use, not the four hundred the conversation shows; a private one has no words there, and a lesson names its cases", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: async () => ({ ...base, reply: "ok", acts: [] }) });
  t.after(() => mind.close());
  const scope = { userId: "local", agentId: "assistant", projectId: "asteme" };
  mind.log.ingest(scope, "seed", [{ seq: 0, role: "user", kind: "user/message", content: "Notes over a long time, and I take medication at eight", occurredAt: mind.log.now() }]);
  const e = mind.log.events(scope, "seed")[0], put = (n, more = {}) => mind.core.apply([{ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated", text: `Note ${n}`, about: `note ${n}`,
    concrete: `Doing thing ${n}`, general: `A step numbered ${n}`, tested: "Once", hypothesis: "Others untested", entities: [], evidence: [{ id: e.id, quote: "Notes over a long time" }], ...more }], [e]).applied[0].id;
  let secret;
  mind.log.transaction(() => { for (let n = 0; n < 450; n++) put(n); secret = put("private", { text: "Takes medication at eight", sensitive: ["health"], evidence: [{ id: e.id, quote: "I take medication at eight" }] }); });
  const sky = mind.sky();
  assert.equal(sky.length, 451);
  assert.equal(mind.snapshot().sky.length, 400, "the conversation is still sent only what the eye can take in");
  const hidden = sky.find(s => s.id === secret);
  assert.deepEqual([hidden.private, hidden.text], [true, ""]);
  assert.ok(sky.every(s => typeof s.strength === "number" && s.strength >= 0 && s.strength <= 1 && Array.isArray(s.from) && ["noted", "lesson", "matter"].includes(s.kind)));
});

test("a recording is handed to the recognizer in the plainest shape, whatever the recorder wrote around the sound", async () => {
  const { plainWav } = await import("../brain/voice.mjs");
  const plain = wavOf(800), long = wavOf(800, { fmt: 18, list: true }), longer = wavOf(800, { fmt: 40 });
  // A longer "fmt " (as Windows' own speech writes) and a chunk before the sound come out as the same 44 bytes and the same samples.
  for (const given of [plain, long, longer]) assert.deepEqual(Buffer.from(plainWav(given)), Buffer.from(plain));
  // A stream that was never closed leaves its length open: the sound runs to the end.
  const open = wavOf(800); new DataView(open.buffer).setUint32(40, 0xffffffff, true);
  assert.deepEqual(Buffer.from(plainWav(open)), Buffer.from(plain));
  const floats = wavOf(800); new DataView(floats.buffer).setUint16(20, 3, true);
  assert.throws(() => plainWav(floats), /16-bit PCM/);
  assert.throws(() => plainWav(new Uint8Array(300)), /not a WAV/);
});

test("a time it sets is kept with the words it said then, is known to it the next time, and can be taken back by it or by the user", async t => {
  const t0 = Date.parse("2026-03-10T12:00:00Z"); const inputs = [];
  const mind = openMind({ now: () => t0, embed: situationEmbedder(), infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input);
    const n = inputs.length;
    return n === 1 ? { ...base, reply: "I will speak up at the start of June.", acts: [{ act: "wake", at: "2026-06-01T00:00:00Z", why: "Grandmother's pickled plums" }] }
      : n === 2 ? { ...base, reply: "Taken back.", acts: [{ act: "unwake", id: input.waking?.[0]?.id }] } : { ...base, reply: "Set again.", acts: [{ act: "wake", at: "2026-06-02T00:00:00Z", why: "Plums, again" }] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Tell me when the plums are out.");
  await until(() => replies().length === 1); await mind.idle();
  const at = Date.parse("2026-06-01T00:00:00Z");
  assert.deepEqual(replies()[0].promised, [{ at, why: "Grandmother's pickled plums" }]);
  assert.deepEqual(mind.snapshot().messages.at(-1).promised, [{ at, why: "Grandmother's pickled plums" }], "the line under the words is a stored record");
  const [set] = mind.snapshot().intentions; assert.deepEqual([set.at, set.why, typeof set.id], [at, "Grandmother's pickled plums", "string"]);
  mind.say("Never mind the plums.");
  await until(() => replies().length === 2); await mind.idle();
  assert.deepEqual(inputs[1].waking, [{ id: set.id, at: "2026-06-01T00:00:00.000Z", why: "Grandmother's pickled plums" }], "it is told what it has already set");
  assert.deepEqual(mind.snapshot().intentions, []);
  assert.equal(mind.snapshot().messages.at(-3).promised.length, 1, "what it said it would do then stays said");
  mind.say("Actually, do.");
  await until(() => replies().length === 3); await mind.idle();
  const again = mind.activity().intentions[0];
  assert.deepEqual(mind.unwake(again.id), { intentions: [] });
  assert.throws(() => mind.unwake(again.id), /no longer set/);
});

test("a reply may come as two or three messages, a moment apart, each a record of its own; what belongs to the reply stays with the first", async t => {
  const mind = openMind({ now: () => Date.parse("2026-03-10T12:00:00Z"), embed: situationEmbedder(), config: { pauseMs: 0, pauseChar: 0 },
    infer: answerFor(purpose => purpose === "asteme-think" ? { ...base, reply: "June, then.", more: ["Do you still have her recipe?", "  ", 7, "I would like to read it.", "a fourth is not said"], acts: [{ act: "wake", at: "2026-06-01T00:00:00Z", why: "Plums" }] } : undefined) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Tell me when the plums are out.");
  await until(() => replies().length === 3); await mind.idle();
  assert.deepEqual(replies().map(r => r.text), ["June, then.", "Do you still have her recipe?", "I would like to read it."]);
  assert.deepEqual(replies().map(r => !!r.promised), [true, false, false]);
  assert.deepEqual(mind.snapshot().messages.slice(-3).map(m => m.text), ["June, then.", "Do you still have her recipe?", "I would like to read it."], "each is stored as said");
  assert.equal(new Set(replies().map(r => r.id)).size, 3);
  const on = heard.findIndex(e => e.type === "thinking" && e.on === false);
  assert.ok(on > heard.indexOf(replies()[2]), "it is still at it until the last one is said");
});

test("nothing follows a reply that is not given, and a later answer that says the reply again decides what follows it", async t => {
  let n = 0;
  const mind = openMind({ now: () => Date.parse("2026-03-10T12:00:00Z"), embed: situationEmbedder(), config: { pauseMs: 0, pauseChar: 0 },
    infer: answerFor(purpose => purpose === "asteme-think" ? (++n === 1 ? { ...base, reply: "", more: ["only this"], acts: [{ act: "react", emoji: "👍" }] } : { ...base, reply: "Yes." }) : undefined) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Thanks.");
  await until(() => heard.some(e => e.type === "reaction")); await mind.idle();
  assert.equal(replies().length, 0);
  mind.say("Is it Tuesday?");
  await until(() => replies().length === 1); await mind.idle();
  assert.deepEqual(replies().map(r => r.text), ["Yes."]);
});

test("what it keeps in mind has no time on it: it is shown, known to it the next time, and let go by it or by the user", async t => {
  let now = Date.parse("2026-03-10T12:00:00Z"); const inputs = [];
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { held: 2 }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input);
    const n = inputs.length;
    return n === 1 ? { ...base, reply: "Good luck with it.", acts: [{ act: "hold", about: "How the talk with the director went" }, { act: "hold", about: "" }] }
      : n === 2 ? { ...base, reply: "Glad it went well.", acts: [{ act: "unwake", id: input.mind?.[0]?.id }] }
      : { ...base, reply: "Noted.", acts: [{ act: "hold", about: "one" }, { act: "hold", about: "two" }, { act: "hold", about: "three" }] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("I talk to the director tomorrow.");
  await until(() => replies().length === 1); await mind.idle();
  const [kept] = mind.activity().held;
  assert.deepEqual([kept.about, kept.at, /^held-/.test(kept.id), mind.activity().held.length], ["How the talk with the director went", now, true, 1]);
  assert.deepEqual(mind.activity().intentions, [], "it is not a time that was set");
  now += 86400000;
  mind.say("It went well.");
  await until(() => replies().length === 2); await mind.idle();
  assert.deepEqual(inputs[1].mind, [{ id: kept.id, since: "2026-03-10T12:00:00.000Z", about: "How the talk with the director went" }]);
  assert.deepEqual(mind.activity().held, []);
  mind.say("And more.");
  await until(() => replies().length === 3); await mind.idle();
  assert.deepEqual(mind.activity().held.map(h => h.about), ["one", "two"], "no more than it may keep");
  mind.unwake(mind.activity().held[0].id);
  assert.deepEqual(mind.activity().held.map(h => h.about), ["two"], "the user takes one back");
});

test("coming back after a time away is an occasion only when something is kept; it may say it, and saying nothing is not an error", async t => {
  let now = Date.parse("2026-03-10T12:00:00Z"); const presents = []; let quiet = true;
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { absenceMs: 3 * 3600000 }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; presents.push(input.present);
    return input.present.kind === "the user wrote" ? { ...base, reply: "Good luck.", acts: presents.length === 1 ? [] : [{ act: "hold", about: "How it went" }] }
      : quiet ? { ...base, reply: "", acts: [] } : { ...base, reply: "How did it go with the director?", acts: [{ act: "unwake", id: input.mind[0].id }] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Hello.");
  await until(() => replies().length === 1); await mind.idle();
  now += 5 * 3600000;
  assert.equal(mind.here().back, false, "nothing is kept: coming back is nothing");
  await mind.idle(); assert.equal(presents.length, 1);
  mind.say("I talk to the director tomorrow.");
  await until(() => replies().length === 2); await mind.idle();
  now += 3600000;
  assert.equal(mind.here().back, false, "an hour is not away");
  now += 4 * 3600000;
  assert.equal(mind.here().back, true);
  await until(() => presents.length === 3); await mind.idle();
  assert.deepEqual([presents[2].kind, typeof presents[2].gone.from, replies().length, heard.filter(e => e.type === "error").length], ["the user is back", "string", 2, 0], "it was asked, said nothing, and nothing is wrong");
  assert.equal(heard.slice(heard.findLastIndex(e => e.type === "thinking" && e.on)).some(e => e.type === "writing" && e.on), false, "no dots for words that were never said");
  assert.equal(mind.here().back, false, "once for one coming back");
  quiet = false; now += 6 * 3600000;
  assert.equal(mind.here().back, true);
  await until(() => replies().length === 3); await mind.idle();
  assert.equal(replies()[2].text, "How did it go with the director?");
  assert.deepEqual(mind.activity().held, [], "said, and let go");
});

test("a reply is read aloud from what is stored: the marks for the eye are left out, a lent voice is asked with the chosen voice, and the door passes the sound on", async t => {
  const { forVoice, deepseekVoice } = await import("../brain/voice.mjs");
  assert.equal(forVoice("The LTS is **v26** (see [the list](https://nodejs.org/en/about) or https://www.example.com/a/b?c=1).\n\n## Steps\n- run `nvm install 26`\n```sh\nnvm install 26\n```\nDone."),
    "The LTS is v26 (see the list or example.com).\n\nSteps\nrun nvm install 26\nDone.");
  // What is made for a machine to tell things apart by is not read out; a word in front of it is, and a path is read by its file's name. Dates, versions and ordinary words with hyphens are left alone.
  assert.equal(forVoice("The schedule (ID `schedule-b2896268-d0fe-4d29-95ef-ebf1c70c8245`) is kept in `C:\\Users\\owner\\.dsh\\storages\\schedule.json`; commit 9f3c2ab81d77e04c."), "The schedule (ID schedule) is kept in schedule.json; commit.");
  assert.equal(forVoice("Released v26.13.1 on 2026-11-10 with GPT-4o-mini and COVID-19 in well-known README.md."), "Released v26.13.1 on 2026-11-10 with GPT-4o-mini and COVID-19 in well-known README.md.");
  assert.ok(forVoice("漢".repeat(6000) + "。" + "字".repeat(3000)).length <= 4500, "a Chinese character counts as two toward what one reading may carry");
  // DeepSeek's text-to-speech, with the key asked for at each reading.
  const calls = []; const sound = new Uint8Array([1, 0, 2, 0, 3, 0]);
  const lent = deepseekVoice({ auth: async (base) => ({ authorization: "Bearer k-" + base.length }), same: () => false,
    fetch: async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return calls.length === 3 ? new Response(JSON.stringify({ error: { message: "Content Exists Risk" } }), { status: 400 }) : new Response(sound); } });
  assert.deepEqual(lent.state(), { maker: "deepseek", voices: ["stella", "tide"], same: false });
  assert.equal(deepseekVoice({ auth: async () => null, ready: () => false }).state(), null);
  await assert.rejects(deepseekVoice({ auth: async () => null }).speak("hello"), /no DeepSeek key/);
  const mind = openMind({ embed: situationEmbedder(), voice: lent, infer: answerFor((purpose) => purpose !== "asteme-think" ? undefined : { ...base, reply: "It is **done**: see `notes.md`.", acts: [] }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Is it done?");
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  const said = mind.snapshot().messages.at(-1), mine = mind.snapshot().messages.at(-2);
  assert.deepEqual(mind.snapshot().can.speak, { maker: "deepseek", voices: ["stella", "tide"], same: false });
  assert.deepEqual(await mind.aloud(said.id, { as: "text" }), { text: "It is done: see notes.md." });
  await assert.rejects(mind.aloud(mine.id), /no such reply/, "only its own replies are read");
  assert.deepEqual([mind.look({ aloud: "always", voice: "tide" }).aloud, mind.look({}).voice, mind.look({ aloud: "loudly", voice: "<not a voice>" }).aloud], ["always", "tide", "always"]);
  const got = await mind.aloud(said.id);
  assert.deepEqual([got.type, got.rate, calls[0].url, calls[0].headers.authorization, calls[0].body], ["audio/pcm", 24000, "https://api.deepseek.com/v1/tools/tts", "Bearer k-33", { text: "It is done: see notes.md.", voice_id: "tide", format: "pcm", filter_markdown: false }]);
  const { serve } = await import("../brain/server.mjs");
  const door = await serve(mind, { port: 0, token: "tok" }); t.after(() => door.close());
  const at = `http://127.0.0.1:${door.port}`, auth = { cookie: "asteme=tok" };
  const through = await fetch(`${at}/api/speak?id=${said.id}&voice=stella`, { headers: auth });
  assert.deepEqual([through.status, through.headers.get("content-type"), through.headers.get("x-audio-rate"), [...new Uint8Array(await through.arrayBuffer())], calls[1].body.voice_id], [200, "audio/pcm", "24000", [...sound], "stella"]);
  const refused = await fetch(`${at}/api/speak?id=${said.id}`, { headers: auth });
  assert.deepEqual([refused.status, (await refused.json()).error], [400, "DeepSeek did not read it (400: Content Exists Risk)"]);
});

test("a time can come round again: it is set for its next hour when it comes, skips the weekend when it is for weekdays, and says so where it is shown", async t => {
  const { nextTime } = await import("../brain/wake.mjs");
  const fri = new Date(2026, 10, 20, 9, 0).getTime(), day = 86400000;
  assert.equal(nextTime(fri, "day", fri + 1000), fri + day);
  assert.equal(new Date(nextTime(fri, "weekday", fri + 1000)).getDay(), 1, "after Friday a weekday is Monday");
  assert.equal(nextTime(fri, "week", fri + 10 * day), fri + 14 * day, "times missed are not made up one by one");
  assert.equal(new Date(nextTime(fri, "month", fri + 1000)).getMonth(), 11);
  let now = fri - 3600000; const inputs = [];
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input);
    return input.present.kind === "the user wrote" ? { ...base, reply: "Every morning at nine.", acts: [{ act: "wake", at: new Date(fri).toISOString(), why: "Morning greeting", every: "day" }] } : { ...base, reply: "Good morning.", acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Greet me every morning at nine.");
  await until(() => replies().length === 1); await mind.idle();
  assert.deepEqual(replies()[0].promised, [{ at: fri, why: "Morning greeting", every: "day" }]);
  assert.deepEqual(mind.snapshot().intentions.map(i => [i.at, i.every]), [[fri, "day"]]);
  now = fri + 60000; mind.say("And today?");
  await until(() => replies().length >= 3, 8000); await mind.idle();
  assert.ok(inputs.some(i => i.present.kind === "a time you set has come"), "it came at nine");
  assert.deepEqual(mind.snapshot().intentions.map(i => [i.at, i.every]), [[fri + day, "day"]], "and is set for tomorrow");
});

test("it can put a sign on what the user said and send a face the user gave it; both are stored, both can be turned off, and neither takes anything that is not one", async t => {
  const inputs = []; let acts = [{ act: "react", emoji: "👍" }];
  const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input); return { ...base, reply: "Glad to hear it.", acts }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  const turn = async (text) => { const n = replies().length; mind.say(text); await until(() => replies().length > n); await mind.idle(); };
  mind.start(); await turn("I got the job.");
  const mine = mind.snapshot().messages.find(m => m.role === "user");
  assert.deepEqual([mine.reaction, heard.find(e => e.type === "reaction")?.to], ["👍", mine.id]);
  acts = [{ act: "react", emoji: "well done" }]; await turn("Again.");
  assert.equal(mind.snapshot().messages.filter(m => m.role === "user").at(-1).reaction, undefined, "words are not a reaction");
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.throws(() => mind.self({ addExpression: { name: "", image: png } }), /needs a name/);
  assert.throws(() => mind.self({ addExpression: { name: "glad", image: "data:text/html;base64,AAAA" } }), /cannot be kept/);
  assert.deepEqual(mind.self({ addExpression: { name: "glad", image: png } }).expressions, [{ name: "glad", image: png }]);
  acts = [{ act: "express", name: "glad" }, { act: "express", name: "not one" }]; await turn("And a raise.");
  assert.deepEqual([inputs.at(-1).expressions, mind.snapshot().messages.at(-1).expression, mind.snapshot().expressions.length], [[{ name: "glad" }], "glad", 1]);
  mind.self({ feel: { react: false, express: false } });
  acts = [{ act: "react", emoji: "🎉" }, { act: "express", name: "glad" }]; await turn("And a desk by the window.");
  assert.deepEqual([inputs.at(-1).reactions, inputs.at(-1).expressions, mind.snapshot().messages.at(-1).expression, mind.snapshot().messages.at(-2).reaction], ["off", undefined, undefined, undefined]);
  // A model that can see is shown a face once and what it says goes beside the name; the choosing is still by name.
  const eyes = openMind({ embed: situationEmbedder(), models: { now: async () => null, list: async () => [], choose: async () => {}, see: async (image, question) => { assert.match(question, /"waving"/); return { shows: "a small figure waving hello" }; } },
    infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input); return { ...base, reply: "Hello.", acts: [] }; }) });
  t.after(() => eyes.close());
  eyes.self({ addExpression: { name: "waving", image: png } }); await until(() => eyes.self().expressions[0]?.shows);
  const waved = []; eyes.listen(e => waved.push(e)); eyes.start().say("Hi."); await until(() => waved.some(e => e.type === "message" && e.role === "assistant")); await eyes.idle();
  assert.deepEqual(inputs.at(-1).expressions, [{ name: "waving", shows: "a small figure waving hello" }]);
  // A face can be called something else; two cannot share a name.
  mind.self({ addExpression: { name: "sorry", image: png } });
  assert.deepEqual(mind.self({ renameExpression: { from: "glad", to: " pleased " } }).expressions.map(x => x.name), ["pleased", "sorry"]);
  assert.throws(() => mind.self({ renameExpression: { from: "pleased", to: "sorry" } }), /already called that/);
  assert.deepEqual(mind.self({ dropExpression: "pleased" }).expressions.map(x => x.name), ["sorry"]);
});

test("the user can stop what is being thought about for them: the asking is ended, nothing is said or done, and what they said is kept", async t => {
  let asked = 0, ended = 0;
  const mind = openMind({ embed: situationEmbedder(), infer: (purpose, prompt, tokens, stop) => { if (purpose !== "asteme-think") return Promise.resolve({ changes: [], feedback: [], episode: { scene: "s", signals: [] } });
    asked++; return new Promise((resolve, reject) => { stop?.addEventListener("abort", () => { ended++; reject(Object.assign(new Error("stopped"), { name: "AbortError" })); }); if (asked > 1) resolve({ ...base, reply: "Here.", acts: [] }); }); } });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e));
  assert.deepEqual(mind.stop(), { stopped: false });
  mind.start().say("Think about this for a long time.");
  await until(() => asked === 1 && mind.snapshot().thinking);
  assert.ok(mind.snapshot().thinkingSince > 0);
  assert.deepEqual(mind.stop(), { stopped: true });
  await until(() => heard.some(e => e.type === "stopped")); await mind.idle();
  assert.deepEqual([ended, heard.filter(e => e.type === "message" && e.role === "assistant").length, heard.some(e => e.type === "error"), mind.snapshot().thinking, mind.snapshot().messages.length], [1, 0, false, false, 1]);
  mind.say("Never mind, the short answer.");
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  assert.equal(mind.snapshot().messages.at(-1).text, "Here.");
});

test("a worker's question reaches the user as it is and Asteme too: either may answer a choice, only the user may give leave, and the worker is told in its own shape", async t => {
  const got = []; let ask = null, mode = "choose";
  const worker = { name: "hand", about: "", start: async ({ onQuestion }) => ({ sessionId: "s1", tell() {}, cancel() {}, close() {},
    done: (async () => { const q = mode === "leave" ? { id: "q1", question: "Run rm -rf build?", options: [{ label: "Allow" }, { label: "Deny" }], intent: { kind: "approval", approve: "Allow", reject: "Deny" }, detail: "rm -rf build" }
        : { id: "q1", question: "Register it again?", options: [{ label: "Again", description: "same hour" }, { label: "Leave it" }] };
      got.push(await onQuestion({ questions: [q] })); return { stopReason: "end_turn", said: "done", did: [] }; })() }), close() {} };
  const inputs = [];
  const mind = openMind({ embed: situationEmbedder(), workers: { hand: worker }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input);
    if (input.present.kind === "the user wrote") return { ...base, reply: "Asked.", acts: [{ act: "delegate", to: "hand", task: "register the schedule" }] };
    if (input.present.kind === "a worker asks") return { ...base, reply: "You said to keep it, so I told it: again.", acts: [{ act: "answer", ask: input.present.ask, answers: [{ id: "q1", choose: [mode === "leave" ? "Allow" : mode === "wrong" ? "Maybe" : "Again"] }] }] };
    return { ...base, reply: "It is done.", acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const said = () => heard.filter(e => e.type === "message" && e.role === "assistant").length;
  mind.start().say("Register it.");
  await until(() => got.length === 1); await mind.idle();
  ask = heard.find(e => e.type === "ask").ask;
  assert.deepEqual([ask.kind, ask.questions[0].options.map(o => o.label), ask.questions[0].approval], ["question", ["Again", "Leave it"], false]);
  assert.deepEqual(inputs.find(i => i.present.kind === "a worker asks").questions[0].questions, [{ id: "q1", question: "Register it again?", options: ["Again", "Leave it"] }]);
  assert.deepEqual(got[0], { answers: [{ id: "q1", selected: ["Again"] }] }, "answered from what it knew, in the shape the worker takes");
  assert.equal(heard.find(e => e.type === "answered").by, "asteme");
  // Leave to act is never Asteme's to give: its answer is refused and the question stays open for the user.
  mode = "leave"; heard.length = 0; mind.say("Clean the build.");
  await until(() => heard.some(e => e.type === "ask")); await mind.idle();
  ask = heard.find(e => e.type === "ask").ask;
  assert.deepEqual([ask.questions[0].approval, got.length, mind.snapshot().asks.length], [true, 1, 1]);
  assert.throws(() => mind.answer(ask.id, null, [{ id: "q1", choose: ["Perhaps"] }]), /needs one of its options/);
  mind.answer(ask.id, null, [{ id: "q1", choose: ["Deny"] }]);
  await until(() => got.length === 2); await mind.idle();
  assert.deepEqual([got[1], mind.snapshot().asks.length], [{ answers: [{ id: "q1", selected: ["Deny"] }] }, 0]);
});

test("inside DSH a question from one of Asteme's sessions is taken to the conversation, and every other session's is left to DSH", async () => {
  const { dshWorker } = await import("../plugin/worker.mjs");
  const saved = new Map(), hooks = [];
  const host = { abort: new AbortController(), log: { state: (k, d) => saved.get(k) ?? d, save: (k, v) => saved.set(k, v) },
    ctx: { get(name) { return this[name]; }, on(name, fn, first) { hooks.push({ name, fn, first }); return () => hooks.splice(0); }, agents: { list: () => [] },
      sessionController: { create: async () => ({ sessionId: "session-hand" }), prompt: async () => {} }, sessionPersistence: { open: async () => ({ read: async () => ({ events: [] }), close: async () => {} }) } } };
  const asked = [], updates = [];
  const task = await dshWorker(host, { pollMs: 1000 }).start({ text: "x", onUpdate: u => updates.push(u.kind), onQuestion: async (q) => { asked.push(q.questions); return { answers: [{ id: "a", selected: ["Yes"] }] }; } });
  assert.deepEqual([hooks[0].name, hooks[0].first], ["user-questions/request", true]);
  const questions = [{ id: "a", question: "Go on?", options: [{ label: "Yes" }, { label: "No" }] }];
  assert.equal(await hooks[0].fn({ agent: { session: { id: "someone-elses" } }, questions }, () => "dsh's own"), "dsh's own");
  assert.equal(await hooks[0].fn({ agent: { session: { id: "session-hand" } }, questions, wait: 5000 }, () => "timed ones stay with dsh"), "timed ones stay with dsh");
  assert.deepEqual(await hooks[0].fn({ agent: { session: { id: "session-hand" } }, questions }, () => "not this"), { answers: [{ id: "a", selected: ["Yes"] }] });
  assert.deepEqual([asked, updates], [[questions], ["waiting", "resumed"]]);
  task.close(); host.abort.abort(); task.done.catch(() => {});
});

test("the look holds a ground, tones, saved looks, a typeface and a size; how hard it thinks is chosen apart from which model; and a voice of the common kind is asked in that kind's shape", async t => {
  let effort = null;
  const lent = { now: async () => ({ provider: "p", model: "m", name: "M", follows: true, efforts: [{ id: "low", name: "Low" }, { id: "high", name: "High" }], effort: effort ?? "low" }), list: async () => [], choose: async () => {}, effort: async (id) => { if (id && !["low", "high"].includes(id)) throw new Error("This model does not offer that"); effort = id; } };
  const mind = openMind({ embed: situationEmbedder(), models: lent, infer: async () => ({ ...base, reply: "ok", acts: [] }) });
  t.after(() => mind.close());
  const look = mind.look({ ground: "#1D2A3A", its: "#27405c", accent: "#d9b45a", font: "Yu Mincho", px: 17.26, showName: false, tips: false, themes: [{ name: " Night sea ", ground: "#1d2a3a", its: "", mine: "#d9b45a" }, { name: "", ground: "white" }, { name: "bad", ground: "url(x)" }] });
  assert.deepEqual([look.ground, look.its, look.font, look.px, look.showName, look.tips, look.themes], ["#1D2A3A", "#27405c", "Yu Mincho", 17.5, false, false, [{ name: "Night sea", ground: "#1d2a3a", its: "", mine: "#d9b45a" }]]);
  const kept = mind.look({ ground: "javascript:1", font: 'x"; } body { display: none', px: 400 });
  assert.deepEqual([kept.ground, kept.font, kept.px], ["#1D2A3A", "Yu Mincho", 24], "what is not a colour or a name is not taken, and a size stays within reason");
  assert.equal(mind.look({ ground: "" }).ground, "auto");
  // The colour of the letters is the user's too, on the ground and under each kind of words, and a saved look carries it.
  const inked = mind.look({ ink: "#3b2f2f", itsInk: "#5A3E2B", mineInk: "red", themes: [{ name: "Paper", ground: "#f4efe6", ink: "#3b2f2f", mineInk: "nope" }] });
  assert.deepEqual([inked.ink, inked.itsInk, inked.mineInk, inked.themes], ["#3b2f2f", "#5A3E2B", undefined, [{ name: "Paper", ground: "#f4efe6", its: "", mine: "", ink: "#3b2f2f" }]]);
  assert.equal(mind.look({ ink: "" }).ink, "");
  assert.equal((await mind.model({ effort: "high" })).now.effort, "high");
  await assert.rejects(mind.model({ effort: "enormous" }), /does not offer/);
  const { speechVoice } = await import("../brain/voice.mjs"); const calls = [];
  const voice = speechVoice({ url: "http://127.0.0.1:8880/v1/", model: "kokoro", voices: ["af_heart", "<bad>"], auth: async () => ({ authorization: "Bearer k" }), same: () => true,
    fetch: async (url, init) => { calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) }); return calls.length === 1 ? new Response(new Uint8Array([1, 0])) : new Response("{}", { status: 500 }); } });
  assert.deepEqual(voice.state(), { maker: "service", voices: ["af_heart"], same: true });
  const sound = await voice.speak("Hello.", { voice: "nobody" });
  assert.deepEqual([sound.type, sound.rate, calls[0]], ["audio/pcm", 24000, { url: "http://127.0.0.1:8880/v1/audio/speech", auth: "Bearer k", body: { model: "kokoro", input: "Hello.", voice: "af_heart", response_format: "pcm" } }]);
  await assert.rejects(voice.speak("Hello."), /did not read it \(500\)/);
  assert.throws(() => speechVoice({ url: "ftp://x", voices: ["a"] }), /needs its address/);
});

test("what the user said is read when it is taken up; what Asteme said is known to it as seen or not; and a message taken back is erased with what was remembered from it", async t => {
  let now = Date.parse("2026-11-20T09:00:00Z"); const inputs = [];
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input);
    return { ...base, reply: inputs.length === 1 ? "Shall I book the table for seven?" : "Booked.", acts: [] }; }) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  mind.start().say("Dinner on Friday with Mina.");
  await until(() => replies().length === 1); await mind.idle();
  const [mine, its] = mind.snapshot().messages;
  assert.deepEqual([mine.read, heard.find(e => e.type === "read")?.id, its.seen], [now, mine.id, undefined], "read when taken up; its own reply not yet seen");
  assert.equal(inputs[0].unanswered, undefined);
  // Three hours on the page shows it; an hour after that the user writes.
  now += 3 * 3600000; assert.deepEqual(mind.seen([its.id, mine.id, "nope"]), { seen: 1, at: now }); assert.equal(mind.seen([its.id]).seen, 0);
  now += 3600000; mind.say("Yes, seven.");
  await until(() => replies().length === 2); await mind.idle();
  assert.deepEqual(inputs[1].unanswered, [{ said: "2026-11-20T09:00:00.000Z", seen: "2026-11-20T12:00:00.000Z", words: "Shall I book the table for seven?" }]);
  assert.equal(mind.snapshot().messages[1].seen, Date.parse("2026-11-20T12:00:00Z"));
  // The user puts a sign on what it said: no moment comes of it, and it is told the next time it thinks; an empty one takes it off.
  const second = replies()[1].id, asked = inputs.length;
  assert.deepEqual(mind.react(second, "👍"), { to: second, emoji: "👍" }); assert.throws(() => mind.react(second, "nice"), /one pictograph/); assert.throws(() => mind.react(mine.id, "👍"), /no such reply/);
  await mind.idle(); assert.equal(inputs.length, asked);
  assert.equal(mind.snapshot().messages.find(m => m.id === second).reaction, "👍");
  // And answers one thing in particular: it is named to the model, and kept with the message.
  mind.say("Make that eight.", [], its.id);
  await until(() => replies().length === 3); await mind.idle();
  assert.deepEqual([inputs.at(-1).present.replying.to, inputs.at(-1).present.replying.words, inputs.at(-1).unanswered.at(-1).reaction, mind.snapshot().messages.at(-2).replyTo], ["something you said", "Shall I book the table for seven?", "👍", { id: its.id, role: "assistant", words: "Shall I book the table for seven?" }]);
  mind.react(second, ""); assert.equal(mind.snapshot().messages.find(m => m.id === second).reaction, undefined);
  // Turned off, neither side is told.
  mind.self({ feel: { seen: false } }); assert.deepEqual([mind.snapshot().messages[0].read, mind.seen([replies()[2].id])], [undefined, { seen: 0 }]); mind.self({ feel: { seen: true } });
  // Taken back: the words are gone from the store, its place and hour stay, and nothing else of the user's can be taken by that name.
  const before = mind.snapshot().messages.length;
  assert.deepEqual(await mind.retract(mine.id), { retracted: mine.id });
  const after = mind.snapshot().messages;
  assert.deepEqual([after.length, after[0].retracted, after[0].text, after[0].at, heard.find(e => e.type === "retracted")], [before - 1, true, "", mine.at, { type: "retracted", id: mine.id, also: [its.id] }], "what was said in answer to it goes with it");
  assert.ok(!after.some(m => m.id === its.id) && !JSON.stringify(after).includes("Shall I book"));
  assert.ok(!JSON.stringify(mind.core.exportArchive?.() ?? mind.snapshot()).includes("Dinner on Friday with Mina."), "the words are nowhere in what is kept");
  await assert.rejects(mind.retract(mine.id), /no such message/); await assert.rejects(mind.retract(its.id), /no such message/);
});


test("what Asteme said and nobody has looked at is counted, for a mark where the conversation is not in view; looking at it clears the count whether or not seeing is told to Asteme", async t => {
  let now = Date.parse("2026-11-20T09:00:00Z");
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose) => purpose === "asteme-think" ? { ...base, reply: "Done.", acts: [] } : undefined) });
  t.after(() => mind.close());
  const heard = []; mind.listen(e => heard.push(e)); const replies = () => heard.filter(e => e.type === "message" && e.role === "assistant");
  assert.deepEqual(mind.unseen(), { n: 0, at: null });
  mind.start().say("Book the table.");
  await until(() => replies().length === 1); await mind.idle();
  const its = mind.snapshot().messages.at(-1);
  assert.deepEqual(mind.unseen(), { n: 1, at: its.at }, "said after the user's last words and not looked at");
  now += 60000; mind.seen([its.id]);
  assert.equal(mind.unseen().n, 0, "looked at");
  // With seeing not told to Asteme, nothing is marked on the message, and the count is still cleared by looking.
  mind.self({ feel: { seen: false } }); now += 60000; mind.say("And a taxi.");
  await until(() => replies().length === 2); await mind.idle();
  assert.equal(mind.unseen().n, 1);
  now += 60000; assert.equal(mind.seen([mind.snapshot().messages.at(-1).id]).seen, 0); assert.equal(mind.unseen().n, 0);
  assert.equal(mind.snapshot().messages.at(-1).seen, undefined);
});

test("the names of a machine's typefaces are read from the font files: every language a family names itself in, the proper family name before a weight's, one face or a collection", async t => {
  const { namesIn, namesOfFile, fontFolders, fontNames } = await import("../brain/fonts.mjs");
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const utf16 = (s) => { const b = Buffer.from(s, "utf16le"); b.swap16(); return b; };
  const nameTable = (records) => { const head = Buffer.alloc(6 + records.length * 12), parts = []; let at = 0; head.writeUInt16BE(0, 0); head.writeUInt16BE(records.length, 2); head.writeUInt16BE(head.length, 4);
    records.forEach(([platform, id, text], i) => { const b = platform === 1 ? Buffer.from(text, "latin1") : utf16(text), o = 6 + i * 12; head.writeUInt16BE(platform, o); head.writeUInt16BE(platform === 3 ? 1 : 0, o + 2); head.writeUInt16BE(platform === 3 ? 0x409 : 0, o + 4); head.writeUInt16BE(id, o + 6); head.writeUInt16BE(b.length, o + 8); head.writeUInt16BE(at, o + 10); parts.push(b); at += b.length; });
    return Buffer.concat([head, ...parts]); };
  const face = (table, start = 0, tableAt = start + 12 + 32) => { const b = Buffer.alloc(12 + 32); b.writeUInt32BE(0x00010000, 0); b.writeUInt16BE(2, 4); b.write("head", 12, "latin1"); b.writeUInt32BE(tableAt, 20); b.writeUInt32BE(0, 24); b.write("name", 28, "latin1"); b.writeUInt32BE(tableAt, 36); b.writeUInt32BE(table.length, 40); return b; };
  const plain = nameTable([[3, 1, "Yu Gothic"], [3, 1, "游ゴシック"], [1, 1, "Yu Gothic"], [3, 2, "Regular"], [3, 4, "Yu Gothic Regular"]]);
  assert.deepEqual(namesIn(plain), ["Yu Gothic", "游ゴシック"]);
  assert.deepEqual(namesIn(nameTable([[3, 1, "Inter Light"], [3, 16, "Inter"], [3, 1, ".Hidden"]])), ["Inter"], "the family's proper name, not one weight's; a hidden system face is left out");
  assert.deepEqual(namesIn(Buffer.alloc(3)), []);
  const dir = mkdtempSync(join(tmpdir(), "asteme-fonts-")); t.after(() => rmSync(dir, { recursive: true, force: true })); mkdirSync(join(dir, "deeper"));
  writeFileSync(join(dir, "one.ttf"), Buffer.concat([face(plain), plain]));
  // A collection: two faces, each with its own table of names.
  const a = nameTable([[3, 1, "Meiryo"]]), b = nameTable([[3, 1, "Meiryo UI"]]), ttc = Buffer.alloc(20); ttc.write("ttcf", 0, "latin1"); ttc.writeUInt32BE(0x00010000, 4); ttc.writeUInt32BE(2, 8);
  const first = 20, second = first + 44 + a.length; ttc.writeUInt32BE(first, 12); ttc.writeUInt32BE(second, 16);
  writeFileSync(join(dir, "deeper", "two.ttc"), Buffer.concat([ttc, face(a, first), a, face(b, second), b]));
  writeFileSync(join(dir, "notes.txt"), "not a font"); writeFileSync(join(dir, "broken.otf"), Buffer.from("OTTO"));
  assert.deepEqual(namesOfFile(join(dir, "one.ttf")), ["Yu Gothic", "游ゴシック"]);
  assert.deepEqual(namesOfFile(join(dir, "deeper", "two.ttc")), ["Meiryo", "Meiryo UI"]);
  assert.deepEqual(namesOfFile(join(dir, "broken.otf")), []); assert.deepEqual(namesOfFile(join(dir, "missing.ttf")), []);
  assert.deepEqual(fontNames({ folders: [dir, join(dir, "nowhere")] }), ["Meiryo", "Meiryo UI", "Yu Gothic", "游ゴシック"].sort((x, y) => x.localeCompare(y)));
  assert.deepEqual(fontFolders({ WINDIR: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "win32", "C:\\Users\\a").length, 2);
  assert.ok(fontFolders({}, "darwin", "/Users/a").includes("/Library/Fonts")); assert.ok(fontFolders({}, "linux", "/home/a").includes("/usr/share/fonts"));
});

test("a store from before the count was kept: what was already marked seen is not counted as unseen", async t => {
  const { mkdtempSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path"); const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "asteme-unseen-")), path = join(dir, "memory.sqlite");
  let now = Date.parse("2026-11-20T09:00:00Z");
  const open = () => openMind({ path, now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose) => purpose === "asteme-think" ? { ...base, reply: "Done.", acts: [] } : undefined) });
  let mind = open(); const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Book the table."); await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  now += 60000; mind.seen([mind.snapshot().messages.at(-1).id]); assert.equal(mind.unseen().n, 0); mind.close();
  // As an older version left it: the message is marked seen, and no line says when the conversation was last looked at.
  const db = new DatabaseSync(path), gone = db.prepare("DELETE FROM state WHERE key LIKE '%brain:shown%'").run().changes; db.close(); assert.equal(gone, 1);
  // The store is closed before its folder is removed: an open file cannot be removed on Windows.
  mind = open(); t.after(() => { mind.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  assert.equal(mind.unseen().n, 0, "seen then, seen now");
});

test("a store at its very beginning says so until it has been woken or spoken to", async t => {
  let now = Date.parse("2026-11-20T09:00:00Z");
  const inputs = [];
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; inputs.push(input); return { ...base, reply: "I am here.", acts: [] }; }) });
  t.after(() => mind.close()); mind.start();
  assert.equal(mind.snapshot().fresh, true, "nothing said, nothing remembered, never woken");
  const said = []; mind.listen(e => { if (e.type === "message" && e.role === "assistant") said.push(e.text); });
  mind.self({ name: "Mina", userName: "Sam", born: true, language: "ja", firstMemory: "Sam woke me and gave me the name Mina." });
  assert.equal(mind.snapshot().fresh, false, "woken: the first scene is over");
  // Being woken is its first memory, resting on what it was given, and the first star of its sky; and it speaks first.
  const sky = mind.sky(); assert.deepEqual(sky.map(s => [s.text, s.first]), [["Sam woke me and gave me the name Mina.", true]]);
  await until(() => said.length === 1); await mind.idle(); assert.equal(said[0], "I am here.");
  assert.deepEqual([inputs[0].present.kind, inputs[0].present.language], ["you were just woken for the first time", "ja"], "told that it was woken, and in which language to say hello");
  // Woken once: a second time changes nothing.
  mind.self({ born: true, firstMemory: "Again." }); assert.equal(mind.sky().length, 1);
  // A second store that was never woken but has been spoken to is not at its beginning either.
  const other = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose) => purpose === "asteme-think" ? { ...base, reply: "Hello.", acts: [] } : undefined) });
  t.after(() => other.close()); const heard = []; other.listen(e => heard.push(e)); other.start().say("Hello.");
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await other.idle();
  assert.deepEqual([other.snapshot().fresh, other.snapshot().born], [false, false]);
  // Woken later, from the settings: the memory of it is made then, and a conversation already under way is not greeted as if it were the first moment.
  other.self({ name: "Mina", born: true, firstMemory: "I was woken and given the name Mina." }); await other.idle();
  assert.deepEqual([other.snapshot().born, other.sky().filter(s => s.first).length, heard.filter(e => e.type === "message" && e.role === "assistant").length], [true, 1, 1]);
});

test("when the store under it is wiped, nothing it held in its head is left: work that was out, times it had set, and the page is told to start over", async t => {
  let now = Date.parse("2026-11-20T09:00:00Z");
  const mind = openMind({ now: () => now, embed: situationEmbedder(), config: { settleMs: 5, restEveryMs: 100000 }, infer: answerFor((purpose) => purpose === "asteme-think" ? { ...base, reply: "At nine.", acts: [{ act: "wake", at: "2026-11-21T09:00:00Z", why: "Say good morning", every: "day" }] } : undefined) });
  t.after(() => mind.close()); const heard = []; mind.listen(e => heard.push(e));
  mind.start().say("Greet me every morning."); await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  assert.equal(mind.snapshot().intentions.length, 1);
  mind.log.wipe({ keep: [] }); mind.wiped();
  const after = mind.snapshot();
  assert.deepEqual([after.intentions.length, after.messages.length, after.fresh, heard.at(-1).type], [0, 0, true, "wiped"]);
  // Woken, wiped, and woken again by the same names: the second waking is remembered as the first was.
  now += 60000; mind.self({ name: "Mina", userName: "Sam", born: true, greet: false, firstMemory: "Sam woke me and gave me the name Mina." }); assert.equal(mind.sky().filter(s => s.first).length, 1);
  now += 60000; mind.log.wipe({ keep: [] }); mind.wiped(); assert.equal(mind.sky().length, 0);
  now += 60000; mind.self({ name: "Mina", userName: "Sam", born: true, greet: false, firstMemory: "Sam woke me and gave me the name Mina." }); assert.equal(mind.sky().filter(s => s.first).length, 1);
});

test("writing is told apart from thinking: read first, then writing from the first word of the answer (or from the call, where the model cannot say), and never left on", async t => {
  // A host that streams says when the first word comes.
  const answer = answerFor((purpose) => purpose !== "asteme-think" ? undefined : { ...base, reply: "Hello.", acts: [] });
  const marks = [], streaming = Object.assign(async (purpose, prompt, tokens, stop, hooks) => { if (purpose === "asteme-think") { marks.push("called"); await new Promise(r => setTimeout(r, 20)); hooks?.wrote?.(); marks.push("first word"); } return answer(purpose, prompt, tokens, stop); }, { reports: true });
  const mind = openMind({ embed: situationEmbedder(), infer: streaming }); t.after(() => mind.close());
  const heard = []; mind.listen(e => { if (["thinking", "read", "writing", "message"].includes(e.type)) { heard.push(e.type + (e.on === undefined ? (e.role ? ":" + e.role : "") : e.on ? ":on" : ":off")); if (e.type === "writing" && e.on) marks.push("writing"); } });
  mind.start().say("Hi."); await until(() => heard.includes("thinking:off")); await mind.idle();
  assert.deepEqual(heard, ["thinking:on", "message:user", "read", "writing:on", "message:assistant", "writing:off", "thinking:off"]);
  assert.deepEqual(marks, ["called", "writing", "first word"], "not when the call went out: when its first word came");
  assert.equal(mind.snapshot().writing, false);
  // One that does not: writing begins with the call that speaks.
  const plain = openMind({ embed: situationEmbedder(), infer: answer }); t.after(() => plain.close());
  const said = []; plain.listen(e => { if (e.type === "writing" || e.type === "read") said.push(e.type + (e.on === undefined ? "" : e.on ? ":on" : ":off")); });
  plain.start().say("Hi."); await until(() => said.includes("writing:off")); await plain.idle();
  assert.deepEqual(said, ["read", "writing:on", "writing:off"]);
});

test("the greeting can be asked to wait until the scene of its waking is over, and is not given at all to a store wiped in the meantime", async t => {
  let greeted = 0; const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose, input) => { if (purpose !== "asteme-think") return undefined; if (input.present?.kind === "you were just woken for the first time") greeted++; return { ...base, reply: "Hello.", acts: [] }; }) });
  t.after(() => mind.close()); mind.start();
  mind.self({ born: true, name: "Mina", userName: "Boss", firstMemory: "Woken by Boss and named Mina.", greetIn: 120 });
  await new Promise(r => setTimeout(r, 40)); assert.equal(greeted, 0, "not yet");
  await until(() => greeted === 1); await mind.idle();
  assert.equal(mind.snapshot().messages.filter(m => m.role === "assistant").length, 1);
});

test("the conversation with Asteme cannot be one that is not remembered: a mark left on it is taken off and it answers; and silence is never left unexplained", async t => {
  let empty = false; const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose) => purpose !== "asteme-think" ? undefined : empty ? { ...base, reply: "", acts: [] } : { ...base, reply: "Here.", acts: [] }) });
  t.after(() => mind.close()); const heard = []; mind.listen(e => heard.push(e));
  mind.core.setQuiet("thread", true); assert.equal(mind.core.quiet("thread"), true);
  mind.start().say("Are you there?"); await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  assert.equal(mind.core.quiet("thread"), false);
  empty = true; mind.say("And now?"); await until(() => heard.some(e => e.type === "error")); await mind.idle();
  assert.match(heard.find(e => e.type === "error").text, /Nothing came back/);
});

test("every word the page asks for by name is one the door gives it, in English at least", async () => {
  const { readFile } = await import("node:fs/promises"); const { PAGE_SCRIPTS } = await import("../brain/page.mjs"); const copy = await import("../client/copy.mjs");
  const door = await readFile(new URL("../brain/server.mjs", import.meta.url), "utf8"), shared = new Set([...door.match(/const SHARED = \[(.*?)\]/s)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));
  const script = (await Promise.all(PAGE_SCRIPTS.map(n => readFile(new URL(`../brain/page/${n}`, import.meta.url), "utf8")))).join("\n");
  const asked = [...new Set([...script.matchAll(/\bsay\(\s*"([A-Za-z0-9_]+)"\s*[,)]/g)].map(m => m[1]))];
  assert.ok(asked.length > 100, String(asked.length));
  assert.deepEqual(asked.filter(k => !(k in copy.en)), [], "not in the dictionary");
  assert.deepEqual(asked.filter(k => !(k.startsWith("brain") || k.startsWith("kind_") || k.startsWith("idle_") || shared.has(k))), [], "in the dictionary but not handed to the page");
});

test("the page is put together whole whatever the line ends of its files are, and a shell without its places is an error, not a blank page", async () => {
  const { joinPage } = await import("../brain/page.mjs");
  const page = await composePage();
  assert.ok(!page.includes("__STYLE__") && !page.includes("__SCRIPT__"));
  assert.match(page, /--bg:/); assert.match(page, /const birth = /); assert.ok(page.length > 150000, String(page.length));
  const shell = "<style>\r\n/*__STYLE__*/\r\n</style>\r\n<script>\r\n/*__SCRIPT__*/\r\n</script>";
  assert.equal(joinPage(shell, "a{}\r\n", ["let x = '$&';\r\n", "x;\r\n"]), "<style>\r\na{}\r\n</style>\r\n<script>\r\nlet x = '$&';\r\nx;\r\n</script>");
  assert.throws(() => joinPage("<style></style>", "", []), /no place/);
});

test("what is being written is kept with the store until it is sent or emptied, so a restart does not lose it", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose) => purpose !== "asteme-think" ? undefined : { ...base, reply: "Yes.", acts: [] }) });
  t.after(() => mind.close()); const heard = []; mind.listen(e => heard.push(e));
  assert.equal(mind.snapshot().draft, "");
  assert.deepEqual([mind.draft("Half a thought").kept, mind.snapshot().draft], [true, "Half a thought"]);
  assert.equal(heard.length, 0, "it is held, not said: nobody is told");
  mind.draft(""); assert.equal(mind.snapshot().draft, "");
  mind.draft("The whole thought"); mind.start().say("The whole thought");
  await until(() => heard.some(e => e.type === "message" && e.role === "assistant")); await mind.idle();
  assert.equal(mind.snapshot().draft, "", "sent, it is no longer a draft");
});

test("how it is told to speak when it is first woken goes into its charter, not into a mood for the day", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: answerFor(() => undefined) }); t.after(() => mind.close());
  const me = mind.self({ born: true, greet: false, name: "Mina", userName: "Boss", tone: "  Plainly, like a friend  " });
  assert.deepEqual([me.tone, mind.core.core().style.tone, mind.snapshot().tone, mind.snapshot().manner], ["Plainly, like a friend", "Plainly, like a friend", "Plainly, like a friend", ""]);
});

test("the page that is served is the one loaded with the code, and the code is told from what is on the disk by its contents, not its version", async () => {
  const { readFile } = await import("node:fs/promises");
  const door = await readFile(new URL("../brain/server.mjs", import.meta.url), "utf8");
  assert.match(door, /LOADED\.page && !live \? LOADED\.page/, "a page newer than the running code is not read from the disk");
  assert.match(door, /print !== LOADED\.print/, "builds that share a version are still told apart");
});

test("a new page: from there it speaks without the earlier exchanges in front of it; nothing is erased, memory and work are as they were; and it can be joined again", async t => {
  const saw = []; const mind = openMind({ embed: situationEmbedder(), infer: answerFor((purpose, input, prompt) => { if (purpose !== "asteme-think") return undefined; saw.push(prompt); return { ...base, reply: "Yes.", acts: [] }; }) });
  t.after(() => mind.close()); const heard = []; mind.listen(e => heard.push(e));
  const turn = async (text) => { const n = heard.filter(e => e.type === "message" && e.role === "assistant").length; mind.say(text); await until(() => heard.filter(e => e.type === "message" && e.role === "assistant").length > n); await mind.idle(); };
  mind.start(); await turn("The password to the shed is heron.");
  const page = mind.fresh().page; assert.ok(page > 0); assert.equal(mind.snapshot().page, page);
  await new Promise(r => setTimeout(r, 5)); await turn("What were we talking about?");
  assert.ok(!saw.at(-1).includes("heron"), "the earlier exchange is not carried onto the new page");
  assert.ok(saw.at(-1).includes("What were we talking about?"));
  assert.equal(mind.snapshot().messages.filter(m => m.role === "user").length, 2, "and nothing was erased");
  assert.equal(mind.fresh(false).page, 0); await turn("And now?");
  assert.ok(saw.at(-1).includes("heron"), "joined again, it is one conversation");
});

test("a picture handed over is looked at by a model that can see, and what it shows stands before the one that speaks; where none can see, it stays unseen", async t => {
  const prompts = [], looked = [];
  const infer = answerFor((purpose, input, prompt) => { if (purpose !== "asteme-think") return undefined; prompts.push(prompt); return { ...base, reply: "I see it.", acts: [] }; });
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const seeing = openMind({ embed: situationEmbedder(), infer, models: { see: async (image, question) => { looked.push([image.slice(0, 22), question.includes("What is this?")]); return { shows: "A grey heron standing in shallow water." }; } } });
  t.after(() => seeing.close()); const heard = []; seeing.listen(e => heard.push(e.type + ":" + (e.role ?? "")));
  const pic = seeing.keep({ name: "bird.png", type: "image/png", bytes: png });
  seeing.start().say("What is this?", [pic.id]); await until(() => heard.includes("message:assistant")); await seeing.idle();
  assert.deepEqual(looked, [["data:image/png;base64,", true]]);
  assert.ok(prompts.at(-1).includes("A grey heron standing in shallow water."), "what was seen is in front of the one that speaks");
  assert.ok(heard.indexOf("message:user") < heard.indexOf("message:assistant"));
  const blind = openMind({ embed: situationEmbedder(), infer }); t.after(() => blind.close()); const said = []; blind.listen(e => said.push(e.type + ":" + (e.role ?? "")));
  const other = blind.keep({ name: "bird.png", type: "image/png", bytes: png });
  blind.start().say("What is this?", [other.id]); await until(() => said.includes("message:assistant")); await blind.idle();
  assert.ok(!/"seen":\s*"/.test(prompts.at(-1)) && !prompts.at(-1).includes("heron"), "nothing is made up for a picture nobody looked at");
});

test("laid flat, the whole sky keeps what is joined by a line together, and the stars behind the conversation stay where they stand there", async () => {
  // The star view starts from the flat places and returns to them. The page's own rule is run here as it is written (hash, families, flat).
  const { readFile } = await import("node:fs/promises"); const vm = await import("node:vm");
  const src = await readFile(new URL("../brain/page/1-sky.js", import.meta.url), "utf8");
  const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from) + from.length));
  const box = vm.createContext({ innerWidth: 1100, innerHeight: 860 });
  vm.runInContext(`${cut("const hash = ", "\nconst ")}\n${cut("const families = ", "const setSky = ")}\nthis.hash = hash; this.flat = flat;`, box);
  const { hash, flat } = box;
  const star = (id, more = {}) => ({ id, at: Number(id.slice(1)), u: hash(id, 1), v: hash(id, 2), ...more });
  // Forty lessons, each drawn from five cases; a second lesson drawn from one of the same cases; a lesson drawn from a lesson.
  const list = [];
  for (let n = 0; n < 40; n++) { const cases = [0, 1, 2, 3, 4].map(k => star(`c${n * 10 + k}`)); list.push(...cases, star(`l${n * 10 + 5}`, { kind: "lesson", from: cases.map(c => c.id) }), star(`l${n * 10 + 6}`, { kind: "lesson", from: [cases[0].id] }), star(`l${n * 10 + 7}`, { kind: "lesson", from: [`l${n * 10 + 5}`] })); }
  const longest = (map) => { let far = 0; for (const m of map.values()) for (const id of m.from ?? []) { const c = map.get(id); far = Math.max(far, Math.hypot((m.u - c.u) * 0.9 * 1100, (m.v - c.v) * 0.7 * 860)); } return far; };
  const raw = new Map(list.map(m => [m.id, { ...m }]));
  assert.ok(longest(raw) > 600, "placed by their ids alone, lines cross the page");
  // Behind the conversation: a part of the sky, gathered by the same rule.
  const behind = new Map(list.filter((_, n) => n % 3 === 0).map(m => [m.id, { ...m }]));
  flat(behind);
  const whole = new Map(list.map(m => [m.id, { ...m }]));
  flat(whole, behind);
  for (const [id, m] of behind) assert.deepEqual([whole.get(id).u, whole.get(id).v], [m.u, m.v], `${id} moved`);
  // Every memory that is not behind the conversation stands beside one it is joined to.
  for (const m of whole.values()) {
    if (behind.has(m.id)) continue;
    const tied = [...(m.from ?? []), ...list.filter(o => o.from?.includes(m.id)).map(o => o.id)].map(id => whole.get(id));
    if (tied.length) assert.ok(Math.min(...tied.map(c => Math.hypot((m.u - c.u) * 0.9 * 1100, (m.v - c.v) * 0.7 * 860))) < 140, `${m.id} stands alone`);
  }
});

test("the conversation it keeps in hand is the stored one: rows written behind it (an archive brought in), taken back, or wiped are read, and rows added at the end are added", async t => {
  const mind = openMind({ embed: situationEmbedder(), infer: async () => ({}) });
  t.after(() => mind.close());
  const scope = { userId: "local", agentId: "assistant", projectId: "asteme" }, at = Date.parse("2026-11-20T09:00:00Z");
  const said = (seq, text, role = "user") => ({ seq, role, kind: `${role}/message`, content: text, occurredAt: at + seq * 60000 });
  // A place in the order with no row in it (something not kept), as there are in a real conversation.
  mind.log.ingest(scope, "thread", [said(0, "first"), { seq: 1, skip: true }, said(2, "second", "assistant")]);
  assert.deepEqual(mind.snapshot().messages.map(m => m.text), ["first", "second"]);
  mind.log.ingest(scope, "thread", [said(3, "third")]);
  assert.deepEqual(mind.snapshot().messages.map(m => m.text), ["first", "second", "third"], "added at the end");
  // An archive brought in writes a row behind what was read: it is shown, in its place.
  const copy = mind.core.exportArchive(), events = copy.tables.events, data = events.columns.indexOf("data"), id = events.columns.indexOf("id");
  const row = [...events.rows[0]], e = JSON.parse(row[data]);
  row[id] = "behind-" + e.id; row[data] = JSON.stringify({ ...e, id: row[id], seq: 1, content: "from the archive", occurredAt: at + 30000 });
  row[events.columns.indexOf("seq")] = 1;
  mind.core.importArchive({ ...copy, tables: { events: { ...events, rows: [row] } } });
  assert.deepEqual(mind.snapshot().messages.map(m => m.text), ["first", "from the archive", "second", "third"], "brought in behind, and shown in its place");
  // Taken back, and wiped.
  const third = mind.snapshot().messages.find(m => m.text === "third");
  mind.log.erase([third.id]);
  assert.ok(!mind.snapshot().messages.some(m => m.text === "third"));
  mind.log.wipe({ keep: [] });
  assert.deepEqual(mind.snapshot().messages, []);
});
