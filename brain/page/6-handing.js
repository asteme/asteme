// --- What goes with the words: files handed over, and words that were spoken ---
let held = [],
  hintTimer;
// Copying: the clipboard as it is asked for now; and where a frame is not let use it, the older way, through a field that is selected and copied.
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* not allowed here */
  }
  const t = el("textarea");
  t.value = text;
  t.setAttribute("readonly", "");
  t.style.cssText = "position:fixed;left:-99rem;top:0;opacity:0";
  document.body.append(t);
  const had = document.activeElement;
  t.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    /* not here either */
  }
  t.remove();
  had?.focus?.({ preventScroll: true });
  if (!ok) throw new Error("copy");
};
const hint = (text) => {
  $("hint").textContent = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    $("hint").textContent = "";
  }, 7000);
};
const ready = () => !!box.value.trim() || held.some((f) => f.id);
// One button on the right: the microphone while there is nothing to send, and send as soon as there is.
const fit = () => {
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 192) + "px";
  const can = ready(),
    stoppable = thinking && !can,
    voice = hearing !== null && !can && !stoppable;
  $("send").classList.toggle("idle", !can);
  $("halt").hidden = !stoppable;
  $("mic").hidden = !voice;
  $("send").hidden = voice || stoppable;
};
const drawHeld = () => {
  $("files").replaceChildren(
    ...held.map((f) => {
      const chip = el("div", "chip" + (f.url ? " pic" : "") + (f.id ? "" : " loading"));
      chip.title = f.name;
      if (f.url) {
        const i = el("img");
        i.src = f.url;
        i.alt = f.name;
        chip.append(i);
      } else {
        const what = el("div", "what");
        what.append(el("b", null, f.name), el("span", "muted", SIZE(f.size)));
        chip.append(what);
      }
      const x = el("button", "x");
      x.type = "button";
      x.innerHTML = svg(CROSS, 10, 2.6);
      x.setAttribute("aria-label", say("brainFileRemove", { name: f.name }));
      x.onclick = () => {
        if (f.url) URL.revokeObjectURL(f.url);
        held = held.filter((h) => h !== f);
        drawHeld();
        box.focus();
      };
      chip.append(x);
      return chip;
    }),
  );
  fit();
};
// A file goes to Asteme's own folder on this computer as soon as it is chosen; the message then carries it by its id.
const hand = async (list) => {
  for (const file of [...list]) {
    if (held.length >= 6) {
      hint(say("brainFileMany"));
      break;
    }
    if (file.size > 25000000) {
      hint(say("brainFileBig", { name: file.name }));
      continue;
    }
    if (!file.size) continue;
    const f = { name: file.name || "file", size: file.size, type: file.type, url: PICTURE.test(file.type) ? URL.createObjectURL(file) : null };
    held.push(f);
    drawHeld();
    try {
      const r = await fetch(api("/api/file"), {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name) },
        body: file,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error ?? "Failed");
      f.id = v.id;
    } catch (e) {
      held = held.filter((h) => h !== f);
      hint(say("brainFileFailed", { name: f.name }) + " " + e.message);
    }
    drawHeld();
  }
};
$("attach").onclick = () => $("pick").click();
$("pick").onchange = () => {
  void hand($("pick").files);
  $("pick").value = "";
};
box.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) {
    e.preventDefault();
    void hand(files);
  }
});
const carries = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
addEventListener("dragover", (e) => {
  if (carries(e)) {
    e.preventDefault();
    $("composer").classList.add("over");
  }
});
addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) $("composer").classList.remove("over");
});
addEventListener("drop", (e) => {
  if (!carries(e)) return;
  e.preventDefault();
  $("composer").classList.remove("over");
  void hand(e.dataTransfer.files);
});
// Speaking instead of typing. The recognizer is the host's own (DSH's voice
// input); the sound goes to it on this computer, comes back as words in the
// box, and is not kept. Nothing is sent until the user sends it.
let rec = null;
const wav = (samples) => {
  const b = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(b),
    w = (o, t) => {
      for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
    };
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(b);
};
// Inside DSH on the desktop a page in a frame is not given the microphone at
// all: DSH gives it to its own window only. There the recording is made by
// the panel around this page, on this page's word, and handed in when it is
// stopped. Anywhere else the page records for itself.
const framed = !!TOKEN && parent !== window;
let hostSays = null;
addEventListener("message", (e) => {
  if (e.source !== parent || e.data?.asteme !== "mic") return;
  const m = e.data;
  if (m.state === "level") {
    if (rec?.host) {
      rec.levels.push(Math.min(1, Number(m.level) || 0));
      if (rec.levels.length > 240) rec.levels.shift();
    }
  } else hostSays?.(m);
});
const askHost = (what, ms) =>
  new Promise((resolve) => {
    const late = setTimeout(() => {
      hostSays = null;
      resolve(null);
    }, ms);
    hostSays = (m) => {
      clearTimeout(late);
      hostSays = null;
      resolve(m);
    };
    if (what) parent.postMessage({ asteme: "mic", do: what }, "*");
  });
