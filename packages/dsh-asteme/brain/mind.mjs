// The brain: Asteme as the one the user talks to.
//
// One conversation that never ends, kept in Asteme's own store. Every moment
// it attends to has a cause (wake.mjs): the user spoke, a worker came back, a
// time it set itself arrived. One model call reads the situation, decides
// what memory applies, says the reply and names what to do (speakBody in
// src/prompts.mjs). It has no hands: work goes to workers through one door
// (acp.mjs), and what comes back is something it read, never something the
// user said. docs/BRAIN.md has the reasons.
import { Log, profile, scopeKey } from "../src/log.mjs";
import { Asteme, plain, accessibility, useStats } from "../src/core.mjs";
import { Wakefulness, EVERY } from "./wake.mjs";
import { forVoice, plainWav } from "./voice.mjs";
import { mkdirSync, writeFileSync, readFileSync, openSync, readSync, closeSync, existsSync, rmSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const THREAD = "thread",
  STAGE = "experienced";
const cut = (s, n) => {
  const t = String(s ?? "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
export const DEFAULTS = {
  drowsyAfterMs: 300000,
  settleMs: 20000,
  restEveryMs: 30000,
  watchMs: 1200000,
  leash: 8,
  recent: 14,
  resultChars: 6000,
  presentChars: 12000,
  earlier: 10,
  promptChars: 80000,
  // What every speaking call carries whatever is said: the rules, the charter, the shape of the answer. A test holds this to the real size, so the rules cannot grow past it unnoticed.
  fixedChars: 25600,
  candidateChars: 28000,
  fileBytes: 25000000,
  filesAtOnce: 6,
  fileText: 4000,
  // Between two messages said one after the other: a moment, longer for more words, the way a second message takes a moment to write.
  pauseMs: 700,
  pauseChar: 25,
  pauseMax: 2600,
  // How long the user was not here before coming back counts as coming back, and how many things are kept to bring up then.
  absenceMs: 3 * 3600000,
  held: 8,
};
// Kinds of file whose beginning can be read as text. The bytes decide in the
// end: a file with one of these names that is not text is not read.
const TEXTUAL = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".h",
  ".cpp",
  ".cs",
  ".php",
  ".sh",
  ".ps1",
  ".bat",
  ".sql",
  ".log",
  ".tex",
  ".srt",
  ".vue",
  ".svelte",
  ".swift",
  ".lua",
  ".r",
]);

// Inside a host that already has the store open, `shared` is { log, core }:
// the conversation is then one more session in the same memory, and reading
// turns in and consolidating are left to the host, which does them already.
// `models`, `hear` and `voice` are what a host lends: which model speaks (and
// the ones it could be changed to), turning a recording into words, and a
// voice to read replies aloud with. Without them the conversation uses the one
// model it was started with, has no microphone, and is read aloud only by the
// voice the device has.
export function openMind({
  path = ":memory:",
  shared = null,
  identity = { userId: "local", agentId: "assistant" },
  infer,
  embed,
  judge = null,
  workers = {},
  models = null,
  hear = null,
  voice = null,
  now,
  timers = {},
  config = {},
} = {}) {
  if (typeof infer !== "function") throw new Error("The brain needs a model to think with");
  const cfg = { ...DEFAULTS, ...config };
  const log = shared?.log ?? new Log(path, now),
    core = shared?.core ?? new Asteme({ log, identity, embed });
  const scope = { ...identity, projectId: "asteme" };
  // The conversation as stored, read once and then only what was added since. Everything that draws or decides from the whole conversation reads it
  // (fourteen places, three of them in every state the page asks for), and a conversation of a year is tens of thousands of records: read again
  // each time, it was most of what opening the page waited on. Whether the kept copy still is the conversation is asked each time: any write that is
  // not an addition at the end (erasing, wiping, thinning, an archive brought in) is counted by the store (`rewrites`) and makes it read again, and so
  // does a store whose count of records or last record is not what was read; rows only added at the end are added to it. (As first written it trusted
  // the place reached in the conversation, then the count and the last record, and each time a way was found to change the records with those the
  // same.) It is frozen, so nothing can change it by mistake.
  let kept = null;
  const counted = log.db.prepare("SELECT count(*) AS n, max(seq) AS top FROM events WHERE scope=? AND session_id=? AND erased=0");
  const thread = () => {
    const { n, top } = counted.get(scopeKey(scope), THREAD),
      erased = log.rewrites ?? 0;
    if (kept && kept.erased === erased && kept.n === n && kept.top === top) return kept.list;
    if (kept && kept.erased === erased && n > kept.n && (kept.top ?? -1) < (top ?? -1)) {
      const added = log.events(scope, THREAD, (kept.top ?? -1) + 1);
      if (kept.n + added.length === n) {
        kept = { erased, n, top, list: Object.freeze([...kept.list, ...added]) };
        return kept.list;
      }
    }
    const list = log.events(scope, THREAD);
    kept = { erased, n, top, list: Object.freeze(list) };
    return list;
  };
  // What is worked out from the whole conversation is kept with the copy it was worked out from, and worked out again when that copy changes.
  const fromThread = (name, make) => {
    const list = thread();
    if (kept.made?.list !== list) kept.made = { list };
    return name in kept.made ? kept.made[name] : (kept.made[name] = make(list));
  };
  const listeners = new Set(),
    emit = (event) => {
      for (const l of listeners) {
        try {
          l(plain(event));
        } catch {
          /* a listener's failure is its own */
        }
      }
    };
  // What is being thought about for the conversation can be stopped by the user; the rest of what it does cannot.
  let halt = null;
  // Writing is told apart from thinking, as it is between people: the dots that say "is writing" belong to the moment its words begin, not to the time it spends
  // recalling and making up its mind. A host that streams (infer.reports) says when the first word of an answer comes; with one that does not, writing is taken
  // to begin when the call that speaks goes out, which is at least after memory was called up. Once it has begun it stays until the moment is over: what it wrote may be
  // looked at again with more of what it remembers before it is said, and dots that came, went and came back read as words that were lost.
  let writing = false,
    greeting = null;
  // On an occasion where saying nothing is the ordinary case, the dots do not come up for words that may never be said: they would appear and go, answering nothing.
  let hushed = false;
  const write = (on) => {
    if (writing === on || (on && hushed)) return;
    writing = on;
    emit({ type: "writing", on });
  };
  const model = async (purpose, prompt, tokens) => {
    const started = Date.now(),
      speaks = purpose === "asteme-think" && thinking,
      hooks = speaks
        ? {
            wrote: () => {
              if (thinking) write(true);
            },
          }
        : undefined;
    if (speaks && !infer.reports) hooks.wrote();
    if (shared) return infer(purpose, prompt, tokens, halt?.signal, hooks); // the host keeps the journal
    try {
      const v = await infer(purpose, prompt, tokens, halt?.signal, hooks);
      core.note("call", { purpose, ok: true, ms: Date.now() - started, tokens });
      return v;
    } catch (e) {
      core.note("call", {
        purpose,
        ok: false,
        ms: Date.now() - started,
        tokens,
        error: cut(e.message, 200),
        ...(e.name === "TimeoutError" ? { timeout: true } : {}),
      });
      throw e;
    }
  };
  // Files the user hands over are kept beside the store, on this computer only.
  const filesDir =
    cfg.files ?? (log.path && log.path !== ":memory:" ? join(dirname(log.path), "files") : join(tmpdir(), `asteme-files-${process.pid}`));
  const fileOf = (id) => {
    const f = typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? log.state(`brain:file:${id}`, null) : null;
    return f && existsSync(join(filesDir, f.file)) ? { ...f, path: join(filesDir, f.file) } : null;
  };
  // The beginning of a file that reads as text. Anything else is not read here.
  const beginning = (f) => {
    if (!TEXTUAL.has(extname(f.name).toLowerCase()) && !/^text\//.test(f.type)) return null;
    const buffer = Buffer.alloc(Math.min(f.size, cfg.fileText * 4)),
      fd = openSync(f.path, "r");
    try {
      readSync(fd, buffer, 0, buffer.length, 0);
    } finally {
      closeSync(fd);
    }
    if (buffer.includes(0)) return null;
    return cut(buffer.toString("utf8").replace(/\uFFFD+$/, ""), cfg.fileText);
  };
  const add = (role, content, kind = `${role}/message`, metadata) => {
    log.ingest(scope, THREAD, [{ seq: log.cursor(scope, THREAD), role, kind, content, occurredAt: log.now(), ...(metadata ? { metadata } : {}) }]);
    return thread().at(-1);
  };
  // Work that is out with workers. Handles live in this process; what is kept
  // is enough to say, after a restart, what was lost.
  const tasks = new Map((log.state("brain:tasks", []) ?? []).map((t) => [t.id, t.state === "running" ? { ...t, state: "lost" } : t]));
  const handles = new Map(),
    asks = new Map();
  const keepTasks = () => log.save("brain:tasks", [...tasks.values()].slice(-60));
  const brief = (t) => ({
    id: t.id,
    to: t.to,
    task: cut(t.task, 300),
    state: t.state,
    startedAt: t.startedAt,
    ...(t.endedAt ? { endedAt: t.endedAt } : {}),
    ...(t.where ? { where: t.where } : {}),
    ...(t.error ? { error: t.error } : {}),
    ...(t.session ? { session: t.session } : {}),
  });
  let turnOpen = false,
    origin = null,
    steps = 0,
    thinking = false,
    thinkingSince = null,
    lastRecall = null;
  // The way of speaking for now: a mood the user asked for, with an end. The
  // charter is not touched by it, and when it ends the usual voice is back.
  const manner = () => {
    const m = log.state("brain:manner", null);
    if (m?.until && m.until <= log.now()) {
      log.save("brain:manner", null);
      return null;
    }
    return m?.text ? m : null;
  };
  const setManner = (text, until) => {
    const t = typeof text === "string" ? cut(text.trim(), 300) : "";
    log.save("brain:manner", t ? { text: t, until: Number.isFinite(until) && until > log.now() ? until : null, at: log.now() } : null);
    emit({ type: "manner" });
    return t;
  };
  const running = () => [...tasks.values()].filter((t) => t.state === "running");
  // The end of a matter says how it ended, as a host's turn does: without it every one of these counted as "ended, reason not recorded".
  const endTurn = () => {
    if (turnOpen) {
      add("unknown", "", "turn/end", { ended: { kind: "completed" } });
      turnOpen = false;
    }
  };

  const wake = new Wakefulness({
    now: () => log.now(),
    ...timers,
    drowsyAfterMs: cfg.drowsyAfterMs,
    restEveryMs: cfg.restEveryMs,
    settleMs: cfg.settleMs,
    load: () => log.state("brain:wake", null),
    save: (v) => log.save("brain:wake", v),
  });

  // --- Workers -----------------------------------------------------------------
  const finish = (task, outcome, error) => {
    if (task.state !== "running") return;
    task.state = error?.stopped ? "stopped" : error ? "failed" : outcome.stopReason === "cancelled" ? "cancelled" : "done";
    task.endedAt = log.now();
    if (error) task.error = cut(error.message, 400);
    // One line for each round of work, so that one which never came back can be traced afterwards.
    core.note("work", {
      to: task.to,
      task: task.id,
      ...(task.session ? { session: task.session } : {}),
      ok: !error,
      state: task.state,
      ms: log.now() - (task.sentAt ?? task.startedAt),
      ...(task.last ? { last: task.last } : {}),
      ...(error ? { error: task.error } : {}),
    });
    wake.forget(`watch:${task.id}`);
    keepTasks();
    emit({ type: "task", task: brief(task) });
    wake.stimulus({ kind: "worker", task: task.id, ...(error ? { error: cut(error.message, 400) } : { outcome }) });
  };
  const dispatch = async (task, text, first) => {
    const worker = workers[task.to];
    task.state = "running";
    task.sentAt = log.now();
    task.last = null;
    keepTasks();
    emit({ type: "task", task: brief(task) });
    wake.intend(log.now() + cfg.watchMs, `Nothing has come back from ${task.to} on "${cut(task.task, 80)}"`, `watch:${task.id}`);
    try {
      let handle = handles.get(task.id);
      const onPermission = (ask) => {
        // Permission is the user's to give. It goes to them as it is, and the
        // brain is not asked: a model must not be the one to say yes.
        const id = `${task.id}:${asks.size + 1}:${log.now()}`;
        asks.set(id, { id, task: task.id, to: task.to, title: ask.title, detail: ask.detail, answer: ask.answer });
        emit({ type: "ask", ask: { id, task: task.id, to: task.to, title: ask.title, detail: ask.detail } });
      };
      // A worker may also ask something with choices. It is shown to the user as it is; unless it asks leave to act, Asteme is told too, and may answer from what it already knows.
      const onQuestion = (asked) =>
        new Promise((answer, fail) => {
          const id = `${task.id}:q${asks.size + 1}:${log.now()}`;
          const questions = (asked.questions ?? []).map((q, i) => ({
            id: String(q.id ?? i),
            question: cut(q.question ?? q.header ?? "", 600),
            detail: cut(typeof q.detail === "string" ? q.detail : q.detail ? JSON.stringify(q.detail) : "", 800),
            options: (q.options ?? []).map((o) => ({ label: String(o.label ?? o), description: cut(o.description ?? "", 300) })),
            multi: q.multiSelect === true,
            approval: q.intent?.kind === "approval",
          }));
          if (!questions.length) return fail(new Error("Nothing was asked"));
          const ask = { id, kind: "question", task: task.id, to: task.to, questions, answer };
          asks.set(id, ask);
          emit({ type: "ask", ask: { id, kind: "question", task: task.id, to: task.to, questions } });
          asked.signal?.addEventListener?.(
            "abort",
            () => {
              if (asks.delete(id)) {
                emit({ type: "answered", id, by: "nobody" });
                fail(new Error("The question was withdrawn"));
              }
            },
            { once: true },
          );
          if (!questions.some((q) => q.approval)) wake.stimulus({ kind: "question", ask: id });
        });
      const done =
        first || !handle
          ? ((handle = await worker.start({
              where: task.where || undefined,
              text,
              onPermission,
              onQuestion,
              onUpdate: (u) => {
                task.last = { kind: u.kind, text: cut(u.text, 80), after: log.now() - task.sentAt };
                emit({ type: "progress", task: task.id, ...u, text: cut(u.text, 200), ...(handle?.sessionId ? { session: handle.sessionId } : {}) });
              },
            })),
            handles.set(task.id, handle),
            (task.session = handle.sessionId ?? null),
            handle.done)
          : handle.tell(text);
      finish(task, await done);
    } catch (e) {
      finish(task, null, e);
    }
  };
  const act = (a, present) => {
    if (!a || typeof a !== "object") return null;
    if (a.act === "delegate" || a.act === "tell") {
      if (a.act === "delegate" && !workers[a.to]) return { refused: "delegate", why: `there is no worker named ${cut(a.to, 40)}` };
      // The leash: how many times work may go out before the user speaks again.
      if (steps >= cfg.leash)
        return { refused: a.act, why: `the limit of ${cfg.leash} hand-offs since the user last spoke is reached; report and ask` };
      if (a.act === "delegate") {
        if (typeof a.task !== "string" || a.task.trim().length < 8) return { refused: "delegate", why: "the task says too little" };
        const task = {
          id: `t${tasks.size + 1}-${Math.round(log.now() % 1e5)}`,
          to: a.to,
          task: a.task.trim(),
          where: typeof a.where === "string" ? a.where.trim() : "",
          origin,
          startedAt: log.now(),
          state: "running",
        };
        tasks.set(task.id, task);
        steps++;
        add("tool", `To ${task.to}: ${task.task}`, "tool/call", { tool: { phase: "call", name: task.to }, task: task.id });
        void dispatch(task, task.task, true);
        return { started: task.id };
      }
      const task = tasks.get(a.task);
      if (!task || !handles.has(task.id) || task.state === "running") return { refused: "tell", why: "that task cannot be continued" };
      if (typeof a.message !== "string" || !a.message.trim()) return { refused: "tell", why: "nothing to say" };
      steps++;
      task.endedAt = undefined;
      add("tool", `To ${task.to}, continuing: ${a.message.trim()}`, "tool/call", { tool: { phase: "call", name: task.to }, task: task.id });
      void dispatch(task, a.message.trim(), false);
      return { continued: task.id };
    }
    if (a.act === "cancel") {
      const h = handles.get(a.task);
      if (h && tasks.get(a.task)?.state === "running") {
        h.cancel();
        return { cancelling: a.task };
      }
      return { refused: "cancel", why: "that task is not running" };
    }
    if (a.act === "manner") {
      const t = setManner(a.text, Date.parse(a.until));
      return t ? { speaking: t } : { speaking: "as usual" };
    }
    if (a.act === "wake") {
      const at = Date.parse(a.at);
      if (!Number.isFinite(at) || at <= log.now() || typeof a.why !== "string" || !a.why.trim())
        return { refused: "wake", why: "a time in the future and a reason are needed" };
      const every = EVERY.includes(a.every) ? a.every : null;
      const id = wake.intend(at, cut(a.why.trim(), 300), null, every);
      emit({ type: "intention", at, why: cut(a.why.trim(), 300) });
      return { waking: new Date(at).toISOString(), promised: { id, at, why: cut(a.why.trim(), 300), ...(every ? { every } : {}) } };
    }
    // A small sign on what the user just said, the way a person nods. Only a pictograph is one; anything else is words and belongs in the reply.
    if (a.act === "react") {
      if (!feel().react || present?.kind !== "the user wrote" || !origin)
        return { refused: "react", why: "there is nothing of the user's to react to now" };
      const emoji = typeof a.emoji === "string" ? a.emoji.trim() : "";
      if (!emoji || emoji.length > 16 || !/^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f)+$/u.test(emoji))
        return { refused: "react", why: "a reaction is one pictograph" };
      add("unknown", JSON.stringify({ to: origin, emoji }), "reaction");
      emit({ type: "reaction", to: origin, emoji });
      return { reacted: emoji };
    }
    // A face of its own, from the ones the user gave it: it goes with the words of this moment.
    if (a.act === "express") {
      const mine = expressions().find((x) => x.name === a.name);
      if (!feel().express || !mine) return { refused: "express", why: "there is no such expression" };
      return { expressed: mine.name };
    }
    // A worker's question, answered from what is already known. One that asks leave to act is the user's alone.
    if (a.act === "answer") {
      const ask = asks.get(a.ask);
      if (!ask || ask.kind !== "question") return { refused: "answer", why: "that question is no longer open" };
      if (ask.questions.some((q) => q.approval)) return { refused: "answer", why: "leave to act is the user's to give" };
      try {
        settle(ask, a.answers, "asteme");
      } catch (e) {
        return { refused: "answer", why: e.message };
      }
      return { answered: ask.id };
    }
    // Something to bring up when the user is next around: kept in its own words, with no time on it.
    if (a.act === "hold") {
      const about = typeof a.about === "string" ? cut(a.about.trim(), 300) : "";
      if (!about) return { refused: "hold", why: "what is kept needs words" };
      const list = held();
      if (list.length >= cfg.held) return { refused: "hold", why: `${cfg.held} things are kept already; let one go first` };
      const kept = { id: `held-${randomUUID().slice(0, 8)}`, at: log.now(), about, ...(origin ? { from: origin } : {}) };
      log.save("brain:mind", [...list, kept]);
      emit({ type: "intention" });
      return { holding: kept.id };
    }
    if (a.act === "unwake") {
      if (held().some((h) => h.id === a.id)) {
        log.save(
          "brain:mind",
          held().filter((h) => h.id !== a.id),
        );
        emit({ type: "intention" });
        return { unset: a.id };
      }
      if (!standing().some((w) => w.id === a.id)) return { refused: "unwake", why: "there is no such time set" };
      wake.forget(a.id);
      emit({ type: "intention" });
      return { unset: a.id };
    }
    return null;
  };

  // How it may show feeling besides words: a pictograph on what the user said, and faces the user gave it. Both can be turned off.
  const feel = () => ({ react: true, express: true, seen: true, ...(log.state("brain:feel", null) ?? {}) });
  // Who has had what in front of them. A message of the user's is read when Asteme takes it up; a reply of Asteme's is seen when the page had it in view. Each is kept by the message's id with the time, the last few hundred.
  const marks = (key) => log.state(key, null) ?? {},
    mark = (key, id, at) => {
      const all = marks(key);
      if (all[id]) return false;
      const next = Object.fromEntries([...Object.entries(all), [id, at]].slice(-300));
      log.save(key, next);
      return true;
    };
  const expressions = () => (log.state("brain:expressions", []) ?? []).filter((x) => x && typeof x.name === "string" && typeof x.image === "string");
  // A face is chosen by its name. A model that can see pictures is also shown each face once and says in a few words what it shows; that goes beside the name from then on. Nothing is waited for, and a model that cannot see is not asked.
  const seen = async (name, image) => {
    if (!models?.see) return;
    try {
      const said = await models.see(
        image,
        'This picture was given to an assistant as a face it may send to show how it takes something. Say what the face shows, as a person would name the expression, in at most twelve words, in the language of its name ("' +
          cut(name, 40) +
          '"). Return {"shows":"..."}.',
      );
      const shows = typeof said?.shows === "string" ? cut(said.shows.trim(), 120) : "";
      if (!shows) return;
      log.save(
        "brain:expressions",
        expressions().map((x) => (x.name === name && x.image === image ? { ...x, shows } : x)),
      );
      emit({ type: "look" });
    } catch {
      /* it is still chosen by its name */
    }
  };
  // A worker's question is settled once, by the user or by Asteme: each of its questions gets one or more of its own options, or words.
  const settle = (ask, answers, by) => {
    const given = Array.isArray(answers) ? answers : [];
    const out = ask.questions.map((q) => {
      const a = given.find((x) => x?.id === q.id) ?? (ask.questions.length === 1 ? given[0] : null);
      if (!a) throw new Error(`no answer for "${cut(q.question, 60)}"`);
      const selected = (Array.isArray(a.choose) ? a.choose : typeof a.choose === "string" ? [a.choose] : []).filter((l) =>
          q.options.some((o) => o.label === l),
        ),
        custom = typeof a.say === "string" && a.say.trim() ? cut(a.say.trim(), 1000) : undefined;
      if (!selected.length && !custom) throw new Error(`"${cut(q.question, 60)}" needs one of its options or words`);
      if (selected.length > 1 && !q.multi) throw new Error(`"${cut(q.question, 60)}" takes one option`);
      return { id: q.id, selected, ...(custom ? { custom } : {}) };
    });
    asks.delete(ask.id);
    ask.answer({ answers: out });
    const text = out
      .map((o, i) => `${cut(ask.questions[i].question, 120)} → ${[...o.selected, ...(o.custom ? [o.custom] : [])].join(", ")}`)
      .join("; ");
    add("tool", `${by === "user" ? "The user answered" : "You answered"} ${ask.to}'s question: ${text}`, "tool/result", {
      tool: { phase: "result", name: ask.to, execution: "completed" },
      task: ask.task,
    });
    emit({ type: "answered", id: ask.id, by, text });
  };
  // The signs put on what was said, by which message; the last one on each stands, and an empty one takes it off. Asteme's are on the user's words, the user's on Asteme's.
  const reactions = () => {
    const its = new Map(),
      theirs = new Map();
    for (const e of thread())
      if (e.kind === "reaction") {
        try {
          const r = JSON.parse(e.content);
          if (!r?.to) continue;
          const on = r.by === "user" ? theirs : its;
          if (r.emoji) on.set(r.to, r.emoji);
          else on.delete(r.to);
        } catch {
          /* not one */
        }
      }
    return { its, theirs };
  };
  // What it said since the user last wrote, with when each was said and when it was first in front of the user, if it was. For it to know whether it was heard; nothing is done with this in code.
  const unanswered = (present) => {
    if (!feel().seen) return {};
    const said = thread().filter((e) => e.content && ["user", "assistant"].includes(e.role)),
      seen = marks("brain:seen"),
      theirs = reactions().theirs;
    let end = said.length;
    if (present?.kind === "the user wrote") end = said.map((e) => e.id).lastIndexOf(origin);
    if (end < 0) end = said.length;
    const mine = [];
    for (let i = end - 1; i >= 0 && said[i].role === "assistant" && mine.length < 4; i--)
      mine.unshift({
        said: new Date(said[i].occurredAt).toISOString(),
        seen: seen[said[i].id] ? new Date(seen[said[i].id]).toISOString() : null,
        words: cut(said[i].content, 60),
        ...(theirs.get(said[i].id) ? { reaction: theirs.get(said[i].id) } : {}),
      });
    return mine.length ? { unanswered: mine } : {};
  };
  // The times it has set to look at something or to speak, soonest first. A watch on a worker is its own business.
  const standing = () => wake.alarms.filter((a) => !String(a.ref ?? "").startsWith("watch:")).sort((a, b) => a.at - b.at);

  // What it keeps to bring up when the user is next around. No time is set on these; each is in its own words, from the moment it kept it.
  const held = () => (log.state("brain:mind", null) ?? []).filter((h) => h && typeof h.id === "string" && typeof h.about === "string");

  // --- One moment of attention ---------------------------------------------------
  const think = async (request, present) => {
    // An earlier message that came with files says so, by name, where the model reads it.
    // After a new page, only what was said since is in front of it (and the words it is answering, whenever they were said).
    const page = log.state("brain:page", null) ?? 0;
    const recent = thread()
      .filter((e) => e.content && ["user", "assistant", "tool"].includes(e.role) && ((e.occurredAt ?? 0) > page || e.id === request.id))
      .slice(-cfg.recent)
      .map((e) =>
        e.metadata?.files?.length && e.id !== request.id
          ? { ...e, content: `${e.content}\n[handed over: ${e.metadata.files.map((f) => f.name).join(", ")}]` }
          : e,
      );
    let reply = "",
      more = [],
      acts = [];
    const zone = cfg.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const here = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, dateStyle: "short", timeStyle: "short" }).format(new Date(log.now()));
    // The conversation never ends and is never summarised away: every word of
    // it stays in the store. What is in front of the model at one moment is
    // the last few records, what memory brings, and this: one line for each
    // earlier exchange that has been read into memory, so it knows where the
    // conversation has been without carrying it.
    const first = recent[0]?.occurredAt ?? log.now(),
      shown = new Set(recent.map((e) => e.id));
    const earlier = core
      .episodes()
      .filter((e) => e.sessionId === THREAD && e.scene && e.at < first && e.at > page && !(e.events ?? []).some((id) => shown.has(id)))
      .sort((a, b) => a.at - b.at)
      .slice(-cfg.earlier)
      .map((e) => ({
        at: new Intl.DateTimeFormat("sv-SE", { timeZone: zone, dateStyle: "short", timeStyle: "short" }).format(new Date(e.at)),
        about: e.scene,
      }));
    const input = (found) => ({
      present,
      clock: { zone, here },
      ...(earlier.length ? { earlier } : {}),
      ...(manner() ? { manner: manner().text } : {}),
      workers: Object.entries(workers).map(([name, w]) => ({ name, about: w.about ?? "" })),
      tasks: [...tasks.values()].slice(-8).map(brief),
      ...(standing().length
        ? {
            waking: standing()
              .slice(0, 8)
              .map((w) => ({ id: w.id, at: new Date(w.at).toISOString(), why: w.why, ...(w.every ? { every: w.every } : {}) })),
          }
        : {}),
      ...unanswered(present),
      ...(held().length ? { mind: held().map((h) => ({ id: h.id, since: new Date(h.at).toISOString(), about: h.about })) } : {}),
      ...(feel().express && expressions().length
        ? { expressions: expressions().map((x) => ({ name: x.name, ...(x.shows ? { shows: x.shows } : {}) })) }
        : {}),
      ...(feel().react ? {} : { reactions: "off" }),
      ...([...asks.values()].some((a) => a.kind === "question")
        ? {
            questions: [...asks.values()]
              .filter((a) => a.kind === "question")
              .map((a) => ({
                ask: a.id,
                task: a.task,
                from: a.to,
                questions: a.questions.map((q) => ({
                  id: q.id,
                  question: q.question,
                  options: q.options.map((o) => o.label),
                  ...(q.multi ? { many: true } : {}),
                  ...(q.approval ? { leave: true } : {}),
                })),
              })),
          }
        : {}),
      ...(present.away ? { away: { from: new Date(present.away.from).toISOString(), to: new Date(present.away.to).toISOString() } } : {}),
      ...(found ? { found } : {}),
    });
    const speak = (found) => ({
      input: input(found),
      draft: () => ({ reply, acts }),
      heard: (a) => {
        // What follows the reply belongs to that reply: a later answer that says the reply again says what follows it again, or that nothing does.
        if (typeof a.reply === "string") {
          reply = a.reply;
          more = Array.isArray(a.more) ? a.more : [];
        }
        if (Array.isArray(a.acts)) acts = a.acts;
      },
    });
    // One moment has a ceiling. The length of the conversation does not add
    // to a call: the records shown, the lines of `earlier` and the candidates
    // are each a fixed number of bounded pieces. What can be large is what
    // arrives at once: a long message and files with it. Those are fitted to
    // the model that speaks (seven tenths of its window when the host knows
    // it, counted as one token a character, which is the worst case), and
    // what was cut is marked as cut, so it is said and not guessed past.
    let window = null;
    try {
      window = await models?.window?.();
    } catch {
      /* not known */
    }
    const budget = Math.min(cfg.promptChars, Number.isFinite(window) && window > 0 ? Math.floor(window * 0.7) : Infinity);
    // Of what is left after the fixed part (the rules, the charter), memory's candidates may take a little under half, and what is said takes the rest.
    const open = Math.max(12000, budget - cfg.fixedChars),
      candidateChars = Math.min(cfg.candidateChars, Math.max(6000, Math.floor(open * 0.45)));
    const older = recent.filter((e) => e.id !== request.id).reduce((n, e) => n + Math.min(e.content.length, 1200), 0);
    const texts = (present.files ?? []).filter((f) => typeof f.text === "string");
    let left = Math.max(2000, open - candidateChars - older);
    const mine = Math.min(cfg.presentChars, Math.max(2000, Math.floor(left * (texts.length ? 0.5 : 1))));
    left = Math.max(0, left - Math.min(mine, request.content.length));
    if (texts.length) {
      const each = Math.max(400, Math.floor(left / texts.length));
      for (const f of texts)
        if (f.text.length > each) {
          f.text = cut(f.text, each);
          f.cut = true;
        }
    }
    let trace = await core.prepare({
      request,
      recent,
      infer: model,
      judge,
      admission: judge ? "shadow" : "model",
      reading: "one",
      wide: { ids: new Set([request.id]), n: mine },
      candidateChars,
      speak: speak(),
    });
    // Deliberate recall: once, and then it answers with what was found.
    const search = acts.find((a) => a?.act === "search" && typeof a.query === "string" && a.query.trim());
    if (search && !trace.error) {
      const found = { query: cut(search.query, 200), ...(await core.seek(search.query, { here: scope.projectId })) };
      acts = acts.filter((a) => a !== search);
      trace = await core.prepare({
        request,
        recent,
        infer: model,
        judge,
        admission: judge ? "shadow" : "model",
        reading: "one",
        wide: { ids: new Set([request.id]), n: mine },
        candidateChars,
        speak: speak(found),
      });
    }
    // How the last calling of memories went, for whoever watches it grow: the time is recall's own, without the model.
    lastRecall = {
      ms: trace.recallMs ?? null,
      candidates: trace.candidates?.length ?? 0,
      crowded: trace.crowded ?? 0,
      memories: core.items().length,
      at: log.now(),
    };
    const opening = typeof reply === "string" ? reply.trim() : "";
    return {
      reply: opening,
      // Two more at most, and only after a first: a reply in pieces is still one reply.
      more: opening
        ? more
            .filter((m) => typeof m === "string" && m.trim())
            .map((m) => m.trim())
            .slice(0, 2)
        : [],
      acts: acts.filter((a) => a?.act !== "search"),
      trace,
    };
  };
  const attend = async (event) => {
    thinking = true;
    const since = log.now();
    halt = new AbortController();
    const mine = halt;
    emit({ type: "thinking", on: true, since });
    thinkingSince = since;
    try {
      let request, present;
      hushed = event.kind === "return";
      own();
      if (event.kind === "user") {
        const files = (event.files ?? []).map(fileOf).filter(Boolean),
          listed = files.map(({ id, name, type, size }) => ({ id, name, type, size }));
        // Words are the user's; a message of files alone is recorded by their names.
        const about = event.replyTo ? thread().find((e) => e.id === event.replyTo && e.content) : null,
          replyTo = about ? { id: about.id, role: about.role, words: cut(about.content, 140) } : null;
        endTurn();
        request = add(
          "user",
          event.text || `[${files.map((f) => f.name).join(", ")}]`,
          undefined,
          files.length || replyTo ? { ...(files.length ? { files: listed } : {}), ...(replyTo ? { replyTo: replyTo.id } : {}) } : undefined,
        );
        turnOpen = true;
        origin = request.id;
        steps = 0;
        present = {
          kind: "the user wrote",
          ...(replyTo
            ? {
                replying: {
                  to: replyTo.role === "assistant" ? "something you said" : "something they said",
                  at: new Date(about.occurredAt).toISOString(),
                  words: cut(about.content, 600),
                },
              }
            : {}),
          ...(files.length
            ? {
                files: files.map((f) => {
                  const text = beginning(f);
                  return {
                    name: f.name,
                    type: f.type,
                    size: f.size,
                    path: f.path,
                    ...(text !== null ? { text, ...(text.endsWith("…") ? { cut: true } : {}) } : {}),
                  };
                }),
              }
            : {}),
          ...(event.away ? { away: event.away } : {}),
        };
        emit({
          type: "message",
          role: "user",
          text: request.content,
          at: request.occurredAt,
          id: request.id,
          ...(files.length ? { files: listed } : {}),
          ...(replyTo ? { replyTo } : {}),
        });
        // A picture is looked at before it is answered, where the model that speaks can see: it is shown the picture with the user's words and says what is there,
        // and that stands with the file as what was seen. Three at most, and none larger than a model will take. Where no model can see, the picture stays unseen
        // and can still be handed to a worker with its path, as any file can.
        if (models?.see && present.files) {
          const pictures = present.files.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type) && f.size <= 4000000).slice(0, 3);
          await Promise.all(
            pictures.map(async (f) => {
              try {
                const said = await models.see(
                  `data:${f.type};base64,${readFileSync(f.path).toString("base64")}`,
                  `A person handed this picture to an assistant with these words: "${cut(request.content, 300)}". Say what the picture shows, and whatever in it bears on those words; give short text in it word for word. At most 120 words, in the language of the person's words. Return {"shows":"..."}.`,
                );
                const shows = typeof said?.shows === "string" ? cut(said.shows.trim(), 900) : "";
                if (shows) f.seen = shows;
              } catch {
                /* it stays unseen */
              }
            }),
          );
        }
        // It has this in front of it now: read, as a person's message is read when they take it up. Anything of the user's said before it and not yet taken up is read with it.
        for (const e of thread())
          if (e.role === "user" && e.content && mark("brain:read", e.id, log.now())) emit({ type: "read", id: e.id, at: log.now() });
      } else if (event.kind === "worker") {
        const task = tasks.get(event.task);
        const where = task.session ? ` (its session: ${task.session})` : "";
        const text = event.error
          ? `${task.to} failed on "${cut(task.task, 200)}"${where}: ${event.error}`
          : `${task.to} ${event.outcome.stopReason === "end_turn" ? "finished" : `stopped (${event.outcome.stopReason})`} "${cut(task.task, 200)}".\nIt said: ${cut(event.outcome.said || "(nothing)", cfg.resultChars)}${event.outcome.did.length ? `\nIt did: ${cut(event.outcome.did.map((d) => `${d.title} [${d.status}]`).join("; "), 1200)}` : ""}`;
        request = add("tool", text, "tool/result", {
          tool: { phase: "result", name: task.to, execution: event.error ? "failed" : "completed" },
          task: task.id,
        });
        if (!turnOpen) turnOpen = true;
        present = { kind: event.error ? "a worker failed" : "a worker came back", task: task.id, ...(event.away ? { away: event.away } : {}) };
      } else if (event.kind === "question") {
        const ask = asks.get(event.ask);
        if (!ask) return;
        const task = tasks.get(ask.task);
        request = add(
          "tool",
          `${ask.to}, working on "${cut(task?.task ?? "", 200)}", asks before going on:\n${ask.questions.map((q) => `${q.question}${q.detail ? `\n${q.detail}` : ""}\nOptions: ${q.options.map((o) => o.label + (o.description ? ` (${o.description})` : "")).join(" | ") || "(none: words)"}`).join("\n")}`,
          "tool/result",
          { tool: { phase: "result", name: ask.to, execution: "completed" }, task: ask.task },
        );
        if (!turnOpen) turnOpen = true;
        present = { kind: "a worker asks", ask: ask.id, task: ask.task };
      } else if (event.kind === "alarm") {
        const lost = event.ref?.startsWith?.("watch:") ? tasks.get(event.ref.slice(6)) : null;
        if (lost && lost.state !== "running") return;
        request = add(
          "tool",
          `A time you set has come${event.late ? `, ${Math.round(event.late / 60000)} minutes late because you were not running` : ""}: ${event.why}`,
          "tool/result",
          { tool: { phase: "result", name: "clock", execution: "completed" } },
        );
        if (!turnOpen) turnOpen = true;
        present = { kind: "a time you set has come", why: event.why, ...(event.away ? { away: event.away } : {}) };
      } else if (event.kind === "return") {
        // The user is here again after a time away, and something was kept to bring up. Whether it is brought up is its own to decide; mostly it is not.
        if (!held().length) return;
        const hours = Math.max(1, Math.round((event.gone.to - event.gone.from) / 3600000));
        request = add("tool", `The user is here again, after about ${hours} ${hours === 1 ? "hour" : "hours"} away.`, "tool/result", {
          tool: { phase: "result", name: "clock", execution: "completed" },
        });
        if (!turnOpen) turnOpen = true;
        present = {
          kind: "the user is back",
          gone: { from: new Date(event.gone.from).toISOString(), to: new Date(event.gone.to).toISOString() },
          note: "Nothing is asked of you and the user has said nothing yet.",
        };
      } else if (event.kind === "born") {
        request = add("tool", "You have just been woken for the first time.", "tool/result", {
          tool: { phase: "result", name: "clock", execution: "completed" },
        });
        if (!turnOpen) turnOpen = true;
        present = {
          kind: "you were just woken for the first time",
          ...(event.language ? { language: event.language } : {}),
          note: "Nothing has been said yet and nothing is asked of you. Greet the person, briefly, in your own voice, in the language their screen is in (language, when given, is its tag).",
        };
      } else return;
      const { reply, more, acts, trace } = await think(request, present);
      // Stopped by the user while it thought: nothing is said and nothing is done, and it is on record that this is why.
      if (mine.signal.aborted) {
        add("tool", "The user stopped this before you answered. Nothing was said and nothing was done.", "tool/result", {
          tool: { phase: "result", name: "asteme", execution: "cancelled" },
        });
        emit({ type: "stopped" });
        if (!running().length) endTurn();
        return;
      }
      if (trace.error && !reply) wrong(`Thinking failed: ${cut(trace.error, 200)}. Your message is kept.`);
      // Silence is never left unexplained: words from the user that got neither words nor a sign nor anything done say so.
      else if (event.kind === "user" && !reply && !acts.length)
        wrong(
          trace.private
            ? "Nothing was read: this conversation was marked as not remembered. The mark has been taken off; say it again."
            : // With a judge beside the model, a call that fails is set aside so the judge can still admit memories; nothing then speaks. The reason is the call's, and is said.
              trace.sceneError
              ? `The model could not be reached: ${cut(trace.sceneError, 200)}. Your message is kept.`
              : "Nothing came back from the model. Your message is kept; say it again.",
        );
      const did = acts.map((a) => act(a, present)).filter(Boolean);
      const refused = did.filter((d) => d.refused);
      if (refused.length)
        add("tool", `Not done: ${refused.map((r) => `${r.refused} (${r.why})`).join("; ")}`, "tool/result", {
          tool: { phase: "result", name: "asteme", execution: "failed" },
        });
      // What it promised in this moment is kept with the words it said then: the line under them is that record.
      const promised = did
          .filter((d) => d.promised)
          .map((d) => ({ at: d.promised.at, why: d.promised.why, ...(d.promised.every ? { every: d.promised.every } : {}) })),
        expression = did.find((d) => d.expressed)?.expressed;
      const with_ = { ...(promised.length ? { promised } : {}), ...(expression ? { expression } : {}) };
      if (reply) {
        const said = add("assistant", reply, undefined, Object.keys(with_).length ? with_ : undefined);
        emit({
          type: "message",
          role: "assistant",
          text: reply,
          at: said.occurredAt,
          id: said.id,
          ...with_,
          used: trace.delivered.map((i) => ({ id: i.id, use: i.use, text: cut(i.text, 200) })),
          // Rounds of earlier conversation it was given: what was said, and when.
          ...(trace.passages?.length ? { record: trace.passages.map((p) => ({ at: p.at, said: cut(p.said || p.replied, 200) })) } : {}),
        });
        // What it says right after, each a message of its own, a moment apart. Stopped in between, the rest is not said.
        if (more.length) {
          hushed = false;
          write(true);
        }
        for (const text of more) {
          await new Promise((done) => {
            const t = setTimeout(done, Math.min(cfg.pauseMax, cfg.pauseMs + text.length * cfg.pauseChar));
            mine.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                done();
              },
              { once: true },
            );
          });
          if (mine.signal.aborted) break;
          const next = add("assistant", text);
          emit({ type: "message", role: "assistant", text, at: next.occurredAt, id: next.id });
        }
      }
      // The matter is closed for now when nothing is out; reflection reads it whole.
      if (!running().length) endTurn();
    } finally {
      thinking = false;
      thinkingSince = null;
      if (halt === mine) halt = null;
      hushed = false;
      write(false);
      emit({ type: "thinking", on: false });
    }
  };
  // --- Quiet moments ---------------------------------------------------------------
  // light: what just happened is read into memory. deep (asleep): outcomes and consolidation too.
  const rest = async (depth) => {
    const before = core.items().length;
    try {
      return await round(depth);
    } finally {
      if (core.items().length !== before) emit({ type: "learned", memories: core.items().length });
    }
  };
  const round = async (depth) => {
    if (shared) return false;
    const turn = log.pending(identity, STAGE)[0];
    if (turn) {
      await core.reflect(turn, model);
      return true;
    }
    if (core.outcomeCandidates(log.now(), { delay: depth === "deep" ? 0 : 60000 }).length) {
      await core.outcomes({ infer: model, judge, mode: "shadow", ...(depth === "deep" ? { delay: 0 } : {}) });
      return log.pending(identity, STAGE).length > 0;
    }
    // A little more of the record made searchable, until all of it is (a store from an earlier version has none of it indexed).
    if (await core.indexRecord().catch(() => 0)) return true;
    if (depth === "deep" && (await core.sleepDue())) {
      await core.sleep({ infer: model, budget: 1 });
      return true;
    }
    return false;
  };
  // What went wrong is said on the page and also kept, where a report can find it afterwards: a page nobody was looking at is not a record.
  const wrong = (text) => {
    try {
      core.note("brain-error", { text: cut(text, 300) });
    } catch {
      /* the store is closed */
    }
    emit({ type: "error", text });
  };
  wake.failed = (e, event) => wrong(`${event.kind}: ${cut(e.message, 200)}`);
  // The conversation with Asteme is its memory: it cannot be one that is "not remembered". A store where that was set (the panel once offered it) answered nothing, without a word; the mark is taken off wherever it is found.
  const own = () => {
    try {
      if (core.quiet?.(THREAD)) core.setQuiet(THREAD, false);
      if (core.projectOff?.(scope.projectId)) core.setProjectOff(scope.projectId, false);
    } catch {
      /* an older core */
    }
  };
  wake.on({ attend, rest, holds: () => running().length > 0 || thinking, changed: (state) => emit({ type: "state", state }) });

  return {
    core,
    log,
    wake,
    start() {
      own();
      for (const t of tasks.values())
        if (t.state === "lost") {
          t.state = "failed";
          t.endedAt = log.now();
          wake.stimulus({ kind: "worker", task: t.id, error: "Asteme stopped while this was out; the result was not seen" });
        }
      keepTasks();
      wake.start();
      return this;
    },
    /** The user speaks. */
    say(text, files = [], replyTo = null) {
      const ids = Array.isArray(files) ? files.filter((id) => fileOf(id)).slice(0, cfg.filesAtOnce) : [];
      if (typeof text !== "string" || (!text.trim() && !ids.length)) throw new Error("Say something");
      if (log.state("brain:draft", null)) log.save("brain:draft", null);
      // Whoever speaks is here.
      log.save("brain:here", log.now());
      // Said in answer to one thing that was said before: it is named, so that "that one" has something to point at.
      const about =
        typeof replyTo === "string" ? thread().find((e) => e.id === replyTo && e.content && ["user", "assistant"].includes(e.role)) : null;
      wake.stimulus({ kind: "user", text: text.trim(), ...(ids.length ? { files: ids } : {}), ...(about ? { replyTo: about.id } : {}) });
    },
    /** A file the user hands over: kept beside the store until a message carries it. */
    keep({ name, type, bytes }) {
      if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("The file is empty");
      if (bytes.length > cfg.fileBytes) throw new Error(`The file is larger than ${Math.round(cfg.fileBytes / 1e6)} MB`);
      const id = randomUUID(),
        clean = cut(
          String(name ?? "file")
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
            .replace(/^\.+/, "")
            .trim() || "file",
          120,
        ).replace(/…$/, "");
      const kept = {
        id,
        name: clean,
        type: /^[\w.+-]+\/[\w.+-]+$/.test(type ?? "") ? type : "application/octet-stream",
        size: bytes.length,
        file: `${id}${extname(clean)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, "")}`,
        at: log.now(),
      };
      mkdirSync(filesDir, { recursive: true });
      writeFileSync(join(filesDir, kept.file), bytes, { mode: 0o600 });
      log.save(`brain:file:${id}`, kept);
      return { id, name: kept.name, type: kept.type, size: kept.size };
    },
    file: (id) => fileOf(id),
    /** Which model speaks, and which it could be changed to. A host lends these; alone there is the one it was started with. */
    async models() {
      const now = (await models?.now?.()) ?? null;
      let window = null;
      try {
        window = (await models?.window?.()) ?? null;
      } catch {
        /* not known */
      }
      return plain({ now: now && { ...now, window }, list: (await models?.list?.()) ?? [] });
    },
    async model(choice) {
      if (!models?.choose) throw new Error("The model is set where Asteme was started");
      // How hard it thinks before it speaks is chosen apart from which model: `effort` alone changes only that.
      if (choice && typeof choice.effort === "string" && !("model" in choice)) {
        if (!models.effort) throw new Error("This model has nothing to choose there");
        await models.effort(choice.effort || null);
      } else
        await models.choose(
          choice && typeof choice.provider === "string" && typeof choice.model === "string"
            ? { provider: choice.provider, model: choice.model }
            : null,
        );
      emit({ type: "model" });
      return this.models();
    },
    /** A recording turned into words, by the host's own recognizer. Nothing is sent as a message and the sound is not kept. */
    async hear(bytes) {
      if (!hear?.transcribe) throw new Error("There is no speech recognition here");
      if (!(bytes instanceof Uint8Array) || bytes.length < 100) throw new Error("Nothing was recorded");
      return plain(await hear.transcribe(plainWav(bytes)));
    },
    /** A time it set is taken back by the user. What it said when it set it stays said. */
    unwake(id) {
      if (held().some((h) => h.id === id))
        log.save(
          "brain:mind",
          held().filter((h) => h.id !== id),
        );
      else {
        if (!standing().some((w) => w.id === id)) throw new Error("That time is no longer set");
        wake.forget(id);
      }
      emit({ type: "intention" });
      return plain({
        intentions: standing()
          .slice(0, 8)
          .map((a) => ({ id: a.id, at: a.at, why: a.why, ...(a.every ? { every: a.every } : {}) })),
      });
    },
    /**
     * One of its own replies, for reading aloud. What is read is the stored
     * reply and nothing else. `as: "text"` gives the words for the device's
     * own voice; otherwise the lent voice reads them and its sound is handed
     * back as it comes. Nothing of the sound is kept.
     */
    async aloud(id, { as = "sound", voice: which, signal } = {}) {
      const said = thread().find((e) => e.id === id && e.role === "assistant" && e.content);
      if (!said) throw new Error("There is no such reply");
      const text = forVoice(said.content);
      if (as === "text") return plain({ text });
      if (!voice?.speak) throw new Error("No voice was lent here");
      if (!text) throw new Error("There are no words in it to read");
      const chosen = typeof which === "string" && which ? which : (log.state("brain:look", null) ?? {}).voice;
      return voice.speak(text, { voice: chosen, signal });
    },
    /** The user puts a sign on something Asteme said, or takes it off with an empty one. It is not a message: nothing is thought about because of it, and Asteme learns of it the next time it thinks. */
    react(id, emoji) {
      const said = thread().find((e) => e.id === id && e.role === "assistant" && e.content);
      if (!said) throw new Error("There is no such reply");
      const sign = typeof emoji === "string" ? emoji.trim() : "";
      if (sign && (sign.length > 16 || !/^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f)+$/u.test(sign)))
        throw new Error("A reaction is one pictograph");
      add("unknown", JSON.stringify({ to: id, emoji: sign, by: "user" }), "reaction");
      emit({ type: "reaction", to: id, emoji: sign, by: "user" });
      return plain({ to: id, emoji: sign });
    },
    /** The page had these replies in view: the user has seen them. */
    /** The store under it has been wiped. What it was holding in its head goes too: work that was out, questions waiting, times it had set, and the files it was handed. Whoever shows it is told to start over. */
    wiped() {
      halt?.abort();
      for (const h of handles.values()) {
        try {
          h.cancel?.();
        } catch {
          /* it is gone either way */
        }
      }
      handles.clear();
      tasks.clear();
      asks.clear();
      wake.alarms = [];
      wake.queue = [];
      wake.keep();
      clearTimeout(greeting);
      greeting = null;
      turnOpen = false;
      origin = null;
      steps = 0;
      thinking = false;
      thinkingSince = null;
      lastRecall = null;
      try {
        rmSync(filesDir, { recursive: true, force: true });
      } catch {
        /* nothing was handed over */
      }
      emit({ type: "wiped" });
    },
    /** How many things Asteme has said that have not been in front of the user: for a mark on a tab or beside its name, where the conversation itself is not in view. Counted from when the conversation was last looked at, and from the user's own last words. */
    unseen() {
      const shown = log.state("brain:shown", 0) ?? 0,
        events = thread();
      let from = 0;
      events.forEach((e, i) => {
        if (e.role === "user" && e.content) from = i + 1;
      });
      const seen = marks("brain:seen"),
        waiting = events.slice(from).filter((e) => e.role === "assistant" && e.content && e.occurredAt > shown && !seen[e.id]);
      return plain({ n: waiting.length, at: waiting.at(-1)?.occurredAt ?? null });
    },
    /** What the user is in the middle of writing, kept with the store so that it is still there after the program is closed, restarted or crashes. It is not said and not read: only held, and let go when it is sent or emptied. */
    draft(text) {
      const kept = typeof text === "string" && text ? cut(text, 20000) : null;
      if (kept !== log.state("brain:draft", null)) log.save("brain:draft", kept);
      return plain({ kept: !!kept });
    },
    /**
     * The user is in front of the conversation. After a time away, when
     * something was kept to bring up, that is an occasion: it is woken to
     * decide for itself whether to say it. Nothing is kept, nothing happens.
     */
    here() {
      const now = log.now(),
        last = log.state("brain:here", null);
      if (!last || now - last > 60000) log.save("brain:here", now);
      const back = !!last && now - last >= cfg.absenceMs && held().length > 0 && !thinking && !running().length;
      if (back) wake.stimulus({ kind: "return", gone: { from: last, to: now } });
      return plain({ here: true, back });
    },
    seen(ids) {
      if (!Array.isArray(ids)) return plain({ seen: 0 });
      log.save("brain:shown", log.now());
      if (!feel().seen) return plain({ seen: 0 });
      const mine = new Set(
        thread()
          .filter((e) => e.role === "assistant" && e.content)
          .map((e) => e.id),
      );
      const at = log.now();
      let n = 0;
      for (const id of ids.slice(0, 50)) if (mine.has(id) && mark("brain:seen", id, at)) n++;
      return plain({ seen: n, at });
    },
    /**
     * The user takes back something they said. Its words are erased from the
     * store, and with them anything remembered from them; what is left is
     * that a message was taken back, and when. If it was being thought about,
     * the thinking is ended. What Asteme already answered stays said.
     */
    async retract(id) {
      const said = thread().find((e) => e.id === id && e.role === "user" && e.content);
      if (!said) throw new Error("There is no such message of yours");
      if (thinking && origin === id) halt?.abort();
      // What was said in answer goes with it: the answer rests on the words that are being taken back, and may repeat them. So does work that was handed out for it and is still out.
      const all = thread(),
        from = all.findIndex((e) => e.id === id),
        answers = [];
      for (let i = from + 1; i < all.length; i++) {
        const e = all[i];
        if (e.role === "user" && e.content && e.kind !== "retraction") break;
        if (["assistant", "tool"].includes(e.role) && e.content) answers.push(e.id);
      }
      for (const t of tasks.values()) if (t.origin === id && t.state === "running") handles.get(t.id)?.cancel?.();
      const gone = all.filter((e) => answers.includes(e.id) && e.role === "assistant").map((e) => e.id);
      log.erase([id, ...answers]);
      add("unknown", JSON.stringify({ of: id, at: said.occurredAt }), "retraction");
      add(
        "tool",
        "The user took back a message they had sent. Its words are gone, and so is anything that was remembered from them. Do not refer to it.",
        "tool/result",
        { tool: { phase: "result", name: "asteme", execution: "completed" } },
      );
      emit({ type: "retracted", id, also: gone });
      emit({ type: "learned", memories: core.items().length });
      await shared?.afterForget?.();
      return plain({ retracted: id });
    },
    /**
     * A new page in the one conversation. Nothing is erased: every word stays in the store, memories and their sources are as they were, and work and times set go on.
     * What changes is what is carried: from here it speaks without the last exchanges in front of it, as if the talk had just begun, and still with all it remembers.
     * Turned off, the conversation is one piece again.
     */
    fresh(on = true) {
      log.save("brain:page", on === false ? null : log.now());
      emit({ type: "look" });
      return plain({ page: log.state("brain:page", null) ?? 0 });
    },
    /** The user stops what is being thought about for them. What they said is kept; nothing is answered and nothing is done. */
    stop() {
      if (!thinking || !halt || halt.signal.aborted) return plain({ stopped: false });
      halt.abort();
      return plain({ stopped: true });
    },
    /** Something was changed from outside the conversation (the panel that manages memory): whoever is looking at the page is told to look again. */
    touched() {
      emit({ type: "learned", memories: core.items().length });
    },
    /** The user answers a worker: leave to act (yes or no), or a question with its options. */
    answer(id, allow, answers) {
      const ask = asks.get(id);
      if (!ask) throw new Error("That question is no longer open");
      if (ask.kind === "question") return settle(ask, answers, "user");
      asks.delete(id);
      ask.answer(allow === true);
      add("unknown", JSON.stringify({ id, outcome: allow === true ? "allowed" : "denied", title: ask.title, to: ask.to }), "approval/decided");
      emit({ type: "answered", id, allow: allow === true });
    },
    // --- What the page opens: a memory, the list, itself, what it has been doing ---
    /** One memory in full, with the words it rests on. Asked for by the user, so a private one is shown. */
    memory(id) {
      const i = core.item(id);
      if (!i) throw new Error("Unknown memory");
      const why = core.why(id),
        stats = useStats(
          core.feedback().filter((f) => f.item === id),
          i.revision,
        );
      return plain({
        id: i.id,
        revision: i.revision,
        kind: i.kind === "concern" ? "matter" : i.level === "lesson" ? "lesson" : "noted",
        text: i.text,
        private: !!i.sensitive?.length,
        status: i.status,
        paused: !!i.paused,
        grounds: core.grounds(i),
        at: i.learnedAt,
        strength: accessibility(i, stats),
        ...(i.closure?.when ? { closes: i.closure.when } : {}),
        sources: (i.evidence ?? []).slice(-3).map((e) => {
          const ev = log.event(e.id);
          return { quote: cut(e.quote, 300), role: ev?.role ?? "", at: ev?.occurredAt ?? null };
        }),
        helped: stats.helped,
        uses: { helped: stats.helped, missed: stats.missed, irrelevant: stats.irrelevant, wrong: stats.wrong, unused: stats.unused },
        why: !!why,
      });
    },
    /** What the user does to one memory. The revision says which version they were looking at. */
    async change(id, revision, what) {
      const item = core.items({ closed: true }).find((i) => i.id === id);
      if (!item || item.revision !== revision) throw new Error("That memory has changed. Look at it again.");
      log.transaction(() => {
        if (what === "confirm") core.userConfirm(id, revision);
        else if (what === "retire") core.userRetire(id, revision, "");
        else if (what === "pause" || what === "resume") {
          core.write({ ...item, paused: what === "pause", revision: revision + 1 }, "User " + what);
          core.propagate(id, what === "pause" ? "was paused by the user" : "was resumed by the user");
        } else if (what === "forget") log.erase([...new Set(item.evidence.map((e) => e.id))]);
        else throw new Error("Unknown change");
      });
      // Forgetting is not finished while a copy made earlier still holds it.
      if (what === "forget") await shared?.afterForget?.();
      emit({ type: "learned", memories: core.items().length });
      return { done: what };
    },
    settle(a, b, keep) {
      core.userSettle(a, b, keep);
      emit({ type: "learned", memories: core.items().length });
      return { done: "settle" };
    },
    find(query) {
      const all = core.items().filter((i) => !i.paused),
        brief = (i) => ({
          id: i.id,
          kind: i.kind === "concern" ? "matter" : i.level === "lesson" ? "lesson" : "noted",
          text: i.sensitive?.length ? "" : cut(i.text, 200),
          private: !!i.sensitive?.length,
          at: i.learnedAt,
          ...(i.id === (log.state("brain:born", null)?.star ?? 0) ? { first: true } : {}),
        });
      const q = String(query ?? "").trim();
      if (!q)
        return plain(
          all
            .sort((x, y) => (y.learnedAt ?? 0) - (x.learnedAt ?? 0))
            .slice(0, 60)
            .map(brief),
        );
      // What the search ranks comes first, in its order; then whatever merely has the words in it, newest first. A page lists them a screen at a time, so there is room for many.
      const ranked = core.search(q).understanding.map((u) => u.id),
        rank = new Map(ranked.map((id, n) => [id, n])),
        low = q.toLowerCase();
      const hits = all
        .filter((i) => rank.has(i.id) || i.text.toLowerCase().includes(low))
        .sort((x, y) => (rank.get(x.id) ?? Infinity) - (rank.get(y.id) ?? Infinity) || (y.learnedAt ?? 0) - (x.learnedAt ?? 0));
      return plain(hits.slice(0, 200).map(brief));
    },
    /** How the page looks for this person: a picture behind the sky, a colour, a text size. It travels with the person. */
    look(patch) {
      const now = log.state("brain:look", null) ?? {};
      if (patch && typeof patch === "object") {
        const next = { ...now };
        if (
          typeof patch.wall === "string" &&
          (patch.wall === "" || (/^data:image\/(png|jpeg|webp);base64,/.test(patch.wall) && patch.wall.length < 1600000))
        )
          next.wall = patch.wall || null;
        for (const [k, lo, hi] of [
          ["dim", 0, 0.9],
          ["blur", 0, 24],
        ])
          if (Number.isFinite(patch[k])) next[k] = Math.min(hi, Math.max(lo, patch[k]));
        if (typeof patch.accent === "string" && /^(#[0-9a-f]{6})?$/i.test(patch.accent)) next.accent = patch.accent;
        if (["s", "m", "l"].includes(patch.size)) next.size = patch.size;
        // The ground it stands on (as the host has it, white, black or a colour of the user's), the colour under its own words, and looks the user saved to come back to.
        const HEX = /^#[0-9a-f]{6}$/i,
          ground = (v) => typeof v === "string" && (["", "auto", "white", "black"].includes(v) || HEX.test(v)),
          tone = (v) => typeof v === "string" && (v === "" || HEX.test(v));
        if (ground(patch.ground)) next.ground = patch.ground || "auto";
        if (tone(patch.its)) next.its = patch.its;
        // The colour of the letters, on the ground and under each kind of words: the user's own, or left to whichever ink can be read there.
        for (const k of ["ink", "itsInk", "mineInk"]) if (tone(patch[k])) next[k] = patch[k];
        if (Array.isArray(patch.themes))
          next.themes = patch.themes
            .filter((t) => t && typeof t.name === "string" && t.name.trim() && ground(t.ground ?? "") && tone(t.its ?? "") && tone(t.mine ?? ""))
            .slice(0, 12)
            .map((t) => ({
              name: t.name.trim().slice(0, 30),
              ground: t.ground || "auto",
              its: t.its ?? "",
              mine: t.mine ?? "",
              ...Object.fromEntries(["ink", "itsInk", "mineInk"].filter((k) => tone(t[k]) && t[k]).map((k) => [k, t[k]])),
            }));
        // Any typeface the device has, by its name, and letters of any size within reason.
        if (typeof patch.font === "string" && /^[^"'\\;{}<>]{0,80}$/.test(patch.font)) next.font = patch.font.trim();
        if (Number.isFinite(patch.px)) next.px = Math.min(24, Math.max(12, Math.round(patch.px * 2) / 2));
        // Whether its name stands at the top and by its words, and whether a star says what it is when the pointer rests on it in the conversation.
        for (const k of ["showName", "tips", "comet"]) if (typeof patch[k] === "boolean") next[k] = patch[k];
        // Among the stars: whether a pull moves the sky or turns it (Shift does the other).
        if (["move", "turn"].includes(patch.pull)) next.pull = patch.pull;
        // Reading replies aloud: when (only when asked, after the user spoke, or always) and with which of the voices a host lends.
        if (["press", "spoke", "always"].includes(patch.aloud)) next.aloud = patch.aloud;
        if (typeof patch.voice === "string" && /^[\w .:-]{0,60}$/.test(patch.voice)) next.voice = patch.voice || null;
        log.save("brain:look", next);
        emit({ type: "look" });
        return plain(next);
      }
      return plain(now);
    },
    /** Who it is: the names, and what it holds to. Only the names are changed from the page. */
    self(patch) {
      // It has been woken (or the person chose to begin without the scene): the first-run scene is not shown again for this store.
      // With a name given, being woken is the first thing it remembers: a memory like any other, resting on what the person gave it, and the first star of its sky.
      // The words of the memory come from whoever shows the scene (they are in the person's language); what is checked here is that there is something they rest on.
      if (patch && patch.born === true && !log.state("brain:born", null)) {
        const born = { at: log.now(), star: null };
        const given = [patch.name, patch.userName].filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim().slice(0, 60));
        if (given.length && typeof patch.firstMemory === "string" && patch.firstMemory.trim()) {
          try {
            // Each waking is a record of its own: a store that was wiped and is woken again does not find the first one's place taken.
            const where = `beginning-${born.at}`;
            log.ingest(scope, where, [{ seq: 0, role: "user", kind: "user/message", content: given.join(" / "), occurredAt: log.now() }]);
            const e = log.events(scope, where).at(-1);
            born.star =
              core.apply(
                [
                  {
                    op: "put",
                    kind: "understanding",
                    certainty: "explicit",
                    reason:
                      typeof patch.firstWhy === "string" && patch.firstWhy.trim() ? cut(patch.firstWhy.trim(), 120) : "Given when it was first woken",
                    text: cut(patch.firstMemory.trim(), 200),
                    about: "the day it was woken and given its name",
                    concrete: "The user asks how it got its name, or about the day it was first woken",
                    general: "Someone asks about its own beginning",
                    tested: "It happened once",
                    hypothesis: "",
                    entities: [],
                    evidence: [{ id: e.id, quote: e.content }],
                  },
                ],
                [e],
              ).applied[0]?.id ?? null;
          } catch {
            /* woken all the same, without a star */
          }
        }
        log.save("brain:born", born);
        // Woken, it speaks first.
        // In the language of the screen it was woken on: nothing has been said yet for it to take the language from.
        // (Only where nothing has been said yet: a conversation already under way is not greeted as if it were the first moment.)
        // It says hello once the scene of its waking is over, not under it: whoever shows the scene says how long that is (greetIn, at most half a minute).
        const hello = () => {
          greeting = null;
          if (log.state("brain:born", null)?.at === born.at && !thread().length)
            wake.stimulus({
              kind: "born",
              ...(typeof patch.language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(patch.language) ? { language: patch.language } : {}),
            });
        };
        if (patch.greet !== false) {
          const after = Number.isFinite(patch.greetIn) ? Math.max(0, Math.min(30000, patch.greetIn)) : 0;
          if (after) {
            clearTimeout(greeting);
            greeting = setTimeout(hello, after);
            greeting.unref?.();
          } else hello();
        }
      }
      if (patch && typeof patch.manner === "string") setManner(patch.manner, null);
      // Ways of speaking the user liked enough to keep, to be picked again.
      if (patch && typeof patch.keepManner === "string" && patch.keepManner.trim())
        log.save("brain:manners", [...new Set([cut(patch.keepManner.trim(), 300), ...(log.state("brain:manners", []) ?? [])])].slice(0, 8));
      if (patch && typeof patch.dropManner === "string")
        log.save(
          "brain:manners",
          (log.state("brain:manners", []) ?? []).filter((m) => m !== patch.dropManner),
        );
      // A picture for each side of the conversation: small, kept with the rest of this person.
      if (patch && typeof patch === "object")
        for (const k of ["face", "yourFace"])
          if (
            typeof patch[k] === "string" &&
            (patch[k] === "" || (/^data:image\/(png|jpeg|webp);base64,/.test(patch[k]) && patch[k].length < 300000))
          )
            log.save(`brain:${k}`, patch[k] || null);
      // How it shows feeling: reactions and faces on or off, and the faces themselves, each with the name it is chosen by.
      if (patch && patch.feel && typeof patch.feel === "object")
        log.save("brain:feel", {
          ...feel(),
          ...Object.fromEntries(["react", "express", "seen"].filter((k) => typeof patch.feel[k] === "boolean").map((k) => [k, patch.feel[k]])),
        });
      if (patch && patch.addExpression && typeof patch.addExpression === "object") {
        const name = typeof patch.addExpression.name === "string" ? patch.addExpression.name.trim().slice(0, 40) : "",
          image = patch.addExpression.image;
        if (!name) throw new Error("A face needs a name to be chosen by");
        if (typeof image !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image) || image.length > 400000)
          throw new Error("That picture cannot be kept as a face");
        // Twenty-four faces are kept. A twenty-fifth used to push the oldest out without a word; it is refused, and says why.
        if (expressions().length >= 24 && !expressions().some((x) => x.name === name))
          throw new Error("Twenty-four faces are kept; take one away to add another");
        log.save("brain:expressions", [...expressions().filter((x) => x.name !== name), { name, image }]);
        void seen(name, image);
      }
      if (patch && typeof patch.dropExpression === "string")
        log.save(
          "brain:expressions",
          expressions().filter((x) => x.name !== patch.dropExpression),
        );
      if (patch && patch.renameExpression && typeof patch.renameExpression === "object") {
        const from = patch.renameExpression.from,
          to = typeof patch.renameExpression.to === "string" ? patch.renameExpression.to.trim().slice(0, 40) : "";
        if (!to) throw new Error("A face needs a name to be chosen by");
        if (expressions().some((x) => x.name === to && x.name !== from)) throw new Error("Another face is already called that");
        log.save(
          "brain:expressions",
          expressions().map((x) => (x.name === from ? { ...x, name: to } : x)),
        );
      }
      if (patch && typeof patch === "object")
        profile(
          log,
          identity,
          Object.fromEntries(["name", "userName"].filter((k) => typeof patch[k] === "string").map((k) => [k, patch[k].trim().slice(0, 60)])),
        );
      // How it speaks as a rule belongs to its charter, with its name: what it is told when it is first woken is that, not a mood for the day.
      if (patch && typeof patch.tone === "string")
        profile(log, identity, { style: { ...(core.core().style ?? {}), tone: cut(patch.tone.trim(), 300) } });
      const who = core.core();
      return plain({
        tone: who.style?.tone ?? "",
        feel: feel(),
        expressions: expressions(),
        manner: manner(),
        manners: log.state("brain:manners", []) ?? [],
        name: who.name ?? "",
        userName: who.userName ?? "",
        purpose: who.purpose ?? "",
        values: who.values ?? [],
        promises: who.commitments ?? [],
        habits: Object.values(who.habits ?? {})
          .map((h) => (typeof h === "string" ? h : h?.text))
          .filter(Boolean),
      });
    },
    activity() {
      const d = core.diagnose();
      return plain({
        state: wake.state,
        tasks: [...tasks.values()].slice(-8).reverse().map(brief),
        intentions: standing()
          .slice(0, 8)
          .map((a) => ({ id: a.id, at: a.at, why: a.why, ...(a.every ? { every: a.every } : {}) })),
        held: held().map((h) => ({ id: h.id, at: h.at, about: h.about })),
        unread: log.pending(identity, STAGE).length,
        idle: d.sleep?.idle ?? [],
        lastSleep: d.sleep?.last ?? null,
      });
    },
    /** Every memory in use, for the sky itself: what each is, how easily it comes to mind, when it was learned, what a lesson was drawn from. A private one has no words here. */
    sky() {
      const outcomes = new Map();
      for (const f of core.feedback()) (outcomes.get(f.item) ?? outcomes.set(f.item, []).get(f.item)).push(f);
      return plain(
        core
          .items()
          .filter((i) => !i.paused)
          .map((i) => ({
            id: i.id,
            kind: i.kind === "concern" ? "matter" : i.level === "lesson" ? "lesson" : "noted",
            text: i.sensitive?.length ? "" : cut(i.text, 120),
            private: !!i.sensitive?.length,
            strength: Math.round(accessibility(i, useStats(outcomes.get(i.id) ?? [], i.revision)) * 1000) / 1000,
            from: i.premises ?? [],
            at: i.learnedAt,
            ...(i.id === (log.state("brain:born", null)?.star ?? 0) ? { first: true } : {}),
          })),
      );
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      // The sign it put on something the user said, by which message: the last one stands.
      const readBy = feel().seen ? marks("brain:read") : {},
        seenBy = marks("brain:seen");
      // A message that was taken back keeps its place and its hour, and nothing else.
      // An erased record is no longer among the records; its place is found again by its hour: before whatever was said at or after it.
      const withTakenBack = (list) => {
        for (const [id, at] of [...takenBack].sort((a, b) => a[1] - b[1])) {
          if (list.length && at < (list[0].at ?? 0) && list.length >= 200) continue;
          const i = list.findIndex((m) => !m.retracted && (m.at ?? 0) >= at);
          list.splice(i < 0 ? list.length : i, 0, { id, role: "user", text: "", at, retracted: true });
        }
        return list;
      };
      const takenBack = fromThread("takenBack", (list) => {
        const back = new Map();
        for (const e of list)
          if (e.kind === "retraction") {
            try {
              const r = JSON.parse(e.content);
              if (r?.of) back.set(r.of, r.at ?? e.occurredAt);
            } catch {
              /* not one */
            }
          }
        return back;
      });
      const both = reactions(),
        reacted = new Map([...both.its, ...both.theirs]);
      // What a message answers is kept by its id alone and its words are looked up when shown: once that message is taken back, nothing of it is left standing in another.
      const byId = fromThread("byId", (list) => new Map(list.filter((e) => e.content).map((e) => [e.id, e]))),
        quoted = (id) => {
          const e = id && byId.get(id);
          return e ? { id: e.id, role: e.role, words: cut(e.content, 140) } : null;
        };
      const outcomes = new Map();
      for (const f of core.feedback()) (outcomes.get(f.item) ?? outcomes.set(f.item, []).get(f.item)).push(f);
      // Everything the page draws is a stored record: one star per memory in
      // use, as bright as it comes to mind; a lesson is joined to its cases.
      const sky = core
        .items()
        .filter((i) => !i.paused)
        .map((i) => ({
          id: i.id,
          kind: i.kind === "concern" ? "matter" : i.level === "lesson" ? "lesson" : "noted",
          text: i.sensitive?.length ? "" : cut(i.text, 240),
          private: !!i.sensitive?.length,
          strength: accessibility(i, useStats(outcomes.get(i.id) ?? [], i.revision)),
          from: i.premises ?? [],
          at: i.learnedAt,
          ...(i.id === (log.state("brain:born", null)?.star ?? 0) ? { first: true } : {}),
        }))
        // A sky of thousands is a smear. The page is sent the four hundred that come to mind most easily; the count says how many there are.
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 400);
      // The names the user gave: what it is called, and what it calls them.
      const who = core.core();
      // What it would like settled, a little at a time: asked in the conversation, not on a page of its own.
      const r = core.review(),
        textOf = (id) => {
          const i = core.item(id);
          return i && !i.sensitive?.length ? { id, revision: i.revision, text: cut(i.text, 240) } : null;
        };
      const review = [
        ...r.disputes.map((d) => ({ kind: "dispute", a: textOf(d.a), b: textOf(d.b) })).filter((d) => d.a && d.b),
        ...[...r.unsure, ...r.stale].map((id) => ({ kind: "check", item: textOf(id) })).filter((c) => c.item),
      ].slice(0, 1);
      // Nothing said, nothing remembered and never woken: a store at its very beginning, a new one or one wiped clean.
      const fresh = !log.state("brain:born", null) && !thread().length && !core.items().length;
      return plain({
        fresh,
        born: !!log.state("brain:born", null),
        review,
        look: log.state("brain:look", null) ?? {},
        manner: manner()?.text ?? "",
        face: log.state("brain:face", null),
        yourFace: log.state("brain:yourFace", null),
        name: typeof who?.name === "string" ? who.name.trim() : "",
        you: typeof who?.userName === "string" ? who.userName.trim() : "",
        state: wake.state,
        thinking,
        writing,
        next: wake.next(),
        sky,
        intentions: standing()
          .slice(0, 6)
          .map((a) => ({ id: a.id, at: a.at, why: a.why, ...(a.every ? { every: a.every } : {}) })),
        workers: Object.entries(workers).map(([name, w]) => ({ name, about: w.about ?? "" })),
        tasks: [...tasks.values()].slice(-20).map(brief),
        asks: [...asks.values()].map(({ answer, ...a }) => a),
        draft: log.state("brain:draft", null) ?? "",
        tone: core.core().style?.tone ?? "",
        page: log.state("brain:page", null) ?? 0,
        memories: core.items().length,
        messages: withTakenBack(
          fromThread("said", (list) => list.filter((e) => e.content && ["user", "assistant"].includes(e.role)))
            .slice(-200)
            .map((e) => ({
              id: e.id,
              role: e.role,
              text: e.content,
              at: e.occurredAt,
              ...(e.metadata?.files?.length ? { files: e.metadata.files } : {}),
              ...(e.metadata?.promised?.length ? { promised: e.metadata.promised } : {}),
              ...(e.metadata?.expression ? { expression: e.metadata.expression } : {}),
              ...(quoted(e.metadata?.replyTo) ? { replyTo: quoted(e.metadata.replyTo) } : {}),
              ...(reacted.has(e.id) ? { reaction: reacted.get(e.id) } : {}),
              ...(e.role === "user" && readBy[e.id] ? { read: readBy[e.id] } : {}),
              ...(e.role === "assistant" && seenBy[e.id] ? { seen: seenBy[e.id] } : {}),
            })),
        ),
        // What this place can do beyond words: take files, and (lent by a host) hear and change the model.
        can: {
          files: true,
          hear: hear?.state?.() ?? null,
          model: !!models?.choose,
          speak: voice?.state?.() ?? null,
          ...(voice && !voice.state?.() && voice.why ? { speakWhy: voice.why() } : {}),
        },
        ...(thinking && thinkingSince ? { thinkingSince } : {}),
        feel: feel(),
        expressions: expressions(),
        ...(lastRecall ? { recall: lastRecall } : {}),
      });
    },
    async idle() {
      while (wake.busy || wake.queue.length) await new Promise((r) => setImmediate(r));
    },
    close() {
      clearTimeout(greeting);
      wake.stop();
      for (const w of Object.values(workers)) w.close?.();
      if (!shared) log.close();
    },
  };
}
