// The conversation page without a model or a store: a made-up mind that
// answers after a moment, so the page can be looked at and worked on.
//   node brain/preview.mjs [port] [language]
// SPEAK=1 lends it a made-up voice (a tone), so reading aloud can be tried;
// SPEAK=deepseek lends DeepSeek's own, with the key in DEEPSEEK_API_KEY.
// STORY=<file.json> starts it from a written scene (names, memories, what was
// said) and makes it answer nothing by itself; STAGE=<port> opens a second
// door through which whoever is filming or testing says what happens next.
import { serve } from "./server.mjs";
import { forVoice, deepseekVoice } from "./voice.mjs";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const listeners = new Set(),
  emit = (e) => {
    for (const l of listeners) l(e);
  };
const now = Date.now(),
  id = (n) => `m${n}-${((n * 2654435761) >>> 0).toString(16)}`;
const sky = Array.from({ length: Number(process.env.STARS ?? 46) }, (_, n) => ({
  id: id(n),
  kind: n % 11 === 0 ? "lesson" : n % 7 === 0 ? "matter" : "noted",
  private: n === 5,
  text:
    n === 5
      ? ""
      : [
          "Lead with the decision for this director",
          "Meeting notes follow the order of discussion",
          "The release moved to Tuesday",
          "Prefers short replies in the morning",
        ][n % 4],
  strength: [0.95, 0.7, 0.5, 0.32, 0.18][n % 5],
  from: n % 11 === 0 && n ? [id(n - 1), id(n - 3), id(n - 4)] : [],
  at: now - n * 86400000,
}));
// For the sky itself: many more than the conversation shows, some of them lessons with their cases.
const more = Array.from({ length: Number(process.env.ALL ?? 900) }, (_, n) => {
  const k = n + 1000,
    lesson = n % 37 === 0 && n > 6;
  return {
    id: id(k),
    kind: lesson ? "lesson" : n % 9 === 0 ? "matter" : "noted",
    private: n % 53 === 0,
    text:
      n % 53 === 0
        ? ""
        : [
            "Keeps release notes to five lines",
            "Reviews go out before lunch",
            "The supplier answers on Thursdays",
            "Tests run before every merge",
            "Prefers numbers to adjectives",
          ][n % 5] +
          " (" +
          n +
          ")",
    strength: [0.9, 0.6, 0.4, 0.25, 0.12][n % 5],
    from: lesson ? [id(k - 1), id(k - 2), id(k - 3), id(k - 5)] : [],
    at: now - (n + 50) * 43200000,
  };
});
const reviewId = "m2-" + ((2 * 2654435761) >>> 0).toString(16);
let looks = {};
const names = { name: process.env.NAME ?? "", you: "" };
let reviewed = false;
let draft = "",
  tone = "",
  page = 0;
let state = "awake",
  thinking = false,
  messages = [
    { id: "a", role: "user", text: "Write the memo for the director about the slip.", at: now - 400000 },
    {
      id: "b",
      role: "assistant",
      text: "The release moves from Thursday to next Tuesday.\nQA found a bug that can lose data, and the fix needs one more test cycle.\nNothing is needed from you today.",
      at: now - 380000,
    },
    { id: "c", role: "user", text: "Good. Ask DSH to add that to the changelog.", at: now - 60000 },
    { id: "d", role: "assistant", text: "I have asked DSH to add one line to the changelog. I will tell you when it is in.", at: now - 50000 },
  ];
const tasks = [
  {
    id: "t1",
    to: "dsh",
    task: "Add one line to CHANGELOG.md: the release moved to Tuesday",
    state: "running",
    startedAt: now - 50000,
    session: "session-51ba5e24-0000-4000-8000-000000000000",
  },
];
const asks = [{ id: "q1", task: "t1", to: "dsh", title: 'run: git commit -m "changelog"', detail: '{"command":"git commit -m changelog"}' }];
// What it keeps to bring up when the user is next around (none in a plain preview).
let held = process.env.DEMO ? [{ id: "held-1", at: now - 86400000, about: "How the talk with the director went" }] : [];
let intentions = process.env.DEMO
  ? [{ id: "w1", at: now + 30600000, why: "Remind about Mina's keys" }]
  : [{ id: "w1", at: now + 64800000, why: "Ask whether the memo was sent" }];
