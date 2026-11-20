// --- Keys, the look of the page, and starting -------------------------------------
// While it thinks and there is nothing to send, the button on the right stops it: what was said is kept, and nothing is answered.
$("halt").onclick = async () => {
  $("halt").disabled = true;
  try {
    await post("/api/stop", {});
  } catch (e) {
    problem(e.message);
  } finally {
    setTimeout(() => {
      $("halt").disabled = false;
    }, 1500);
  }
};
$("mic").onclick = () => void startRec();
$("recok").onclick = () => void endRec(true);
$("recno").onclick = () => void endRec(false);
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rec) {
    e.preventDefault();
    void endRec(false);
  }
});
// What is being written is not lost. It is kept on this device as it is typed, so that leaving the page and coming back finds it where it was; and every change to it can be
// taken back and put again (Ctrl or Cmd with Z, and with Shift or Y), whether it was typed, pasted, spoken in, or wiped out by a slip of the hand. The browser's own
// undo forgets everything whenever the page itself sets the words (what was heard, a send that failed), so the steps are kept here: one for each burst of typing, and
// one of its own for anything that changes a lot at once.
const DRAFT = "asteme-draft";
let past = [],
  ahead = [],
  settled = "",
  lastChange = 0;
// Kept twice: in this browser at once, and with the store a moment later. The store's copy is the one that outlives the program being closed, restarted or crashing
// (inside DSH the page's address changes with each start, and what a browser keeps is kept by address).
let draftTimer = null,
  draftSaid = null;
