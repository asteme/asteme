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
import { refuse, sieve } from "../scripts/sieve-lines.mjs";

const room = () => {
  const kept = new Map();
  return { kept, LINES: { get: async (k) => kept.get(k) ?? null, put: async (k, v) => void kept.set(k, v), delete: async (k) => void kept.delete(k), list: async ({ prefix, limit }) => ({ keys: [...kept.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) }) }, ORIGIN: "https://asteme.github.io", KEY: "k".repeat(40), SALT: "s" };
};
const ask = (env, path, { method = "GET", origin, key, body, ip = "203.0.113.7" } = {}) =>
  worker.fetch(new Request("https://lines.example" + path, { method, headers: { ...(origin ? { origin } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}), "cf-connecting-ip": ip, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);

test("a line a visitor shares is kept unseen until it is fetched with the key: nothing is shown to anyone, nobody else can read the queue, and who wrote it is not kept", async () => {
  const env = room(), site = "https://asteme.github.io";
  assert.equal((await ask(env, "/line", { method: "POST", origin: "https://elsewhere.example", body: { text: "hello" } })).status, 403, "only from the site");
  assert.equal((await ask(env, "/line", { method: "POST", origin: site, body: { text: "x" } })).status, 422, "too short");
  assert.equal((await ask(env, "/line", { method: "POST", origin: site, body: { text: "y".repeat(LIMITS.max + 1) } })).status, 422, "too long");
  const ok = await ask(env, "/line", { method: "POST", origin: site, body: { text: "  I want to see the sea\u200b  in spring ", lang: "en" } });
  assert.deepEqual([ok.status, ok.headers.get("access-control-allow-origin"), await ok.json()], [202, site, { kept: true }]);
  assert.equal((await ask(env, "/pending")).status, 401);
  assert.equal((await ask(env, "/pending", { key: "wrong" })).status, 401);
  const { lines } = await (await ask(env, "/pending", { key: env.KEY })).json();
  assert.deepEqual(lines.map((l) => [l.text, l.lang, Object.keys(l).sort()]), [["I want to see the sea in spring", "en", ["at", "id", "lang", "text"]]], "the words, their language and when: nothing of who");
  assert.equal([...env.kept.entries()].some(([k, v]) => /203\.0\.113/.test(k + v)), false, "the address is nowhere in what is kept");
  // One visitor cannot fill the queue.
  for (let i = 0; i < LIMITS.perVisitor - 1; i++) assert.equal((await ask(env, "/line", { method: "POST", origin: site, body: { text: "line " + i } })).status, 202);
  assert.equal((await ask(env, "/line", { method: "POST", origin: site, body: { text: "one too many" } })).status, 429);
  assert.equal((await ask(env, "/line", { method: "POST", origin: site, ip: "198.51.100.9", body: { text: "from someone else" } })).status, 202);
  // What has been dealt with is removed, and only with the key.
  assert.equal((await ask(env, "/taken", { method: "POST", body: { ids: [lines[0].id] } })).status, 401);
  assert.equal((await (await ask(env, "/taken", { method: "POST", key: env.KEY, body: { ids: [lines[0].id] } })).json()).removed, 1);
  assert.equal((await (await ask(env, "/pending", { key: env.KEY })).json()).lines.some((l) => l.id === lines[0].id), false);
  assert.equal(clean("a\u0000b\n\nc"), "a b c");
});

test("the sieve only throws away: links, addresses, numbers to call, handles, noise, listed words and what is already there are dropped, and what is left still waits for a person", () => {
  const banned = ["badword", "bad phrase", "悪語"];
  const why = (t, already) => refuse(t, banned, already);
  assert.deepEqual(
    ["I want to see the sea in spring", "visit https://example.com now", "cheap at example.shop", "write me: a@b.co", "call 090-1234-5678", "add me @someone", "加我微信", "aaaaaaaaaa", "you badword", "a bad phrase here", "これは悪語です", "x"].map((t) => why(t)),
    [null, "link", "link", "address", "number", "handle", "handle", "noise", "listed", "listed", "listed", "length"],
  );
  assert.equal(why("embadwordment is a word"), null, "a listed word inside another word is not that word");
  assert.equal(why("The Sea", ["the sea"]), "said");
  const { kept, dropped } = sieve([{ text: "one", lang: "en", at: 0 }, { text: "see www.x.com", lang: "en", at: 0 }, { text: "one", lang: "en", at: 0 }, { text: "二つ目", lang: "ja", at: 86400000 }], banned, []);
  assert.deepEqual([kept.map((k) => [k.text, k.lang, k.at]), dropped], [[["one", "en", "1970-01-01"], ["二つ目", "ja", "1970-01-02"]], { link: 1, said: 1 }]);
});
