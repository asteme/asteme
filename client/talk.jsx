// Talking with Asteme itself, inside the panel. The conversation is Asteme's
// own page (brain/page.html), served by the plugin to this computer only and
// shown here in a frame; the same page can be opened in a window of its own.
import React from "react";
import { Button, Notice } from "./ui.jsx";
import { ICON_PATH, ICON_CIRCLES, ICON_STROKE } from "./icon.mjs";

// While the conversation is being opened there is its mark, in the middle, its stars coming up one after another. No words: there is nothing to read
// in the second or two it takes, and a paragraph that appears and goes looked like something broken. It stays until the page itself has loaded, so that
// what is seen is one thing giving way to the conversation, not a mark, then an empty frame, then the conversation.
function Opening({ label, leaving = false }) {
  return (
    <div className={leaving ? "ast-talk__wait ast-talk__wait--leaving" : "ast-talk__wait"} role="status" aria-label={label}>
      <svg className="ast-talk__mark" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICON_PATH} />
        {ICON_CIRCLES.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" style={{ animationDelay: `${i * 0.22}s` }} />)}
      </svg>
    </div>
  );
}

export function TalkTab({ ctx, active, onManage, onOpenSession, onChanged, settingsAsked = 0 }) {
  const { t, model, projectId } = ctx;
  // The language the panel is in now. The conversation is opened in it, and opened again when it changes.
  const lang = t("_lang") || "";
  const [door, setDoor] = React.useState(null), [error, setError] = React.useState(null), [busy, setBusy] = React.useState(false);
  // The page in the frame has loaded; until then the mark stays over it.
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => { setLoaded(false); }, [door, lang]);
  const start = React.useCallback(async () => {
    setBusy(true); setError(null);
    try { setDoor((await model.request("brain", { projectId })).url); } catch (e) { setError({ code: e.code, text: e.message }); } finally { setBusy(false); }
  }, [model, projectId]);
  // Opening the tab is asking for the conversation; nothing runs before that.
  React.useEffect(() => { if (active && !door && !busy && !error) void start(); }, [active, door, busy, error, start]);
  // The page asks for the panel by its "Manage and settings" button.
  // It also asks for a DSH session to be opened: the one doing a task it handed over.
  React.useEffect(() => { const heard = (e) => { if (!door || e.origin !== new URL(door).origin) return; if (e.data?.asteme === "manage") onManage?.(typeof e.data.tab === "string" ? e.data.tab : "review"); else if (e.data?.asteme === "changed") onChanged?.(); else if (e.data?.asteme === "open" && typeof e.data.session === "string" && /^[\w-]{1,120}$/.test(e.data.session)) onOpenSession?.(e.data.session); }; window.addEventListener("message", heard); return () => window.removeEventListener("message", heard); }, [door, onManage, onOpenSession]);
  const dark = typeof document !== "undefined" && (document.body?.hasAttribute("data-ds-dark-theme") || document.querySelector(".asteme-page")?.style.colorScheme === "dark");
  // DSH can be dressed by skins. The page is in a frame and cannot see them, so
  // the colours actually in use here are read and handed to it.
  const frame = React.useRef(null);
  // The room the conversation is given is measured on the box around it, which is there from the first moment: the mark that stands in it while
  // the conversation is opened is then in the same place before the frame exists and after. (It was measured on the frame, so the room was only known
  // once the frame was there, and the mark moved down as it gave way.)
  const box = React.useRef(null), lastOver = React.useRef(0), roomRef = React.useRef(null);
  const look = React.useCallback(() => {
    const hex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c ?? ""); return m && (m[4] === undefined || Number(m[4]) > 0.5) ? "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("") : ""; };
    let node = document.querySelector(".asteme-page"), bg = ""; const ink = node ? hex(getComputedStyle(node).color) : "";
    for (; node && !bg; node = node.parentElement) bg = hex(getComputedStyle(node).backgroundColor);
    const n = bg ? parseInt(bg.slice(1), 16) : 0, dark = bg ? (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) < 128 : document.body.hasAttribute("data-ds-dark-theme");
    return { theme: dark ? "dark" : "light", bg, ink };
  }, []);
  // DSH can change its theme, or be dressed by a skin, while the conversation is open: it follows.
  React.useEffect(() => {
    if (!door || typeof MutationObserver === "undefined") return undefined;
    const tell = () => frame.current?.contentWindow?.postMessage({ asteme: "theme", ...look() }, new URL(door).origin);
    const watch = new MutationObserver(tell);
    for (const node of [document.documentElement, document.body]) watch.observe(node, { attributes: true, attributeFilter: ["class", "style", "data-ds-dark-theme", "data-theme"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)"); media?.addEventListener?.("change", tell);
    return () => { watch.disconnect(); media?.removeEventListener?.("change", tell); };
  }, [door, look]);
  const colours = React.useMemo(() => {
    if (typeof document === "undefined") return "";
    const hex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c ?? ""); return m && (m[4] === undefined || Number(m[4]) > 0.5) ? [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("") : ""; };
    let node = document.querySelector(".asteme-page"), bg = ""; const ink = node ? hex(getComputedStyle(node).color) : "";
    for (; node && !bg; node = node.parentElement) bg = hex(getComputedStyle(node).backgroundColor);
    return (bg ? `&bg=${bg}` : "") + (ink ? `&ink=${ink}` : "");
  }, [door]);
  // The address is made once for a language. A later change of theme is told to the page; it must not load it again. A change of language does
  // load it again, in that language: a page is given its words when it is made. What was being typed is kept by the page and by the store.
  const src = React.useMemo(() => door ? `${door}&embed=1&lang=${encodeURIComponent(lang)}&theme=${typeof document === "undefined" ? (dark ? "dark" : "light") : look().theme}${colours}` : "", [door, lang]);
  // Asked from the panel's settings: the conversation opens its own. The page may still be loading, so it is told again when it says it is ready.
  const wantSettings = React.useRef(0);
  React.useEffect(() => { if (!settingsAsked || !door) return undefined; wantSettings.current = settingsAsked; const tell = () => frame.current?.contentWindow?.postMessage({ asteme: "settings" }, new URL(door).origin); tell(); const again = setTimeout(tell, 1200); return () => clearTimeout(again); }, [settingsAsked, door]);
  // The microphone. DSH on the desktop gives it to its own window and to no
  // frame inside it, so the page cannot record there. It asks; the recording
  // is made here, the measured level is told to the page as it goes, and what
  // was recorded is handed to the page when it says stop. Nothing is kept here.
  const recording = React.useRef(null);
  React.useEffect(() => {
    if (!door) return undefined;
    const origin = new URL(door).origin, tell = (message, transfer) => frame.current?.contentWindow?.postMessage({ asteme: "mic", ...message }, origin, transfer ?? []);
    const end = (keep) => { const r = recording.current; recording.current = null; if (!r) return keep ? tell({ state: "none" }) : undefined;
      clearInterval(r.tick); try { r.proc.disconnect(); } catch { /* already apart */ } r.stream.getTracks().forEach(track => track.stop()); void r.audio.close().catch(() => {});
      if (!keep) return tell({ state: "cancelled" });
      const total = r.chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(total); let at = 0; for (const c of r.chunks) { all.set(c, at); at += c.length; }
      tell({ state: "done", rate: r.rate, pcm: all.buffer }, [all.buffer]); };
    const begin = async () => {
      if (recording.current) return;
      tell({ state: "asked" });
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { return tell({ state: "refused", why: String(e?.name ?? "") }); }
      const Audio = window.AudioContext || window.webkitAudioContext, audio = new Audio(), source = audio.createMediaStreamSource(stream), proc = audio.createScriptProcessor(4096, 1, 1), quiet = audio.createGain(); quiet.gain.value = 0;
      const r = recording.current = { stream, audio, proc, chunks: [], rate: audio.sampleRate, level: 0, seconds: 0 };
      proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); r.chunks.push(new Float32Array(d)); let sum = 0; for (let i = 0; i < d.length; i += 8) sum += d[i] * d[i]; r.level = Math.min(1, Math.sqrt(sum / (d.length / 8)) * 5); r.seconds += d.length / r.rate; };
      source.connect(proc); proc.connect(quiet); quiet.connect(audio.destination);
      // Two minutes is the most the page asks for; past that it is ended here too, in case the page has gone.
      r.tick = setInterval(() => { if (r.seconds > 130) return end(false); tell({ state: "level", level: r.level }); }, 85);
      tell({ state: "on", rate: r.rate });
    };
    const heard = (e) => { if (e.origin !== origin || e.data?.asteme !== "mic") return; if (e.data.do === "start") void begin(); else if (e.data.do === "stop") end(true); else if (e.data.do === "cancel") end(false); };
    window.addEventListener("message", heard);
    return () => { window.removeEventListener("message", heard); end(false); };
  }, [door]);
  // The frame takes exactly the room DSH leaves it: from its own corner to the
  // nearest edge of DSH's that would cut it off. A share of the window's height
  // is not that room: DSH on the desktop has a title bar, and the bottom of the
  // conversation, where the box is, ended up below the window.
  const [room, setRoom] = React.useState(null);
  React.useLayoutEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const outside = []; for (let n = el.closest(".asteme-page")?.parentElement; n; n = n.parentElement) outside.push(n);
    const fit = () => {
      // The frame is made to fill exactly the room there is, so nothing around it has a reason to scroll. A container that has scrolled all the same (a browser does that to bring a focused field into view when the frame was, for a moment, larger than the room) is put back: left as it was, the top of the conversation stayed hidden and the measure taken from there was wrong for good.
      for (const n of outside) { if (n.scrollTop) n.scrollTop = 0; if (n.scrollLeft) n.scrollLeft = 0; }
      const at = el.getBoundingClientRect(); let bottom = window.innerHeight, right = window.innerWidth;
      // Only DSH's own containers count: Asteme's are as large as the frame makes them.
      for (const n of outside) { const cs = getComputedStyle(n); if (!/hidden|auto|scroll|clip/.test(cs.overflowX + cs.overflowY)) continue; const r = n.getBoundingClientRect(); bottom = Math.min(bottom, r.top + n.clientTop + n.clientHeight); right = Math.min(right, r.left + n.clientLeft + n.clientWidth); }
      const h = Math.max(240, Math.floor(bottom - at.top)), w = Math.max(240, Math.floor(right - at.left));
      // Something of DSH's can lie over the top of the room without the room being any smaller: a title bar the main area runs under when the side panel
      // is folded away. Nothing scrolls and nothing changes size, so it cannot be measured, only looked for: what is actually under a point at the top
      // of the frame? If it is not the frame, the frame begins lower. Only a bar counts (wide, at the very top, there on two looks in a row, and not
      // deeper than a bar is): a menu, a tooltip or a dialog's backdrop passing over the frame moves nothing.
      let over = 0;
      if (at.top < 0) over = Math.ceil(-at.top);
      else {
        const x = at.left + Math.min(w / 2, 320);
        for (let y = at.top + 2; y < at.top + 96; y += 3) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || el.contains(hit)) break;
          const r = hit.getBoundingClientRect();
          if (r.width < w * 0.5 || r.top > at.top + 1 || r.bottom - at.top > 96) { over = 0; break; }
          over = Math.ceil(r.bottom - at.top);
          y = Math.max(y, r.bottom - 1);
        }
      }
      const cover = over === lastOver.current ? over : (roomRef.current?.cover ?? 0);
      lastOver.current = over;
      setRoom(now => { const next = now && now.h === h && now.w === w && now.cover === cover ? now : { h, w, cover }; roomRef.current = next; return next; });
    };
    fit();
    const watch = new ResizeObserver(fit); for (const n of outside) watch.observe(n);
    window.addEventListener("resize", fit);
    // Where the frame begins can change with nothing changing size (a bar that appears above it, a panel that slides): that is looked for too, a few times a second, which costs a handful of measurements.
    for (const n of outside) n.addEventListener("scroll", fit, { passive: true });
    const often = setInterval(fit, 400);
    return () => { watch.disconnect(); window.removeEventListener("resize", fit); for (const n of outside) n.removeEventListener("scroll", fit); clearInterval(often); };
  }, [active, error]);
  if (error) return <div className="ast-talk__failed">{error.code === "asteme/NO_MODEL" ? <Notice>{t("talkNoModel")}</Notice> : <Notice tone="danger">{error.text}</Notice>}<div className="ast-actions"><Button onClick={start}>{t("tryAgain")}</Button></div></div>;
  const cover = room?.cover ?? 0;
  const size = room ? { height: room.h, width: room.w, paddingTop: cover, boxSizing: "border-box" } : undefined;
  return (
    <div className="ast-talk" ref={box} style={size}>
      {door && <iframe className="ast-talk__frame" title={t("tabTalk")} ref={frame} src={src} onLoad={() => setLoaded(true)} allow="microphone; autoplay; local-fonts; clipboard-write" style={room ? { height: room.h - cover, width: room.w } : undefined} />}
      <Opening label={t("loading")} leaving={!!door && loaded} />
    </div>
  );
}
