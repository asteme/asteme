// --- The conversation -----------------------------------------------------------
// How long it has been thinking is said once it is more than a moment, so that a slow answer is not taken for a page that stopped; past a minute it says so in words.
let thinkingFrom = 0;
const tick = () => {
  const took = document.querySelector("#state .took");
  if (!took || !thinking) return;
  const secs = Math.max(0, Math.round((Date.now() - thinkingFrom) / 1000));
  took.textContent = secs < 8 ? "" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` + (secs >= 60 ? " · " + say("brainSlow") : "");
};
setInterval(tick, 1000);
const paint = () => {
  // Thinking is said at the top, beside its name, with how long it has been once that is more than a moment.
  const stateWord = !online ? say("brainOffline") : say("brainState_" + (thinking ? "thinking" : state));
  $("state").replaceChildren(el("span", "presence"), el("span", "word", stateWord), ...(thinking ? [el("span", "took muted")] : []));
  $("state").title = stateWord;
  if (thinking) tick();
  // The three dots stand where its words will be only while it is writing them, and never before what it answers has been marked read: read first, then writing, as between people.
  const dots = thinking && writing && !reads.length,
    was = thread.querySelector(".typing");
  if (!dots) was?.remove();
  else if (!was) {
    const t = el("div", "entry it typing first"),
      b = el("div", "bubble");
    b.setAttribute("aria-label", (name || "Asteme") + " " + say("brainTyping"));
    b.append(el("i"), el("i"), el("i"));
    const said = el("div", "said");
    said.append(b);
    t.append(face("it"), said);
    thread.append(t);
  } else if (was !== thread.lastElementChild) thread.append(was);
  document.body.classList.toggle("thinking", thinking);
  document.body.classList.toggle("asleep", state === "asleep");
  const empty = thread.querySelector(".empty");
  if (empty && thread.querySelector(".entry:not(.typing)")) empty.remove();
  kick();
};
const PICTURE = /^image\/(png|jpeg|webp|gif)$/,
  SIZE = (n) => (n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB");
// What it wrote is shown the way it was written to be read: `code`, **strong**, links, list marks and fenced blocks.
// Only the marks are read; nothing is taken out, and the person's own words are shown exactly as typed.
const MARKS =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|\[([^\]\n]+)\]\((https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%]+)\)|(https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%]+)/g;
const marked = (into, text) => {
  let at = 0;
  for (const m of text.matchAll(MARKS)) {
    if (m.index > at) into.append(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1]) into.append(el("code", null, m[1].slice(1, -1)));
    else if (m[2]) {
      const strong = el("strong");
      marked(strong, m[2].slice(2, -2));
      into.append(strong);
    } else {
      let href = m[4] ?? m[5],
        tail = "";
      if (!m[4]) {
        const cut = href.match(/[.,;:!?'")\]]+$/);
        if (cut) {
          tail = cut[0];
          href = href.slice(0, -tail.length);
        }
      }
      const a = el("a", "link", m[3] ?? href);
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      into.append(a, tail);
    }
  }
  if (at < text.length) into.append(text.slice(at));
};
const written = (text) => {
  const out = el("div", "text"),
    parts = String(text ?? "").split(/^```[^\n]*\n?/m);
  parts.forEach((part, i) => {
    if (i % 2) return out.append(el("pre", "code", part.replace(/\n$/, "")));
    const lines = (i ? part.replace(/^\n/, "") : part).replace(i < parts.length - 1 ? /\n$/ : /$^/, "").split("\n");
    lines.forEach((line, n) => {
      const head = line.match(/^#{1,4} +(.+)$/),
        item = line.match(/^(\s*)[-*] +(.*)$/);
      if (head) {
        const strong = el("strong");
        marked(strong, head[1]);
        out.append(strong);
      } else if (item) {
        out.append(item[1] + "• ");
        marked(out, item[2]);
      } else marked(out, line);
      if (n < lines.length - 1) out.append("\n");
    });
  });
  return out;
};
// "Read" stands under the last of the user's messages that Asteme has taken up, with the hour, as it does between people.
let readShare = true,
  writing = false,
  reads = [],
  mannerNow = "",
  toneNow = "",
  penDown = null;
