// The control Asteme puts in the conversation's composer: one small button
// that says whether this conversation is being remembered, and switches it.
// It holds no state of its own beyond what the plugin last answered.
import React, { useEffect, useRef, useState } from "react";
import { ICON_CIRCLES, ICON_STROKE } from "./icon.mjs";

// The mark is a small constellation, and the switch says what it means.
// Remembering: the stars are joined. Not remembering: the lines are drawn
// back and the stars stand apart, since nothing here is being joined to what
// is known. The lines are the mark's own, taken one by one so that each can
// be drawn out from the middle star and back (client/styles.css).
const LINES = ["M12 11 5 7", "M12 11l6-7", "M12 11l6 8", "M5 7l-2 11"];

export function AstemeComposerSwitch({ label, read, set }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [lit, setLit] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    read().then(value => { if (alive.current) setState(value); }, () => {});
    return () => { alive.current = false; };
  }, [read]);
  // Nothing to show while memory is off altogether or the answer is not in.
  if (!state || !state.enabled) return null;
  const on = state.remembered, fixed = state.projectOff;
  const text = label(fixed ? "composerProjectOff" : on ? "composerOn" : "composerOff");
  const toggle = async () => {
    if (busy || fixed) return;
    setBusy(true);
    try { const value = await set(!on); if (alive.current) { setState(value); if (value?.remembered && !on) { setLit(true); setTimeout(() => { if (alive.current) setLit(false); }, 900); } } } catch {}
    if (alive.current) setBusy(false);
  };
  return (<>
    <button type="button" className={"asteme-composer" + (lit ? " is-lit" : "") + (busy ? " is-busy" : "")} aria-pressed={on} aria-label={text} title={text} disabled={busy || fixed} onClick={toggle}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 6px", border: 0, borderRadius: 6, color: "inherit", font: "inherit", fontSize: 12, cursor: fixed ? "default" : "pointer" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {LINES.map((d, n) => <path key={d} className="asteme-composer__line" d={d} pathLength="1" style={{ "--n": n }} />)}
        {ICON_CIRCLES.map(([cx, cy, r], n) => <circle key={cx + ":" + cy} className="asteme-composer__star" cx={cx} cy={cy} r={r} style={{ "--n": n }} />)}
      </svg>
      {!on && <span className="asteme-composer__word">{label("composerOffShort")}</span>}
    </button>
  </>);
}
