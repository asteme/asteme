// What the site adds to the page: the way in, a few links, the line a visitor may leave, and the film. The sky, the search and a memory opened are the page's own.
(() => {
  const S = window.SITE, U = S.ui, $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches && localStorage.getItem("asteme-motion") !== "full";
  document.body.classList.add("site");
  // --- Links, at the top ------------------------------------------------------------------------------
  const top = make("nav", "site-top");
  const home = make("a", "site-name"); home.href = S.root || "./"; home.innerHTML = S.mark; home.append(make("span", null, "Asteme"));
  const links = make("span", "site-links");
  for (const [code, label, path] of [["en", "English", ""], ["ja", "日本語", "ja/"], ["zh", "中文", "zh/"]]) { const a = make("a", code === S.lang ? "on" : null, label); a.href = S.root + path || "./"; a.lang = code; links.append(a); }
  const film = make("button", "bare", U.film); film.type = "button";
  const plain = make("a", null, U.plain); plain.href = "#plain";
  const code = make("a", null, U.code); code.href = "https://github.com/asteme/asteme"; code.rel = "noopener";
  links.append(film, plain, code); top.append(home, links); document.body.append(top);
  // --- Words to try, above the search -------------------------------------------------------------------
  const tries = make("div", "site-tries");
  for (const w of U.seek) { const b = make("button", "bare", w); b.type = "button"; b.onclick = () => { const f = $("find"); f.value = f.value === w ? "" : w; f.dispatchEvent(new Event("input", { bubbles: true })); f.focus(); }; tries.append(b); }
  document.body.append(tries);
  // --- A line of one's own ---------------------------------------------------------------------------------
  const leave = make("div", "site-leave"), field = make("input"), keepIt = make("button", null, U.keep), note = make("p", "muted", U.leaveNote);
  field.type = "text"; field.maxLength = 200; field.placeholder = U.leave; field.setAttribute("aria-label", U.leave); keepIt.type = "button";
  leave.append(field, keepIt, note); document.body.append(leave);
  const keepLine = async () => { const line = S.leave(field.value); if (!line) return; field.value = ""; field.blur(); await load(); await loadAll(); setTimeout(() => { flyTo(line.id, true); void openMemory(line.id); }, 500); };
  keepIt.onclick = keepLine; field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); void keepLine(); } e.stopPropagation(); });
  // --- The film ----------------------------------------------------------------------------------------------
  film.onclick = () => { const veil = make("div", "site-film"), v = make("video"), x = make("button", "bare", U.close);
    v.controls = true; v.autoplay = true; v.playsInline = true; v.poster = `${S.root}media/film-${S.film}.jpg`; v.src = `${S.root}media/asteme-${S.film}.mp4`; x.type = "button";
    const shut = () => { v.pause(); veil.remove(); removeEventListener("keydown", key, true); }, key = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); shut(); } };
    x.onclick = shut; veil.onclick = (e) => { if (e.target === veil) shut(); }; addEventListener("keydown", key, true); veil.append(v, x); document.body.append(veil); x.focus(); };
  // --- A memory opened: the site's own sentences are not something to confirm or forget; a visitor's own line is theirs, and can be forgotten. ------------
  new MutationObserver(() => document.body.classList.toggle("site-own", typeof openId === "string" && openId.startsWith("mine-"))).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: false });
  // --- There is no conversation to go back to here: Escape closes what is open and no more. ----------------------
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.body.classList.contains("sheet-on") && !$("find").value) e.stopImmediatePropagation(); }, true);
  // --- What it is, in one sentence, and how to move: said once at the top, and the second of them goes after a while. ----------------------------
  const said = make("div", "site-said"); said.append(make("p", null, S.first), make("p", "muted", U.hint)); document.body.append(said);
  // --- The way in: the mark's five stars come up one after another, and then they are the first stars of the sky. ---
  const door = make("div", "site-door"); door.innerHTML = S.mark; document.body.append(door);
  const began = performance.now();
  const enter = async () => {
    // As long as the mark takes to come up, or as long as the page takes to be ready, whichever is longer: never one after the other.
    for (let i = 0; i < 400 && !(typeof loaded !== "undefined" && loaded); i++) await new Promise((r) => setTimeout(r, 25));
    if (!still) await new Promise((r) => setTimeout(r, Math.max(0, 2300 - (performance.now() - began))));
    try { enterSpace(); } catch {}
    door.classList.add("gone"); document.body.classList.add("site-in"); setTimeout(() => door.remove(), 1600);
    setTimeout(() => said.classList.add("known"), 14000);
    // Someone who left a line and has come back is told so, in their own words.
    const [last] = S.lines();
    if (last) { said.classList.add("aside"); setTimeout(() => said.classList.remove("aside"), 10400); const hi = make("div", "site-back"); hi.append(make("b", null, U.back), make("span", null, U.backSaid), make("q", null, last.text)); document.body.append(hi); setTimeout(() => hi.classList.add("on"), still ? 0 : 2600); setTimeout(() => { hi.classList.remove("on"); setTimeout(() => hi.remove(), 900); }, 9500); hi.onclick = () => { flyTo(last.id, false); void openMemory(last.id); }; }
  };
  void enter();
})();