// A mark of having read that is still on its way is put down at once when its answer comes: the answer never stands above the mark for what it answers.
const readsNow = () => {
  for (const r of reads) {
    clearTimeout(r.timer);
    readMark(r.id, r.at);
  }
  reads = [];
};
const readMark = (id, at) => {
  if (!readShare) return;
  const row = [...thread.querySelectorAll(".entry.you")].find((r) => r.dataset.id === id);
  if (!row || row.classList.contains("gone")) return;
  const rows = [...thread.querySelectorAll(".entry.you")];
  const old = thread.querySelector(".readmark");
  if (old && rows.indexOf(old.closest(".entry")) > rows.indexOf(row)) return;
  old?.remove();
  row
    .querySelector(".said")
    .append(
      el(
        "div",
        "readmark muted",
        say("brainRead") + " " + new Date(at).toLocaleTimeString(document.documentElement.lang, { hour: "numeric", minute: "2-digit" }),
      ),
    );
};
// What Asteme said and the page has had in view, with someone there to see it, is told to it: seen.
const unseen = new Set();
// Whether the conversation is in front of someone: the page is showing, it has a size (a frame put away has none), and the sky is not open over it.
const inView = () => document.visibilityState === "visible" && innerWidth > 0 && innerHeight > 0 && !spaceOn;
// What was said while nobody was looking is counted in the tab's title, and whoever holds this page in a frame is told when it has been seen.
let missed = 0;
const titled = () => {
  document.title = (missed ? `(${missed}) ` : "") + (name || "Asteme");
};
// That the conversation is being looked at is told once each time it comes into view, new words or not: the count kept for a mark elsewhere starts again from there.
let shownTold = false;
const tellSeen = () => {
  if (!inView()) {
    shownTold = false;
    return;
  }
  if (!unseen.size && shownTold) return;
  if (!loaded) return;
  const ids = [...unseen];
  unseen.clear();
  shownTold = true;
  void post("/api/seen", { ids })
    .then((r) => {
      if (ids.length) seenMark(ids.at(-1), r?.at ?? Date.now());
      missed = 0;
      titled();
      if (framed) parent.postMessage({ asteme: "seen" }, "*");
    })
    .catch(() => {
      shownTold = false;
      for (const id of ids) unseen.add(id);
    });
};
// And the same the other way: under the last thing Asteme said that the user has had in front of them, with the hour, so both can see what the other knows.
const seenMark = (id, at) => {
  if (!readShare) return;
  const rows = [...thread.querySelectorAll(".entry.it:not(.typing)")],
    row = rows.find((r) => r.dataset.id === id);
  if (!row) return;
  const old = thread.querySelector(".seenmark");
  if (old && rows.indexOf(old.closest(".entry")) > rows.indexOf(row)) return;
  old?.remove();
  row.dataset.seen = at;
  row
    .querySelector(".said")
    .append(
      el(
        "div",
        "seenmark muted",
        say("brainRead") + " " + new Date(at).toLocaleTimeString(document.documentElement.lang, { hour: "numeric", minute: "2-digit" }),
      ),
    );
};
document.addEventListener("visibilitychange", tellSeen);
// That the user is in front of the conversation is said when they come to it: on opening it, on turning back to it. Not more than once a minute; what it means is Asteme's to decide.
let hereTold = 0;
const tellHere = () => {
  if (document.hidden || Date.now() - hereTold < 60000) return;
  hereTold = Date.now();
  void post("/api/here", {}).catch(() => {
    hereTold = 0;
  });
};
document.addEventListener("visibilitychange", tellHere);
addEventListener("focus", tellHere);
addEventListener("resize", tellSeen);
// The signs to choose from close when anything else is touched, or on Escape.
const signsShut = (but) => {
  for (const t of thread.querySelectorAll(".tools.choosing")) if (t !== but) t.classList.remove("choosing");
};
document.addEventListener("pointerdown", (e) => signsShut(e.target.closest?.(".tools")), true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") signsShut(null);
});
// A message taken back keeps its place and its hour, and says only that it was taken back.
const takenBack = (row) => {
  row.classList.add("gone");
  row.classList.remove("picked");
  const bubble = row.querySelector(".bubble") ?? el("div", "bubble");
  bubble.replaceChildren(el("div", "text muted", say("brainRetracted")));
  row.querySelector(".handed")?.remove();
  row.querySelector(".readmark")?.remove();
  if (!bubble.parentNode) row.querySelector(".said").append(bubble);
};
const takeBack = (m) => {
  const box = $("choose");
  box.replaceChildren(
    el("span", null, say("brainRetractAsk")),
    button(say("brainRetract"), async () => {
      box.replaceChildren();
      try {
        await post("/api/retract", { id: m.id });
      } catch (e) {
        problem(e.message);
      }
    }),
    button(say("cancel"), () => box.replaceChildren(), "bare muted"),
  );
};
const viewPicture = (src, title) => {
  document.getElementById("viewer")?.remove();
  const back = document.activeElement,
    v = el("div"),
    img = el("img"),
    bar = el("div", "viewbar"),
    shut = () => {
      v.remove();
      document.removeEventListener("keydown", key, true);
      back?.focus?.({ preventScroll: true });
    },
    key = (e) => {
      // While the picture is open, Tab goes between its two controls and nowhere behind it.
      if (e.key === "Tab") {
        const stops = [...v.querySelectorAll("a, button")],
          at = stops.indexOf(document.activeElement);
        e.preventDefault();
        stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus({ preventScroll: true });
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      shut();
    };
  v.id = "viewer";
  v.setAttribute("role", "dialog");
  v.setAttribute("aria-modal", "true");
  v.setAttribute("aria-label", title);
  img.src = src;
  img.alt = title;
  const open = el("a", "bare", say("brainViewOpen"));
  open.href = src;
  open.target = "_blank";
  open.rel = "noopener";
  const close = button(say("brainClose"), shut, "bare");
  bar.append(el("span", "muted", title), open, close);
  v.append(img, bar);
  v.addEventListener("click", (e) => {
    if (e.target === v) shut();
  });
  document.addEventListener("keydown", key, true);
  document.body.append(v);
  close.focus({ preventScroll: true });
};
// A new page in the conversation: what was said before it is put away, not erased, and one line stands where the page turns, with the way to look back and the way to
// join the two again. What comes after is the conversation as it is carried now.
let pageAt = 0;
const turnPage = () => {
  thread.querySelector(".newpage")?.remove();
  let firstAfter = null;
  for (const k of thread.children) {
    const at = Number(k.dataset?.at ?? 0);
    const before = !!pageAt && !!at && at <= pageAt;
    k.classList.toggle("before", before);
    if (pageAt && !before && at && !firstAfter) firstAfter = k;
  }
  if (!pageAt) return document.body.classList.remove("showbefore");
  const line = el("div", "newpage muted");
  const look = button(
    say(document.body.classList.contains("showbefore") ? "brainFreshHide" : "brainFreshShow"),
    () => {
      document.body.classList.toggle("showbefore");
      turnPage();
    },
    "bare muted",
  );
  const join = button(
    say("brainFreshJoin"),
    async () => {
      try {
        await post("/api/fresh", { on: false });
      } catch (e) {
        problem(e.message);
      }
    },
    "bare muted",
  );
  line.append(el("span", null, say("brainFreshLine")), look, join);
  // The line stands before the first thing said on the new page; with nothing said yet, above the dots and whatever else is at the foot.
  const foot =
    firstAfter ?? [...thread.children].find((k) => !Number(k.dataset?.at ?? 0) && !k.classList.contains("day") && !k.classList.contains("empty"));
  if (foot) thread.insertBefore(line, foot);
  else thread.append(line);
};
const message = (m, fresh) => {
  if (seen.has(m.id)) return;
  seen.add(m.id);
  thread.querySelector(".typing")?.remove();
  // A conversation that never ends is read by its days: when the day turns, the thread says which day it now is.
  if (m.at) {
    const d = new Date(m.at),
      key = d.toDateString();
    if (key !== lastDay) {
      if (lastDay !== null || key !== new Date().toDateString()) {
        const day = el(
          "div",
          "day muted",
          d.toLocaleDateString(document.documentElement.lang, {
            ...yearOf(d),
            month: "long",
            day: "numeric",
            weekday: "short",
          }),
        );
        day.dataset.at = String(m.at);
        thread.append(day);
      }
      lastDay = key;
      lastSaid = { role: "", at: 0 };
    }
  }
  const first = lastSaid.role !== m.role || (m.at ?? 0) - lastSaid.at > 300000;
  lastSaid = { role: m.role, at: m.at ?? 0 };
  const row = el("div", "entry " + (m.role === "user" ? "you" : "it") + (first ? " first" : "") + (fresh ? " new" : "")),
    said = el("div", "said"),
    bubble = el("div", "bubble");
  row.dataset.at = String(m.at ?? 0);
  row.dataset.id = m.id;
  const clock = m.at ? new Date(m.at).toLocaleTimeString(document.documentElement.lang, { hour: "numeric", minute: "2-digit" }) : "";
  said.append(el("div", "meta", m.role === "user" ? clock : [look.showName === false ? "" : name, clock].filter(Boolean).join(" · ")));
  // What was handed over with the words: a picture is shown, anything else is named and can be opened.
  if (m.files?.length) {
    const handed = el("div", "handed");
    for (const f of m.files) {
      const a = el("a", PICTURE.test(f.type) ? "pic" : "doc");
      a.href = api("/api/file?id=" + f.id);
      a.target = "_blank";
      a.rel = "noopener";
      if (PICTURE.test(f.type)) {
        const i = el("img");
        i.src = a.href;
        i.alt = f.name;
        i.loading = "lazy";
        a.append(i);
        // A picture is looked at here, large, over the conversation; it used to open in another tab of the browser, which inside DSH took the person out of it.
        // (Held with Ctrl, Cmd or Shift, or pressed with the middle button, the link still opens the way links do.)
        a.addEventListener("click", (e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
          e.preventDefault();
          viewPicture(a.href, f.name);
        });
      } else {
        a.download = f.name;
        a.append(el("b", null, f.name), el("span", "muted", SIZE(f.size)));
      }
      handed.append(a);
    }
    said.append(handed);
  }
  const wordless = m.files?.length && m.text === "[" + m.files.map((f) => f.name).join(", ") + "]";
  if (m.retracted) {
    said.append(bubble);
    row.append(face(m.role), said);
    thread.append(row);
    return takenBack(row);
  }
  if (!wordless) {
    if (m.replyTo) bubble.append(quoteOf(m.replyTo));
    bubble.append(m.role === "user" ? el("div", "text", m.text) : written(m.text));
    // Something long that the user sent is shown by its first lines, with the rest one press away: what they wrote is theirs to scroll past, and the answer is what they came for.
    if (m.role === "user" && (m.text.length > 480 || m.text.split("\n").length > 8)) {
      bubble.classList.add("folded");
      const more = button(
        say("brainMore"),
        () => {
          const open = bubble.classList.toggle("folded") === false;
          more.textContent = say(open ? "brainLess" : "brainMore");
          more.setAttribute("aria-expanded", String(open));
        },
        "bare more",
      );
      more.setAttribute("aria-expanded", "false");
      bubble.append(more);
    }
    said.append(bubble);
  }
  // A face of its own that it chose to send with these words, from the ones the user gave it.
  const shownFace = m.expression && faceOf.get(m.expression);
  if (shownFace) {
    const pic = el("img", "expression");
    pic.src = shownFace;
    pic.alt = m.expression;
    pic.title = m.expression;
    said.append(pic);
  }

  for (const v of m.promised ?? [])
    said.append(
      el(
        "div",
        "vow muted",
        "◇ " +
          (v.every
            ? say("brainNextEvery", { every: say("brainEvery_" + v.every), time: time(v.at), why: v.why })
            : say("brainNext", { time: time(v.at), why: v.why })),
      ),
    );
  // Beside its words: read them aloud, copy them, put a sign on them, answer them in particular. Beside the user's own: take them back, copy them, add to them.
  if (!wordless) {
    const tools = el("div", "tools"),
      tool = (icon, label, run, cls) => {
        const b = el("button", "tool2" + (cls ? " " + cls : ""));
        b.type = "button";
        b.innerHTML = svg(icon, 15, 1.7);
        b.title = label;
        b.setAttribute("aria-label", label);
        b.onclick = run;
        tools.append(b);
        return b;
      };
    if (m.role !== "user") tool(SPEAKER, say("brainSpeak"), () => void aloud(m.id), "speak").dataset.id = m.id;
    else tool(UNDO, say("brainRetract"), () => takeBack(m));
    const c = tool(COPY, say("brainCopy"), async () => {
      try {
        await copyText(m.text);
        c.innerHTML = svg(TICK, 15, 2);
        c.title = say("brainCopied");
        setTimeout(() => {
          c.innerHTML = svg(COPY, 15, 1.7);
          c.title = say("brainCopy");
        }, 1400);
      } catch {
        hint(say("brainCopyFailed"));
      }
    });
    if (m.role !== "user") {
      const signs = el("div", "signs");
      for (const sign of SIGNS) {
        const b = el("button", null, sign);
        b.type = "button";
        b.setAttribute("aria-label", sign);
        b.onclick = () => {
          tools.classList.remove("choosing");
          void sign_(m.id, row.querySelector(".reaction")?.textContent === sign ? "" : sign);
        };
        signs.append(b);
      }
      tool(SMILE, say("brainSign"), () => tools.classList.add("choosing"));
      tools.append(signs);
      tools.addEventListener("mouseleave", () => tools.classList.remove("choosing"));
    }
    tool(REPLY, say("brainReply"), () => answering(m));
    bubble.append(tools);
    // Where there is no pointer to rest, a touch on the words brings their tools, another puts them away.
    bubble.addEventListener("click", (e) => {
      if (matchMedia("(max-width: 34rem), (hover: none)").matches && !e.target.closest("a, button")) {
        for (const o of document.querySelectorAll(".entry.picked")) if (o !== row) o.classList.remove("picked");
        row.classList.toggle("picked");
      }
    });
  }
  if (m.used?.length) {
    const more = el("button", "used muted", say("brainUsed", { n: m.used.length }));
    more.type = "button";
    more.onclick = () => {
      const open = said.querySelector(".used-list");
      if (open) return open.remove();
      const list = el("ul", "used-list muted");
      for (const u of m.used) {
        const li = el("li"),
          b = el("button", null, u.text);
        b.type = "button";
        b.title = say("brainOpenMemory");
        b.onclick = () => openMemory(u.id);
        li.append(b);
        list.append(li);
      }
      said.append(list);
      flares.push({ ids: m.used.map((u) => u.id), t0: performance.now() });
      kick();
    };
    said.append(more);
    if (fresh) flares.push({ ids: m.used.map((u) => u.id), t0: performance.now() });
  }
  row.append(face(m.role), said);
  thread.append(row);
  if (m.reaction) {
    react(m.id, m.reaction);
    row.querySelector(".reaction")?.classList.remove("new");
  }
  if (m.role === "user" && m.read) readMark(m.id, m.read);
  if (m.role !== "user") {
    if (m.seen) seenMark(m.id, m.seen);
    else {
      unseen.add(m.id);
      tellSeen();
    }
  }
};
const task = (t) => {
  let line = taskLines.get(t.id);
  if (!line) {
    line = el("div", "line muted");
    line.append(el("span", "what"), el("span", "how"));
    taskLines.set(t.id, line);
    thread.append(line);
    lastSaid = { role: "", at: 0 };
  }
  // Work that is still out stays in sight whatever page the conversation is on; work that is done belongs to the page it was asked on.
  line.dataset.at = t.state === "running" ? "" : String(t.startedAt ?? 0);
  line.firstChild.textContent = say("brainAsked", { to: t.to, task: t.task });
  line.lastChild.replaceChildren(el("span", null, say("brainTask_" + t.state)));
  // Inside DSH the session that does the work is one press away.
  if (TOKEN && parent !== window && t.to === "dsh" && t.session) {
    const go = el("button", "go", say("brainOpenSession"));
    go.type = "button";
    go.onclick = () => parent.postMessage({ asteme: "open", session: t.session }, "*");
    line.lastChild.append(go);
  }
  line.title = t.task + (t.session ? "\n" + t.session : "") + (t.error ? "\n" + t.error : "");
  if (t.state === "running") {
    if (!tasksOut.has(t.id)) tasksOut.set(t.id, { id: t.id, to: t.to, t0: performance.now(), phase: hash(t.id) * 6.28 });
  } else if (tasksOut.has(t.id) && !tasksOut.get(t.id).back) tasksOut.get(t.id).back = performance.now();
};
// A worker's question with choices: the user presses one (or several, where it takes several, and then sends), and the worker goes on. Asteme sees the same question and may have answered it already.
const question = (a) => {
  const box = el("div", "ask");
  box.append(el("div", "muted asker", say("brainAsks", { to: a.to })));
  const chosen = new Map(),
    send = el("button", null, say("brainAnswerSend"));
  send.type = "button";
  const answer = async () => {
    for (const b of box.querySelectorAll("button")) b.disabled = true;
    try {
      await post("/api/answer", { id: a.id, answers: a.questions.map((q) => ({ id: q.id, choose: [...(chosen.get(q.id) ?? [])] })) });
    } catch (e) {
      problem(e.message);
      for (const b of box.querySelectorAll("button")) b.disabled = false;
    }
  };
  const single = a.questions.length === 1 && !a.questions[0].multi;
  for (const q of a.questions) {
    box.append(el("div", "asked", q.question));
    if (q.detail) box.append(el("pre", "muted", q.detail));
    const options = el("div", "options");
    chosen.set(q.id, new Set());
    for (const o of q.options) {
      const b = el("button", "plain option");
      b.type = "button";
      b.append(el("b", null, o.label), o.description ? el("span", "muted", o.description) : "");
      b.setAttribute("aria-pressed", "false");
      b.onclick = () => {
        const set = chosen.get(q.id);
        if (single) {
          set.add(o.label);
          return void answer();
        }
        if (!q.multi) {
          set.clear();
          for (const x of options.children) {
            x.classList.remove("on");
            x.setAttribute("aria-pressed", "false");
          }
        }
        if (set.has(o.label)) set.delete(o.label);
        else set.add(o.label);
        b.classList.toggle("on", set.has(o.label));
        b.setAttribute("aria-pressed", String(set.has(o.label)));
        send.disabled = ![...chosen.values()].every((v) => v.size);
      };
      options.append(b);
    }
    box.append(options);
  }
  const buttons = el("div", "buttons");
  if (!single) {
    send.disabled = true;
    send.onclick = () => void answer();
    buttons.append(send);
  }
  buttons.append(el("span", "muted note", say("brainAsksNote")));
  box.append(buttons);
  askBoxes.set(a.id, box);
  thread.append(box);
};
const react = (to, emoji) => {
  const row = [...thread.querySelectorAll(".entry")].find((r) => r.dataset.id === to);
  if (!row) return;
  let mark = row.querySelector(".reaction");
  if (!emoji) return void mark?.remove();
  if (!mark) {
    mark = el("span", "reaction new");
    row.querySelector(".bubble")?.append(mark);
    const mine = row.classList.contains("it");
    mark.title = mine ? say("brainSignMine") : say("brainReacted", { name: name || "Asteme" });
    if (mine) {
      mark.setAttribute("role", "button");
      mark.tabIndex = 0;
      mark.onclick = () => void sign_(to, "");
    }
  }
  mark.textContent = emoji;
};
// The user's own sign on something Asteme said; the same sign again, or a press on it, takes it off.
const sign_ = async (id, emoji) => {
  try {
    await post("/api/react", { id, emoji });
  } catch (e) {
    problem(e.message);
  }
};
// Answering one thing in particular: it stands above the box until the message is sent or it is put away, and goes with the message.
let answeringTo = null;
const answering = (m) => {
  answeringTo = m ? { id: m.id, role: m.role, words: m.text.length > 140 ? m.text.slice(0, 139) + "…" : m.text } : null;
  const strip = $("replying");
  strip.replaceChildren();
  if (answeringTo) {
    const x = el("button", "bare muted", "×");
    x.type = "button";
    x.setAttribute("aria-label", say("cancel"));
    x.onclick = () => answering(null);
    strip.append(
      el("b", null, say("brainReplyingTo", { who: m.role === "user" ? you || say("brainYou") : name || "Asteme" })),
      el("span", null, answeringTo.words),
      x,
    );
    box.focus();
  }
};
const quoteOf = (q) => {
  const b = el("button", "quote");
  b.type = "button";
  b.append(el("b", null, q.role === "user" ? you || say("brainYou") : name || "Asteme"), el("span", null, q.words));
  b.onclick = () => {
    const row = [...thread.querySelectorAll(".entry")].find((r) => r.dataset.id === q.id);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    row.classList.remove("found");
    void row.offsetWidth;
    row.classList.add("found");
  };
  return b;
};
const ask = (a) => {
  if (askBoxes.has(a.id)) return;
  if (a.kind === "question") return question(a);
  const box = el("div", "ask");
  box.append(el("div", null, say("brainAsk", { to: a.to, title: a.title })), el("pre", "muted", a.detail));
  const buttons = el("div", "buttons"),
    yes = el("button", null, say("brainAllow")),
    no = el("button", "plain", say("brainRefuse"));
  yes.type = no.type = "button";
  const answer = async (allow) => {
    yes.disabled = no.disabled = true;
    try {
      await post("/api/answer", { id: a.id, allow });
    } catch (e) {
      problem(e.message);
      yes.disabled = no.disabled = false;
    }
  };
  yes.onclick = () => answer(true);
  no.onclick = () => answer(false);
  buttons.append(yes, no);
  box.append(buttons);
  askBoxes.set(a.id, box);
  thread.append(box);
};
