// --- What opens beside the conversation ------------------------------------------
const sheetBox = $("sheet");
const get = async (path) => {
  const r = await fetch(api(path));
  const v = await r.json();
  if (!r.ok) throw new Error(v.error ?? "Failed");
  return v;
};
const closeSheet = () => {
  sheetBox.classList.remove("on");
  document.body.classList.remove("sheet-on");
  if (flares.some((f) => f.held)) {
    flares = flares.filter((f) => !f.held);
    kick();
  }
  if (openId) {
    openId = null;
    report();
  }
  if (!spaceOn) box.focus();
};
const sheet = (title, parts, key = title) => {
  if (flares.some((f) => f.held)) flares = flares.filter((f) => !f.held);
  openId = null;
  // The title, the way out and (in the settings) the parts stay at the top while what is under them is read.
  const head = el("div", "sheethead"),
    named = el("h2", null, title),
    shut = el("button", "bare muted", say("brainClose"));
  shut.type = "button";
  shut.onclick = closeSheet;
  named.append(shut);
  head.append(named);
  parts = parts.filter(Boolean);
  if (parts[0]?.classList?.contains("tabs")) head.append(parts.shift());
  // The same sheet drawn again after a change stays where it was read to, and the focus is not taken to the top.
  const again = sheetBox.classList.contains("on") && sheetBox.dataset.title === key,
    at = sheetBox.scrollTop;
  sheetBox.replaceChildren(head, ...parts.filter(Boolean));
  sheetBox.dataset.title = key;
  sheetBox.classList.add("on");
  document.body.classList.add("sheet-on");
  if (again) sheetBox.scrollTop = at;
  else {
    sheetBox.scrollTop = 0;
    shut.focus();
  }
};
// The sheet is put away by a press anywhere outside it. What was pressed still does what it does: a star pressed opens its memory in the sheet's place. Letting go after turning the sky is not a press.
addEventListener(
  "click",
  (e) => {
    if (!sheetBox.classList.contains("on") || grabbed?.moved || !e.target.closest || e.target.closest("#sheet, #tip")) return;
    closeSheet();
  },
  true,
);
const button = (label, run, cls) => {
  const b = el("button", cls ?? "plain", label);
  b.type = "button";
  b.onclick = run;
  return b;
};
const section = (title, lines) =>
  lines.length
    ? [
        el("h3", null, title),
        (() => {
          const ul = el("ul");
          for (const l of lines) ul.append(el("li", null, l));
          return ul;
        })(),
      ]
    : [];
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheetBox.classList.contains("on")) closeSheet();
});
const openMemory = async (id) => {
  let m;
  try {
    m = await get("/api/memory?id=" + encodeURIComponent(id));
  } catch (e) {
    return problem(e.message);
  }
  const act = (what) => async () => {
    try {
      await post("/api/change", { id: m.id, revision: m.revision, what });
      await load();
      what === "forget" || what === "retire" ? closeSheet() : await openMemory(id);
    } catch (e) {
      problem(e.message);
    }
  };
  const acts = el("div", "acts");
  const live = ["active", "doubtful"].includes(m.status);
  const forget = () => {
    acts.replaceChildren(
      el("p", "warn", say("brainForgetWarn")),
      button(say("forgetConfirm"), act("forget")),
      button(say("cancel"), () => openMemory(id)),
    );
  };
  if (live)
    acts.append(
      button(say("stillTrue"), act("confirm")),
      button(say("brainNoLonger"), act("retire")),
      button(say(m.paused ? "brainResume" : "brainPause"), act(m.paused ? "resume" : "pause")),
    );
  acts.append(button(say("brainForget"), forget));
  sheet(say("kind_" + m.kind) + (m.private ? " · " + say("private") : "") + (m.paused ? " · " + say("paused") : ""), [
    el("p", "big", m.text),
    m.closes ? el("p", "muted", say("brainClosesWhen", { when: m.closes })) : null,
    el("h3", null, say(m.grounds === "seen" ? "brainFromSeen" : "brainFromSaid")),
    ...m.sources.map((q) => el("blockquote", null, q.quote)),
    m.at ? el("p", "muted", say("brainLearnedOn", { time: time(m.at) })) : null,
    acts,
  ]);
  // The line to the star is there while the memory is open, and goes when it is closed.
  flares = flares.filter((f) => !f.held);
  flares.push({ ids: [m.id], t0: performance.now(), held: true });
  openId = m.id;
  touched = performance.now();
  kick();
  report();
};
const openAll = async (q = "") => {
  const input = el("input");
  input.type = "search";
  input.placeholder = say("search");
  input.value = q;
  const list = el("div");
  const fill = async () => {
    let found;
    try {
      found = await get("/api/find?q=" + encodeURIComponent(input.value));
    } catch (e) {
      return problem(e.message);
    }
    list.replaceChildren(
      ...(found.length
        ? found.map((m) => {
            const b = button(m.private ? say("private") : m.text, () => openMemory(m.id), "row");
            b.title = say("kind_" + m.kind);
            return b;
          })
        : [el("p", "muted", say("brainNothing"))]),
    );
  };
  let wait;
  input.oninput = () => {
    clearTimeout(wait);
    wait = setTimeout(fill, 250);
  };
  // Everything about memory starts here, under the one word at the top that says so: look for something; see the same memories as stars; and, inside DSH, each place
  // where memory is looked after (the list to correct or forget, why it answered as it did, what it does between conversations, its charter, and the memory settings).
  // The places give way to what is found as soon as something is looked for.
  const places = el("div", "places");
  places.append(
    placeRow(say("brainSpaceEnter"), say("brainGoSky"), () => {
      closeSheet();
      enterSpace();
    }),
    ...(framed
      ? [
          ["memory", "brainGoList"],
          ["review", "brainGoReview"],
          ["activity", "brainGoActivity"],
          ["charter", "brainGoCharter"],
          ["settings", "brainGoKeep"],
        ].map(([to, title]) => placeRow(say(title), say("brainGo_" + to), () => go(to)))
      : []),
  );
  input.addEventListener("input", () => {
    places.hidden = !!input.value.trim();
  });
  places.hidden = !!q.trim();
  sheet(say("brainAll"), [input, places, list]);
  input.focus();
  await fill();
};
const openSelf = async () => {
  let me;
  try {
    me = await get("/api/self");
  } catch (e) {
    return problem(e.message);
  }
  const field = (label, value) => {
    const l = el("label", null, label),
      i = el("input");
    i.value = value;
    l.append(i);
    return [l, i];
  };
  const [a, ai] = field(say("assistantName"), me.name),
    [b, bi] = field(say("yourName"), me.userName);
  const again = button(
    say("brainBirthAgain"),
    () => {
      closeSheet();
      birth(true);
    },
    "bare muted",
  );
  again.style.marginTop = "1.4rem";
  const save = button(say("save"), async () => {
    try {
      await post("/api/self", { name: ai.value, userName: bi.value });
      await load();
      await openSelf();
    } catch (e) {
      problem(e.message);
    }
  });
  const set = async (patch) => {
    try {
      await post("/api/self", patch);
      await load();
      await openSelf();
    } catch (e) {
      problem(e.message);
    }
  };
  // A picture is made small here, in the browser, before it is kept.
  const small = (file, side, type, then) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"),
        k = Math.min(1, side / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      then(c.toDataURL(type, 0.86));
    };
    img.src = URL.createObjectURL(file);
  };
  const picture = (label, key, has) => {
    const i = el("input");
    i.type = "file";
    i.accept = "image/*";
    i.hidden = true;
    i.onchange = () => {
      const f = i.files?.[0];
      if (f) small(f, 160, "image/jpeg", (data) => void set({ [key]: data }));
    };
    // The browser's own file control is not shown: a button in the page's words opens it.
    const row = el("div", "tonerow");
    row.append(
      i,
      el("span", null, label),
      button(say("brainChoose"), () => i.click()),
      has ? button(say("brainFaceNone"), () => set({ [key]: "" }), "bare muted") : "",
    );
    return row;
  };
  const [m, mi] = field(say("brainManner"), me.manner?.text ?? "");
  mi.placeholder = say("brainMannerUsual");
  const manner = el("div", "acts");
  manner.style.marginTop = "0";
  manner.append(
    button(say("brainMannerSet"), () => set({ manner: mi.value })),
    me.manner ? button(say("brainMannerBack"), () => set({ manner: "" })) : "",
    me.manner && !me.manners.includes(me.manner.text) ? button(say("brainMannerKeep"), () => set({ keepManner: me.manner.text })) : "",
  );
  const kept = me.manners.length
    ? [
        el("h3", null, say("brainMannerKept")),
        ...me.manners.map((text) => {
          const row = el("div", "acts");
          row.style.marginTop = ".3rem";
          row.append(
            button(text, () => set({ manner: text })),
            button("×", () => set({ dropManner: text }), "bare muted"),
          );
          return row;
        }),
      ]
    : [];
  // How it shows feeling besides words: a pictograph on what you said, and faces you give it, each with the name it chooses it by.
  const feel = me.feel ?? { react: true, express: true },
    setFeel = async (patch) => {
      try {
        me = await post("/api/self", { feel: patch });
      } catch (e) {
        problem(e.message);
      }
    };
  // Faces are given several at once: chosen, or dropped onto the list. Each is first called by its file's name and can be called something else by pressing the name; the name is what Asteme chooses it by.
  const facePick = el("input");
  facePick.type = "file";
  facePick.accept = "image/*";
  facePick.multiple = true;
  facePick.hidden = true;
  const takeFaces = async (files) => {
    const pictures = [...files].filter((f) => /^image\//.test(f.type)).slice(0, 12);
    if (!pictures.length) return;
    let last = me;
    for (const f of pictures) {
      const called =
        f.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim()
          .slice(0, 40) || say("brainExpress");
      const data = await new Promise((done) =>
        small(f, 256, f.type === "image/png" || f.type === "image/gif" || f.type === "image/webp" ? "image/png" : "image/jpeg", done),
      );
      try {
        last = await post("/api/self", { addExpression: { name: called, image: data } });
      } catch (e) {
        problem(e.message);
      }
    }
    await load();
    await openSelf();
  };
  facePick.onchange = () => void takeFaces(facePick.files ?? []);
  const faceList = el("div", "faces");
  for (const x of me.expressions ?? []) {
    const one = el("span", "faceone"),
      pic = el("img"),
      called = el("button", "facename", x.name),
      drop = el("button", "lookdrop", "×");
    pic.src = x.image;
    pic.alt = x.name;
    if (x.shows) pic.title = say("brainExpressionShows", { shows: x.shows });
    called.type = "button";
    called.title = say("brainExpressionRename");
    called.onclick = () => {
      const input = el("input");
      input.value = x.name;
      input.maxLength = 40;
      input.setAttribute("aria-label", say("brainExpressionName"));
      called.replaceWith(input);
      input.focus();
      input.select();
      const done = (keep) => {
        const to = input.value.trim();
        if (keep && to && to !== x.name) void set({ renameExpression: { from: x.name, to } });
        else input.replaceWith(called);
      };
      input.onblur = () => done(true);
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          input.onblur = null;
          done(false);
        }
      };
    };
    drop.type = "button";
    drop.title = say("brainLookDrop", { name: x.name });
    drop.setAttribute("aria-label", drop.title);
    drop.onclick = () => set({ dropExpression: x.name });
    one.append(pic, called, drop);
    faceList.append(one);
  }
  const more = el("button", "faceadd");
  more.type = "button";
  more.innerHTML = svg('<path d="M12 6v12M6 12h12"/>', 20, 1.6);
  more.title = say("brainExpressionAdd");
  more.setAttribute("aria-label", say("brainExpressionAdd"));
  more.onclick = () => facePick.click();
  faceList.append(more, facePick);
  for (const type of ["dragenter", "dragover"])
    faceList.addEventListener(type, (e) => {
      e.preventDefault();
      faceList.classList.add("over");
    });
  faceList.addEventListener("dragleave", () => faceList.classList.remove("over"));
  faceList.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    faceList.classList.remove("over");
    void takeFaces(e.dataTransfer?.files ?? []);
  });
  const feels = [el("h3", null, say("brainFeel")), el("div", "tonerow", null), el("div", "tonerow", null)];
  feels[1].append(
    el("span", null, say("brainReact")),
    choice(
      [
        [true, say("brainOn")],
        [false, say("brainOff")],
      ],
      feel.react !== false,
      (v) => setFeel({ react: v }),
      say("brainReact"),
    ),
  );
  feels[2].append(
    el("span", null, say("brainExpress")),
    choice(
      [
        [true, say("brainOn")],
        [false, say("brainOff")],
      ],
      feel.express !== false,
      (v) => setFeel({ express: v }),
      say("brainExpress"),
    ),
  );
  feels.push(faceList, el("p", "note muted", say("brainExpressNote")));
  const seenRow = el("div", "tonerow");
  seenRow.append(
    el("span", null, say("brainSeenShare")),
    choice(
      [
        [true, say("brainOn")],
        [false, say("brainOff")],
      ],
      feel.seen !== false,
      (v) => setFeel({ seen: v }).then(load),
      say("brainSeenShare"),
    ),
  );
  feels.push(seenRow, el("p", "note muted", say("brainSeenNote")));
  sheet(
    say("brainSettings"),
    [
      settingsTabs("self"),
      // Four parts, as the look has three: who it is to the eye, how it speaks, how it shows what it feels, and what it is for.
      el("h4", "group", say("brainGroupWho")),
      el("h3", null, say("brainNames")),
      a,
      b,
      save,
      el("h3", null, say("brainFaces")),
      picture(say("brainFaceIt"), "face", !!faces.it),
      picture(say("brainFaceYou"), "yourFace", !!faces.you),
      el("h4", "group", say("brainGroupWay")),
      el("h3", null, say("brainManner")),
      mi,
      manner,
      ...kept,
      el("h4", "group", say("brainGroupFeel")),
      ...feels,
      el("h4", "group", say("brainGroupFor")),
      ...(me.purpose ? section(say("purpose"), [me.purpose]) : []),
      ...section(
        say("values"),
        me.values.map((v) => (typeof v === "string" ? v : (v.text ?? ""))),
      ),
      ...section(
        say("brainPromises"),
        me.promises.map((v) => (typeof v === "string" ? v : (v.text ?? ""))),
      ),
      ...section(say("brainHabits"), me.habits),
      // What it is for and what it holds to are read here and changed in the charter: one press, where there is a panel to go to.
      ...(framed ? [placeRow(say("brainGoCharter"), say("brainGo_charter"), () => go("charter"))] : []),
      again,
    ],
    "settings:self",
  );
};
// Its voice and how it thinks: which model, how hard, when a reply is read aloud and by whom.
const openVoice = async () => {
  // Which model it thinks with, and how hard. Inside DSH it is the one DSH's own chat uses unless another is chosen here.
  let thinks = [];
  try {
    const ms = await get("/api/models");
    if (ms.now) {
      const line = el("p", "muted", ms.now.name + (ms.now.follows ? " — " + say("brainModelFollows") : ""));
      thinks = [el("h3", null, say("brainModel")), line];
      if (canModel && ms.list.length) {
        const pick = el("select");
        pick.setAttribute("aria-label", say("brainModel"));
        const same = el("option", null, say("brainModelSame"));
        same.value = "";
        pick.append(same);
        const groups = new Map();
        for (const o of ms.list) {
          let g = groups.get(o.provider);
          if (!g) {
            g = el("optgroup");
            g.label = o.providerName || o.provider;
            groups.set(o.provider, g);
            pick.append(g);
          }
          const op = el("option", null, o.name);
          op.value = o.provider + "\n" + o.model;
          g.append(op);
        }
        pick.value = ms.now.follows ? "" : ms.now.provider + "\n" + ms.now.model;
        pick.onchange = async () => {
          const [provider, model] = pick.value.split("\n");
          try {
            await post("/api/model", pick.value ? { provider, model } : {});
            await openVoice();
          } catch (e) {
            problem(e.message);
          }
        };
        thinks.push(pick);
      }
      // What this model lets be chosen about its thinking; a model that offers nothing shows nothing.
      if (canModel && ms.now.efforts?.length > 1)
        thinks.push(
          el("h3", null, say("brainEffort")),
          choice(
            ms.now.efforts.map((e) => [e.id, e.name]),
            ms.now.effort,
            async (id) => {
              try {
                await post("/api/model", { effort: id });
              } catch (e) {
                problem(e.message);
              }
            },
            say("brainEffort"),
          ),
          el("p", "note muted", say("brainEffortNote")),
        );
    }
  } catch {
    /* a host that lends no models shows none */
  }
  // Its voice: when a reply is read aloud, and by which voice.
  const sendLook = async (patch) => {
    try {
      look = await post("/api/look", patch);
      applyLook(look);
    } catch (e) {
      problem(e.message);
    }
  };
  const makers = (lent?.voices ?? []).map((v) => [v, v[0].toUpperCase() + v.slice(1)]),
    nowVoice = voiceNow();
  const speaks = makers.length
    ? [
        el("h3", null, say("brainAloud")),
        choice(
          ["press", "spoke", "always"].map((k) => [k, say("brainAloud_" + k)]),
          look.aloud ?? "spoke",
          (k) => sendLook({ aloud: k }),
          say("brainAloud"),
        ),
        ...(makers.length > 1
          ? [
              el("h3", null, say("brainVoiceWhich")),
              choice(makers, nowVoice === "ask" ? null : nowVoice, (v) => sendLook({ voice: v }), say("brainVoiceWhich")),
            ]
          : []),
        el("p", "note muted", say(lent.maker === "deepseek" ? "brainVoiceNote" : "brainVoiceNoteLent")),
      ]
    : [el("h3", null, say("brainAloud")), el("p", "note muted", say("brainSpeakNone") + (lentWhy === "no-key" ? " " + say("brainVoiceNoKey") : ""))];
  sheet(say("brainSettings"), [settingsTabs("voice"), ...speaks, ...thinks, managed()], "settings:voice");
};
// The settings are one sheet in three parts. Whatever is set for the conversation is set here; what is kept and how memory is looked after is the panel's, one press away inside DSH.
const settingsTabs = (now) => {
  const bar = el("div", "seg tabs");
  bar.setAttribute("role", "tablist");
  for (const [key, label, open] of [
    ["look", "brainLook", () => openLook()],
    ["self", "brainSelfTab", () => void openSelf()],
    ["voice", "brainVoiceTab", () => void openVoice()],
  ]) {
    const b = el("button", key === now ? "on" : "", say(label));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(key === now));
    b.onclick = open;
    bar.append(b);
  }
  return bar;
};
// Looking after memory (what it used and why, the list to correct or forget, what it does between conversations, its charter, copies and starting over) is the panel's work inside DSH. It used to be one
// small link at the foot of another tab; it is a tab of its own here, with each place named and said in a line, and one press takes the person there. The same memories as stars are first in it.
const managed = () => null;
const go = (to) => {
  closeSheet();
  parent.postMessage({ asteme: "manage", tab: to }, "*");
};
const placeRow = (title, hint_, act) => {
  const b = el("button", "row place");
  b.type = "button";
  b.append(el("b", null, title), el("span", "muted", hint_));
  b.onclick = act;
  return b;
};
const openActivity = async () => {
  let a;
  try {
    a = await get("/api/activity");
  } catch (e) {
    return problem(e.message);
  }
  const quiet = !a.tasks.length && !a.intentions.length && !a.unread;
  sheet(say("brainDoing"), [
    el("p", "big", say("brainState_" + a.state)),
    quiet ? el("p", "muted", say("brainQuiet")) : null,
    ...section(
      say("brainOut"),
      a.tasks.map((t) => `${t.to}: ${t.task} — ${say("brainTask_" + t.state)}${t.error ? " (" + t.error + ")" : ""}`),
    ),
    ...(a.intentions.length
      ? [
          el("h3", null, say("brainSet")),
          ...a.intentions.map((i) => {
            const row = el("div", "vowrow"),
              words = el("div");
            words.append(el("b", null, (i.every ? say("brainEvery_" + i.every) + " · " : "") + time(i.at)), el("span", null, i.why));
            // Taking one back does not unsay it: the line under the words it was said with stays.
            row.append(
              words,
              button(
                say("brainUnwake"),
                async () => {
                  try {
                    await post("/api/unwake", { id: i.id });
                    await load();
                    await openActivity();
                  } catch (e) {
                    problem(e.message);
                  }
                },
                "bare muted",
              ),
            );
            return row;
          }),
        ]
      : []),
    a.unread ? el("p", "muted", say("brainUnread", { n: a.unread })) : null,
    ...a.idle.map((i) => el("p", "muted", say("idle_" + i.code))),
  ]);
};
// What it would like settled is asked here, one thing at a time, where an answer takes one press.
let asked = "";
const review = (r) => {
  const key = r ? JSON.stringify(r) : "";
  if (key === asked) return;
  asked = key;
  thread.querySelector(".review")?.remove();
  if (!r) return;
  const card = el("div", "ask review"),
    done = async (path, body) => {
      try {
        await post(path, body);
        card.remove();
        asked = "";
        await load();
      } catch (e) {
        problem(e.message);
      }
    };
  if (r.kind === "check") {
    card.append(el("div", "muted", say("brainReviewAsk")), el("p", null, r.item.text));
    const b = el("div", "buttons");
    b.append(
      button(say("stillTrue"), () => done("/api/change", { id: r.item.id, revision: r.item.revision, what: "confirm" }), ""),
      button(say("brainNoLonger"), () => done("/api/change", { id: r.item.id, revision: r.item.revision, what: "retire" })),
    );
    card.append(b);
  } else {
    card.append(el("div", "muted", say("brainDisputeAsk")));
    for (const side of [r.a, r.b]) {
      card.append(el("p", null, side.text));
      const b = el("div", "buttons");
      b.append(button(say("keepThis"), () => done("/api/settle", { a: r.a.id, b: r.b.id, keep: side.id })));
      card.append(b);
    }
  }
  thread.append(card);
};
const problem = (text) => {
  thread.append(el("div", "problem", text));
  down();
};
const post = async (path, body) => {
  const r = await fetch(api(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error ?? "Failed");
  return v;
};
// Several things often change at once (a reply, what was learned from it, a time it set): the state is read once for them, a moment after the first, and never twice at the same time.
let reloading = null,
  reloadAgain = false;
const reload = () => {
  if (reloading) {
    reloadAgain = true;
    return;
  }
  reloading = setTimeout(async () => {
    try {
      await load();
      if (follow) down();
    } catch {
      /* the next event reads it again */
    }
    reloading = null;
    if (reloadAgain) {
      reloadAgain = false;
      reload();
    }
  }, 60);
};
const load = async () => {
  const s = await (await fetch(api("/api/state"))).json();
  if (s.thinking && (!thinking || !thinkingFrom)) thinkingFrom = s.thinkingSince ?? Date.now();
  state = s.state;
  thinking = s.thinking;
  writing = s.writing ?? s.thinking;
  name = s.name || "";
  called = name;
  mannerNow = s.manner ?? "";
  toneNow = s.tone ?? "";
  you = s.you || "";
  faceOf = new Map((s.expressions ?? []).map((x) => [x.name, x.image]));
  readShare = s.feel?.seen !== false;
  if (!readShare) for (const m of thread.querySelectorAll(".readmark, .seenmark")) m.remove();
  // It is spoken to by the name it was given, once it has one.
  waitingWords = name ? say("brainPlaceholderNamed", { name }) : say("brainPlaceholder");
  if (!$("box").disabled) $("box").placeholder = waitingWords;
  hearing = s.can?.hear ?? null;
  $("attach").hidden = !s.can?.files;
  canModel = !!s.can?.model;
  lent = s.can?.speak ?? null;
  lentWhy = s.can?.speakWhy ?? "";
  if (typeof fit === "function") fit();
  document.body.classList.toggle("voiceless", !lent);
  look = s.look ?? {};
  // Its name stands at the top when it has one and the user wants it there. Without one there is its face, which opens the same thing.
  $("name").textContent = name;
  $("name").hidden = !name || look.showName === false;
  titled();
  applyLook(look);
  const changed = faces.it !== (s.face ?? null) || faces.you !== (s.yourFace ?? null);
  faces = { it: s.face ?? null, you: s.yourFace ?? null };
  if (changed || !loaded) refaces();
  $("count").textContent = say("tabMemory") + (s.memories ? " " + s.memories : "");
  // What it has said it will come back to is not kept above the box. The words it said it with carry the line; here, by its state, is only when the next one is, and a press shows them all, where each can be taken back.
  const soonest = s.intentions[0],
    soon = $("soon");
  soon.hidden = !soonest;
  if (soonest) {
    soon.textContent = "◇ " + when(soonest.at) + (s.intentions.length > 1 ? " +" + (s.intentions.length - 1) : "");
    soon.title = s.intentions
      .map((i) =>
        i.every
          ? say("brainNextEvery", { every: say("brainEvery_" + i.every), time: time(i.at), why: i.why })
          : say("brainNext", { time: time(i.at), why: i.why }),
      )
      .join("\n");
    soon.setAttribute("aria-label", soon.title);
  }
  if (!s.messages.length && !thread.children.length)
    thread.append(
      el(
        "p",
        "empty muted",
        [say("brainEmpty"), s.workers.length ? "" : say("brainWorkersNone"), s.sky?.length || s.memories ? "" : say("brainSkyEmpty")]
          .filter(Boolean)
          .join(" "),
      ),
    );
  // What was said and what was handed over, in the order it happened. Work that has come back keeps its line, so its session can still be opened.
  [...s.messages.map((m) => ({ at: m.at ?? 0, m })), ...s.tasks.map((t) => ({ at: t.startedAt ?? 0, t }))]
    .sort((a, b) => a.at - b.at)
    .forEach((x) => {
      if (x.m) message(x.m, false);
      else if (!taskLines.has(x.t.id) || x.t.state === "running") task(x.t);
    });
  s.asks.forEach(ask);
  pageAt = s.page ?? 0;
  turnPage();
  review(thinking ? null : (s.review?.[0] ?? null));
  const first = !loaded;
  setSky(s.sky);
  if (first) shown("page");
  loaded = true;
  paint();
  tellSeen();
  wasBorn = s.born !== false;
  if (s.stale && !toldStale) {
    toldStale = true;
    problem(say("brainRestart"));
  } // On a device that asks for less movement the sky does not glide or fall: said once, so that stillness is not taken for something broken; the choice is in the settings.
  if (first && calm && !s.fresh) {
    try {
      if (!localStorage.getItem("asteme-motion-told")) {
        localStorage.setItem("asteme-motion-told", "1");
        setTimeout(
          () => hint(say("brainMotionNote") + " (" + say("brainSettings") + " › " + say("brainLook") + " › " + say("brainMotion") + ")"),
          1200,
        );
      }
    } catch {
      /* not kept */
    }
  }
  if (first) draftFrom(s.draft);
  if (first) {
    let again = false;
    try {
      again = sessionStorage.getItem("asteme-again") === "1";
      sessionStorage.removeItem("asteme-again");
    } catch {
      /* not kept */
    }
    if (s.fresh || new URLSearchParams(location.search).get("first") === "1") birth();
    else if (again) birth(true);
  }
  if (first && (location.hash === "#stars" || new URLSearchParams(location.search).get("stars") === "1")) enterSpace();
};
let waitingWords = "",
  hearing = null,
  canModel = false,
  lent = null,
  lentWhy = "";
// What the page is drawn in is reported back, so that a host's colours arriving can be checked from outside.
const shown = (from) => {
  const st = getComputedStyle(document.documentElement),
    hex = (c) => {
      const m = /^#[0-9a-f]{6}$/i.exec(c.trim());
      return m ? m[0] : "";
    };
  void post("/api/shown", {
    theme: document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    bg: hex(st.getPropertyValue("--bg")),
    ink: hex(st.getPropertyValue("--ink")),
    from: from ?? "page",
    stars: spaceOn,
    open: openId,
    ...(hostAsked ? { asked: hostAsked } : {}),
  }).catch(() => {});
};
const listen = () => {
  const stream = new EventSource(api("/api/events"));
  stream.onopen = async () => {
    online = true;
    await load();
    down();
  };
  stream.onerror = () => {
    online = false;
    paint();
  };
  stream.onmessage = (raw) => {
    const e = JSON.parse(raw.data),
      follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    if (e.type === "message" && e.role === "assistant" && spaceOn) $("spaceback").textContent = say("brainSpaceNew");
    if (e.type === "message" && !follow) newest.classList.add("fresh");
    if (e.type === "message" && e.role === "assistant") readFresh = e.id;
    if (e.type === "message" && e.role === "assistant" && !inView()) {
      missed++;
      titled();
    }
    if (e.type === "message" && e.role === "assistant") readsNow();
    if (e.type === "message") message(e, true);
    else if (e.type === "task") task(e.task);
    else if (e.type === "ask") ask(e.ask);
    else if (e.type === "answered") {
      const box = askBoxes.get(e.id);
      if (box) {
        box.querySelector(".options")?.remove();
        for (const o of box.querySelectorAll(".options")) o.remove();
        box
          .querySelector(".buttons")
          ?.replaceWith(
            el(
              "div",
              "muted",
              e.by
                ? e.by === "nobody"
                  ? say("brainAnswered_gone")
                  : say(e.by === "user" ? "brainAnswered_you" : "brainAnswered_it") + (e.text ? " " + e.text : "")
                : say(e.allow ? "brainAnswered_allow" : "brainAnswered_deny"),
            ),
          );
      }
    } else if (e.type === "reaction") react(e.to, e.emoji);
    // Read a moment after it is taken up, the way a person's eye reaches a message a moment after it lands.
    else if (e.type === "read") {
      const r = { id: e.id, at: e.at };
      r.timer = setTimeout(() => {
        reads = reads.filter((x) => x !== r);
        readMark(r.id, r.at);
        paint();
        if (follow) down();
      }, 1600);
      reads.push(r);
    }
    // Its words are handed over a moment after the last of them is written: the dots stay for that moment, so they give way to the words and not to nothing.
    else if (e.type === "writing") {
      clearTimeout(penDown);
      if (e.on || !thinking) writing = e.on;
      else
        penDown = setTimeout(() => {
          writing = false;
          paint();
        }, 1500);
    } else if (e.type === "retracted") {
      const rows = [...thread.querySelectorAll(".entry")],
        row = rows.find((r) => r.dataset.id === e.id);
      if (row) takenBack(row);
      for (const id of e.also ?? []) rows.find((r) => r.dataset.id === id)?.remove();
      thread.querySelector(".typing")?.remove();
      if (!thread.querySelector(".seenmark")) {
        const last = [...thread.querySelectorAll(".entry.it[data-seen]")].at(-1);
        if (last) seenMark(last.dataset.id, Number(last.dataset.seen));
      }
    } else if (e.type === "stopped") hint(say("brainStopped"));
    else if (e.type === "progress" && (e.kind === "waiting" || e.kind === "resumed")) {
      const how = taskLines.get(e.task)?.lastChild?.firstChild;
      if (how)
        how.textContent =
          say(e.kind === "waiting" ? "brainTask_waiting" : "brainTask_running") +
          (e.kind === "waiting" && [e.text, e.session].some(Boolean) ? " (" + [e.text, e.session].filter(Boolean).join(" · ") + ")" : "");
    } else if (e.type === "wiped") return location.reload();
    else if (e.type === "state") state = e.state;
    else if (e.type === "thinking") {
      if (e.on && !thinking) thinkingFrom = Date.now();
      thinking = e.on;
      if (!e.on) {
        clearTimeout(penDown);
        writing = false;
      }
      fit();
    } else if (e.type === "error") problem(e.text);
    if (["message", "learned", "intention", "state", "manner", "look"].includes(e.type)) reload();
    // Inside DSH, the panel that manages memory shows the same store: it is told when something here changed it, so that it does not go on showing what was already settled.
    if (e.type === "learned" && framed) parent.postMessage({ asteme: "changed" }, "*");
    paint();
    if (follow) down();
    // A reply that has just come is read aloud when that is asked for: always, or (as it starts out) when the user spoke theirs. Not to a page nobody is looking at.
    if (readFresh) {
      const id = readFresh,
        mode = look.aloud ?? "spoke";
      readFresh = null;
      if (document.visibilityState === "visible" && !spaceOn && (mode === "always" || (mode === "spoke" && answerAloud))) {
        answerAloud = false;
        void aloud(id, true);
      }
    }
  };
};
const newest = $("newest"),
  away = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 80;
const browse = () => {
  const on = away();
  newest.classList.toggle("on", on);
  newest.tabIndex = on ? 0 : -1;
  if (!on) newest.classList.remove("fresh");
};
scroller.addEventListener("scroll", browse, { passive: true });
newest.addEventListener("click", () => {
  scroller.scrollTo({ top: scroller.scrollHeight, behavior: calm ? "auto" : "smooth" });
  box.focus({ preventScroll: true });
});
const box = $("box");
