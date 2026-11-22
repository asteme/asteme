// Stands where Asteme's own mind would be: the page asks its questions as it always does, and is answered from what the site says (window.SITE) and from
// the lines a visitor has left, which are kept in this browser. Nothing here goes to a network: every call the page makes is answered here.
(() => {
  const S = window.SITE,
    DAY = 86400000,
    born = Date.parse("2026-11-20T17:15:09Z"),
    KEY = "asteme-site-lines";
  const mine = () => {
    try {
      return (JSON.parse(localStorage.getItem(KEY) ?? "[]") ?? []).filter((m) => m && typeof m.text === "string" && typeof m.id === "string");
    } catch {
      return [];
    }
  };
  const keep = (list) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  };
  // The site's own stars: the first one, and each family as a lesson with the cases it was drawn from. Further back in the list is further back in time.
  const said = [{ id: "s-first", kind: "noted", first: true, private: false, text: S.first, strength: 1, from: [], at: born }];
  S.families.forEach((family, f) =>
    family.forEach((text, n) =>
      said.push({
        id: `s-${f}-${n}`,
        kind: n ? "noted" : "lesson",
        private: false,
        text,
        strength: n ? 0.72 : 0.95,
        from: n ? [] : family.slice(1).map((_, k) => `s-${f}-${k + 1}`),
        at: born + DAY * (1 + f) + n * 3600000,
      }),
    ),
  );
  // What visitors chose to share, once a person has read it: a constellation of its own. It is not part of the page: it is asked for once the sky is
  // there (over.js), and a sky that never hears back is simply without it.
  window.SITE.others = (texts) => {
    const lines = [...new Set(texts.filter((t) => typeof t === "string" && t.trim()))].slice(0, 80);
    if (!lines.length || said.some((m) => m.id === "s-shared")) return false;
    said.push({ id: "s-shared", kind: "lesson", private: false, text: S.ui.shared, strength: 0.9, from: lines.map((_, n) => `v-${n}`), at: born + DAY * 30 });
    lines.forEach((text, n) => said.push({ id: `v-${n}`, kind: "noted", private: false, text, strength: 0.7, from: [], at: born + DAY * 30 - (n + 1) * 60000 }));
    return true;
  };
  const sky = () => [...mine().map((m) => ({ id: m.id, kind: "noted", private: false, text: m.text, strength: 0.9, from: [], at: m.at })), ...said];
  const state = () => ({
    fresh: false, born: true, name: "Asteme", you: "", look: {}, manner: "", face: null, yourFace: null, review: [], state: "awake", thinking: false, writing: false, next: null,
    sky: sky(), intentions: [], workers: [], tasks: [], asks: [], draft: "", tone: "", page: 0, memories: sky().length, messages: [],
    can: { files: false, hear: null, model: false, speak: null }, feel: { react: false, express: false, seen: false }, expressions: [],
  });
  const answer = (path, query, body) => {
    if (path === "/api/state") return state();
    if (path === "/api/sky") return sky();
    if (path === "/api/find") {
      const q = (query.get("q") ?? "").toLowerCase();
      return sky().filter((m) => !q || m.text.toLowerCase().includes(q)).map((m) => ({ id: m.id, kind: m.kind, text: m.text, private: false, at: m.at }));
    }
    if (path === "/api/memory") {
      const m = sky().find((x) => x.id === query.get("id")) ?? said[0],
        own = m.id.startsWith("mine-");
      return { id: m.id, revision: 1, kind: m.kind, text: m.text, private: false, status: own ? "active" : "kept", paused: false, grounds: "said", at: m.at, strength: m.strength, sources: own ? [{ quote: m.text, role: "user", at: m.at }] : [] };
    }
    if (path === "/api/activity") return { state: "awake", tasks: [], intentions: [], held: [], unread: 0, idle: [], lastSleep: Date.now() };
    if (path === "/api/fonts") return { names: [] };
    if (path === "/api/change" && body?.what === "forget" && String(body.id).startsWith("mine-")) keep(mine().filter((m) => m.id !== body.id));
    return {};
  };
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return real(input, init);
    let body = null;
    try {
      body = init?.body ? JSON.parse(init.body) : null;
    } catch {}
    return Promise.resolve(new Response(JSON.stringify(answer(url.pathname, url.searchParams, body)), { status: 200, headers: { "content-type": "application/json" } }));
  };
  // Nothing happens here by itself, so the stream of events is one that never says anything.
  window.EventSource = class {
    constructor() {
      this.readyState = 1;
      // It opens, as a real one does (the page begins when it has), and then is silent.
      setTimeout(() => this.onopen?.({ type: "open" }), 0);
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  };
  // A line of the visitor's own: kept here, and nowhere else.
  window.SITE.lines = mine;
  window.SITE.leave = (text) => {
    const line = { id: "mine-" + Date.now().toString(36), text: String(text).trim().slice(0, 200), at: Date.now() };
    return line.text && keep([line, ...mine()].slice(0, 24)) ? line : null;
  };
})();
