// Takes the lines visitors choose to put in everyone's sky, keeps them where nobody can see them until a person has read them, and gives the site the
// ones that person chose to show. A Cloudflare Worker with one KV namespace (LINES). Nothing a visitor sent is ever anywhere public before it is shown:
// not in a repository, not in a log, not in an answer to anyone without the key. Nothing is removed before it has been decided, and what was shown
// stays: a line is in the sky until it is taken down.
// Nothing about who wrote a line is kept with it. A visitor may send one line a day: they are counted for a day, under a salted hash of their address
// that is thrown away with the count.
//
//   GET  /pass                                    for the site, when a visitor asks to share: { pass, work }, leave to send one line (see `passFor`)
//   POST /line     { text, lang, pass, answer, name?, to? }   from the site: 202 when taken (also when the sieve threw it away: it is not told which).
//                  `name` is a name the visitor chose to sign with; `to` is the id of a shown line this one is added to
//   GET  /lines                                   for the site: { lines: [{ id, text, lang, at, name?, to? }] }, what has been read and is shown, newest first
//   GET  /review                                  the page where the lines are read (it holds nothing itself; it asks for the key and then asks below)
//   GET  /waiting  Authorization: Bearer <KEY>    { waiting: [{ id, text, lang, at }], shown: [{ id, text, lang, at }] }
//   POST /decide   Authorization: Bearer <KEY>    { show: [ids], drop: [ids], take: [ids of shown lines to take down], dropAll: true }
//
// How it is kept: each line is a key of its own (pending:<id> while it waits, shown:<id> once shown), with its words in the key's metadata, so reading
// them all is one listing and two decisions made at once cannot undo each other. What the site is given is one value written from those (`sky`), so a
// visit does not cost a listing. That value is a copy and is treated as one: this store has no way to change two things together, and a listing may
// lag behind a write, so a copy written at a decision can miss a line shown a moment before by another. A copy is therefore trusted only once it was
// written well after the last decision (`settle`); until then whoever asks for the lines has it written again from the lines themselves (`skyOf`).
// Set on the Worker: ORIGIN (the site's origin, e.g. https://asteme.github.io), and the secrets KEY (what the reader types) and SALT.
import { refuse, letters } from "./sieve.js";
import { REVIEW } from "./review.js";

