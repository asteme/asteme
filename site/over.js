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
  // The languages fold into one: eight names in a row leave no room for anything else.
  const langs = make("details", "site-lang"), list = make("div");
  langs.append(make("summary", null, (S.languages.find(([code]) => code === S.lang) ?? S.languages[0])[1]), list);
  for (const [code, label, path] of S.languages) { const a = make("a", code === S.lang ? "on" : null, label); a.href = S.root + path || "./"; a.lang = code; a.hreflang = code; list.append(a); }
  links.append(langs); addEventListener("click", (e) => { if (!langs.contains(e.target)) langs.open = false; });
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
  // Sharing is offered only where there is somewhere to send to, and only when asked for: the box is empty until the visitor ticks it. With it comes a
  // place for a name, which is as optional as the box; and a line may be added to one another visitor left (`answer`, shown while such a star is open).
  const share = make("label", "site-share"), box = make("input"), who = make("input", "site-who"), to = make("button", "site-to bare"), answer = make("button", "site-answer bare", U.answer);
  box.type = "checkbox"; who.type = "text"; who.maxLength = 24; who.placeholder = U.name; who.setAttribute("aria-label", U.name); to.type = answer.type = "button"; to.hidden = true;
  try { who.value = localStorage.getItem("asteme-site-name") ?? ""; } catch {}
  share.append(box, make("span", null, U.share), who, make("small", "muted", U.shareNote));
  leave.append(to, field, keepIt, note); if (S.share) { leave.append(share); document.body.append(answer); } document.body.append(leave);
  const tell = (text) => { const t = make("div", "site-told", text); document.body.append(t); requestAnimationFrame(() => t.classList.add("on")); setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 800); }, 5200); };
  // Leave to send is asked for when the box is ticked, and the little work it asks is done while the visitor writes (see site/worker/worker.js).
  let pass = null, target = null, theirs = "";
  const hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const ask = () => (pass ??= fetch(S.share + "/pass").then((r) => r.json()).then(async (p) => { const at = Date.now(); let n = 0; while (parseInt((await hex(`${p.pass}:${n}`)).slice(0, 8), 16) >>> (32 - p.work)) n++; return { pass: p.pass, answer: String(n), ready: at + (p.wait + 1) * 1000 }; }));
  const aim = (id) => { target = id; to.hidden = !id; document.body.classList.toggle("site-aimed", !!id); if (id) { const t = S.said(id); to.textContent = `${U.answering} ${t.length > 22 ? t.slice(0, 22) + "…" : t} ×`; box.checked = true; void ask().catch(() => {}); closeSheet(); field.focus(); } };
  box.onchange = () => { if (box.checked) void ask().catch(() => {}); else aim(null); }; to.onclick = () => aim(null); answer.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); if (theirs) aim(theirs.slice(2)); }); answer.onclick = (e) => { if (!e.detail && theirs) aim(theirs.slice(2)); };
  const send = async (line, name, toId) => {
    try { const p = await ask(); pass = null; await new Promise((r) => setTimeout(r, Math.max(0, p.ready - Date.now())));
      const r = await fetch(S.share + "/line", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line.text, lang: S.lang, name, to: toId, pass: p.pass, answer: p.answer }) });
      tell(r.ok ? U.shareSent : r.status === 429 ? U.shareLater : U.shareFail);
    } catch { pass = null; tell(U.shareFail); } };
  const keepLine = async () => { const line = S.leave(field.value); if (!line) return; const also = S.share && box.checked, name = who.value.trim(), toId = target; field.value = ""; box.checked = false; aim(null); field.blur();
    try { localStorage.setItem("asteme-site-name", name); } catch {}
    await load(); await loadAll(); setTimeout(() => { flyTo(line.id, true); void openMemory(line.id); }, 500);
    if (also) void send(line, name, toId); };
  keepIt.onclick = keepLine; field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); void keepLine(); } e.stopPropagation(); });
  // --- The film ----------------------------------------------------------------------------------------------
  film.onclick = () => { const veil = make("div", "site-film"), v = make("video"), x = make("button", "bare", U.close);
    v.controls = true; v.autoplay = true; v.playsInline = true; v.poster = `${S.root}media/film-${S.film}.jpg`; v.src = `${S.root}media/asteme-${S.film}.mp4`; x.type = "button";
    const shut = () => { v.pause(); veil.remove(); removeEventListener("keydown", key, true); }, key = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); shut(); } };
    x.onclick = shut; veil.onclick = (e) => { if (e.target === veil) shut(); }; addEventListener("keydown", key, true); veil.append(v, x); document.body.append(veil); x.focus(); };
  // --- A memory opened: the site's own sentences are not something to confirm or forget; a visitor's own line is theirs, and can be forgotten. ------------
  new MutationObserver(() => { const id = typeof openId === "string" && document.body.classList.contains("sheet-on") ? openId : ""; document.body.classList.toggle("site-own", id.startsWith("mine-")); document.body.classList.toggle("site-theirs", id.startsWith("v-")); if (id.startsWith("v-")) theirs = id; }).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: false });
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
    // What other visitors left, and a person has read, comes into the sky once the sky is there. Nothing waits for it.
    if (S.share) fetch(S.share + "/lines").then((r) => (r.ok ? r.json() : null)).then(async (j) => { if (j && S.others(j.lines)) { await load(); await loadAll(); } }).catch(() => {});
    // Someone who left a line and has come back is told so, in their own words.
    const [last] = S.lines();
    if (last) { said.classList.add("aside"); setTimeout(() => said.classList.remove("aside"), 10400); const hi = make("div", "site-back"); hi.append(make("b", null, U.back), make("span", null, U.backSaid), make("q", null, last.text)); document.body.append(hi); setTimeout(() => hi.classList.add("on"), still ? 0 : 2600); setTimeout(() => { hi.classList.remove("on"); setTimeout(() => hi.remove(), 900); }, 9500); hi.onclick = () => { flyTo(last.id, false); void openMemory(last.id); }; }
  };
  void enter();
})();
