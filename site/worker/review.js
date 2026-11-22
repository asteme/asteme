// The page where the lines are read. It holds no line and no key: the key is typed by the reader, kept for as long as the tab is open, and sent with each
// question to this same Worker. A line is put on the page as text, never as markup.
export const REVIEW = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Lines left by visitors</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0d1326; color: #ece6d8; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; }
  main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 6rem; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.25rem; }
  h2 { font-size: 0.95rem; font-weight: 600; margin: 2.5rem 0 0.5rem; color: #b9b2a1; }
  p { margin: 0 0 1rem; color: #b9b2a1; }
  form { display: flex; gap: 0.5rem; }
  input { flex: 1; min-width: 0; padding: 0.6rem 0.8rem; border-radius: 0.6rem; border: 1px solid #2c3554; background: #131a31; color: inherit; font: inherit; }
  button { padding: 0.5rem 0.9rem; border-radius: 0.6rem; border: 1px solid #2c3554; background: #1a2240; color: inherit; font: inherit; cursor: pointer; }
  button:hover { background: #222c52; }
  button:focus-visible, input:focus-visible { outline: 2px solid #d9b46a; outline-offset: 2px; }
  button.show { border-color: #d9b46a; color: #f1d9a4; }
  button[disabled] { opacity: 0.5; cursor: default; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.8rem 0; border-top: 1px solid #1d2543; }
  li q { flex: 1; quotes: none; overflow-wrap: anywhere; font-size: 1.05rem; }
  li small { color: #8c8676; text-align: right; }
  li.gone { opacity: 0.35; }
  #say { min-height: 1.6rem; color: #e7a08a; }
  [hidden] { display: none; }
</style>
<main>
  <h1>Lines left by visitors</h1>
  <p>Nothing here is on the site until you show it. Show a line and it becomes a star in everyone's sky, and stays until you take it down; drop it and it is gone.</p>
  <form id="door"><input id="key" type="password" autocomplete="current-password" placeholder="The key" aria-label="The key" /><button>Open</button></form>
  <p id="say" role="status"></p>
  <section id="room" hidden>
    <h2 id="nw"></h2>
    <p id="all" hidden><button id="dropall">Drop everything that is waiting</button></p>
    <ul id="waiting"></ul>
    <h2 id="ns"></h2>
    <ul id="shown"></ul>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id), say = (t) => ($("say").textContent = t);
  let key = sessionStorage.getItem("asteme-lines-key") || "", texts = new Map();
  const ask = async (path, body) => {
    const r = await fetch(path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + key, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error("That is not the key.");
    if (!r.ok) throw new Error("It did not answer (" + r.status + ").");
    return r.json();
  };
  const row = (line, buttons) => {
    const li = document.createElement("li"), q = document.createElement("q"), s = document.createElement("small");
    q.textContent = line.text + (line.name ? " — " + line.name : ""); q.lang = line.lang; s.textContent = (line.to ? "added to: " + ((texts.get(line.to) || "a line no longer shown").slice(0, 24)) + " · " : "") + line.lang + " · " + (typeof line.at === "number" ? new Date(line.at).toISOString().slice(0, 10) : line.at);
    li.append(q, s);
    for (const [label, cls, what] of buttons) {
      const b = document.createElement("button"); b.textContent = label; b.className = cls;
      b.onclick = async () => { li.querySelectorAll("button").forEach((x) => (x.disabled = true)); try { await ask("/decide", { [what]: [line.id] }); li.classList.add("gone"); setTimeout(fill, 400); } catch (e) { say(e.message); li.querySelectorAll("button").forEach((x) => (x.disabled = false)); } };
      li.append(b);
    }
    return li;
  };
  const fill = async () => {
    const { waiting, shown } = await ask("/waiting");
    texts = new Map(shown.map((l) => [l.id, l.text]));
    $("nw").textContent = waiting.length ? "Waiting to be read: " + waiting.length : "Nothing is waiting.";
    $("ns").textContent = shown.length ? "On the site now: " + shown.length : "Nothing is on the site yet.";
    $("all").hidden = waiting.length < 8;
    $("waiting").replaceChildren(...waiting.map((l) => row(l, [["Show", "show", "show"], ["Drop", "", "drop"]])));
    $("shown").replaceChildren(...shown.map((l) => row(l, [["Take down", "", "take"]])));
  };
  const open = async () => { try { await fill(); sessionStorage.setItem("asteme-lines-key", key); $("door").hidden = true; $("room").hidden = false; say(""); } catch (e) { say(e.message); sessionStorage.removeItem("asteme-lines-key"); } };
  $("dropall").onclick = async () => { if (!confirm("Drop every line that is waiting? This cannot be undone.")) return; try { await ask("/decide", { dropAll: true }); await fill(); } catch (e) { say(e.message); } };
  $("door").onsubmit = (e) => { e.preventDefault(); key = $("key").value.trim(); $("key").value = ""; void open(); };
  if (key) void open();
</script>
</html>
`;