// perDay: lines one visitor may send in a day. everyone: lines taken from all visitors in a day (what the free plan can write, with room to spare).
// wait and work: what sending costs (seconds between asking and sending; bits of work), nothing to a person and something to a script.
// given: how many lines a visit is given at most; beyond that the newest half and, of the older, a different part each day.
export const LIMITS = { min: 2, max: 120, name: 24, settle: 90, again: 10, perDay: 1, everyone: 200, queue: 400, wait: 3, work: 14, passHours: 12, given: 600, kept: 20000 };
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
const day = (at) => new Date(at).toISOString().slice(0, 10);
// Leave to send one line: when it was asked for, signed for the one who asked. It is good from a few seconds after it was given (a person has to write
// something; a script would rather not wait) for some hours, and only from where it was asked. With it comes a little work to do (`worked`).
const who = async (env, request) => (await hex(`${env.SALT ?? ""}|${request.headers.get("cf-connecting-ip") ?? ""}`)).slice(0, 24);
export const passFor = async (env, visitor, at) => `${at}.${(await hex(`${env.SALT ?? ""}|pass|${visitor}|${at}`)).slice(0, 32)}`;
// The work: a number that, put after the pass, gives a hash beginning with `bits` zero bits. A browser finds one in well under a second.
export const worked = async (pass, answer, bits) => {
  const h = await hex(`${pass}:${answer}`);
  return parseInt(h.slice(0, 8), 16) >>> (32 - bits) === 0;
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
// Every line under a prefix, from the keys' own metadata: oldest first (an id begins with when it was sent).
const linesOf = async (env, prefix, most) => {
  const lines = [];
  for (let cursor; lines.length < most; ) {
    const page = await env.LINES.list({ prefix, limit: Math.min(1000, most - lines.length), cursor });
    for (const k of page.keys) if (k.metadata && typeof k.metadata.text === "string") lines.push({ id: k.name.slice(prefix.length), ...k.metadata });
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return lines;
};
// What is shown, newest first, with each line's id: read from the copy, and the copy made again from the lines themselves while it cannot be trusted
// yet (written before the last decision had settled), though not more often than every few seconds. `over` is what a decision has just done here, laid
// over a listing that may not have caught up with it.
const written = async (env, now, over = { show: [], take: new Set() }) => {
  const listed = (await linesOf(env, "shown:", LIMITS.kept)).filter((l) => !over.take.has(l.id) && !over.show.some((s) => s.id === l.id)),
    lines = [...listed, ...over.show].sort((a, b) => (a.id < b.id ? 1 : -1));
  await env.LINES.put("sky", JSON.stringify({ built: now, lines }));
  return lines;
};
const skyOf = async (env, now) => {
  const copy = parse(await env.LINES.get("sky"), null),
    changed = Number((await env.LINES.get("changed")) ?? 0),
    lines = (Array.isArray(copy?.lines) ? copy.lines : []).filter((l) => l && typeof l.text === "string"),
    built = Number(copy?.built ?? 0);
  if (!changed || built > changed + LIMITS.settle * 1000 || now - built < LIMITS.again * 1000) return lines;
  return written(env, now);
};
// What a visit is given: everything while it is few; when it is many, the newest half and a part of the older that is another part each day, so that
// every line that was ever shown is in the sky some of the time and none is dropped for being old.
export const given = (sky, today, most = LIMITS.given) => {
  if (sky.length <= most) return sky;
  const half = most >> 1,
    older = sky.slice(half),
    turn = [...today].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % older.length;
  return [...sky.slice(0, half), ...[...older.slice(turn), ...older.slice(0, turn)].slice(0, most - half)];
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      from = request.headers.get("origin"),
      origin = env.ORIGIN && from === env.ORIGIN ? from : null,
      authorized = !!env.KEY && request.headers.get("authorization") === `Bearer ${env.KEY}`,
      now = Date.now();
    if (request.method === "OPTIONS")
      return new Response(null, { status: origin ? 204 : 403, headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin" } : {} });
    if (request.method === "GET" && url.pathname === "/pass") {
      if (!origin) return json(403, { error: "not from the site" });
      return json(200, { pass: await passFor(env, await who(env, request), now), work: LIMITS.work, wait: LIMITS.wait }, origin);
    }
    if (request.method === "POST" && url.pathname === "/line") {
      if (!origin) return json(403, { error: "not from the site" });
      const body = parse((await request.text()).slice(0, 2000), null);
      if (!body) return json(400, { error: "not understood" }, origin);
      const text = clean(body.text),
        lang = /^[a-z]{2}$/.test(body.lang ?? "") ? body.lang : "en";
      if ([...text].length < LIMITS.min || [...text].length > LIMITS.max) return json(422, { error: "length" }, origin);
      const name = [...clean(body.name)].slice(0, LIMITS.name).join("").trim();
      // Leave to send: asked for from here, long enough ago, not too long ago, and the work done. None of this reads or writes anything kept.
      const visitor = await who(env, request),
        pass = String(body.pass ?? ""),
        asked = Number(pass.split(".")[0]);
      if (!Number.isFinite(asked) || pass !== (await passFor(env, visitor, asked)) || now - asked < LIMITS.wait * 1000 || now - asked > LIMITS.passHours * 3600000 || !(await worked(pass, String(body.answer ?? ""), LIMITS.work)))
        return json(403, { error: "pass" }, origin);
      const mine = `rl:${visitor}`,
        seen = Number((await env.LINES.get(mine)) ?? 0);
      if (seen >= LIMITS.perDay) return json(429, { error: "tomorrow" }, origin);
      const all = `day:${day(now)}`,
        today = Number((await env.LINES.get(all)) ?? 0);
      if (today >= LIMITS.everyone) return json(503, { error: "full" }, origin);
      await env.LINES.put(mine, String(seen + 1), { expirationTtl: 86400 });
      // What the sieve throws away is answered like what it keeps: whoever sends such things learns nothing from the answer.
      const sky = await skyOf(env, now),
        words = await banned(env);
      if (refuse(text, words, sky.map((l) => l.text)) || (name && refuse(name, words, [], 1))) return json(202, { taken: true }, origin);
      // Added to another line only if that line is in the sky.
      const to = typeof body.to === "string" && sky.some((l) => l.id === body.to) ? body.to : undefined;
      const waiting = await env.LINES.list({ prefix: "pending:", limit: LIMITS.queue });
      if (waiting.keys.length >= LIMITS.queue) return json(503, { error: "full" }, origin);
      await env.LINES.put(all, String(today + 1), { expirationTtl: 2 * 86400 });
      const id = `${now.toString(36).padStart(9, "0")}-${crypto.randomUUID().slice(0, 8)}`;
      await env.LINES.put(`pending:${id}`, "", { metadata: { text, lang, at: now, ...(name ? { name } : {}), ...(to ? { to } : {}) } });
      return json(202, { taken: true }, origin);
    }
    if (request.method === "GET" && url.pathname === "/lines")
      return json(200, { lines: given(await skyOf(env, now), day(now)) }, env.ORIGIN ?? null, "public, max-age=120");
    if (request.method === "GET" && url.pathname === "/review")
      return new Response(REVIEW, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } });
    if (request.method === "GET" && url.pathname === "/waiting") {
      if (!authorized) return json(401, { error: "no" });
      return json(200, { waiting: await linesOf(env, "pending:", LIMITS.queue), shown: (await linesOf(env, "shown:", LIMITS.kept)).reverse() });
    }
    if (request.method === "POST" && url.pathname === "/decide") {
      if (!authorized) return json(401, { error: "no" });
      const body = parse(await request.text(), {}),
        ids = (list) => (Array.isArray(list) ? list.filter((i) => typeof i === "string").slice(0, LIMITS.queue) : []),
        waiting = await linesOf(env, "pending:", LIMITS.queue),
        show = waiting.filter((l) => ids(body.show).includes(l.id)),
        drop = body.dropAll === true ? waiting.filter((l) => !show.includes(l)) : waiting.filter((l) => ids(body.drop).includes(l.id)),
        take = new Set(ids(body.take));
      // What is shown is written first and what waited is removed after: if this stops half way a line is still waiting, never lost.
      const kept = (l) => ({ text: l.text, lang: l.lang, at: day(l.at), ...(l.name ? { name: l.name } : {}), ...(l.to ? { to: l.to } : {}) });
      for (const l of show) await env.LINES.put(`shown:${l.id}`, "", { metadata: kept(l) });
      for (const id of take) await env.LINES.delete(`shown:${id}`);
      for (const l of [...show, ...drop]) await env.LINES.delete(`pending:${l.id}`);
      // What the site is given is written again at once, so that the one who decided sees it; and marked as changed, so that it goes on being written
      // again from the lines themselves until that has settled, whatever another decision made at the same moment did to this copy.
      if (show.length || take.size) {
        await env.LINES.put("changed", String(Date.now()));
        await written(env, Date.now(), { show: show.map((l) => ({ id: l.id, ...kept(l) })), take });
      }
      return json(200, { shown: show.length, dropped: drop.length, taken: take.size });
    }
    return json(404, { error: "nothing here" });
  },
};
