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
import worker, { LIMITS, clean, passFor, worked, given } from "../site/worker/worker.js";
import { refuse } from "../site/worker/sieve.js";
import { REVIEW } from "../site/worker/review.js";
import { readFileSync, readdirSync } from "node:fs";

// A stand-in for the Worker's store: values, each with what is kept beside it, listed in the order of their names.
const room = (lag = 0) => {
  const kept = new Map(), gone = [];
  return {
    kept,
    LINES: {
      get: async (k) => kept.get(k)?.value ?? null,
      put: async (k, value, more = {}) => void kept.set(k, { value, metadata: more.metadata ?? null, ttl: more.expirationTtl ?? null, at: Date.now() }),
      delete: async (k) => { if (kept.has(k)) gone.push({ k, v: { ...kept.get(k), at: 0 }, at: Date.now() }); kept.delete(k); },
      // A listing may lag behind what was written (`lag`, in ms), as the real one may; what was removed may linger in it as long (`gone`).
      list: async ({ prefix, limit = 1000 }) => ({ keys: [...kept.entries(), ...gone.filter((g) => Date.now() - g.at < lag && !kept.has(g.k)).map((g) => [g.k, g.v])].filter(([k, v]) => k.startsWith(prefix) && (!lag || Date.now() - (v.at ?? 0) >= lag)).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }),
    },
    ORIGIN: "https://asteme.github.io", KEY: "k".repeat(40), SALT: "s".repeat(40),
  };
};
const ask = (env, path, { method = "GET", origin, key, body, ip = "203.0.113.7" } = {}) =>
  worker.fetch(new Request("https://lines.example" + path, { method, headers: { ...(origin ? { origin } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}), "cf-connecting-ip": ip, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
const site = "https://asteme.github.io";
// What the page does before it sends: asks for leave, does the work, and waits. Here the waiting is done by the clock being moved on.
const leave = async (env, ip) => {
  const { pass, work } = await (await ask(env, "/pass", { origin: site, ip })).json();
  let n = 0;
  while (!(await worked(pass, String(n), work))) n++;
  return { pass, answer: String(n) };
};
const later = async (ms, run) => {
  const real = Date.now;
  Date.now = () => real() + ms;
  try {
    return await run();
  } finally {
    Date.now = real;
  }
};
const send = async (env, text, { ip = "203.0.113.7", ...more } = {}) => {
  const l = await leave(env, ip);
  return later(LIMITS.wait * 1000 + 50, () => ask(env, "/line", { method: "POST", origin: site, ip, body: { text, lang: "en", ...l, ...more } }));
};

test("a line a visitor shares is seen by nobody until the one who holds the key has shown it; then it stays. It is never lost before it is decided, and who wrote it is not kept", async () => {
  const env = room();
  env.kept.set("banned", { value: JSON.stringify(["badword"]) });
  const lines = async () => (await (await ask(env, "/lines")).json()).lines;
  const read = async () => (await ask(env, "/waiting", { key: env.KEY })).json();
  const decide = async (body) => (await ask(env, "/decide", { method: "POST", key: env.KEY, body })).json();
  assert.equal((await ask(env, "/line", { method: "POST", origin: "https://elsewhere.example", body: { text: "hello" } })).status, 403, "only from the site");
  assert.equal((await send(env, "x")).status, 422, "too short");
  assert.equal((await send(env, "y".repeat(LIMITS.max + 1))).status, 422, "too long");
  const ok = await send(env, "  I want to see the sea\u200b  in spring ", { name: "  Mio " });
  assert.deepEqual([ok.status, ok.headers.get("access-control-allow-origin"), await ok.json()], [202, site, { taken: true }]);
  // Sent is not shown: the site is given nothing, and without the key nobody is given anything.
  assert.deepEqual(await lines(), []);
  for (const path of ["/waiting", "/pending"]) for (const key of [undefined, "wrong"]) assert.notEqual((await ask(env, path, { key })).status, 200);
  assert.equal((await ask(env, "/decide", { method: "POST", body: { show: ["anything"] } })).status, 401);
  const first = await read();
  assert.deepEqual(first.waiting.map((l) => [l.text, l.lang, l.name, Object.keys(l).sort()]), [["I want to see the sea in spring", "en", "Mio", ["at", "id", "lang", "name", "text"]]], "the words, their language, when, and the name they chose: nothing else of who");
  assert.equal([...env.kept.entries()].some(([k, v]) => /203\.0\.113/.test(k + JSON.stringify(v))), false, "the address is nowhere in what is kept");
  // What waits has no end set to it: it is there until it is decided. Only the count of a visitor's day goes by itself.
  assert.deepEqual([...env.kept.entries()].filter(([, v]) => v.ttl).map(([k, v]) => [k.slice(0, 3), v.ttl]).sort(), [["day", 172800], ["rl:", 86400]]);
  // One line a day from one visitor, whatever it says; someone else may still send.
  assert.equal((await send(env, "a second line today")).status, 429);
  assert.equal((await later(86400000 + 1000, async () => 0), (await send(env, "from someone else", { ip: "198.51.100.9" })).status), 202);
  // What the sieve throws away is answered like what it keeps, and does not wait to be read. So is a line signed with what no line may hold.
  for (const [n, [text, more]] of [["visit https://example.com now", {}], ["you badword", {}], ["a fine line", { name: "badword" }], ["another fine line", { name: "www.example.com" }]].entries()) {
    const r = await send(env, text, { ip: "198.51.100." + (20 + n), ...more });
    assert.deepEqual([r.status, await r.json()], [202, { taken: true }]);
  }
  assert.equal((await read()).waiting.length, 2);
  // Reading: one is shown, the other goes on waiting. What was shown is given to the site.
  const [a, b] = (await read()).waiting;
  assert.deepEqual(await decide({ show: [a.id] }), { shown: 1, dropped: 0, taken: 0 });
  const given1 = await ask(env, "/lines", { origin: site });
  assert.equal(given1.headers.get("access-control-allow-origin"), site);
  assert.deepEqual((await given1.json()).lines.map((l) => [l.text, l.name, l.lang, Object.keys(l).sort()]), [["I want to see the sea in spring", "Mio", "en", ["at", "id", "lang", "name", "text"]]]);
  assert.deepEqual((await read()).waiting.map((l) => l.id), [b.id], "what was not decided is still waiting");
  // Showing it twice does not show it twice, and what is shown is not said again.
  await decide({ show: [a.id] });
  assert.equal((await lines()).length, 1);
  await send(env, "i want to see the sea in spring", { ip: "198.51.100.3" });
  assert.equal((await read()).waiting.some((l) => /sea/.test(l.text)), false);
  // A line may be added to one that is shown, and to nothing else.
  await send(env, "so do I", { ip: "198.51.100.4", to: a.id });
  await send(env, "added to nothing", { ip: "198.51.100.5", to: "000000000-00000000" });
  const more = (await read()).waiting;
  assert.deepEqual(more.map((l) => [l.text, l.to]), [["from someone else", undefined], ["so do I", a.id], ["added to nothing", undefined]]);
  // Two decisions made at once do not undo each other: each line is kept by itself.
  await Promise.all([decide({ show: [more[0].id] }), decide({ show: [more[1].id] })]);
  assert.deepEqual((await lines()).map((l) => [l.text, l.to]), [["so do I", a.id], ["from someone else", undefined], ["I want to see the sea in spring", undefined]], "newest first");
  // Everything still waiting can be dropped at once; taken down, a line is gone from the site.
  assert.equal((await decide({ dropAll: true })).dropped, 1);
  assert.equal((await decide({ take: [a.id] })).taken, 1);
  assert.deepEqual((await lines()).map((l) => l.text), ["so do I", "from someone else"]);
  assert.equal(clean("a\u0000b\n\nc"), "a b c");
});

test("decisions made at the same moment, over a store whose listings lag, lose nothing: within a minute and a half what the site is given is exactly what is kept", async () => {
  const env = room(60000), at = Date.now() - 3600000;
  const lines = async () => (await (await ask(env, "/lines")).json()).lines.map((l) => l.text).sort();
  const decide = async (body) => (await ask(env, "/decide", { method: "POST", key: env.KEY, body })).status;
  for (const [n, text] of ["one", "two", "three"].entries()) env.kept.set(`pending:00000000${n}-aaaaaaaa`, { value: "", metadata: { text, lang: "en", at }, at });
  // Two shown at once from two places: both are answered, both are kept; the copy the site reads may hold only one of them for a moment.
  assert.deepEqual(await Promise.all([decide({ show: ["000000000-aaaaaaaa"] }), decide({ show: ["000000001-aaaaaaaa"] })]), [200, 200]);
  assert.equal([...env.kept.keys()].filter((k) => k.startsWith("shown:")).length, 2);
  assert.ok((await lines()).length >= 1);
  assert.deepEqual(await later(100000, lines), ["one", "two"], "settled: both");
  assert.deepEqual(await later(200000, lines), ["one", "two"], "and it stays so");
  // One shown and one taken down at once.
  await later(300000, async () => {
    assert.deepEqual(await Promise.all([decide({ show: ["000000002-aaaaaaaa"] }), decide({ take: ["000000000-aaaaaaaa"] })]), [200, 200]);
    assert.deepEqual(await later(100000, lines), ["three", "two"]);
  });
  // A copy that has settled is read as it is: no listing, nothing written.
  await later(900000, async () => {
    const before = JSON.stringify([...env.kept.entries()]);
    let listed = 0;
    const list = env.LINES.list;
    env.LINES.list = (...a) => (listed++, list(...a));
    assert.deepEqual(await lines(), ["three", "two"]);
    assert.deepEqual([listed, JSON.stringify([...env.kept.entries()])], [0, before]);
  });
});

test("a decision whose mark was slow to be written does not let an older copy pass for settled: the mark says when it landed, not when writing it began", async () => {
  const env = room(60000), real = Date.now, began = real(), at = began - 3600000;
  let off = 0;
  Date.now = () => real() + off;
  try {
    const lines = async () => (await (await ask(env, "/lines")).json()).lines.map((l) => l.text).sort();
    const decide = async (body) => (await ask(env, "/decide", { method: "POST", key: env.KEY, body })).status;
    env.kept.set("shown:000000000-aaaaaaaa", { value: "", metadata: { text: "one", lang: "en", at: "2026-01-01" }, at });
    env.kept.set("pending:000000001-aaaaaaaa", { value: "", metadata: { text: "two", lang: "en", at }, at });
    // The first decision's mark hangs for 95 seconds. While it hangs, "one" is taken down from another place, and that decision goes straight through.
    const put = env.LINES.put;
    let hung = false;
    env.LINES.put = async (k, ...rest) => {
      if (k === "changed" && !hung) {
        hung = true;
        off += 50000;
        assert.equal(await decide({ take: ["000000000-aaaaaaaa"] }), 200);
        off += 45000;
      }
      return put(k, ...rest);
    };
    assert.equal(await decide({ show: ["000000001-aaaaaaaa"] }), 200);
    // The slow decision's own copy was made from a listing in which "one" still lingered. It must not be trusted: once things have settled, what was
    // taken down is not given to the site.
    off += 100000;
    assert.deepEqual(await lines(), ["two"]);
    off += 100000;
    assert.deepEqual(await lines(), ["two"], "and it stays so");
    assert.ok(Number(env.kept.get("changed").value) >= began + 95000, "the mark carries the time it landed");
  } finally {
    Date.now = real;
  }
});

test("however long the mark hangs, and however often, a line that was taken down does not stay: the last try carries a time ahead, and no copy is believed for ever", async () => {
  const real = Date.now;
  let off = 0;
  Date.now = () => real() + off;
  try {
    const at = real() - 3600000;
    const begin = (delays) => {
      const env = room(60000), put = env.LINES.put, started = Date.now();
      env.kept.set("shown:000000000-aaaaaaaa", { value: "", metadata: { text: "one", lang: "en", at: "2026-01-01" }, at });
      env.kept.set("pending:000000001-aaaaaaaa", { value: "", metadata: { text: "two", lang: "en", at }, at });
      const lines = async () => (await (await ask(env, "/lines")).json()).lines.map((l) => l.text).sort();
      const decide = async (body) => (await ask(env, "/decide", { method: "POST", key: env.KEY, body })).status;
      // Each write of the first decision's mark hangs for as long as `delays` says; "one" is taken down from another place 80 seconds in.
      let n = 0, inner = false, taken = false;
      env.LINES.put = async (k, ...rest) => {
        if (k === "changed" && !inner && n < delays.length) {
          const until = Date.now() + delays[n++];
          if (!taken && until - started > 80000) {
            off += 80000 - (Date.now() - started);
            taken = inner = true;
            assert.equal(await decide({ take: ["000000000-aaaaaaaa"] }), 200);
            inner = false;
          }
          off += until - Date.now();
        }
        return put(k, ...rest);
      };
      return { env, lines, decide };
    };
    // Every try slow, the last one slowest: three tries with the time it is, then the one that carries a time ahead.
    for (const delays of [[10000, 10000, 10000, 95000], [95000, 95000, 95000, 95000], [10000, 10000, 10000, 500000]]) {
      const { env, lines, decide } = begin(delays);
      assert.equal(await decide({ show: ["000000001-aaaaaaaa"] }), 200);
      assert.ok(Number(env.kept.get("changed").value) > Date.now(), "the mark left behind is ahead of the time it landed");
      off += 100000;
      assert.deepEqual(await lines(), ["two"], `${delays}: after 100 seconds`);
      off += 100000;
      assert.deepEqual(await lines(), ["two"], `${delays}: after 200 seconds`);
      off += LIMITS.hung * 1000;
      assert.deepEqual(await lines(), ["two"], `${delays}: once the time ahead is over`);
    }
    // And if a copy that is wrong were ever believed, by any road: it is not believed for longer than `fresh`.
    const { env, lines } = begin([]);
    const old = Date.now();
    env.kept.set("sky", { value: JSON.stringify({ built: old, lines: [{ id: "gone", text: "gone", lang: "en", at: "2026-01-01" }] }), metadata: null, at: old });
    off += 600000;
    assert.deepEqual(await lines(), ["gone"], "a settled copy is read as it is");
    off += LIMITS.fresh * 1000;
    assert.deepEqual(await lines(), ["one"], "and made again from the lines once it is old");
  } finally {
    Date.now = real;
  }
});

test("sending a line takes leave asked for from the site a moment before, by the one who sends, and a little work", async () => {
  const env = room(), body = { text: "a line that is fine", lang: "en" };
  const post = (more, ip) => ask(env, "/line", { method: "POST", origin: site, ip, body: { ...body, ...more } });
  assert.equal((await ask(env, "/pass")).status, 403, "leave is given to the site only");
  assert.equal((await post({})).status, 403, "none");
  const l = await leave(env);
  assert.equal((await post(l)).status, 403, "at once: a person has not written anything yet");
  assert.equal((await later(LIMITS.wait * 1000 + 50, () => post({ ...l, answer: "not the work" }))).status, 403);
  assert.equal((await later(LIMITS.wait * 1000 + 50, () => post(l, "198.51.100.77"))).status, 403, "from somewhere else");
  assert.equal((await later(LIMITS.passHours * 3600000 + 1000, () => post(l))).status, 403, "long after");
  assert.equal((await post({ ...l, pass: await passFor({ SALT: "guessed" }, "x", Date.now() - 5000) })).status, 403, "made up");
  assert.equal([...env.kept.keys()].length, 0, "none of this was kept or counted");
  assert.equal((await later(LIMITS.wait * 1000 + 50, () => post(l))).status, 202);
  // All the visitors of a day together send no more than the free plan can keep.
  env.kept.set(`day:${new Date().toISOString().slice(0, 10)}`, { value: String(LIMITS.everyone) });
  assert.equal((await send(env, "one more than the day holds", { ip: "198.51.100.8" })).status, 503);
});

test("every line that was shown stays in the sky: when there are more than a visit is given, the newest are always there and the older take turns by the day", () => {
  const sky = Array.from({ length: 1000 }, (_, n) => ({ id: String(n) }));
  assert.equal(given(sky.slice(0, 600), "2026-11-23").length, 600);
  const days = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-12-01", "2027-01-15"].map((d) => given(sky, d, 600).map((l) => Number(l.id)));
  for (const d of days) assert.deepEqual([d.length, new Set(d).size, d.slice(0, 300).join()], [600, 600, sky.slice(0, 300).map((l) => l.id).join()]);
  assert.notDeepEqual(days[0], days[1]);
  const seen = new Set();
  for (let n = 0; n < 60; n++) for (const l of given(sky, new Date(Date.UTC(2026, 10, 23 + n)).toISOString().slice(0, 10), 600)) seen.add(l.id);
  assert.equal(seen.size, 1000, "over two months every one of them has been in the sky");
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
