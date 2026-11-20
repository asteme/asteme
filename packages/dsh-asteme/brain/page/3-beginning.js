// --- The very beginning ---------------------------------------------------------
// A store with nothing in it has nobody in it yet. Before the conversation there is one scene, once: a name is asked for, what to call the person,
// and one thing to remember first. Each can be left empty, and the whole scene can be passed over. Then it is woken: the mark that will be its face
// is drawn and lit, it breathes once, and goes to its place at the top as the conversation appears. What was given to remember is said as the first
// message, so its first words are an answer; and when that has really been remembered, the first star falls into the empty sky. Nothing in the scene
// stands for a memory that is not there: the first star is the first memory, when there is one.
let wasBorn = true,
  toldStale = false;
const birth = (again = false) => {
  const stage = $("birth"),
    mark = $("birthmark"),
    svg = mark.querySelector("svg"),
    nameAt = $("birthname"),
    line = $("birthline"),
    note = $("birthnote"),
    field = $("birthfield"),
    acts = $("birthacts"),
    skip = $("birthskip"),
    move = $("birthmove");
  // Seen again, it is played with what it was given the first time; what is changed on the way is kept.
  const given = { name: again ? name : "", you: again ? you : "", manner: again ? toneNow : "" },
    had = { ...given };
  let at = 0,
    busy = false,
    over = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    real = !wasBorn;
  // The five stars of the mark stand for five things, and each is lit by the one thing it stands for and by nothing else: the middle one is Asteme itself, lit when the person
  // chooses to begin; the three around it are its name, the person, and how it is to speak, half lit while each is being written and lit when it is given; the last, which hangs
  // from the person's star, is the waking, lit by the press that wakes it. A star nothing was given for stays a ring until the lines are drawn, and is filled by the line that reaches it.
  const star = {
      it: mark.querySelector(".s1"),
      name: mark.querySelector(".s2"),
      you: mark.querySelector(".s0"),
      manner: mark.querySelector(".s3"),
      woken: mark.querySelector(".s4"),
    },
    ORDER = ["it", "name", "you", "manner", "woken"];
  const ripple = (c, wide) => {
    if (calm || !svg) return;
    const r = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    for (const a of ["cx", "cy", "r"]) r.setAttribute(a, c.getAttribute(a));
    r.setAttribute("class", "ripple" + (wide ? " wide" : ""));
    svg.append(r);
    r.addEventListener("animationend", () => r.remove());
  };
  const set = (key, how) => {
    const c = star[key];
    if (!c || (c.dataset.how ?? "") === how) return;
    c.dataset.how = how;
    c.style.animationDelay = "";
    c.classList.remove("tick");
    for (const k of ["near", "lit", "eased"]) c.classList.toggle(k, how === k);
    if (how === "lit") ripple(c, key === "woken");
    stage.style.setProperty("--lit", String(ORDER.filter((k) => ["lit", "eased"].includes(star[k]?.dataset.how)).length / 5));
  };
  const shine = () => {
    set("it", at >= 1 ? "lit" : "");
    set("name", at > 1 ? "lit" : at === 1 && given.name.trim() ? "near" : "");
    set("you", !given.you.trim() || at < 2 ? "" : at > 2 ? "lit" : "near");
    set("manner", given.manner.trim() && at === 3 ? "near" : "");
    set("woken", "");
  };
  // It opens out of the dark: the five rings come one after another, then the dotting between them, then the words.
  for (const r of mark.querySelectorAll(".ripple")) r.remove();
  for (const k of ORDER) {
    const c = star[k];
    if (!c) continue;
    delete c.dataset.how;
    c.classList.remove("near", "lit", "eased", "tick");
  }
  mark.className = "birthmark arriving";
  mark.style.transform = "";
  mark.querySelector("path")?.setAttribute("pathLength", "1");
  stage.className = "opening turning";
  stage.style.setProperty("--lit", "0");
  stage.hidden = false;
  ORDER.forEach((k, n) => {
    if (star[k]) star[k].style.animationDelay = 0.3 + n * 0.14 + "s";
  });
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("opening")));
  setTimeout(() => {
    mark.classList.remove("arriving");
    for (const k of ORDER) if (star[k]) star[k].style.animationDelay = "";
  }, 1900);
  nameAt.className = "birthname";
  nameAt.style.opacity = "";
  nameAt.textContent = given.name;
  nameAt.classList.toggle("unsaid", !!given.name);
  line.textContent = "";
  note.textContent = "";
  field.replaceChildren();
  acts.replaceChildren();
  // The conversation steps aside for the scene and the sky goes dark, the first time and when it is seen again; nothing under the scene can be pressed until it is over.
  document.body.classList.add("birthing");
  // Seen again, the first star is already in the sky. It is held unseen with the rest until the scene sends it on its way: left standing, it showed for a moment when
  // the dark lifted, went out, and came again.
  for (const [id, m] of stars) if (m.first) comets.set(id, { t0: Infinity, from: 0, first: true });
  skyHushTo = 1;
  kick();
  const end = async () => {
    over = true;
    // Anything still held unseen for the scene is let be seen.
    for (const [id, c] of comets) if (c.t0 === Infinity) comets.delete(id);
    document.body.classList.remove("birthing");
    skyHushTo = 0;
    kick();
    stage.classList.add("leaving");
    await wait(1100);
    stage.hidden = true;
    stage.className = "";
    box.focus();
  };
  // What it is told when it is woken. With a name given, being woken is the first thing it remembers, in words that say who woke it and what it was called. It says hello when the scene is over, so it is asked to wait that long.
  const keep = async () => {
    const n = given.name.trim(),
      y = given.you.trim(),
      m = given.manner.trim(),
      first =
        n && y
          ? say("brainBirthMemory", { name: n, you: y })
          : n
            ? say("brainBirthMemoryName", { name: n })
            : y
              ? say("brainBirthMemoryYou", { you: y })
              : "";
    try {
      await post("/api/self", {
        ...(real
          ? {
              born: true,
              firstMemory: first,
              firstWhy: say("brainBirthWhy"),
              language: document.documentElement.lang || "en",
              greetIn: first && level !== "off" ? (calm ? 8600 : 11600) : 3200,
            }
          : {}),
        ...(n !== name ? { name: n } : {}),
        ...(y !== you ? { userName: y } : {}),
        ...(m !== had.manner.trim() && (m || again) ? { tone: m } : {}),
      });
      return real && !!first;
    } catch (e) {
      problem(e.message);
      return false;
    }
  };
  const wake = async () => {
    busy = true;
    stage.classList.add("waking", "turning");
    mark.classList.remove("arriving");
    // What was given last is lit; then the press itself lights the last star, the one for this moment.
    at = 4;
    if (given.manner.trim()) {
      set("manner", "lit");
      await wait(650);
    }
    set("woken", "lit");
    await wait(950);
    field.replaceChildren();
    acts.replaceChildren();
    line.textContent = "";
    note.textContent = "";
    nameAt.textContent = "";
    mark.classList.add("waking");
    // The lines are drawn from star to star, and fill what they reach; then it breathes, and its name is said.
    await wait(2300);
    for (const k of ORDER) if (star[k]?.dataset.how !== "lit") set(k, "eased");
    await wait(500);
    mark.classList.add("alive");
    await wait(650);
    nameAt.className = "birthname said";
    nameAt.textContent = given.name.trim() || "Asteme";
    await wait(900);
    line.textContent = say("brainBirthAwake");
    stage.classList.remove("turning");
    await wait(3000);
    const kept = await keep();
    stage.classList.add("turning");
    nameAt.style.opacity = "0";
    await wait(350);
    // To its place: the mark becomes the face at the top, and what was dark is the sky again, still empty.
    const from = mark.getBoundingClientRect(),
      to = $("face").getBoundingClientRect(),
      origin = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    mark.classList.add("placed");
    if (!calm)
      mark.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(${Math.max(0.2, (to.height * 0.62) / from.height)})`;
    stage.classList.add("clear");
    await wait(1350);
    // Then the sky is read. If being woken was remembered (now, or the first time when this is seen again), that star leaves the place where it happened and goes up to the pole, whatever is chosen
    // for the stars that fall on other days; where less movement is asked for it comes to light where it stands. The conversation waits until it is there and has been said.
    try {
      await load();
    } catch {
      /* the conversation will say so */
    }
    const first = level !== "off" && (kept || !real) ? [...stars].find(([, m]) => m.first)?.[0] : null;
    if (first) {
      const t = performance.now();
      if (calm) {
        comets.delete(first);
        births.set(first, t);
        firstStar = { id: first, t0: t, calm: true };
      } else comets.set(first, { t0: t + 200, from: 0, first: true, ox: origin.x, oy: origin.y });
      kick();
      await wait(calm ? 5600 : 3200 + 5200);
    }
    await end();
  };
  const steps = [
    () => ({ words: say("brainBirthNobody"), small: say("brainBirthIntro"), go: say("brainBirthBegin") }),
    () => ({ words: say("brainBirthName"), small: say("brainBirthNameNote", { plain: "Asteme" }), ask: "name", go: say("brainBirthNext") }),
    () => ({ words: say("brainBirthYou"), small: say("brainBirthYouNote"), ask: "you", go: say("brainBirthNext") }),
    () => ({ words: say("brainBirthManner"), small: say("brainBirthMannerNote"), ask: "manner", go: say("brainBirthWake") }),
  ];
  // One step at a time, and one at a time only: a second press while a step is giving way to the next does nothing.
  const show = async (slow = 340) => {
    busy = true;
    stage.classList.add("turning");
    await wait(slow);
    if (over) return;
    const step = steps[at]();
    line.textContent = step.words;
    note.textContent = step.small;
    shine();
    let i = null;
    if (step.ask) {
      i = el("input");
      i.value = given[step.ask];
      i.setAttribute("aria-label", step.words);
      i.maxLength = step.ask === "manner" ? 300 : 60;
      i.autocomplete = "off";
      i.spellcheck = false;
      i.enterKeyHint = at === steps.length - 1 ? "done" : "next";
      i.oninput = () => {
        given[step.ask] = i.value;
        if (step.ask === "name") {
          nameAt.textContent = i.value;
          nameAt.classList.add("unsaid");
        }
        shine();
        const c = star[step.ask];
        if (c && i.value.trim() && !calm) {
          c.classList.remove("tick");
          void c.getBoundingClientRect();
          c.classList.add("tick");
        }
      };
      i.onkeydown = (e) => {
        if (e.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          next();
        } else if (e.key === "Escape" && at > 0) {
          e.preventDefault();
          e.stopPropagation();
          back();
        }
      };
      field.replaceChildren(i);
    } else field.replaceChildren();
    acts.replaceChildren(...(at > 0 ? [button(say("brainBirthBack"), back, "birthback")] : []), button(step.go, next, "birthgo"));
    stage.classList.remove("turning");
    busy = false;
    if (i) setTimeout(() => i.focus({ preventScroll: true }), calm ? 0 : 380);
  };
  const next = () => {
      if (busy || over) return;
      if (at >= steps.length - 1) return void wake();
      at++;
      void show();
    },
    back = () => {
      if (busy || over || at < 1) return;
      at--;
      void show();
    };
  // The way out is always at the foot. Passed over the first time, it is woken all the same, without the scene, and nothing is asked; seen again, it only closes.
  skip.textContent = say(again ? "brainClose" : "brainBirthSkip");
  skip.onclick = async () => {
    if (busy && stage.classList.contains("waking")) return;
    busy = true;
    if (!again) {
      try {
        await post("/api/self", { born: true, greet: false });
        wasBorn = true;
      } catch (e) {
        problem(e.message);
      }
    }
    await end();
  };
  // Where the device asks for less movement the scene is shown quietly, and says so, with the way to see it move: that is the person's to choose, here and in the settings.
  move.hidden = !calm;
  if (calm)
    move.replaceChildren(
      el("span", null, say("brainMotionNote")),
      button(
        say("brainMotionShow"),
        () => {
          try {
            localStorage.setItem("asteme-motion", "full");
            if (again) sessionStorage.setItem("asteme-again", "1");
          } catch {
            /* not kept: it stays quiet */
          }
          location.reload();
        },
        "bare muted",
      ),
    );
  // Before anything is asked, Enter begins, as the button does.
  stage.tabIndex = -1;
  stage.style.outline = "none";
  stage.focus({ preventScroll: true });
  stage.onkeydown = (e) => {
    if (e.key === "Enter" && at === 0 && e.target === stage) {
      e.preventDefault();
      next();
    }
  };
  void show(1500);
};
