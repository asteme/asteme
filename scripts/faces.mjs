// Says which faces really draw the conversation page on this machine, for each language asked about: the words of the page, and what is drawn on the
// sky. Chinese and Japanese share characters but not their shapes, and which face a browser takes for them depends on the system as much as on the
// page (on a Japanese Windows "the system's font" is itself a Japanese face), so this is asked of a real browser here, not read off the stylesheet.
// Usage: node scripts/faces.mjs [zh ja en ...]     zh and ja when none is named
// It starts the page's own preview and a browser of the Chromium family without a window (Edge or Chrome where they usually are; BROWSER=<path> names
// another), asks it which fonts it used, prints them, and ends with 1 if a language was drawn in the other's shapes. Nothing is installed, and what
// it made for itself is taken away again.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)),
  env = process.env,
  langs = process.argv.slice(2).length ? process.argv.slice(2) : ["zh", "ja"];
const usual = {
  win32: [
    [env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"],
    [env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"],
    [env.ProgramFiles, "Google/Chrome/Application/chrome.exe"],
    [env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"],
    [env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"],
  ],
  darwin: [["/Applications", "Google Chrome.app/Contents/MacOS/Google Chrome"], ["/Applications", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"], ["/Applications", "Chromium.app/Contents/MacOS/Chromium"]],
}[process.platform] ?? [["/usr/bin", "google-chrome"], ["/usr/bin", "chromium"], ["/usr/bin", "chromium-browser"], ["/usr/bin", "microsoft-edge"], ["/snap/bin", "chromium"]];
const browser = [env.BROWSER, ...usual.filter(([dir]) => dir).map(([dir, rest]) => join(dir, rest))].find((p) => p && existsSync(p));
if (!browser) {
  console.error("No Edge or Chrome was found where they usually are. Name one: BROWSER=<path to the program> node scripts/faces.mjs");
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });

// The page: its own preview, with made-up words. The language is asked for in the address, as the panel inside DSH asks for it.
const port = await freePort(),
  preview = spawn(process.execPath, ["brain/preview.mjs", String(port)], { cwd: root, env: { ...env, DEMO: "1" }, stdio: "ignore" });
const home = mkdtempSync(join(tmpdir(), "asteme-faces-"));
const shown = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${home}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let ended = false;
const end = (code) => {
  if (ended) return;
  ended = true;
  preview.kill();
  shown.kill();
  // The browser lets go of its folder a moment after it is told to stop.
  setTimeout(() => { try { rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* left for the system to clear */ } process.exit(code); }, 300);
};
process.on("SIGINT", () => end(130));
const door = await new Promise((ok, no) => {
  let said = "";
  shown.stderr.on("data", (d) => { said += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(said); if (m) ok(m[1]); });
  shown.on("exit", () => no(new Error("The browser stopped before it could be asked anything:\n" + said.slice(-600))));
  setTimeout(() => no(new Error("The browser did not say where to ask it within 30 seconds.")), 30000);
}).catch((e) => { console.error(e.message); end(2); });
if (!door) await sleep(1e9);
for (let tries = 0; ; tries++) {
  if (await fetch(`http://127.0.0.1:${port}/?token=preview`, { redirect: "manual" }).then((r) => r.status < 500, () => false)) break;
  if (tries > 100) { console.error("The page's preview did not start."); end(2); await sleep(1e9); }
  await sleep(200);
}
// Asking the browser, over the door it opened (the DevTools protocol; Node speaks it without anything added).
const ws = new WebSocket(door);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("The browser's door could not be opened.")); });
let n = 0;
const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data), w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); if (m.error) w[1](new Error(m.error.message)); else w[0](m.result); };
const ask = (method, params = {}, sessionId) => new Promise((ok, no) => { waiting.set(++n, [ok, no]); ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await ask("Target.createTarget", { url: "about:blank" }),
  { sessionId: s } = await ask("Target.attachToTarget", { targetId, flatten: true });
const run = async (expression) => (await ask("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, s)).result?.value;

// Shared characters whose shapes differ between the two (直 and 骨 most plainly), and a few Latin letters.
const HAN = "直骨令次海", LATIN = "Agk";
const JAPANESE = /^(Yu Gothic|YuGothic|Meiryo|MS P?Gothic|MS UI Gothic|BIZ UD|Hiragino (Sans|Kaku|Maru)(?! GB)|Noto Sans (CJK )?JP|Source Han Sans( JP)?$|IPA|VL Gothic|TakaoP?Gothic)/i,
  CHINESE = /^(Microsoft YaHei|Microsoft JhengHei|SimSun|NSimSun|SimHei|DengXian|FangSong|KaiTi|PingFang|Hiragino Sans GB|Heiti|STHeiti|Songti|Noto Sans (CJK )?(SC|TC|HK)|Source Han Sans (SC|CN|TC|HC)|WenQuanYi|Droid Sans Fallback)/i;
let wrong = 0;
for (const lang of langs) {
  await ask("Page.navigate", { url: `http://127.0.0.1:${port}/?token=preview&embed=1&theme=dark&lang=${encodeURIComponent(lang)}` }, s);
  for (let tries = 0; tries < 150 && !(await run(`document.readyState === "complete" && typeof lettered === "function" && !!document.body`).catch(() => false)); tries++) await sleep(100);
  await sleep(600);
  // Two lines put on the page, lettered as everything on it is; and the same characters drawn on a canvas the way the sky letters its own.
  const page = await run(`(() => {
    for (const [id, text] of [["faces-han", ${JSON.stringify(HAN)}], ["faces-latin", ${JSON.stringify(LATIN)}]]) { const p = document.createElement("p"); p.id = id; p.textContent = text; document.body.append(p); }
    return { lang: document.documentElement.lang, list: getComputedStyle(document.body).fontFamily, sky: typeof lettered === "function" ? lettered(40) : "" };
  })()`);
  await ask("DOM.enable", {}, s);
  await ask("CSS.enable", {}, s);
  const { root: doc } = await ask("DOM.getDocument", { depth: 1 }, s);
  const used = async (id) => {
    const { nodeId } = await ask("DOM.querySelector", { nodeId: doc.nodeId, selector: "#" + id }, s);
    return (await ask("CSS.getPlatformFontsForNode", { nodeId }, s)).fonts.sort((a, b) => b.glyphCount - a.glyphCount).map((f) => f.familyName);
  };
  const han = await used("faces-han"), latin = await used("faces-latin");
  const onSky = page.sky
    ? await run(`(() => {
        const draw = (font) => { const c = document.createElement("canvas"); c.width = 420; c.height = 90; document.body.append(c); const g = c.getContext("2d"); g.font = font; g.fillStyle = "#fff"; g.fillText(${JSON.stringify(HAN)}, 8, 60); const d = g.getImageData(0, 0, 420, 90).data; c.remove(); return d; };
        const apart = (a, b) => { let k = 0; for (let i = 3; i < a.length; i += 4) k += Math.abs(a[i] - b[i]) > 48 ? 1 : 0; return k; };
        const sky = draw(${JSON.stringify(page.sky)});
        return ${JSON.stringify(han)}.map((name) => apart(sky, draw('40px "' + name.replace(/"/g, "") + '"')));
      })()`)
    : null;
  const other = lang.startsWith("zh") ? JAPANESE : lang.startsWith("ja") ? CHINESE : null,
    bad = !!other && han.some((f) => other.test(f)),
    skySame = onSky ? onSky[0] === 0 : null;
  if (bad || skySame === false) wrong++;
  console.log(`${lang.padEnd(3)} the page's words   ${han.join(", ") || "(nothing)"} for the shared characters; ${latin.join(", ") || "(nothing)"} for Latin${bad ? "   <- the other language's shapes" : ""}`);
  console.log(`    drawn on the sky   ${skySame === null ? "(this page does not say how the sky is lettered)" : skySame ? "the same face" : "another face than the page's words   <- not the same"}`);
  console.log(`    asked for, in order: ${page.list}`);
}
ws.close();
end(wrong ? 1 : 0);
