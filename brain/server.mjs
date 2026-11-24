// The door to the conversation: a page on this computer only.
//
// It listens on 127.0.0.1, answers nobody without the token it printed at
// start, and refuses a request whose Host is not this machine (a page on the
// web cannot reach it by pointing a name at 127.0.0.1).
import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import * as copy from "../client/copy.mjs";
import { composePage, composePageSync, PAGE_FILES } from "./page.mjs";
import { fontNames } from "./fonts.mjs";
import { ICON_PATH, ICON_CIRCLES, ICON_STROKE } from "../client/icon.mjs";

const MARK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATH}"/>${ICON_CIRCLES.map(([cx, cy, r], n) => `<circle class="star s${n}" cx="${cx}" cy="${cy}" r="${r}"/>`).join("")}</svg>`;

// A program that is running goes on running the code it started with, whatever is put on the disk afterwards. If the files are replaced under it (an update
// without a restart), the page on the disk is a newer one than this code: it asks for words this code does not have and for things it does not do. So the page
// is kept as it was when this code was loaded, and served from that copy once the version on the disk is no longer this one; and the state says so, for the
// page to tell the person that a restart is needed. While the versions agree, the file is read each time, as before.
const versionOnDisk = () => {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? null;
  } catch {
    return null;
  }
};
const LOADED = {
  version: versionOnDisk(),
  page: (() => {
    try {
      return composePageSync();
    } catch {
      return null;
    }
  })(),
};
// The version alone does not tell: several builds can carry one version, and then a newer page was served over older code that did not know what the page sent it
// (a way of speaking given at the first waking was sent, ignored, and lost). So the code itself is compared, by a print of the files this program was loaded from;
// and the page that is served is always the one put together when this code was loaded, never a newer one read from the disk. (LIVE is for working on the page.)
const printOnDisk = () => {
  try {
    const h = createHash("sha1");
    for (const name of ["mind.mjs", "server.mjs", "wake.mjs", "page.mjs", ...PAGE_FILES.map((n) => "page/" + n)])
      h.update(readFileSync(new URL("./" + name, import.meta.url)));
    return h.digest("hex");
  } catch {
    return null;
  }
};
LOADED.print = printOnDisk();
let checked = { at: 0, stale: false };
const stale = () => {
  if (Date.now() - checked.at > 20000) {
    const now = versionOnDisk(),
      print = printOnDisk();
    checked = {
      at: Date.now(),
      stale: (!!LOADED.version && !!now && now !== LOADED.version) || (!!LOADED.print && !!print && print !== LOADED.print),
    };
  }
  return checked.stale;
};
// Words the panel already has that the page uses too.
const SHARED = [
  "back",
  "cancel",
  "save",
  "stillTrue",
  "search",
  "values",
  "purpose",
  "keepThis",
  "private",
  "forgetConfirm",
  "assistantName",
  "yourName",
  "paused",
  "tabMemory",
  "talkManage",
  "talkWindow",
];
const LANGUAGES = ["en", "ja", "zh", "de", "es", "fr", "pt", "ru"];
const same = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// The words the page shows, in one language, and a composed page with its places filled. One function for whoever serves the page: this server,
// and the site, which is the same page over a mind that only remembers what the site says.
export const pageWords = (lang) =>
  Object.fromEntries(
    Object.entries({ ...copy.en, ...(copy[lang] ?? {}) }).filter(
      ([k]) => k.startsWith("brain") || k.startsWith("kind_") || k.startsWith("idle_") || SHARED.includes(k),
    ),
  );
export const fillPage = (page, { lang = "en", token = "", host = {}, theme = "" } = {}) =>
  page
    .replace("__LANG__", lang)
    .replace("__TOKEN__", token)
    .replace("__HOST__", JSON.stringify(host))
    .replace("__THEME__", theme)
    .replaceAll("__ICON__", MARK)
    .replace("__WORDS__", JSON.stringify(pageWords(lang)).replace(/</g, "\\u003c"));

