import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../site/content.mjs";
import { buildPage, SITE_LANGUAGES } from "../scripts/make-site.mjs";

test("the site says the same things in each language it is written in: the same families, the same number of lines, the same words for its own controls", () => {
  const shape = (c) => [c.families.map((f) => f.length), Object.keys(c.ui).sort(), c.ui.seek.length];
  for (const lang of SITE_LANGUAGES) {
    assert.deepEqual(shape(CONTENT[lang]), shape(CONTENT.en), lang);
    for (const line of [CONTENT[lang].first, ...CONTENT[lang].families.flat()]) assert.ok(typeof line === "string" && line.trim().length >= 2, `${lang}: an empty line`);
    // A word offered to try must find something, or the first thing a visitor does finds nothing.
    for (const word of CONTENT[lang].ui.seek) assert.ok([CONTENT[lang].first, ...CONTENT[lang].families.flat()].some((t) => t.toLowerCase().includes(word.toLowerCase())), `${lang}: nothing is said about "${word}"`);
  }
});

test("the site is the conversation page itself, with its places filled and nothing left to ask a server for", () => {
  for (const lang of SITE_LANGUAGES) {
    const page = buildPage(lang);
    assert.equal(/__[A-Z]+__/.test(page.replace(/__proto__/g, "")), false, `${lang}: a place in the page was left unfilled`);
    assert.ok(page.includes("window.SITE=") && page.includes('id="plain"') && page.includes(`<html lang="${lang}"`), lang);
    // Every sentence is also there as plain text, for a reader without scripts.
    assert.ok(page.includes(CONTENT[lang].families[0][0].replace(/&/g, "&amp;")), `${lang}: the plain page is missing its first line`);
    assert.equal(/https?:\/\/(?!github\.com\/asteme\/asteme)[^"'\s)]*\.(js|css|woff2?)\b/.test(page), false, `${lang}: the page loads something from elsewhere`);
  }
});

// --- The lines visitors choose to share -------------------------------------------------------------------------------------------------------
import worker, { LIMITS, clean } from "../site/worker/worker.js";
import { refuse } from "../site/worker/sieve.js";
import { REVIEW } from "../site/worker/review.js";
import { readFileSync, readdirSync } from "node:fs";

const room = () => {
  const kept = new Map();
  return { kept, LINES: { get: async (k) => kept.get(k) ?? null, put: async (k, v) => void kept.set(k, v), delete: async (k) => void kept.delete(k), list: async ({ prefix, limit }) => ({ keys: [...kept.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) }) }, ORIGIN: "https://asteme.github.io", KEY: "k".repeat(40), SALT: "s" };
};
const ask = (env, path, { method = "GET", origin, key, body, ip = "203.0.113.7" } = {}) =>
  worker.fetch(new Request("https://lines.example" + path, { method, headers: { ...(origin ? { origin } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}), "cf-connecting-ip": ip, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);

test("a line a visitor shares is seen by nobody until the one who holds the key has shown it: it waits where only the key reads, is never lost before it is decided, and who wrote it is not kept", async () => {
  const env = room(), site = "https://asteme.github.io";
  // The list of words is asked for from elsewhere; here it is already there.
  env.kept.set("banned", JSON.stringify(["badword"]));
  const send = (text, more = {}) => ask(env, "/line", { method: "POST", origin: site, body: { text, lang: "en" }, ...more });
  const lines = async () => (await (await ask(env, "/lines")).json()).lines;
  const room2 = async () => (await ask(env, "/waiting", { key: env.KEY })).json();
  assert.equal((await ask(env, "/line", { method: "POST", origin: "https://elsewhere.example", body: { text: "hello" } })).status, 403, "only from the site");
  assert.equal((await send("x")).status, 422, "too short");
  assert.equal((await send("y".repeat(LIMITS.max + 1))).status, 422, "too long");
  const ok = await send("  I want to see the sea\u200b  in spring ");
  assert.deepEqual([ok.status, ok.headers.get("access-control-allow-origin"), await ok.json()], [202, site, { taken: true }]);
  // Sent is not shown: the site is given nothing, and without the key nobody is given anything.
  assert.deepEqual(await lines(), []);
  for (const path of ["/waiting", "/pending"]) for (const key of [undefined, "wrong"]) assert.notEqual((await ask(env, path, { key })).status, 200);
  assert.equal((await ask(env, "/decide", { method: "POST", body: { show: ["anything"] } })).status, 401);
  const first = await room2();
  assert.deepEqual(first.waiting.map((l) => [l.text, l.lang, Object.keys(l).sort()]), [["I want to see the sea in spring", "en", ["at", "id", "lang", "text"]]], "the words, their language and when: nothing of who");
  assert.equal([...env.kept.entries()].some(([k, v]) => /203\.0\.113/.test(k + v)), false, "the address is nowhere in what is kept");
  // What the sieve throws away is answered like what it keeps, and does not wait to be read.
  const thrown = await send("visit https://example.com now", { ip: "198.51.100.1" });
  assert.deepEqual([thrown.status, await thrown.json()], [202, { taken: true }]);
  assert.equal((await send("you badword", { ip: "198.51.100.2" })).status, 202);
  assert.equal((await room2()).waiting.length, 1);
  // One visitor cannot fill the queue.
  for (let i = 0; i < LIMITS.perVisitor - 1; i++) assert.equal((await send("line " + i)).status, 202);
  assert.equal((await send("one too many")).status, 429);
  assert.equal((await send("from someone else", { ip: "198.51.100.9" })).status, 202);
  // Reading: one is shown, one is dropped, the rest go on waiting. Only what was shown is given to the site, without its id.
  const now = await room2(), [a, b] = now.waiting;
  assert.equal(now.waiting.length, LIMITS.perVisitor + 1);
  assert.deepEqual(await (await ask(env, "/decide", { method: "POST", key: env.KEY, body: { show: [a.id], drop: [b.id] } })).json(), { shown: 1, dropped: 1, taken: 0 });
  const given = await ask(env, "/lines", { origin: site });
  assert.equal(given.headers.get("access-control-allow-origin"), site);
  assert.deepEqual((await given.json()).lines.map((l) => [l.text, l.lang, Object.keys(l).sort()]), [["I want to see the sea in spring", "en", ["at", "lang", "text"]]]);
  assert.equal((await room2()).waiting.length, LIMITS.perVisitor - 1, "what was not decided is still waiting");
  // Showing it twice does not show it twice, and what is shown is not said again.
  await ask(env, "/decide", { method: "POST", key: env.KEY, body: { show: [a.id] } });
  assert.equal((await lines()).length, 1);
  await send("i want to see the sea in spring", { ip: "198.51.100.3" });
  assert.equal((await room2()).waiting.some((l) => /sea/.test(l.text)), false);
  // Taken down, it is gone from the site.
  assert.equal((await (await ask(env, "/decide", { method: "POST", key: env.KEY, body: { take: [a.id] } })).json()).taken, 1);
  assert.deepEqual(await lines(), []);
  assert.equal(clean("a\u0000b\n\nc"), "a b c");
});

test("where the lines are read holds no line and no key, loads nothing from elsewhere, and writes a line as text", async () => {
  const env = room(), page = await ask(env, "/review");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'.*connect-src 'self'/);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(REVIEW.includes(env.KEY), false);
  assert.equal(/https?:\/\//.test(REVIEW), false, "nothing from elsewhere");
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(REVIEW), false, "a line is never put on the page as markup");
});

test("nothing a visitor sent can reach the repository: no workflow fetches the lines, and the site is built without them", () => {
  const flows = readdirSync(new URL("../.github/workflows/", import.meta.url)).map((f) => readFileSync(new URL("../.github/workflows/" + f, import.meta.url), "utf8")).join("\n");
  assert.equal(/\/waiting|\/pending|LINES_KEY/.test(flows), false);
  for (const lang of SITE_LANGUAGES) assert.equal(/"shared":\s*\[/.test(buildPage(lang)), false);
});

test("the sieve only throws away: links, addresses, numbers to call, handles, noise, listed words and what is already there, and what is left still waits for a person", () => {
  const banned = ["badword", "bad phrase", "悪語"];
  const why = (t, already) => refuse(t, banned, already);
  assert.deepEqual(
    ["I want to see the sea in spring", "visit https://example.com now", "cheap at example.shop", "write me: a@b.co", "call 090-1234-5678", "add me @someone", "加我微信", "aaaaaaaaaa", "you badword", "a bad phrase here", "これは悪語です", "x"].map((t) => why(t)),
    [null, "link", "link", "address", "number", "handle", "handle", "noise", "listed", "listed", "listed", "length"],
  );
  assert.equal(why("embadwordment is a word"), null, "a listed word inside another word is not that word");
  assert.equal(why("The Sea", ["the sea"]), "said");
});
