// Films the conversation page on a fixed clock (T in words.mjs), driven through the preview's stage door. Usage: node scripts/film/film.mjs <ja|en|zh>
// See README.md beside this file for what it needs.
import { createRequire } from "node:module"; import { spawn } from "node:child_process"; import { mkdirSync, writeFileSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; import { fileURLToPath } from "node:url";
import { WORDS, T } from "./words.mjs";
const require = createRequire(process.env.FILM_MODULES ? join(process.env.FILM_MODULES, "/") : import.meta.url); const { chromium } = require("playwright");
const lang = process.argv[2] ?? "ja", W = WORDS[lang];
const REPO = fileURLToPath(new URL("../..", import.meta.url)), PORT = 4300 + ["ja", "en", "zh"].indexOf(lang), STAGE = PORT + 50, out = join(process.env.FILM_OUT ?? join(tmpdir(), "asteme-film"), lang);
rmSync(out, { recursive: true, force: true }); mkdirSync(out + "/f", { recursive: true });
const night = Date.parse(W.night), friday = Date.parse(W.back);
const story = { name: "Asteme", you: "", intentions: [], lessons: W.lessons, fill: W.fill,
  // What was said about the one thing, over three years: the first of them is what comes back tonight.
  memories: W.about.map((text, i) => ({ id: "m" + i, text, quote: text, days: [1090, 40, 760, 300, 520, 95, 410, 180, 640][i], strength: 0.93 })),
  messages: W.before.map(([role, text], i) => ({ id: "b" + i, role, text, at: night - 86400000 + i * 30000, ...(role === "user" ? { read: night - 86400000 + 1000 } : {}) })) };
writeFileSync(out + "/story.json", JSON.stringify(story));
const server = spawn("node", ["brain/preview.mjs", String(PORT), W.lang], { cwd: REPO, env: { ...process.env, STORY: out + "/story.json", STAGE: String(STAGE), ALL: "640", TZ: "Asia/Tokyo" }, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = (b) => fetch(`http://127.0.0.1:${STAGE}`, { method: "POST", body: JSON.stringify(b) });
await sleep(1800); await stage({ set: { clock: night } });
const browser = await chromium.launch({ ...(process.env.FILM_CHROME ? { executablePath: process.env.FILM_CHROME } : {}), args: ["--force-color-profile=srgb"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: W.locale, colorScheme: "dark", timezoneId: "Asia/Tokyo" });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${PORT}/?token=preview&theme=dark&lang=${W.lang}`); await sleep(2500);
// Two veils, for the places where the film is not the page: black for coming in and going out and a dimming for the days that pass; and the name at the end.
await p.evaluate(() => { const add = (id, css) => { const v = document.createElement("div"); v.id = id; v.style.cssText = "position:fixed;inset:0;pointer-events:none;" + css; document.body.append(v); };
  add("fdim", "z-index:98;background:#000;opacity:1"); const st = document.createElement("style"); st.textContent = "#spacehint{display:none!important}"; document.head.append(st); add("fend", "z-index:99;display:grid;place-items:center;background:var(--bg);color:var(--ink);opacity:0;text-align:center"); });
const fade = (id, to, seconds, bg) => p.evaluate(([i, o, s, b]) => { const v = document.getElementById(i); if (b) v.style.background = b; v.style.transition = `opacity ${s}s ease-in-out`; v.style.opacity = o; }, [id, to, seconds, bg ?? null]);
await p.locator("#box").click(); await sleep(300);
// Frames as the browser paints them, each kept under its own time: they do not always arrive in order.
const cdp = await ctx.newCDPSession(p); const frames = []; let n = 0, shooting = false;
cdp.on("Page.screencastFrame", (f) => { if (shooting) { const name = `${out}/f/${String(n++).padStart(5, "0")}.jpg`; writeFileSync(name, Buffer.from(f.data, "base64")); frames.push({ name, t: f.metadata.timestamp }); } cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); await sleep(400);
shooting = true; const t0 = Date.now(), log = [];
const at = async (seconds, name) => { const wait = t0 + seconds * 1000 - Date.now(); if (wait > 0) await sleep(wait); if (name) log.push([name, seconds, +((Date.now() - t0) / 1000).toFixed(2)]); };
// Typing over a span of time, a little unevenly, as a hand does; the last key lands at the end of the span.
const type = async (text, [from, to]) => { const chars = [...text]; let x = 7; for (let i = 0; i < chars.length; i++) { x = (x * 73 + 11) % 101; const u = (i + 0.15 + 0.5 * (x / 101)) / chars.length; await at(from + (to - from) * Math.min(1, u)); await p.keyboard.insertText(chars[i]); } await at(to); };
const erase = async (count, [from, to]) => { for (let i = 0; i < count; i++) { await at(from + ((to - from) * i) / count); await p.keyboard.press("Backspace"); } await at(to); };
const dots = () => stage({ thinking: true, writing: true });
const says = async (text, extra = {}, done = true) => { await stage({ message: { role: "assistant", text, ...extra } }); if (done) await stage({ thinking: false }); else await dots(); };
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// --- Night: a worry, said after a hesitation ------------------------------------------------
await at(T.fadeIn); await fade("fdim", 0, 1.5);
await type(W.typeA, T.typeA); await type(W.hesitate, T.hesitate); await erase([...W.hesitate].length, T.erase); await type(W.settle, T.settle);
await at(T.send1, "send1"); await p.keyboard.press("Enter");
await at(T.dots1); await dots();
await at(T.a1, "a1"); await says(W.a1, {}, false);
await at(T.a2, "a2"); await says(W.a2, { used: [{ id: "m0", use: "mention", text: W.about[0] }] });
await type(W.say2, T.type2); await at(T.send2); await p.keyboard.press("Enter");
await at(T.dots3); await dots(); await at(T.a3, "a3"); await says(W.a3);
// --- Days pass ----------------------------------------------------------------------------------
await at(T.dim, "dim"); await fade("fdim", 0.82, 1.1, "var(--bg)"); await at(T.turnDay); await stage({ set: { clock: friday } }); await at(T.undim); await fade("fdim", 0, 1.3);
// --- It speaks first ----------------------------------------------------------------------------
await at(T.dots4); await dots(); await at(T.b1, "b1"); await says(W.b1, {}, false); await at(T.b2, "b2"); await says(W.b2);
await type(W.say3, T.type3); await at(T.send3); await p.keyboard.press("Enter");
await at(T.dots6); await dots(); await at(T.b3, "b3"); await says(W.b3);
await at(T.star, "star"); await stage({ set: { memories: [{ id: "m-new", text: W.won, quote: W.say3 }] } });
await type(W.say4, T.type4); await at(T.send4); await p.keyboard.press("Enter");
await at(T.dots7); await dots(); await at(T.b4, "b4"); await says(W.b4);
// --- Among the stars: everything ever said about the one thing ---------------------------------------
await at(T.space, "space"); await p.evaluate(() => { document.activeElement?.blur(); enterSpace(); });
await at(T.drift[0]); await p.keyboard.down("Shift"); await p.mouse.move(760, 300); await p.mouse.down();
for (;;) { const now = (Date.now() - t0) / 1000, u = Math.min(1, (now - T.drift[0]) / (T.drift[1] - T.drift[0])), e = ease(u); await p.mouse.move(760 - 210 * e, 300 + 26 * Math.sin(e * Math.PI)); if (u >= 1) break; await sleep(14); }
await p.mouse.up(); await p.keyboard.up("Shift"); await p.mouse.move(6, 420);
await at(T.seek[0] - 0.3); await p.locator("#find").focus(); await type(W.seek, T.seek); log.push(["seek", T.seek[1], +((Date.now() - t0) / 1000).toFixed(2)]);
// One line to a beat, the last of them held.
// What was said a moment ago is already there, first; then the rest, back through the years, to the one kept for last.
for (let i = 0; i < W.about.length; i++) { await at(T.lines + i * ((T.lastLine - T.lines) / (W.about.length - 1)), i === W.about.length - 1 ? "last" : null); await p.keyboard.press("ArrowDown"); }
await at(T.release, "release"); await p.keyboard.press("Control+a"); await p.keyboard.press("Backspace"); await sleep(250); await p.evaluate(() => document.activeElement?.blur());
await at(T.pull[0], "pull"); await p.mouse.move(640, 250); { const ticks = 34; for (let i = 0; i < ticks; i++) { await at(T.pull[0] + (T.pull[1] - T.pull[0]) * ease((i + 0.5) / ticks)); await p.mouse.wheel(0, 150); } } await p.mouse.move(6, 420);
// --- The name -------------------------------------------------------------------------------------
await at(T.end, "end");
await p.evaluate(() => { document.getElementById("fend").innerHTML = `<div><svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 7 4 6-7M12 11l6 8M5 7l-2 11"/><circle cx="5" cy="7" r="2" fill="currentColor"/><circle cx="12" cy="11" r="2" fill="currentColor"/><circle cx="18" cy="4" r="1.5" fill="currentColor"/><circle cx="18" cy="19" r="2" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg><div style="margin-top:1.2rem;font-size:1.9rem;font-weight:600;letter-spacing:.22em;padding-left:.22em">ASTEME</div><div style="margin-top:.8rem;font-size:.92rem;opacity:.55;letter-spacing:.02em">github.com/asteme/asteme</div></div>`; });
await fade("fend", 1, 1.2);
await at(T.out, "out"); await fade("fdim", 1, 1.1, "#000"); await p.evaluate(() => { document.getElementById("fdim").style.zIndex = 100; });
await at(T.stop, "stop"); shooting = false; await cdp.send("Page.stopScreencast").catch(() => {});
writeFileSync(out + "/frames.json", JSON.stringify({ frames, t0: t0 / 1000, seconds: T.stop, log, errs }));
console.log(lang, "frames", frames.length, "late by (s):", Math.max(...log.map(([, want, got]) => +(got - want).toFixed(2))), errs.slice(0, 2));
await browser.close(); server.kill();