const endRec = async (keep) => {
  const r = rec;
  if (!r) return;
  rec = null;
  clearInterval(r.tick);
  cancelAnimationFrame(r.frame);
  if (!r.host) {
    r.proc.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ac.close();
  }
  $("rec").hidden = true;
  $("row").hidden = false;
  fit();
  if (!keep) {
    if (r.host) parent.postMessage({ asteme: "mic", do: "cancel" }, "*");
    return box.focus();
  }
  let all,
    rate = r.rate;
  if (r.host) {
    const m = await askHost("stop", 8000);
    if (m?.state !== "done" || !(m.pcm instanceof ArrayBuffer)) {
      hint(say("brainVoiceFailed"));
      return box.focus();
    }
    all = new Float32Array(m.pcm);
    rate = m.rate || rate;
  } else {
    const total = r.chunks.reduce((a, c) => a + c.length, 0);
    all = new Float32Array(total);
    let o = 0;
    for (const c of r.chunks) {
      all.set(c, o);
      o += c.length;
    }
  }
  const n = all.length;
  if (n < rate * 0.3) {
    hint(say("brainVoiceNothing"));
    return box.focus();
  }
  r.rate = rate;
  box.disabled = true;
  box.placeholder = say("brainVoiceWriting");
  try {
    const off = new OfflineAudioContext(1, Math.ceil((n * 16000) / r.rate), 16000),
      buffer = off.createBuffer(1, n, r.rate);
    buffer.copyToChannel(all, 0);
    const source = off.createBufferSource();
    source.buffer = buffer;
    source.connect(off.destination);
    source.start();
    const out = (await off.startRendering()).getChannelData(0);
    const res = await fetch(api("/api/hear"), { method: "POST", headers: { "content-type": "audio/wav" }, body: wav(out) }),
      v = await res.json();
    if (!res.ok) throw new Error(v.error ?? "Failed");
    const heard = String(v.text ?? "").trim();
    if (!heard) hint(say("brainVoiceNothing"));
    else {
      byVoice = true;
      const at = box.selectionStart ?? box.value.length,
        before = box.value.slice(0, at),
        after = box.value.slice(box.selectionEnd ?? at);
      box.value = before + (before && !/\s$/.test(before) ? " " : "") + heard + after;
      drafted();
    }
  } catch (e) {
    hint(say("brainVoiceFailed") + " " + e.message);
  } finally {
    box.disabled = false;
    box.placeholder = waitingWords;
    fit();
    box.focus();
  }
};
const startRec = async () => {
  if (rec) return;
  hush();
  // Recognition is set up in DSH, where its model is downloaded. Until then the button says where.
  if (!["ready", "standby"].includes(hearing))
    return hint(say(["downloading", "checking", "loading", "waking"].includes(hearing) ? "brainVoicePreparing" : "brainVoiceSetup"));
  // The panel is asked first. It says at once that it heard, and then how the asking of the person went; a panel that says nothing is an older one, and the page tries for itself.
  let r = null;
  if (framed) {
    const first = await askHost("start", 1500),
      went = first?.state === "asked" ? await askHost(null, 120000) : first;
    if (went?.state === "on") r = rec = { host: true, rate: went.rate || 48000, t0: performance.now(), levels: [] };
    else if (went) return hint(say("brainVoiceNoMic"));
  }
  if (!r) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      return hint(say("brainVoiceNoMic"));
    }
    const ac = new (window.AudioContext || window.webkitAudioContext)(),
      source = ac.createMediaStreamSource(stream),
      proc = ac.createScriptProcessor(4096, 1, 1),
      quiet = ac.createGain();
    quiet.gain.value = 0;
    r = rec = { stream, ac, proc, chunks: [], rate: ac.sampleRate, t0: performance.now(), levels: [] };
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      r.chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i];
      r.levels.push(Math.min(1, Math.sqrt(sum / (d.length / 8)) * 5));
      if (r.levels.length > 240) r.levels.shift();
    };
    source.connect(proc);
    proc.connect(quiet);
    quiet.connect(ac.destination);
  }
  $("row").hidden = true;
  $("rec").hidden = false;
  $("recok").focus();
  const clock = () => {
    const sec = Math.floor((performance.now() - r.t0) / 1000);
    $("rectime").textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    if (sec >= 120) void endRec(true);
  };
  clock();
  r.tick = setInterval(clock, 500);
  // The level drawn is the level measured: one bar for each slice of sound heard.
  const c = $("level"),
    k = c.getContext("2d");
  const level = () => {
    if (rec !== r) return;
    const dpr = devicePixelRatio || 1,
      w = c.clientWidth,
      h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    k.clearRect(0, 0, w, h);
    k.fillStyle = getComputedStyle(document.body).color;
    const bar = 2.5,
      gap = 3.5,
      count = Math.floor(w / (bar + gap));
    for (let i = 0; i < count; i++) {
      const v = r.levels[r.levels.length - count + i] ?? 0,
        bh = Math.max(2.5, v * h);
      k.globalAlpha = 0.3 + 0.6 * v;
      k.beginPath();
      if (k.roundRect) k.roundRect(i * (bar + gap), (h - bh) / 2, bar, bh, 1.25);
      else k.rect(i * (bar + gap), (h - bh) / 2, bar, bh);
      k.fill();
    }
    r.frame = requestAnimationFrame(level);
  };
  level();
};
