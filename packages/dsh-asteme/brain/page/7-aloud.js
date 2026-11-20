// --- Reading aloud ---------------------------------------------------------------
// A voice is lent by whoever started Asteme (DeepSeek's, through DSH, or a service named in its settings): it is sent the words it reads, and bills for them there.
// The device's own voice is not used: it read each language only if the device happened to have a voice for it, could not be chosen, and sounded like another assistant.
// Which voice reads: the user's choice; without one, the first lent where the words already go to its maker to be thought about; otherwise the user is asked, once, before anything is sent.
const voiceNow = () => {
  const v = look.voice;
  if (v && lent?.voices.includes(v)) return v;
  if (lent?.same) return lent.voices[0];
  return lent ? "ask" : null;
};
let reading = null,
  byVoice = false,
  answerAloud = false,
  readFresh = null;
const voiceKept = new Map();
const mark = (id, how) => {
  for (const b of document.querySelectorAll(".tool2.speak")) {
    const on = !!how && b.dataset.id === id;
    b.classList.toggle("on", on);
    b.classList.toggle("waiting", on && how === "waiting");
    b.parentNode.classList.toggle("on", on);
    b.innerHTML = svg(on ? STOP : SPEAKER, 15, 1.7);
    b.title = say(on ? "brainSpeakStop" : "brainSpeak");
    b.setAttribute("aria-label", b.title);
  }
};
const hush = () => {
  const r = reading;
  reading = null;
  if (r) {
    r.stop();
    mark(r.id, null);
  }
};
const aloud = async (id, quietly = false) => {
  if (reading?.id === id) return hush();
  hush();
  let way = voiceNow();
  if (!way) return quietly ? undefined : hint(say("brainSpeakNone") + (lentWhy === "no-key" ? " " + say("brainVoiceNoKey") : ""));
  // Not chosen yet, and the lent voice would be sent words it has not seen: by itself it is read only by the device; when the user pressed, they are asked which.
  if (way === "ask") return quietly ? undefined : chooseVoice(id);
  const mine = (reading = { id, stop() {} });
  mark(id, "waiting");
  const over = (why) => {
    if (reading !== mine) return;
    reading = null;
    mark(id, null);
    if (why && !quietly) hint(say("brainSpeakFailed") + " " + why);
  };
  try {
    // A lent voice: raw samples come as they are made, and are played as they come. What it has read once is kept in this page until it is closed, so reading the same reply again asks the service for nothing and costs nothing.
    const key = id + "\n" + way,
      had = voiceKept.get(key),
      stop = new AbortController();
    let res = null;
    if (!had) {
      res = await fetch(api("/api/speak?id=" + encodeURIComponent(id) + "&voice=" + way), { signal: stop.signal });
      if (!res.ok) {
        let why = "";
        try {
          why = (await res.json()).error ?? "";
        } catch {
          /* no reason given */
        }
        return over(why || String(res.status));
      }
    }
    // The sound comes in small pieces, some fifty a second. Played one by one through a context of another rate, each piece is fitted to that rate by itself and the joins buzz. So the context is made at the sound's own rate, and the pieces are gathered into stretches of a quarter second before they are played, each beginning exactly where the last ends.
    const rate = had?.rate ?? (Number(res.headers.get("x-audio-rate")) || 24000),
      Ctx = window.AudioContext || window.webkitAudioContext;
    let ac;
    try {
      ac = new Ctx({ sampleRate: rate });
    } catch {
      ac = new Ctx();
    }
    mine.stop = () => {
      stop.abort();
      void ac.close().catch(() => {});
    };
    if (reading !== mine) return mine.stop();
    let at = 0,
      odd = null,
      heard = 0,
      kept = [],
      keptN = 0;
    const whole = [];
    const play = () => {
      if (!keptN) return;
      const buffer = ac.createBuffer(1, keptN, rate),
        out = buffer.getChannelData(0);
      let o = 0;
      for (const part of kept) {
        for (let i = 0; i < part.length; i++) out[o + i] = part[i] / 32768;
        o += part.length;
      }
      kept = [];
      const n = keptN;
      keptN = 0;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.connect(ac.destination);
      // If the sound has fallen behind what was already played (a slow line), it goes on from now, not from the past.
      if (!heard) {
        at = ac.currentTime + 0.08;
        mark(id, "reading");
      } else if (at < ac.currentTime + 0.01) at = ac.currentTime + 0.03;
      src.start(at);
      at += n / rate;
      heard += n;
    };
    const take = (part) => {
      kept.push(part);
      keptN += part.length;
      if (keptN >= rate * (heard ? 0.25 : 0.12)) play();
    };
    if (had) for (const part of had.parts) take(part);
    else {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (reading !== mine) return;
        let bytes = value;
        if (odd) {
          bytes = new Uint8Array(odd.length + value.length);
          bytes.set(odd);
          bytes.set(value, odd.length);
          odd = null;
        }
        if (bytes.length % 2) {
          odd = bytes.slice(bytes.length - 1);
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        if (!bytes.length) continue;
        const n = bytes.length / 2,
          view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          part = new Int16Array(n);
        for (let i = 0; i < n; i++) part[i] = view.getInt16(i * 2, true);
        whole.push(part);
        take(part);
      }
    }
    play();
    // Nothing came, or it was cut off before a moment of sound: that is a reading that failed.
    if (heard < rate * 0.2) {
      mine.stop();
      return over(heard ? "" : "0");
    }
    // Kept whole only when it came whole; the oldest go first, past five minutes of sound in all.
    if (!had) {
      voiceKept.set(key, { rate, parts: whole, n: heard });
      let all = 0;
      for (const v of voiceKept.values()) all += v.n / v.rate;
      for (const k of voiceKept.keys()) {
        if (all <= 300 || voiceKept.size <= 1) break;
        const v = voiceKept.get(k);
        all -= v.n / v.rate;
        voiceKept.delete(k);
      }
    }
    setTimeout(
      () => {
        if (reading === mine) {
          void ac.close().catch(() => {});
          over();
        }
      },
      Math.max(0, (at - ac.currentTime) * 1000) + 150,
    );
  } catch (e) {
    if (e?.name !== "AbortError") over(e.message);
  }
};
const chooseVoice = (id) => {
  const box = $("choose"),
    pick = async (v) => {
      box.replaceChildren();
      try {
        look = await post("/api/look", { voice: v });
        applyLook(look);
        void aloud(id);
      } catch (e) {
        problem(e.message);
      }
    };
  box.replaceChildren(
    el("span", null, say("brainVoiceAsk")),
    ...lent.voices.map((v) => button(v[0].toUpperCase() + v.slice(1), () => pick(v))),
    button(say("cancel"), () => box.replaceChildren(), "bare muted"),
  );
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && reading && !rec && !sheetBox.classList.contains("on") && !spaceOn) {
    e.preventDefault();
    hush();
  }
});
