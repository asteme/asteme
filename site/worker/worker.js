// Takes the lines visitors choose to put in everyone's sky, keeps them where nobody can see them until a person has read them, and gives the site the
// ones that person chose to show. A Cloudflare Worker with one KV namespace (LINES). Nothing a visitor sent is ever anywhere public before it is shown:
// not in a repository, not in a log, not in an answer to anyone without the key. And nothing is removed before it has been decided: a line waits until
// it is shown or dropped by the person reading, or until it has waited thirty days.
// Nothing about who wrote a line is kept with it: a visitor is counted for ten minutes, under a salted hash of their address that is thrown away with
// the count, so that one visitor cannot fill the queue.
//
//   POST /line     { text, lang }                 from the site: 202 when taken (also when the sieve threw it away: it is not told which)
//   GET  /lines                                   for the site: { lines: [{ text, lang, at }] }, what has been read and is shown, newest first
//   GET  /review                                  the page where the lines are read (it holds nothing itself; it asks for the key and then asks below)
//   GET  /waiting  Authorization: Bearer <KEY>    { waiting: [{ id, text, lang, at }], shown: [{ id, text, lang, at }] }
//   POST /decide   Authorization: Bearer <KEY>    { show: [ids], drop: [ids], take: [ids of shown lines to take down] }
//
// Set on the Worker: ORIGIN (the site's origin, e.g. https://asteme.github.io), and the secrets KEY (what the reader types) and SALT.
import { refuse, letters } from "./sieve.js";
import { REVIEW } from "./review.js";

export const LIMITS = { min: 2, max: 120, perVisitor: 3, windowSeconds: 600, keepDays: 30, queue: 400, shown: 80 };
// Words no line may hold: a public list (LDNOOBW, CC BY 4.0) at a fixed revision, fetched here and kept for a week, not kept in the repository.
const WORDS = "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/5faf2ba42d7b1c0977169ec3611df25a3c08eb13/";
const LISTS = ["en", "ja", "zh", "de", "es", "fr", "pt", "ru", "ko"];
const json = (status, body, origin, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...(origin ? { "access-control-allow-origin": origin, vary: "origin" } : {}) } });
const hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const clean = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u200b-\u200f\u2028-\u202f\u2060-\u206f\u007f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const parse = (text, otherwise) => {
  try {
    return JSON.parse(text) ?? otherwise;
  } catch {
    return otherwise;
  }
};
// The list is a help, not a gate: when it cannot be had, a line still waits for the person who reads, and is not let through by anything else.
const banned = async (env) => {
  const kept = parse(await env.LINES.get("banned"), null);
  if (kept) return kept;
  const words = [];
  try {
    for (const name of LISTS) {
      const r = await fetch(WORDS + name);
      if (!r.ok) throw new Error(name);
      words.push(...(await r.text()).split(/\r?\n/).map((w) => letters(w.trim())).filter(Boolean));
    }
  } catch {
    return [];
  }
  await env.LINES.put("banned", JSON.stringify(words), { expirationTtl: 7 * 86400 });
  return words;
};
const shownOf = async (env) => parse(await env.LINES.get("shown"), []).filter((l) => l && typeof l.text === "string");
const waitingOf = async (env) => {
  const { keys } = await env.LINES.list({ prefix: "pending:", limit: LIMITS.queue }),
    lines = [];
  for (const k of keys) {
    const v = parse(await env.LINES.get(k.name), null);
    if (v) lines.push({ id: k.name.slice(8), ...v });
  }
  return lines.sort((a, b) => a.at - b.at);
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      from = request.headers.get("origin"),
      origin = env.ORIGIN && from === env.ORIGIN ? from : null,
      authorized = !!env.KEY && request.headers.get("authorization") === `Bearer ${env.KEY}`;
    if (request.method === "OPTIONS")
      return new Response(null, { status: origin ? 204 : 403, headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin" } : {} });
    if (request.method === "POST" && url.pathname === "/line") {
      if (!origin) return json(403, { error: "not from the site" });
      const body = parse((await request.text()).slice(0, 2000), null);
      if (!body) return json(400, { error: "not understood" }, origin);
      const text = clean(body.text),
        lang = /^[a-z]{2}$/.test(body.lang ?? "") ? body.lang : "en";
      if ([...text].length < LIMITS.min || [...text].length > LIMITS.max) return json(422, { error: "length" }, origin);
      const who = "rl:" + (await hex(`${env.SALT ?? ""}|${request.headers.get("cf-connecting-ip") ?? ""}`)).slice(0, 24),
        seen = Number((await env.LINES.get(who)) ?? 0);
      if (seen >= LIMITS.perVisitor) return json(429, { error: "later" }, origin);
      await env.LINES.put(who, String(seen + 1), { expirationTtl: LIMITS.windowSeconds });
      // What the sieve throws away is answered like what it keeps: whoever sends such things learns nothing from the answer.
      if (refuse(text, await banned(env), (await shownOf(env)).map((l) => l.text))) return json(202, { taken: true }, origin);
      const waiting = await env.LINES.list({ prefix: "pending:", limit: LIMITS.queue });
      if (waiting.keys.length >= LIMITS.queue) return json(503, { error: "full" }, origin);
      const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      await env.LINES.put(`pending:${id}`, JSON.stringify({ text, lang, at: Date.now() }), { expirationTtl: LIMITS.keepDays * 86400 });
      return json(202, { taken: true }, origin);
    }
    if (request.method === "GET" && url.pathname === "/lines")
      return json(200, { lines: (await shownOf(env)).map(({ text, lang, at }) => ({ text, lang, at })) }, env.ORIGIN ?? null, "public, max-age=300");
    if (request.method === "GET" && url.pathname === "/review")
      return new Response(REVIEW, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } });
    if (request.method === "GET" && url.pathname === "/waiting") {
      if (!authorized) return json(401, { error: "no" });
      return json(200, { waiting: await waitingOf(env), shown: await shownOf(env) });
    }
    if (request.method === "POST" && url.pathname === "/decide") {
      if (!authorized) return json(401, { error: "no" });
      const body = parse(await request.text(), {}),
        ids = (list) => (Array.isArray(list) ? list.filter((i) => typeof i === "string").slice(0, LIMITS.queue) : []);
      let shown = await shownOf(env);
      const take = new Set(ids(body.take)),
        add = [];
      for (const id of ids(body.show)) {
        const v = parse(await env.LINES.get(`pending:${id}`), null);
        if (v && !shown.some((l) => l.id === id)) add.push({ id, text: v.text, lang: v.lang, at: new Date(v.at).toISOString().slice(0, 10) });
      }
      // What is shown is written first and what waited is removed after: if this stops half way a line is still waiting, never lost.
      shown = [...add.reverse(), ...shown.filter((l) => !take.has(l.id))].slice(0, LIMITS.shown);
      if (add.length || take.size) await env.LINES.put("shown", JSON.stringify(shown));
      for (const id of [...ids(body.show), ...ids(body.drop)]) await env.LINES.delete(`pending:${id}`);
      return json(200, { shown: add.length, dropped: ids(body.drop).length, taken: take.size });
    }
    return json(404, { error: "nothing here" });
  },
};
