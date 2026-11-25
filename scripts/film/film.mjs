// Films the conversation page for one language, frame by frame on the film's own clock, driven through the preview's stage door.
// Usage: node scripts/film/film.mjs <en|zh|ja>. See README.md beside this file for what it needs.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILMS, LANGS, direct, story, committed } from "./words.mjs";
const require = createRequire(process.env.FILM_MODULES ? join(process.env.FILM_MODULES, "/") : import.meta.url);
const { chromium } = require("playwright");
const lang = process.argv[2] ?? "en",
  F = FILMS[lang];
if (!F) throw new Error("No film for " + lang + "; there is one for each of " + LANGS.join(", "));
const T = direct(lang),
  HERE = fileURLToPath(new URL(".", import.meta.url)),
  REPO = fileURLToPath(new URL("../..", import.meta.url)),
  PORT = 4300 + LANGS.indexOf(lang),
  STAGE = PORT + 50,
  out = join(process.env.FILM_OUT ?? join(tmpdir(), "asteme-film"), lang),
  sky = JSON.parse(readFileSync(join(HERE, "sky", lang + ".json"), "utf8")),
  scene = story(lang, sky);
rmSync(out, { recursive: true, force: true });
mkdirSync(out + "/f", { recursive: true });
writeFileSync(out + "/story.json", JSON.stringify(scene));
// The letters: the page asks for the system's face, and so does what it draws on the sky. On the filming machine both are Inter, with the right CJK
// face for the film's language behind it, so that a Chinese film is not drawn with Japanese shapes.
writeFileSync(
  out + "/fonts.conf",
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include>` +
    ["system-ui", "sans-serif", "-apple-system"]
      .map((f) => `<alias binding="strong"><family>${f}</family><prefer><family>Inter</family><family>${F.cjk}</family></prefer></alias>`)
      .join("") +
    `</fontconfig>`,
);
const night = Date.parse(F.night),
  later = Date.parse(F.later);
// The preview's sky is as large as the person's: every star is one of their memories, none twice.
const server = spawn("node", ["brain/preview.mjs", String(PORT), F.lang], {
  cwd: REPO,
  env: { ...process.env, STORY: out + "/story.json", STAGE: String(STAGE), STARS: "46", ALL: String(Math.max(0, sky.memories.length - 46)), TZ: F.tz },
  stdio: "ignore",
});
// The preview goes when the film does, however the film ends: one left behind would answer the next film's page with this one's conversation.
process.on("exit", () => server.kill());
process.on("unhandledRejection", (e) => {
  console.error(e);
  process.exit(1);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The preview takes a moment to stand up, longer on a cold machine: the film waits until its stage door answers.
for (let tries = 0; ; tries++) {
  const up = await fetch(`http://127.0.0.1:${STAGE}`, { method: "POST", body: JSON.stringify({ set: { clock: night } }) }).then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  if (tries > 100) throw new Error("the preview did not start on port " + PORT);
  await sleep(200);
}
await sleep(600);
const browser = await chromium.launch({
  ...(process.env.FILM_CHROME ? { executablePath: process.env.FILM_CHROME } : {}),
  args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
  env: { ...process.env, FONTCONFIG_FILE: out + "/fonts.conf" },
});
// 1120 by 630 on the page is 1920 by 1080 on film: the words are about twelve pixels high where GitHub shows the film, and a memory opens beside the
// conversation, not over it.
const W = 1120,
  H = 630,
  SCALE = 1920 / W;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, locale: F.locale, colorScheme: "dark", timezoneId: F.tz });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