const kept = new Map(),
  folder = join(tmpdir(), `asteme-preview-${process.pid}`);
let chosen = null;
const MODELS = [
  { provider: "deepseek", providerName: "DeepSeek", model: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { provider: "deepseek", providerName: "DeepSeek", model: "deepseek-v4.1", name: "DeepSeek V4.1" },
];
// DEMO=1: a short everyday conversation and an ordinary person's memories, for showing the page to someone. Nothing here is anyone's real data.
if (process.env.DEMO) {
  const said = [
    "Likes the decision first",
    "The launch moved to Tuesday",
    "Keeps notes short",
    "Runs on Tuesdays and Fridays",
    "Sister's birthday is in March",
    "Prefers trains to flights",
    "Coffee before nine, tea after",
    "Reads on the way home",
    "Mornings are for writing",
    "The dentist is on the 14th",
    "Likes plain words",
    "Walks when stuck",
    "Calls home on Sundays",
    "Left the keys with Mina",
    "Wants the garden done by June",
    "Saves on the first of the month",
  ];
  const lessons = [
    "Start with what matters",
    "Plans work better written down",
    "A short walk clears the head",
    "Small steps, kept up",
    "Say it plainly",
    "Rest before deciding",
  ];
  let l = 0;
  for (const [n, m] of [...sky, ...more].entries()) {
    if (m.private) continue;
    m.text = m.kind === "lesson" ? lessons[l++ % lessons.length] : said[n % said.length];
  }
  messages = [
    { id: "a", role: "user", text: "Morning. What did I decide about the launch?", at: now - 420000 },
    {
      id: "b",
      role: "assistant",
      text: "You moved it to Tuesday, and you wanted the notes kept short.\nShall I draft them the way you like, decision first?",
      at: now - 400000,
    },
    { id: "c", role: "user", text: "Yes please. And remind me about Mina's keys tonight.", at: now - 90000 },
    { id: "d", role: "assistant", text: "Done: the draft is ready when you are.\nI will remind you about the keys at seven.", at: now - 80000 },
  ];
  tasks.length = 0;
  asks.length = 0;
  reviewed = true;
}
// A written scene: an ordinary person's made-up memories and words, for showing or filming. Nothing in one is anyone's real data.
const story = process.env.STORY ? JSON.parse(readFileSync(process.env.STORY, "utf8")) : null,
  quotes = new Map();
if (story) {
  const told = story.memories ?? [],
    fill = story.fill ?? told.map((m) => m.text),
    lessons = story.lessons ?? [];
  let l = 0;
  for (const [n, m] of [...sky, ...more].entries()) {
    if (m.private) continue;
    m.text = m.kind === "lesson" && lessons.length ? lessons[l++ % lessons.length] : fill[n % fill.length];
  }
  // What the scene is about stands among the newest and comes to mind easily.
  told.forEach((t, n) => {
    const m = sky[n + 1];
    if (!m) return;
    Object.assign(m, {
      kind: t.kind ?? "noted",
      private: false,
      text: t.text,
      strength: t.strength ?? 0.9,
      from: [],
      at: now - (t.days ?? n) * 86400000,
    });
    if (t.id) m.id = t.id;
    if (t.quote) quotes.set(m.id, t.quote);
  });
  names.name = story.name ?? names.name;
  names.you = story.you ?? "";
  messages = story.messages ?? [];
  intentions = story.intentions ?? [];
  tasks.length = 0;
  asks.length = 0;
  reviewed = true;
}
// FIRST=old is a store that was in use before there was such a scene: never woken, with everything in it. FIRST=1 starts it as a store at its very beginning: nobody there yet, nothing said, an empty sky. What is said first is remembered, so the first star can be seen to arrive.
let born = !process.env.FIRST;
if (process.env.FIRST === "1") {
  messages = [];
  sky.length = 0;
  more.length = 0;
  names.name = "";
  names.you = "";
  reviewed = true;
}
// In a written scene the hour is the scene's own, when the stage door has said what it is.
let clock = null;
const hour = () => clock ?? Date.now();
const real =
  process.env.SPEAK === "deepseek" && process.env.DEEPSEEK_API_KEY
    ? deepseekVoice({ auth: async () => ({ authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }) })
    : null;
const speaks = process.env.SPEAK ? { maker: "deepseek", voices: ["stella", "tide"], same: process.env.SPEAK !== "other" } : null;
const EFFORTS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];
// MANY=1 offers as many depths as the widest model does, to see that they still fit.
if (process.env.MANY) EFFORTS.push({ id: "xhigh", name: "Xhigh" }, { id: "max", name: "Max" }, { id: "ultra", name: "Ultra (preview)" });
let effort = "low",
  answering = null,
  feel = { react: true, express: true, seen: true },
  expressions = [],
  thinkingSince = null,
  writing = false,
  penning = null;