export function serve(mind, { port = 4170, token = randomBytes(18).toString("base64url"), language = "", live = false } = {}) {
  const streams = new Set();
  mind.listen((event) => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const s of streams) s.write(line);
  });
  const json = (res, status, value) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  };
  const body = (req) =>
    new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1700000) {
          reject(new Error("Too long"));
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error("Not JSON"));
        }
      });
    });
  // A file or a recording comes as it is, not wrapped in JSON.
  const bytes = (req, limit) =>
    new Promise((resolve, reject) => {
      const parts = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > limit) {
          reject(new Error("Too large"));
          req.destroy();
        } else parts.push(c);
      });
      req.on("end", () => resolve(new Uint8Array(Buffer.concat(parts))));
      req.on("error", reject);
    });
  // What the page last drew itself in, as it reported it. Kept only while this runs: it is for checking that a host's colours arrive.
  let shown = null;
  const SHOWABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const server = createServer(async (req, res) => {
    try {
      const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
      if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return json(res, 403, { error: "This page is only served to this computer" });
      const url = new URL(req.url, "http://127.0.0.1");
      const cookie = /(?:^|;\s*)asteme=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
      const given = url.searchParams.get("token");
      const framed = url.searchParams.get("embed") === "1";
      if (url.pathname === "/" && given && same(given, token) && !framed) {
        res.writeHead(303, { location: "/", "set-cookie": `asteme=${token}; HttpOnly; SameSite=Strict; Path=/` });
        return res.end();
      }
      if (!same(cookie, token) && !(given && same(given, token))) return json(res, 401, { error: "Open the address Asteme printed when it started" });
      if (req.method === "GET" && url.pathname === "/") {
        // The language: the one whoever shows this page says it is in itself (the panel around it, which already follows the settings and the harness, and knows of a change made since this started); or the one given when this started; or the browser's.
        const said = String(url.searchParams.get("lang") ?? "")
            .slice(0, 2)
            .toLowerCase(),
          wanted =
            (LANGUAGES.includes(said) ? said : "") ||
            String(language ?? "")
              .slice(0, 2)
              .toLowerCase() ||
            String(req.headers["accept-language"] ?? "")
              .slice(0, 2)
              .toLowerCase();
        const lang = LANGUAGES.includes(wanted) ? wanted : "en";
        const page = fillPage(LOADED.page && !live ? LOADED.page : await composePage(), {
          lang,
          token: framed ? token : "",
          host: Object.fromEntries(
            ["bg", "ink"].map((k) => [k, /^[0-9a-f]{6}$/i.test(url.searchParams.get(k) ?? "") ? "#" + url.searchParams.get(k) : ""]),
          ),
          theme: ["dark", "light"].includes(url.searchParams.get("theme")) ? url.searchParams.get("theme") : "",
        });
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:",
        });
        return res.end(page);
      }
      if (req.method === "GET" && url.pathname === "/api/state")
        return json(res, 200, { ...mind.snapshot(), ...(shown ? { shown } : {}), ...(stale() ? { stale: true } : {}) });
      if (req.method === "POST" && url.pathname === "/api/shown") {
        const b = await body(req);
        shown = {
          theme: b.theme === "dark" ? "dark" : "light",
          bg: /^#[0-9a-f]{6}$/i.test(b.bg ?? "") ? b.bg : "",
          ink: /^#[0-9a-f]{6}$/i.test(b.ink ?? "") ? b.ink : "",
          from: b.from === "host" ? "host" : "page",
          at: Date.now(),
          stars: b.stars === true,
          open: typeof b.open === "string" ? b.open.slice(0, 80) : null,
          // What the host asked for, as the page received it: it can differ from what was drawn when a colour was not one the page accepts.
          ...(b.asked && typeof b.asked === "object"
            ? { asked: Object.fromEntries(["theme", "bg", "ink"].map((k) => [k, String(b.asked[k] ?? "").slice(0, 12)])) }
            : {}),
        };
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/file")
        return json(
          res,
          200,
          mind.keep({
            name: (() => {
              try {
                return decodeURIComponent(String(req.headers["x-file-name"] ?? "")) || "file";
              } catch {
                return "file";
              }
            })(),
            type: String(req.headers["content-type"] ?? ""),
            bytes: await bytes(req, 26000000),
          }),
        );
      if (req.method === "GET" && url.pathname === "/api/file") {
        const f = mind.file(url.searchParams.get("id"));
        if (!f) return json(res, 404, { error: "Not found" });
        // Only a picture is shown in the page; anything else is handed back as a download, never run.
        res.writeHead(200, {
          "content-type": SHOWABLE.has(f.type) ? f.type : "application/octet-stream",
          "content-length": f.size,
          "x-content-type-options": "nosniff",
          "cache-control": "private, max-age=3600",
          "content-disposition": `${SHOWABLE.has(f.type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          "content-security-policy": "default-src 'none'; sandbox",
        });
        return createReadStream(f.path).pipe(res);
      }
      if (req.method === "GET" && url.pathname === "/api/models") return json(res, 200, await mind.models());
      if (req.method === "POST" && url.pathname === "/api/model") return json(res, 200, await mind.model(await body(req)));
      if (req.method === "POST" && url.pathname === "/api/hear") return json(res, 200, await mind.hear(await bytes(req, 8000000)));
      if (req.method === "POST" && url.pathname === "/api/unwake") return json(res, 200, mind.unwake((await body(req)).id));
      if (req.method === "GET" && url.pathname === "/api/speak") {
        const id = url.searchParams.get("id");
        // The sound is passed on as it comes, and ends when the listener leaves.
        const stop = new AbortController();
        res.on("close", () => stop.abort());
        const sound = await mind.aloud(id, { voice: url.searchParams.get("voice") ?? undefined, signal: stop.signal });
        // Raw 16-bit mono samples; the header says how many a second.
        res.writeHead(200, {
          "content-type": "audio/pcm",
          "x-audio-rate": String(sound.rate || 24000),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        if (sound.bytes) return res.end(sound.bytes);
        try {
          for await (const chunk of sound.body) {
            if (!res.write(chunk)) await new Promise((r) => res.once("drain", r));
          }
        } catch {
          /* cut off: an early end is a failed reading, and the page says so */
        }
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/api/sky") return json(res, 200, mind.sky());
      if (req.method === "GET" && url.pathname === "/api/memory") return json(res, 200, mind.memory(url.searchParams.get("id")));
      // The typefaces of the machine this runs on, by name: candidates for a page that cannot ask its own browser.
      if (req.method === "GET" && url.pathname === "/api/fonts") return json(res, 200, { names: fontNames() });
      if (req.method === "GET" && url.pathname === "/api/unseen") return json(res, 200, mind.unseen());
      if (req.method === "GET" && url.pathname === "/api/find") return json(res, 200, mind.find(url.searchParams.get("q") ?? ""));
      if (req.method === "GET" && url.pathname === "/api/self") return json(res, 200, mind.self());
      if (req.method === "GET" && url.pathname === "/api/activity") return json(res, 200, mind.activity());
      if (req.method === "POST" && url.pathname === "/api/change") {
        const b = await body(req);
        return json(res, 200, await mind.change(b.id, b.revision, b.what));
      }
      if (req.method === "POST" && url.pathname === "/api/settle") {
        const b = await body(req);
        return json(res, 200, mind.settle(b.a, b.b, b.keep));
      }
      if (req.method === "POST" && url.pathname === "/api/self") return json(res, 200, mind.self(await body(req)));
      if (req.method === "POST" && url.pathname === "/api/look") return json(res, 200, mind.look(await body(req)));
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": open\n\n");
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/say") {
        const { text, files, replyTo } = await body(req);
        mind.say(text ?? "", files, replyTo);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/react") {
        const { id, emoji } = await body(req);
        return json(res, 200, mind.react(id, emoji));
      }
      if (req.method === "POST" && url.pathname === "/api/answer") {
        const { id, allow, answers } = await body(req);
        mind.answer(id, allow === true, answers);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/stop") return json(res, 200, mind.stop());
      if (req.method === "POST" && url.pathname === "/api/fresh") return json(res, 200, mind.fresh((await body(req)).on !== false));
      if (req.method === "POST" && url.pathname === "/api/draft") return json(res, 200, mind.draft((await body(req)).text));
      if (req.method === "POST" && url.pathname === "/api/seen") return json(res, 200, mind.seen((await body(req)).ids));
      if (req.method === "POST" && url.pathname === "/api/here") return json(res, 200, mind.here?.() ?? { here: true });
      if (req.method === "POST" && url.pathname === "/api/retract") return json(res, 200, await mind.retract((await body(req)).id));
      json(res, 404, { error: "Not found" });
    } catch (e) {
      json(res, 400, { error: String(e.message).slice(0, 200) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/?token=${token}`,
        port: server.address().port,
        token,
        close: () =>
          new Promise((done) => {
            for (const s of streams) s.end();
            server.close(() => done());
          }),
      }),
    );
  });
}