// The page lives on the film's clock, not the wall's: its "now" is the scene's, and every frame is one moment of that clock, so nothing moves by fits
// when the machine is busy. Time stands still between frames while the page fetches what it asked for.
await p.clock.install({ time: night - 6000 });
await p.clock.pauseAt(night - 5800);
await p.addInitScript(() => {
  const real = window.fetch;
  window.__asking = 0;
  window.fetch = (...a) => {
    window.__asking++;
    return real(...a).finally(() => window.__asking--);
  };
});
await p.goto(`http://127.0.0.1:${PORT}/?token=preview&theme=dark&lang=${F.lang}`);
for (let i = 0; i < 50; i++) {
  await p.clock.runFor(100);
  await sleep(30);
}
// The person has set the page's letters a little larger than the default, as anyone can in its settings (12 to 24 px): on GitHub the film is shown
// at less than half its size, and the words have to be read there.
await p.evaluate((px) => post("/api/look", { px }), F.px ?? 19);
for (let i = 0; i < 10; i++) {
  await p.clock.runFor(100);
  await sleep(30);
}
// What the film adds to the page, and nothing else: a veil for the days passing, three lines of the README's own words and the hour of the promise,
// the name at the end with the one sentence that says who this is, the person's hand, and a caret that blinks on the film's clock (the browser's own
// blinks on the wall's, and would flicker).
await p.evaluate(
  ({ end, title }) => {
    const css = document.createElement("style");
    css.textContent = `#spacehint { display: none !important; }
      #box, #find { caret-color: transparent !important; }
      #fdim, #fcap, #fwhen, #fend, #fpoint, #fcaret, #fmirror { position: fixed; pointer-events: none; }
      #fdim { inset: 0; z-index: 97; background: var(--bg); opacity: 0; }
      #fsoon { position: fixed; z-index: 98; pointer-events: none; margin: 0; }
      #fcap { left: 0; right: 0; top: 3.6rem; z-index: 96; display: flex; justify-content: center; padding: .7rem 0 2.6rem; opacity: 0;
        background: linear-gradient(to bottom, var(--bg) 0, var(--bg) 3.9rem, color-mix(in srgb, var(--bg) 0%, transparent) 100%); }
      body.sheet-on #fcap { right: 25rem; }
      #fcap span, #fwhen span { font-size: 1.5rem; font-weight: 500; line-height: 1.4; color: color-mix(in srgb, var(--ink) 92%, transparent); word-break: auto-phrase; text-align: center; max-width: 36rem; }
      #fwhen { inset: 0; z-index: 99; display: grid; place-items: center; opacity: 0; }
      #fend { inset: 0; z-index: 99; display: grid; place-items: center; text-align: center; color: var(--ink); opacity: 0; background: color-mix(in srgb, var(--bg) 42%, transparent); }
      body.fname #spacebar, body.fname #spacelevel { opacity: 0; transition: opacity 1s ease; }
      #fend svg { display: block; margin: 0 auto 1.1rem; }
      #fend .n { font-size: 1.9rem; font-weight: 600; letter-spacing: .22em; padding-left: .22em; }
      #fend .t { margin-top: .9rem; font-size: 1.12rem; font-weight: 500; opacity: .9; word-break: auto-phrase; }
      #fend .a { margin-top: .7rem; font-size: .82rem; opacity: .5; letter-spacing: .02em; }
      #fpoint { left: 0; top: 0; z-index: 100; width: 22px; height: 22px; opacity: 0; }
      #fcaret { z-index: 95; width: 1.5px; background: var(--ink); opacity: 0; }
      #fcomp { z-index: 95; height: 1.5px; background: var(--ink); opacity: 0; position: fixed; pointer-events: none; }
      #fmirror { visibility: hidden; left: 0; top: 0; overflow: hidden; }`;
    document.head.append(css);
    const mark = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 7 4 6-7M12 11l6 8M5 7l-2 11"/><circle cx="5" cy="7" r="2" fill="currentColor"/><circle cx="12" cy="11" r="2" fill="currentColor"/><circle cx="18" cy="4" r="1.5" fill="currentColor"/><circle cx="18" cy="19" r="2" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>`;
    const add = (id, html = "") => {
      const v = document.createElement("div");
      v.id = id;
      v.innerHTML = html;
      document.body.append(v);
      return v;
    };
    add("fdim");
    add("fcap", "<span></span>");
    add("fwhen", "<span></span>");
    const last = add("fend", `<div>${mark}<div class="n">ASTEME</div><div class="t"></div><div class="a"></div></div>`);
    last.querySelector(".t").textContent = title;
    last.querySelector(".a").textContent = end;
    add(
      "fpoint",
      `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 17 L7 13.2 L9.8 19.5 L12.4 18.4 L9.7 12.2 L15 12.2 Z" fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
    );
    add("fcaret");
    add("fcomp");
    add("fmirror");
    // Where the caret would be: the end of what is in the field (the person only ever types at the end), measured on a copy of the field.
    // With an index, where that character of the field is: the start of the reading being composed.
    window.__caretAt = (upto) => {
      const f = document.activeElement;
      if (!f || !["box", "find"].includes(f.id)) return null;
      const s = getComputedStyle(f),
        m = document.getElementById("fmirror"),
        r = f.getBoundingClientRect();
      for (const k of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "boxSizing", "textIndent", "wordBreak", "overflowWrap"])
        m.style[k] = s[k];
      m.style.width = r.width + "px";
      m.style.whiteSpace = f.id === "box" ? "pre-wrap" : "pre";
      m.textContent = f.value.slice(0, upto ?? f.selectionEnd ?? f.value.length);
      const mark = document.createElement("span");
      mark.textContent = "​";
      m.append(mark);
      const a = mark.getBoundingClientRect(),
        b = m.getBoundingClientRect(),
        h = parseFloat(s.fontSize) * 1.25;
      return { x: r.left + (a.left - b.left) - f.scrollLeft, y: r.top + (a.top - b.top) - f.scrollTop + (a.height - h) / 2, h };
    };
  },
  { end: F.end, title: F.title },
);
const BG = (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg"))).trim();

// --- The film's clock ----------------------------------------------------------------------------------------------------------------------------
// One frame every thirtieth of a second. Before each, the page's CSS animations are set to the same moment (they run on their own clock otherwise),
// the caret is drawn (solid while keys are pressed, blinking every 0.53 s otherwise), and the page is left to finish anything it fetched.
const FPS = 30,
  cdp = await ctx.newCDPSession(p),
  log = [];
let now = 0,
  n = 0,
  keyed = -9;
const settle = async () => {
  await sleep(40);
  for (let quiet = 0, k = 0; quiet < 2 && k < 300; k++) {
    quiet = (await p.evaluate(() => window.__asking)) ? 0 : quiet + 1;
    await sleep(15);
  }
};
const frame = async () => {
  const since = now / 1000 - keyed;
  await p.evaluate(
    ([v, lit]) => {
      for (const a of document.getAnimations()) {
        if (a.__from === undefined) {
          a.__from = v;
          a.pause();
        }
        a.currentTime = v - a.__from;
      }
      const c = document.getElementById("fcaret"),
        at = window.__caretAt();
      if (!at || !lit) c.style.opacity = 0;
      else Object.assign(c.style, { opacity: 0.9, left: at.x + "px", top: at.y + "px", height: at.h + "px" });
      // The reading being composed is underlined, from where it starts to the caret.
      const u = document.getElementById("fcomp"),
        from = window.__composing === undefined ? null : window.__caretAt(window.__composing);
      if (!from || !at) u.style.opacity = 0;
      else Object.assign(u.style, { opacity: 0.85, left: from.x + "px", top: at.y + at.h + 1 + "px", width: Math.max(0, at.x - from.x) + "px" });
    },
    [now, since < 0.5 || Math.floor((since - 0.5) / 0.53) % 2 === 1],
  );
  const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
  writeFileSync(`${out}/f/${String(n++).padStart(5, "0")}.jpg`, Buffer.from(shot.data, "base64"));
};
const at = async (seconds, name) => {
  while (now + 1000 / FPS <= seconds * 1000 + 1e-6) {
    await p.clock.runFor(1000 / FPS);
    now += 1000 / FPS;
    await frame();
  }
  if (name) log.push([name, +seconds.toFixed(3)]);
};
const stage = async (b) => {
  await fetch(`http://127.0.0.1:${STAGE}`, { method: "POST", body: JSON.stringify(b) });
  await settle();
};
const fade = (id, to, seconds, ease = "ease-in-out") =>
  p.evaluate(
    ([i, o, s, e]) => {
      const v = document.getElementById(i);
      v.style.transition = `opacity ${s}s ${e}`;
      v.style.opacity = o;
    },
    [id, to, seconds, ease],
  );
const caption = (id, text) =>
  p.evaluate(
    ([i, t]) => {
      const c = document.getElementById(i);
      c.style.transition = "opacity .4s ease";
      if (t) c.firstChild.textContent = t;
      c.style.opacity = t ? 1 : 0;
    },
    [id, text],
  );

// --- The hand -------------------------------------------------------------------------------------------------------------------------------------
// It goes where a person's would, on a slight curve, easing in and out; it is only there when a hand is. It comes in from beside the conversation,
// not across it: a pointer passing over a message would show that message's tools on the way.
let hand = { x: 205, y: 604 };
const reach = async (to, seconds) => {
  const from = { ...hand },
    start = now / 1000;
  await p.evaluate(() => (document.getElementById("fpoint").style.opacity = 1));
  for (let k = 1; ; k++) {
    const t = start + k / FPS,
      u = Math.min(1, (t - start) / seconds),
      e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
      bow = Math.sin(u * Math.PI) * 18,
      x = from.x + (to.x - from.x) * e,
      y = from.y + (to.y - from.y) * e - bow;
    await p.evaluate(([x, y]) => (document.getElementById("fpoint").style.transform = `translate(${x - 3}px, ${y - 2}px)`), [x, y]);
    await p.mouse.move(x, y);
    await at(t);
    if (u >= 1) break;
  }
  hand = to;
};
const handAway = () => fade("fpoint", 0, 0.4);

// --- Typing ---------------------------------------------------------------------------------------------------------------------------------------
// Keys come unevenly, in bursts inside words. An input method shows the reading underlined, then the phrase it becomes, then commits it.
const type = async (typed, [from, to]) => {
  const total = to - from;
  let t = from,
    x = 7;
  const tick = async (dt) => {
    x = (x * 73 + 11) % 101;
    t += dt * (0.7 + 0.6 * (x / 101));
    await at(Math.min(t, to - 0.01));
    keyed = now / 1000;
  };
  if (!Array.isArray(typed)) {
    const chars = [...typed],
      each = total / chars.reduce((s, c) => s + 1 + (c === " " ? 0.8 : /[.,?!…:;]/.test(c) ? 2.6 : 0), 0);
    for (const c of chars) {
      await tick(each * (1 + (c === " " ? 0.8 : 0)));
      await p.keyboard.insertText(c);
      if (/[.,?!…:;]/.test(c)) await tick(each * 1.6);
    }
  } else {
    const weight = typed.reduce((s, [r, w]) => s + (r === w ? [...w].length * 1.6 : [...r.replace(/ /g, "")].length + 4), 0),
      each = total / weight;
    for (const [reading, word] of typed) {
      if (reading === word) {
        for (const c of word) {
          await tick(each * 1.6);
          await p.keyboard.insertText(c);
        }
        continue;
      }
      // The reading as the keys build it: kana one by one, or pinyin letters with the syllables marked.
      const latin = /^[a-z ]+$/.test(reading),
        steps = latin
          ? [...reading]
              .map((_, i) => reading.slice(0, i + 1))
              .filter((s) => !s.endsWith(" "))
              .map((s) => s.replace(/ /g, "'"))
          : [...reading].map((_, i) => [...reading].slice(0, i + 1).join(""));
      // What is being composed stands in the field, underlined, and is replaced as the reading grows and when it is converted; committing it
      // takes the underline away.
      const start = await p.evaluate(() => {
        const f = document.activeElement;
        return (window.__composing = f.value.length);
      });
      const put = async (text) => {
        await p.evaluate((k) => {
          const f = document.activeElement;
          f.setSelectionRange(k, f.value.length);
        }, start);
        await p.keyboard.insertText(text);
      };
      for (const s of steps) {
        await tick(each);
        await put(s);
      }
      await tick(each * 2.2);
      await put(word);
      await tick(each * 1.8);
      await p.evaluate(() => (window.__composing = undefined));
    }
  }
  await at(to);
};
const eraseAll = async (count, [from, to]) => {
  for (let i = 0; i < count; i++) {
    await at(from + ((to - from) * i) / count);
    await p.keyboard.press("Backspace");
    keyed = now / 1000;
  }
  await at(to);
};
const dots = () => stage({ thinking: true, writing: true });
const says = async (text, extra = {}) => {
  await stage({ message: { role: "assistant", text, ...extra } });
  await stage({ thinking: false });
};
const send = async (when, name) => {
  await at(when, name);
  await p.keyboard.press("Enter");
  keyed = now / 1000;
  await settle();
};
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const starAt = (id) => p.evaluate((id) => (typeof drawnAt !== "undefined" && drawnAt?.get(id) ? { x: drawnAt.get(id).x, y: drawnAt.get(id).y } : null), id);
const idOf = (text) => scene.memories.find((m) => m.text === text).id;

// --- Before the first frame: the night as it was, with the start of tonight's message already typed ----------------------------------------------
await p.locator("#box").click();
await p.keyboard.insertText(F.composer);
await p.evaluate(() => (document.getElementById("fdim").style.opacity = 1));
await p.clock.runFor(200);
await settle();
await frame();

// --- Night -----------------------------------------------------------------------------------------------------------------------------------------
await at(T.rise, "rise");
await fade("fdim", 0, 0.6);
await type(F.hesitate, T.hesitate);
await eraseAll([...committed(F.hesitate)].length, [T.erase, T.erase + 0.4]);
await type(F.settle, T.settle);
await send(T.send1, "send1");
await at(T.dots1);
await dots();
// --- Something said long ago, in other words, comes back ---------------------------------------------------------------------------------------------
await at(T.recall, "recall");
await says(F.recall, { used: F.memory.map((m) => ({ id: idOf(m.text), use: "mention", text: m.text })) });
// The person reaches for the star the line runs from; its words show beside it; a click opens it beside the conversation.
await at(T.reach, "reach");
const lit = await starAt(idOf(F.memory[0].text));
if (!lit) throw new Error("the recalled star is not on the sky: " + idOf(F.memory[0].text));
await reach({ x: lit.x, y: lit.y }, T.hover - T.reach);
await at(T.open, "open");
await p.mouse.down();
await p.mouse.up();
await settle();
await handAway();
// The hand leaves the conversation alone: a pointer resting on a message would show that message's tools.
await p.mouse.move(W - 8, H - 8);
hand = { x: W - 110, y: H - 26 };
await at(T.dock, "dock");
await at(T.cap1, "cap1");
await caption("fcap", F.captions[0]);
await at(T.cap1off);
await caption("fcap", "");
await at(T.close, "close");
await p.keyboard.press("Escape");
await p.locator("#box").focus();
// And only then can they believe it.
await type(F.react, T.react);
await send(T.send2, "send2");
await at(T.dots2);
await dots();
await at(T.reactAnswer, "reactAnswer");
await says(F.reactAnswer);
// --- It offers to ask, and the page writes the promise under its words -------------------------------------------------------------------------------
await at(T.dots3);
await dots();
await at(T.promise, "promise");
await stage({ intention: { id: "w-film", at: later, why: F.why } });
await says(F.promise, { promised: [{ at: later, why: F.why }] });
// --- Days pass: everything dims but the promise in the header ----------------------------------------------------------------------------------------
await at(T.dim, "dim");
await p.evaluate(() => {
  // The one thing left lit while the days pass: the promise, where the page shows it.
  const soon = document.getElementById("soon"),
    r = soon.getBoundingClientRect(),
    copy = soon.cloneNode(true);
  copy.id = "fsoon";
  Object.assign(copy.style, { left: r.left + "px", top: r.top + "px", height: r.height + "px", whiteSpace: "nowrap", font: getComputedStyle(soon).font, color: getComputedStyle(soon).color });
  document.body.append(copy);
});
await fade("fdim", 0.9, 1.0);
await at(T.whenOn);
await caption("fwhen", F.when);
await at(T.turn, "turn");
await stage({ set: { clock: later } });
await p.clock.setSystemTime(later);
await at(T.whenOff);
await caption("fwhen", "");
await at(T.undim);
await fade("fdim", 0, 1.2);
// --- At the time it said, it speaks first --------------------------------------------------------------------------------------------------------------
await at(T.dots4);
await dots();
await at(T.first1, "first1");
await stage({ set: { intentions: [] } });
await p.evaluate(() => document.getElementById("fsoon")?.remove());
await stage({ message: { role: "assistant", text: F.first[0] } });
await at(T.first2, "first2");
await says(F.first[1]);
await at(T.cap2, "cap2");
await caption("fcap", F.captions[1]);
await type(F.answer, T.answer);
await at(T.cap2off);
await caption("fcap", "");
await send(T.send3, "send3");
await at(T.dots5);
await dots();
await at(T.answerReply, "answerReply");
await says(F.answerReply);
await at(T.star, "star");
await stage({ set: { memories: [{ id: F.newId ?? "m-new", text: F.won, quote: committed(F.answer) }] } });
// --- Among the stars: everything ever said about the one thing ------------------------------------------------------------------------------------
await at(T.toSky, "toSky");
await p.evaluate(() => document.activeElement?.blur());
const open = F.skyAt ?? { x: 1065, y: 330 };
await reach(open, T.dblclick - T.toSky - 0.05);
await at(T.dblclick, "dblclick");
await p.mouse.dblclick(open.x, open.y);
await settle();
await handAway();
await at(T.land, "land");
await at(T.cap3, "cap3");
await caption("fcap", F.captions[2]);
await p.locator("#find").focus();
await type(F.seek, T.seek);
await at(T.cap3off);
await caption("fcap", "");
// One line after another: the quick ones first, then slower, the last on the theme's last note, and held.
for (let i = 1; i < T.lines.length; i++) {
  await at(T.lines[i], i === T.lines.length - 1 ? "last" : null);
  await p.keyboard.press("ArrowDown");
}
await at(T.release, "release");
await p.keyboard.press("Control+a");
await p.keyboard.press("Backspace");
await settle();
await p.evaluate(() => document.activeElement?.blur());
await at(T.pull, "pull");
await p.mouse.move(560, 300);
{
  const ticks = 34;
  for (let i = 0; i < ticks; i++) {
    await at(T.pull + (T.pulled - T.pull) * ease((i + 0.5) / ticks));
    await p.mouse.wheel(0, 150);
  }
}
await p.mouse.move(4, 600);
// --- The name, over the whole sky ---------------------------------------------------------------------------------------------------------------------
await at(T.name, "name");
await p.evaluate(() => document.body.classList.add("fname"));
await fade("fend", 1, 1.4);
await at(T.stop, "stop");
copyFileSync(`${out}/f/${String(Math.round(T.poster * FPS)).padStart(5, "0")}.jpg`, `${out}/poster.jpg`);
writeFileSync(out + "/frames.json", JSON.stringify({ fps: FPS, frames: n, seconds: T.stop, poster: T.poster, log, errs, bg: BG }));
console.log(lang, "frames", n, "seconds", T.stop, errs.slice(0, 2));
await browser.close().catch(() => {});
process.exit(0);