const mind = {
  react: (id, emoji) => {
    const m = messages.find((x) => x.id === id && x.role === "assistant");
    if (!m) throw new Error("There is no such reply");
    m.reaction = emoji || undefined;
    emit({ type: "reaction", to: id, emoji, by: "user" });
    return { to: id, emoji };
  },
  unseen: () => ({ n: 0, at: null }),
  wiped: () => emit({ type: "wiped" }),
  draft: (text) => {
    draft = typeof text === "string" ? text : "";
    return { kept: !!draft };
  },
  seen: (ids) => {
    const at = hour();
    for (const id of ids ?? []) {
      const m = messages.find((x) => x.id === id);
      if (m) m.seen = at;
    }
    return { seen: (ids ?? []).length, at };
  },
  retract: async (id) => {
    const m = messages.find((x) => x.id === id && x.role === "user");
    if (!m) throw new Error("There is no such message of yours");
    Object.assign(m, { text: "", retracted: true, files: undefined, reaction: undefined, read: undefined });
    const at = messages.indexOf(m),
      also = [];
    for (let i = at + 1; i < messages.length && messages[i].role !== "user"; i++) also.push(messages[i].id);
    for (const gone of also)
      messages.splice(
        messages.findIndex((x) => x.id === gone),
        1,
      );
    emit({ type: "retracted", id, also });
    return { retracted: id };
  },
  unwake: (id) => {
    held = held.filter((h) => h.id !== id);
    intentions = intentions.filter((i) => i.id !== id);
    emit({ type: "intention" });
    return { intentions };
  },
  // The made-up voice is a tone that lasts as long as the words would: enough to try the button, the level and the stop.
  aloud: async (id, { as = "sound" } = {}) => {
    const m = messages.find((x) => x.id === id && x.role === "assistant");
    if (!m) throw new Error("There is no such reply");
    const text = forVoice(m.text);
    if (as === "text") return { text };
    if (!speaks) throw new Error("No voice was lent here");
    if (real) return real.speak(text, { voice: looks.voice });
    const n = Math.min(24000 * 6, Math.max(12000, text.length * 1400)),
      pcm = new Int16Array(n);
    for (let i = 0; i < n; i++)
      pcm[i] = Math.sin((i / 24000) * 2 * Math.PI * (200 + 40 * Math.sin(i / 5000))) * 5000 * Math.min(1, i / 600, (n - i) / 600);
    return { type: "audio/pcm", rate: 24000, bytes: Buffer.from(pcm.buffer) };
  },
  keep: ({ name, type, bytes }) => {
    const id = randomUUID();
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, id), bytes);
    kept.set(id, { id, name, type: type || "application/octet-stream", size: bytes.length, path: join(folder, id) });
    return { id, name, type, size: bytes.length };
  },
  file: (id) => kept.get(id) ?? null,
  sky: () => [...sky, ...more],
  models: async () => ({ now: { ...(chosen ?? MODELS[0]), follows: !chosen, efforts: EFFORTS, effort }, list: MODELS }),
  model: async (c) => {
    if (c && typeof c.effort === "string" && !("model" in c)) effort = c.effort || EFFORTS[0].id;
    else chosen = c?.model ? (MODELS.find((m) => m.model === c.model) ?? null) : null;
    return mind.models();
  },
  fresh: (on = true) => {
    page = on === false ? 0 : Date.now();
    emit({ type: "state", state });
    return { page };
  },
  stop: () => {
    if (!thinking) return { stopped: false };
    clearTimeout(answering);
    clearTimeout(penning);
    thinking = false;
    writing = false;
    emit({ type: "thinking", on: false });
    emit({ type: "stopped" });
    return { stopped: true };
  },
  touched: () => emit({ type: "learned" }),
  hear: async () => ({ text: "Move the review to Thursday afternoon." }),
  listen: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => ({
    fresh: !born && !messages.length,
    born,
    name: names.name,
    you: names.you,
    look: looks,
    manner: "",
    face: null,
    yourFace: null,
    review: reviewed ? [] : [{ kind: "check", item: { id: sky[2].id, revision: 1, text: sky[2].text } }],
    state,
    thinking,
    writing,
    next: null,
    sky,
    intentions,
    workers: [{ name: "dsh", about: "" }],
    tasks,
    asks,
    draft,
    tone,
    page,
    memories: sky.length + (process.env.DEMO || story ? more.length : 0),
    messages,
    can: {
      files: true,
      hear: process.env.HEAR === "none" ? null : (process.env.HEAR ?? "ready"),
      model: true,
      speak: speaks,
      ...(speaks ? {} : { speakWhy: "no-key" }),
    },
    feel,
    expressions,
    ...(thinking && thinkingSince ? { thinkingSince } : {}),
  }),
  memory: (which) => {
    const m = sky.find((x) => x.id === which) ?? more.find((x) => x.id === which) ?? sky[0];
    if (quotes.has(m.id))
      return {
        id: m.id,
        revision: 1,
        kind: m.kind,
        text: m.text,
        private: false,
        status: "active",
        paused: false,
        grounds: "said",
        at: m.at,
        strength: m.strength,
        sources: [{ quote: quotes.get(m.id), role: "user", at: m.at }],
      };
    return {
      id: m.id,
      revision: 1,
      kind: m.kind,
      text: m.private ? "Takes medication at eight every morning" : m.text,
      private: m.private,
      status: "active",
      paused: false,
      grounds: "said",
      at: m.at,
      strength: m.strength,
      sources: [{ quote: "Put the decision in the first line. She only reads the first three lines of anything.", role: "user", at: m.at }],
    };
  },
  find: (q) =>
    [...sky, ...more]
      .filter((m) => !q || m.text.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 200)
      .map((m) => ({ id: m.id, kind: m.kind, text: m.text, private: m.private, at: m.at })),
  self: (patch) => {
    if (patch?.born && !born) {
      born = true;
      if (patch.firstMemory)
        sky.unshift({
          id: "first-memory",
          first: true,
          kind: "noted",
          private: false,
          strength: 1,
          from: [],
          at: Date.now(),
          text: patch.firstMemory,
        });
      // As the real one does: a moment of thinking after the scene is over, then writing, then the greeting.
      if (!messages.length && patch.greet !== false)
        setTimeout(
          () => {
            thinking = true;
            thinkingSince = Date.now();
            emit({ type: "thinking", on: true, since: thinkingSince });
            setTimeout(() => {
              writing = true;
              emit({ type: "writing", on: true });
            }, 1400);
          },
          Math.max(0, Number(patch.greetIn) || 0),
        );
      if (!messages.length && patch.greet !== false)
        setTimeout(
          () => {
            thinking = false;
            writing = false;
            emit({ type: "thinking", on: false });
            const r = {
              id: `r${messages.length}`,
              role: "assistant",
              text: `Good morning${patch.userName ? ", " + patch.userName : ""}. I am ${patch.name || "here"}.`,
              at: Date.now(),
            };
            messages.push(r);
            emit({ type: "message", ...r });
          },
          Math.max(0, Number(patch.greetIn) || 0) + 2800,
        );
    }
    if (typeof patch?.tone === "string") tone = patch.tone;
    if (patch?.name !== undefined) names.name = patch.name;
    if (patch?.userName !== undefined) names.you = patch.userName;
    if (patch?.feel) feel = { ...feel, ...patch.feel };
    if (patch?.addExpression) expressions = [...expressions.filter((x) => x.name !== patch.addExpression.name), patch.addExpression];
    if (patch?.dropExpression) expressions = expressions.filter((x) => x.name !== patch.dropExpression);
    if (patch?.renameExpression)
      expressions = expressions.map((x) => (x.name === patch.renameExpression.from ? { ...x, name: patch.renameExpression.to } : x));
    return {
      feel,
      expressions,
      manner: null,
      manners: ["cool and brief"],
      name: names.name,
      userName: names.you,
      purpose: "To be of real use to one person over years",
      values: ["Says when it is not sure"],
      promises: ["Ask before sending anything in your name"],
      habits: ["Leads with the decision when writing for a busy reader"],
    };
  },
  activity: () => ({ state, tasks, intentions, held, unread: story ? 0 : 1, idle: [], lastSleep: now - 3600000 }),
  here: () => ({ here: true, back: false }),
  change: async (which, revision, what) => {
    if (what === "forget" || what === "retire")
      sky.splice(
        sky.findIndex((x) => x.id === which),
        1,
      );
    if (which === reviewId) reviewed = true;
    emit({ type: "learned" });
    return { done: what };
  },
  look: (patch) => {
    if (patch) {
      looks = { ...looks, ...patch };
      if (patch.wall === "") looks.wall = null;
      emit({ type: "look" });
    }
    return looks;
  },
  settle: () => {
    reviewed = true;
    return { done: "settle" };
  },
  answer: (which, allow, answers) => {
    const a = asks.find((x) => x.id === which);
    asks.splice(0, asks.length, ...asks.filter((x) => x.id !== which));
    if (a?.kind === "question")
      return emit({ type: "answered", id: which, by: "user", text: (answers ?? []).map((x) => (x.choose ?? []).join(", ")).join("; ") });
    emit({ type: "answered", id: which, allow });
  },
  say: (text, files = [], replyTo = null) => {
    const handed = files
      .map((id) => kept.get(id))
      .filter(Boolean)
      .map(({ id, name, type, size }) => ({ id, name, type, size }));
    const m = {
      id: `u${messages.length}`,
      role: "user",
      text: text || `[${handed.map((f) => f.name).join(", ")}]`,
      at: hour(),
      ...(handed.length ? { files: handed } : {}),
      ...(messages.find((x) => x.id === replyTo)
        ? {
            replyTo: {
              id: replyTo,
              role: messages.find((x) => x.id === replyTo).role,
              words: messages.find((x) => x.id === replyTo).text.slice(0, 140),
            },
          }
        : {}),
    };
    messages.push(m);
    emit({ type: "message", ...m });
    if (story) {
      m.read = hour();
      emit({ type: "read", id: m.id, at: m.read });
      return;
    }
    if (/sleep/i.test(text)) {
      state = "asleep";
      return emit({ type: "state", state });
    }
    m.read = hour();
    emit({ type: "read", id: m.id, at: m.read });
    state = "awake";
    thinking = true;
    thinkingSince = Date.now();
    emit({ type: "thinking", on: true, since: thinkingSince });
    // SLOW=<seconds> makes it think that long, to see what waiting looks like.
    // It thinks first and writes after: the dots belong to the last part.
    const whole = Number(process.env.SLOW ?? 2.5) * 1000;
    clearTimeout(penning);
    penning = setTimeout(() => {
      if (thinking) {
        writing = true;
        emit({ type: "writing", on: true });
      }
    }, whole * 0.6);
    answering = setTimeout(
      () => {
        // A message with a 2 in it is answered in two, a moment apart, to see how that looks: the dots stay between them.
        const two = /2|２/.test(text);
        const done = () => {
          thinking = false;
          writing = false;
          emit({ type: "writing", on: false });
          emit({ type: "thinking", on: false });
        };
        if (two)
          setTimeout(() => {
            const r2 = { id: `r${messages.length}`, role: "assistant", text: "And one more thing: who reads it first?", at: Date.now() };
            messages.push(r2);
            emit({ type: "message", ...r2 });
            done();
          }, 1500);
        else done();
        const r = {
          id: `r${messages.length}`,
          role: "assistant",
          text: "Here is what I would do, with the decision first.",
          at: Date.now(),
          used: [sky[0], sky[11], sky[22]].filter(Boolean).map((s) => ({ id: s.id, use: "silent", text: s.text })),
        };
        messages.push(r);
        emit({ type: "message", ...r });
      },
      Number(process.env.SLOW ?? 2.5) * 1000,
    );
  },
};
// The second door. One JSON body: `set` replaces what the made-up mind holds, `message` is said (by either side), `task` goes out or comes back, `thinking` shows the dots, `emit` sends any other event as it is.
if (process.env.STAGE)
  createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    let b = {};
    try {
      b = JSON.parse(raw || "{}");
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (b.set) {
      if (b.set.clock !== undefined) clock = b.set.clock;
      if (b.set.intentions) intentions = b.set.intentions;
      if (b.set.messages) messages = b.set.messages;
      if (b.set.state) state = b.set.state;
      if (b.set.memories !== undefined) {
        for (const m of b.set.memories) {
          sky.unshift({ kind: "noted", private: false, strength: 0.95, from: [], at: hour(), ...m });
          if (m.quote) quotes.set(m.id, m.quote);
        }
        emit({ type: "learned" });
      }
    }
    if (b.thinking !== undefined) {
      thinking = !!b.thinking;
      thinkingSince = thinking ? Date.now() : null;
      emit({ type: "thinking", on: thinking, ...(thinking ? { since: thinkingSince } : {}) });
      writing = b.writing !== undefined ? !!b.writing : thinking;
      emit({ type: "writing", on: writing });
    } else if (b.writing !== undefined) {
      writing = !!b.writing;
      emit({ type: "writing", on: writing });
    }
    if (b.reaction) {
      const m = messages.find((x) => x.id === b.reaction.to) ?? messages.findLast((x) => x.role === "user");
      if (m) {
        m.reaction = b.reaction.emoji;
        emit({ type: "reaction", to: m.id, emoji: b.reaction.emoji });
      }
    }
    if (b.ask) {
      asks.push(b.ask);
      emit({ type: "ask", ask: b.ask });
    }
    if (b.message) {
      const m = { id: `s${messages.length}-${Date.now() % 100000}`, at: hour(), ...b.message };
      messages.push(m);
      if (m.role === "assistant") {
        thinking = false;
        writing = false;
      }
      emit({ type: "message", ...m });
    }
    if (b.task) {
      const at = tasks.findIndex((t) => t.id === b.task.id);
      if (at < 0) tasks.push(b.task);
      else tasks[at] = { ...tasks[at], ...b.task };
      emit({ type: "task", task: at < 0 ? b.task : tasks[at] });
    }
    if (b.intention) {
      intentions = [...intentions, b.intention].sort((x, y) => x.at - y.at);
      emit({ type: "intention", at: b.intention.at, why: b.intention.why });
    }
    if (b.emit) emit(b.emit);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  }).listen(Number(process.env.STAGE), "127.0.0.1");
const door = await serve(mind, { port: Number(process.argv[2] ?? 4171), language: process.argv[3] ?? "", token: "preview", live: true });
console.log(door.url);