const keepDraft = () => {
  try {
    if (box.value) localStorage.setItem(DRAFT, box.value);
    else localStorage.removeItem(DRAFT);
  } catch {
    /* not kept on this device */
  }
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const text = box.value;
    if (text === draftSaid) return;
    draftSaid = text;
    post("/api/draft", { text }).catch(() => {
      draftSaid = null;
    });
  }, 500);
};
// What was kept with the store is put back when the page is first read, if nothing nearer was kept here.
const draftFrom = (text) => {
  if (typeof text !== "string" || !text || box.value) return;
  box.value = settled = draftSaid = text;
  fit();
};
const drafted = () => {
  const now = box.value;
  if (now !== settled) {
    const t = Date.now();
    if (!past.length || t - lastChange > 700 || Math.abs(now.length - settled.length) > 8) {
      past.push(settled);
      if (past.length > 300) past.shift();
    }
    lastChange = t;
    settled = now;
    ahead = [];
    keepDraft();
  }
  fit();
};
const step = (from, to) => {
  if (!from.length) return;
  to.push(box.value);
  box.value = settled = from.pop();
  lastChange = 0;
  keepDraft();
  fit();
};
// Sent, the words are the conversation's and no longer a draft: there is nothing to go back to.
const draftSent = () => {
  past = [];
  ahead = [];
  settled = box.value;
  keepDraft();
};
try {
  const kept = localStorage.getItem(DRAFT);
  if (kept && !box.value) box.value = settled = kept;
} catch {
  /* nothing kept */
}
// A new page: one press, nothing asked, since nothing is lost and one press joins it again.
$("fresh").title = say("brainFresh");
$("fresh").setAttribute("aria-label", say("brainFresh"));
$("fresh").onclick = async () => {
  try {
    await post("/api/fresh", { on: true });
    document.body.classList.remove("showbefore");
    hint(say("brainFreshDone"));
    box.focus();
  } catch (e) {
    problem(e.message);
  }
};
box.addEventListener("input", drafted);
fit();
box.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("form").requestSubmit();
  } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    if (e.shiftKey || e.key === "y" || e.key === "Y") step(ahead, past);
    else step(past, ahead);
  }
});
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = box.value.trim(),
    files = held.filter((f) => f.id);
  if (!text && !files.length) return;
  if (held.some((f) => !f.id)) return hint(say("brainFileWait"));
  const kept = held;
  box.value = "";
  draftSent();
  held = [];
  drawHeld();
  // Whoever speaks is answered aloud, if that is how they have it; starting to say something new ends what was being read.
  hush();
  answerAloud = byVoice;
  byVoice = false;
  const about = answeringTo;
  answering(null);
  try {
    await post("/api/say", { text, files: files.map((f) => f.id), ...(about ? { replyTo: about.id } : {}) });
    kept.forEach((f) => f.url && URL.revokeObjectURL(f.url));
  } catch (err) {
    problem(err.message);
    box.value = text;
    drafted();
    held = kept;
    drawHeld();
    if (about) answering({ id: about.id, role: about.role, text: about.words });
  }
});
$("spaceback").onclick = leaveSpace;
$("spacelist").hidden = !framed;
$("spacelist").textContent = say("brainGoList");
$("spacelist").onclick = () => {
  leaveSpace();
  go("memory");
};
$("find").placeholder = say("brainSpaceFind");
$("find").setAttribute("aria-label", say("brainSpaceFind"));
$("find").addEventListener("input", seek);
// In the search box the arrows go through what was found, and Enter opens the marked one (the first, if none is marked).
$("find").addEventListener("keydown", (e) => {
  const by = gather ? { ArrowDown: 1, ArrowUp: -1, PageDown: wheel.span * 2, PageUp: -wheel.span * 2 }[e.key] : 0;
  if (by) {
    e.preventDefault();
    gatherPick(by);
  } else if (e.key === "Enter" && gather) {
    e.preventDefault();
    const id = gather.ids[gather.at];
    if (id) void openMemory(id);
  } else if (e.key === "Enter" && found?.first) {
    e.preventDefault();
    flyTo(found.first);
  }
});
$("spacelevel").textContent = say("brainSpaceLevel");
$("spacelevel").onclick = upright;
addEventListener("resize", () => {
  if (gather) lay();
});
$("face").onclick = () => openSelf();
$("name").onclick = openSelf;
$("state").onclick = openActivity;
$("soon").onclick = openActivity;
$("count").onclick = () => openAll();
// One of a few: the chosen one is filled, and choosing moves the fill without drawing the sheet again.
// A few choices stand side by side; more than four (a model may offer six depths of thinking) would run off the sheet, so they are a list to pick from instead.
const choice = (options, now, pick, label) => {
  if (options.length > 4) {
    const list = el("select");
    list.setAttribute("aria-label", label);
    for (const [value, text] of options) {
      const o = el("option", null, text);
      o.value = String(options.findIndex(([v]) => v === value));
      o.selected = value === now;
      list.append(o);
    }
    if (!options.some(([v]) => v === now)) list.selectedIndex = -1;
    list.onchange = () => pick(options[Number(list.value)][0]);
    return list;
  }
  const box = el("div", "seg");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", label);
  for (const [value, text] of options) {
    const b = el("button", value === now ? "on" : "", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(value === now));
    b.onclick = () => {
      for (const o of box.children) {
        const on = o === b;
        o.classList.toggle("on", on);
        o.setAttribute("aria-pressed", String(on));
      }
      pick(value);
    };
    box.append(b);
  }
  return box;
};
const TONES = ["#3a4a66", "#2f5d50", "#6b4636", "#5b3f66", "#6a5a2e"];
// A row for one kind of ground: a round patch for its colour and a second for the letters on it, each opening the device's own picker; and the way back to Asteme's own once either is chosen.
const well = (label, value, shown, set, letters) => {
  const w = el("label", "tone pick" + (letters ? " letters" : "") + (value ? " on" : "")),
    input = el("input");
  input.type = "color";
  input.value = COLOUR(value) ? value : shown;
  input.setAttribute("aria-label", label);
  w.title = label;
  if (letters) {
    w.textContent = "A";
    w.style.color = COLOUR(value) ? value : shown;
  } else w.style.setProperty("--tone", COLOUR(value) ? value : shown);
  input.onchange = () => set(input.value);
  w.append(input);
  return w;
};
const patch = (label, fill, letters, reset) => {
  const row = el("div", "tonerow");
  row.append(
    well(label, fill.value, fill.shown, fill.set),
    el("span", null, label),
    well(label + ": " + say("brainLetters"), letters.value, letters.shown, letters.set, true),
    fill.value || letters.value ? button(say("brainReset"), reset, "bare muted") : "",
  );
  return row;
};
const openLook = () => {
  const send = async (patchOf, again = true) => {
    try {
      look = await post("/api/look", patchOf);
      applyLook(look);
      if (again) openLook();
    } catch (e) {
      problem(e.message);
    }
  };
  // Looks: as the host has it, white, black, and any the user saved. One press puts all its colours on.
  const now = {
      ground: look.ground || "auto",
      its: look.its || "",
      mine: look.accent || "",
      ink: look.ink || "",
      itsInk: look.itsInk || "",
      mineInk: look.mineInk || "",
    },
    same = (t) => ["its", "mine", "ink", "itsInk", "mineInk"].every((k) => (t[k] || "") === now[k]) && (t.ground || "auto") === now.ground;
  const looks = el("div", "looks"),
    saved = look.themes ?? [];
  const lookOf = (name, t, drop) => {
    const b = el("button", "lookchip" + (same(t) ? " on" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", String(same(t)));
    const dot = el("i");
    dot.style.background =
      t.ground === "white"
        ? "#ffffff"
        : t.ground === "black"
          ? "#151517"
          : COLOUR(t.ground)
            ? t.ground
            : "linear-gradient(135deg, #ffffff 50%, #151517 50%)";
    if (COLOUR(t.mine)) dot.style.boxShadow = `inset 0 0 0 .22rem ${t.mine}`;
    b.append(dot, el("span", null, name));
    b.onclick = () =>
      send({
        ground: t.ground || "auto",
        its: t.its || "",
        accent: t.mine || "",
        ink: t.ink || "",
        itsInk: t.itsInk || "",
        mineInk: t.mineInk || "",
      });
    if (!drop) return b;
    const wrap = el("span", "lookwrap"),
      x = el("button", "lookdrop", "×");
    x.type = "button";
    x.title = say("brainLookDrop", { name });
    x.setAttribute("aria-label", x.title);
    x.onclick = drop;
    wrap.append(b, x);
    return wrap;
  };
  looks.append(
    lookOf(say("brainLookAuto"), { ground: "auto" }),
    lookOf(say("brainLookWhite"), { ground: "white" }),
    lookOf(say("brainLookBlack"), { ground: "black" }),
    ...saved.map((t) => lookOf(t.name, t, () => send({ themes: saved.filter((o) => o.name !== t.name) }))),
  );
  const keepRow = el("div", "keeprow"),
    keepName = el("input");
  keepName.placeholder = say("brainLookName");
  keepName.maxLength = 30;
  keepName.setAttribute("aria-label", say("brainLookName"));
  const keep = button(say("brainLookSave"), () => {
    const name = keepName.value.trim();
    if (!name) return keepName.focus();
    void send({ themes: [...saved.filter((o) => o.name !== name), { name, ...now }] });
  });
  keepName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      keep.click();
    }
  });
  keepRow.append(keepName, keep);
  const css = getComputedStyle(ROOT),
    hexOf = (v, fallback) => {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = fallback;
      c.fillStyle = v;
      return /^#[0-9a-f]{6}$/i.test(c.fillStyle) ? c.fillStyle : fallback;
    };
  const inkNow = hexOf(css.getPropertyValue("--ink").trim(), "#f9fafb"),
    light = ROOT.dataset.theme === "light";
  const colours = [
    patch(
      say("brainGround"),
      {
        value: COLOUR(look.ground) ? look.ground : "",
        shown: hexOf(css.getPropertyValue("--bg").trim(), "#151517"),
        set: (v) => send({ ground: v }),
      },
      { value: look.ink || "", shown: inkNow, set: (v) => send({ ink: v }) },
      () => send({ ground: "auto", ink: "" }),
    ),
    patch(
      say("brainItsTone"),
      { value: look.its || "", shown: light ? "#f2f2f3" : "#28282a", set: (v) => send({ its: v }) },
      { value: look.itsInk || "", shown: inkNow, set: (v) => send({ itsInk: v }) },
      () => send({ its: "", itsInk: "" }),
    ),
    patch(
      say("brainAccent"),
      { value: look.accent || "", shown: light ? "#dfdfe0" : "#3f3f42", set: (v) => send({ accent: v }) },
      { value: look.mineInk || "", shown: inkNow, set: (v) => send({ mineInk: v }) },
      () => send({ accent: "", mineInk: "" }),
    ),
  ];
  // Letters: any typeface this device has, and any size.
  const font = el("input");
  font.value = look.font ?? "";
  font.placeholder = say("brainFontHint");
  font.setAttribute("aria-label", say("brainFont"));
  font.autocomplete = "off";
  font.spellcheck = false;
  // The typefaces to choose from, each written in itself. The browser is asked first; where it will not say (some desktop shells refuse the question),
  // the machine Asteme runs on gives the names it has and a few that are common everywhere, and only those this screen can really draw are kept.
  const fonts = el("div", "fontlist");
  fonts.hidden = true;
  let fontNames = [];
  const KNOWN = [
    "Yu Gothic UI",
    "Yu Gothic",
    "Yu Mincho",
    "Meiryo",
    "Meiryo UI",
    "BIZ UDPGothic",
    "BIZ UDGothic",
    "BIZ UDPMincho",
    "MS PGothic",
    "MS Gothic",
    "MS Mincho",
    "UD Digi Kyokasho N-R",
    "Segoe UI",
    "Segoe UI Variable",
    "Calibri",
    "Cambria",
    "Candara",
    "Consolas",
    "Constantia",
    "Corbel",
    "Georgia",
    "Tahoma",
    "Verdana",
    "Trebuchet MS",
    "Arial",
    "Times New Roman",
    "Courier New",
    "Cascadia Code",
    "Cascadia Mono",
    "Bahnschrift",
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "Microsoft JhengHei",
    "SimSun",
    "SimHei",
    "DengXian",
    "KaiTi",
    "FangSong",
    "Malgun Gothic",
    "Hiragino Sans",
    "Hiragino Kaku Gothic ProN",
    "Hiragino Mincho ProN",
    "Hiragino Maru Gothic ProN",
    "YuGothic",
    "YuMincho",
    "Helvetica Neue",
    "Helvetica",
    "Avenir",
    "Avenir Next",
    "Futura",
    "Gill Sans",
    "Optima",
    "Palatino",
    "Baskerville",
    "Didot",
    "Menlo",
    "Monaco",
    "SF Pro Text",
    "PingFang SC",
    "PingFang TC",
    "Songti SC",
    "Heiti SC",
    "Apple SD Gothic Neo",
    "Noto Sans",
    "Noto Serif",
    "Noto Sans JP",
    "Noto Serif JP",
    "Noto Sans CJK JP",
    "Noto Serif CJK JP",
    "Noto Sans SC",
    "Noto Sans CJK SC",
    "Noto Sans KR",
    "Noto Sans Mono",
    "Roboto",
    "Roboto Mono",
    "Inter",
    "Ubuntu",
    "Cantarell",
    "DejaVu Sans",
    "DejaVu Serif",
    "DejaVu Sans Mono",
    "Liberation Sans",
    "Liberation Serif",
    "IPAGothic",
    "IPAPGothic",
    "IPAMincho",
    "IPAexGothic",
    "IPAexMincho",
    "TakaoGothic",
    "VL Gothic",
    "M PLUS 1p",
    "M PLUS Rounded 1c",
    "Source Han Sans",
    "Source Han Serif",
    "Source Sans 3",
    "Source Serif 4",
    "Source Code Pro",
    "Fira Sans",
    "Fira Code",
    "JetBrains Mono",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Zen Kaku Gothic New",
    "Zen Maru Gothic",
    "Sawarabi Gothic",
    "Kosugi Maru",
    "LXGW WenKai",
  ];
  // A typeface this screen has is drawn differently from at least one of the three it would fall back to.
  const drawable = (names) => {
    const c = document.createElement("canvas").getContext("2d"),
      text = "mmmmmmmmlli 0123 あ永 Wj",
      bases = ["monospace", "serif", "sans-serif"],
      plain = bases.map((b) => {
        c.font = "72px " + b;
        return c.measureText(text).width;
      });
    return names.filter((n) => {
      const q = '"' + n.replace(/["\\]/g, "") + '"';
      return bases.some((b, i) => {
        c.font = "72px " + q + ", " + b;
        return c.measureText(text).width !== plain[i];
      });
    });
  };
  const listFonts = () => {
    const want = font.value.trim().toLowerCase(),
      now = (look.font ?? "").toLowerCase(),
      shown = fontNames.filter((n) => !want || want === now || n.toLowerCase().includes(want));
    fonts.replaceChildren(
      ...shown.map((n) => {
        const b = el("button", n.toLowerCase() === now ? "on" : null, n);
        b.type = "button";
        b.style.fontFamily = '"' + n.replace(/["\\]/g, "") + '", system-ui, sans-serif';
        b.onclick = () => {
          font.value = n;
          for (const o of fonts.children) o.classList.toggle("on", o === b);
          send({ font: n }, false);
        };
        return b;
      }),
    );
    fonts.hidden = !fontNames.length;
  };
  font.oninput = () => {
    if (fontNames.length) listFonts();
  };
  font.onchange = () => send({ font: font.value.trim() }, false);
  font.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      font.blur();
    }
  });
  const fontRow = el("div", "acts");
  fontRow.append(
    button(say("brainFontPick"), async () => {
      hint(say("brainFontLooking"));
      let names = [];
      try {
        if (typeof window.queryLocalFonts === "function") names = [...new Set((await window.queryLocalFonts()).map((f) => f.family))];
      } catch {
        /* refused here: the other way is below */
      }
      if (!names.length) {
        let told = [];
        try {
          told = (await get("/api/fonts")).names ?? [];
        } catch {
          /* without it there are still the common ones */
        }
        await new Promise((r) => setTimeout(r, 30));
        names = drawable([...new Set([...told, ...KNOWN])]);
      }
      fontNames = names.sort((a, b) => a.localeCompare(b));
      if (!fontNames.length) return hint(say("brainFontNone"));
      listFonts();
      fonts.querySelector(".on")?.scrollIntoView({ block: "nearest" });
      hint(say("brainFontFound", { n: fontNames.length }));
    }),
  );
  if (look.font) fontRow.append(button(say("brainReset"), () => send({ font: "" }), "bare muted"));
  const px = look.px ?? { s: 14.5, l: 18 }[look.size] ?? 16,
    size = el("label", "slide sized"),
    sizeNow = el("b", null, px + " px"),
    range = el("input");
  range.type = "range";
  range.min = 12;
  range.max = 24;
  range.step = 0.5;
  range.value = px;
  range.setAttribute("aria-label", say("brainSize"));
  range.oninput = () => {
    sizeNow.textContent = range.value + " px";
    document.body.style.fontSize = range.value + "px";
  };
  range.onchange = () => send({ px: Number(range.value) }, false);
  size.append(sizeNow, range);
  const sky = choice(
    LEVELS.map((l) => [l, say("brainSky_" + l)]),
    level,
    setLevel,
    say("brainSky"),
  );
  const pick = el("input");
  pick.type = "file";
  pick.accept = "image/*";
  pick.hidden = true;
  pick.onchange = () => {
    const f = pick.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = async () => {
      const c = document.createElement("canvas"),
        k = Math.min(1, 1600 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      await send({ wall: c.toDataURL("image/jpeg", 0.8) });
    };
    img.src = URL.createObjectURL(f);
  };
  const slide = (label, key, max, step, value) => {
    const l = el("label", "slide", label),
      i = el("input");
    i.type = "range";
    i.min = 0;
    i.max = max;
    i.step = step;
    i.value = value;
    i.oninput = () => {
      applyLook({ ...look, [key]: Number(i.value) });
    };
    i.onchange = () => send({ [key]: Number(i.value) }, false);
    l.append(i);
    return l;
  };
  const wallRow = el("div", "acts");
  wallRow.append(
    pick,
    button(say("brainChoose"), () => pick.click()),
    look.wall ? button(say("brainWallNone"), () => send({ wall: "" }), "bare muted") : "",
  );
  // Inside DSH the same conversation can be given a window of its own.
  const own =
    TOKEN && parent !== window
      ? button(
          say("talkWindow"),
          () => {
            window.open(location.origin + "/?token=" + TOKEN, "_blank", "noopener");
          },
          "bare muted",
        )
      : null;
  if (own) own.style.marginTop = "1.6rem";
  sheet(
    say("brainSettings"),
    [
      settingsTabs("look"),
      el("h4", "group", say("brainGroupColour")),
      el("h3", null, say("brainLooks")),
      looks,
      keepRow,
      el("h3", null, say("brainColours")),
      ...colours,
      el("h3", null, say("brainWall")),
      wallRow,
      look.wall ? slide(say("brainWallDim"), "dim", 0.9, 0.05, look.dim ?? 0.45) : null,
      look.wall ? slide(say("brainWallBlur"), "blur", 24, 1, look.blur ?? 0) : null,
      el("h4", "group", say("brainGroupText")),
      el("h3", null, say("brainFont")),
      font,
      fonts,
      fontRow,
      el("h3", null, say("brainSize")),
      size,
      name ? el("h3", null, say("brainNameShow")) : null,
      name
        ? choice(
            [
              [true, say("brainShown")],
              [false, say("brainHidden")],
            ],
            look.showName !== false,
            (v) =>
              send({ showName: v }, false).then(() => {
                $("name").hidden = !name || look.showName === false;
                for (const m of document.querySelectorAll(".entry.it .meta"))
                  m.textContent = [look.showName === false ? "" : name, m.textContent.split(" · ").at(-1)].filter(Boolean).join(" · ");
              }),
            say("brainNameShow"),
          )
        : null,
      el("h4", "group", say("brainGroupSky")),
      el("h3", null, say("brainSky")),
      sky,
      el("p", "note muted", say("brainSpaceHow")),
      el("h3", null, say("brainComet")),
      choice(
        [
          [true, say("brainComet_on")],
          [false, say("brainComet_off")],
        ],
        look.comet !== false,
        (v) => send({ comet: v }, false),
        say("brainComet"),
      ),
      // Only where the device asks for less movement is there anything to choose: whether this page follows it, or moves all the same. It is kept on this device, as the device's own setting is.
      ...(reduce
        ? [
            el("h3", null, say("brainMotion")),
            choice(
              [
                [false, say("brainMotion_device")],
                [true, say("brainMotion_full")],
              ],
              moveAnyway,
              (v) => {
                try {
                  v ? localStorage.setItem("asteme-motion", "full") : localStorage.removeItem("asteme-motion");
                } catch {
                  /* not kept */
                }
                location.reload();
              },
              say("brainMotion"),
            ),
            el("p", "muted", say("brainMotionNote")),
          ]
        : []),
      el("h3", null, say("brainTips")),
      choice(
        [
          [true, say("brainTips_on")],
          [false, say("brainTips_off")],
        ],
        look.tips !== false,
        (v) => send({ tips: v }, false),
        say("brainTips"),
      ),
      el("p", "note muted", say("brainTipsNote")),
      // Among the stars a pull moves the sky or turns it, as the user likes; Shift does the other.
      el("h3", null, say("brainPull")),
      choice(
        ["move", "turn"].map((w) => [w, say("brainPull_" + w)]),
        look.pull ?? "move",
        (way) => send({ pull: way }, false),
        say("brainPull"),
      ),
      own,
      managed(),
    ],
    "settings:look",
  );
};
$("skyset").onclick = openLook;
// Inside DSH the panel that manages memory, copies and settings is one press away, and says so.
// The panel around the page may ask for the settings to be opened (from its own settings, where these are not).
addEventListener("message", (e) => {
  if (e.source === parent && e.data?.asteme === "settings") openLook();
});
document.body.classList.toggle("framed", !!TOKEN);
setLevel(level);
size();
listen();
