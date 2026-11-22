// Takes the lines visitors choose to put in everyone's sky, and keeps them until they have been read. A Cloudflare Worker with one KV namespace (LINES).
// It shows nothing to anyone: what it holds is fetched once a day by the repository (with a secret), sieved, and proposed as a change that a person reads
// and merges. Only then is a line on the site. Nothing about who wrote a line is kept with it: a visitor is counted for ten minutes, under a salted hash of
// their address that is thrown away with the count, so that one visitor cannot fill the queue.
//
//   POST /line      { text, lang }                 from the site: 202 when kept, 4xx with a reason when not
//   GET  /pending   Authorization: Bearer <KEY>    from the repository: { lines: [{ id, text, lang, at }] }
//   POST /taken     Authorization: Bearer <KEY>    { ids: [...] }: what has been fetched and dealt with is removed
//
// Set as variables of the Worker: ORIGIN (the site's origin, e.g. https://asteme.github.io), KEY (a long random secret), SALT (another).
export const LIMITS = { min: 2, max: 120, perVisitor: 3, windowSeconds: 600, keepDays: 30, queue: 400 };
const json = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(origin ? { "access-control-allow-origin": origin, vary: "origin" } : {}) } });
const hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const clean = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u200b-\u200f\u2028-\u202f\u2060-\u206f\u007f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      from = request.headers.get("origin"),
      origin = env.ORIGIN && from === env.ORIGIN ? from : null,
      authorized = !!env.KEY && request.headers.get("authorization") === `Bearer ${env.KEY}`;
    if (request.method === "OPTIONS")
      return new Response(null, { status: origin ? 204 : 403, headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin" } : {} });
    if (request.method === "POST" && url.pathname === "/line") {
      if (!origin) return json(403, { error: "not from the site" });
      let body;
      try {
        body = JSON.parse((await request.text()).slice(0, 2000));
      } catch {
        return json(400, { error: "not understood" }, origin);
      }
      const text = clean(body?.text),
        lang = /^[a-z]{2}$/.test(body?.lang ?? "") ? body.lang : "en";
      if ([...text].length < LIMITS.min || [...text].length > LIMITS.max) return json(422, { error: "length" }, origin);
      const who = "rl:" + (await hex(`${env.SALT ?? ""}|${request.headers.get("cf-connecting-ip") ?? ""}`)).slice(0, 24),
        seen = Number((await env.LINES.get(who)) ?? 0);
      if (seen >= LIMITS.perVisitor) return json(429, { error: "later" }, origin);
      const waiting = await env.LINES.list({ prefix: "pending:", limit: LIMITS.queue });
      if (waiting.keys.length >= LIMITS.queue) return json(503, { error: "full" }, origin);
      await env.LINES.put(who, String(seen + 1), { expirationTtl: LIMITS.windowSeconds });
      const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      await env.LINES.put(`pending:${id}`, JSON.stringify({ text, lang, at: Date.now() }), { expirationTtl: LIMITS.keepDays * 86400 });
      return json(202, { kept: true }, origin);
    }
    if (request.method === "GET" && url.pathname === "/pending") {
      if (!authorized) return json(401, { error: "no" });
      const { keys } = await env.LINES.list({ prefix: "pending:", limit: LIMITS.queue }),
        lines = [];
      for (const k of keys) {
        const v = await env.LINES.get(k.name);
        if (v) lines.push({ id: k.name.slice(8), ...JSON.parse(v) });
      }
      return json(200, { lines });
    }
    if (request.method === "POST" && url.pathname === "/taken") {
      if (!authorized) return json(401, { error: "no" });
      const ids = ((await request.json().catch(() => ({}))).ids ?? []).filter((i) => typeof i === "string").slice(0, LIMITS.queue);
      for (const id of ids) await env.LINES.delete(`pending:${id}`);
      return json(200, { removed: ids.length });
    }
    return json(404, { error: "nothing here" });
  },
};
