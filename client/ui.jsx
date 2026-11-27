// Primitives. Every view is built only from these, so focus, keyboard, busy
// and confirmation behave the same everywhere.
import React, { forwardRef, useEffect, useId, useRef, useState } from "react";
import { cx } from "./format.mjs";

export const Spinner = () => <span className="ast-spinner" aria-hidden="true" />;

/** variant: default | primary | danger | ghost | quiet-danger */
export const Button = forwardRef(function Button(
  { variant = "default", busy = false, disabled = false, className, children, ...rest }, ref,
) {
  return (
    <button
      type="button"
      {...rest}
      ref={ref}
      className={cx("ast-btn", variant !== "default" && `ast-btn--${variant}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
});

// Glyphs in the icon's own stroke: 1.6, round caps, nothing filled.
const GLYPHS = {
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  next: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  refresh: <><path d="M19 12a7 7 0 1 1-2.2-5.1" /><path d="M19 4.5V8h-3.5" /></>,
  // A gear: eight teeth around a hub.
  settings: <><path d="M9.96 5.41 L10.30 3.16 L13.70 3.16 L14.04 5.41 L15.22 5.90 L17.05 4.55 L19.45 6.95 L18.10 8.78 L18.59 9.96 L20.84 10.30 L20.84 13.70 L18.59 14.04 L18.10 15.22 L19.45 17.05 L17.05 19.45 L15.22 18.10 L14.04 18.59 L13.70 20.84 L10.30 20.84 L9.96 18.59 L8.78 18.10 L6.95 19.45 L4.55 17.05 L5.90 15.22 L5.41 14.04 L3.16 13.70 L3.16 10.30 L5.41 9.96 L5.90 8.78 L4.55 6.95 L6.95 4.55 L8.78 5.90Z" /><circle cx="12" cy="12" r="2.7" /></>,
  search: <><circle cx="11" cy="11" r="5.5" /><path d="m15.2 15.2 4.3 4.3" /></>,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
};
export const Glyph = ({ name, size = 16 }) => (
  <svg className="ast-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[name]}</svg>
);
/** A button that is only a glyph. `label` is what a screen reader and a tooltip say. */
export const IconButton = forwardRef(function IconButton({ glyph, label, busy, ...rest }, ref) {
  return (
    <button type="button" {...rest} ref={ref} className="ast-icon-btn" aria-label={label} title={label} aria-busy={busy || undefined}>
      {busy ? <Spinner /> : <Glyph name={glyph} />}
    </button>
  );
});

/** Label, control and optional hint, wired together by id. Takes one control as its child. */
export function Field({ label, hint, aside, children }) {
  const id = useId();
  const hintId = id + "-hint";
  return (
    <div className="ast-field">
      <div className="ast-field__head">
        <label className="ast-field__label" htmlFor={id}>{label}</label>
        {aside}
      </div>
      {React.cloneElement(children, { id, "aria-describedby": hint ? hintId : undefined })}
      {hint && <p className="ast-hint" id={hintId}>{hint}</p>}
    </div>
  );
}
export const TextInput = props => <input type="text" {...props} className={cx("ast-input", props.className)} />;
export const TextArea = props => <textarea {...props} className="ast-input" />;
export const Select = ({ children, ...props }) => (
  <span className="ast-select"><select {...props} className="ast-input">{children}</select></span>
);

/** A setting that applies as soon as it is flipped. */
export function Switch({ label, hint, checked, onChange, disabled, busy }) {
  const id = useId();
  const hintId = id + "-hint";
  return (
    <div className="ast-switch-row">
      <div className="ast-switch-row__text">
        <label className="ast-switch-row__label" htmlFor={id}>{label}</label>
        {hint && <p className="ast-hint" id={hintId}>{hint}</p>}
      </div>
      {busy && <Spinner />}
      <input id={id} type="checkbox" role="switch" className="ast-switch" checked={checked} disabled={disabled}
        aria-describedby={hint ? hintId : undefined} onChange={e => onChange(e.target.checked)} />
    </div>
  );
}

/** tabs: [{ key, label, count?, flag? }]. `count` is shown; `flag` is a dot with hidden text. */
export function Tabs({ idBase, label, tabs, value, onChange }) {
  const buttons = useRef({});
  const onKeyDown = e => {
    const keys = tabs.map(tab => tab.key);
    const at = keys.indexOf(value);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = keys[(to + keys.length) % keys.length];
    onChange(next);
    buttons.current[next]?.focus();
  };
  return (
    <div className="ast-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          ref={node => { buttons.current[tab.key] = node; }}
          type="button" role="tab" className="ast-tab"
          id={`${idBase}-tab-${tab.key}`} aria-controls={`${idBase}-panel-${tab.key}`}
          aria-selected={tab.key === value} tabIndex={tab.key === value ? 0 : -1}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count > 0 && <span className="ast-tab__count">{tab.count}<span className="ast-sr"> {tab.countLabel}</span></span>}
          {tab.flag && <><span className="ast-tab__flag" aria-hidden="true" /><span className="ast-sr">{tab.flag}</span></>}
        </button>
      ))}
    </div>
  );
}
/** Panels stay mounted while hidden, so drafts and open rows survive a tab switch. */
export const TabPanel = ({ idBase, tabKey, active, children }) => (
  <div className="ast-panel" role="tabpanel" id={`${idBase}-panel-${tabKey}`} aria-labelledby={`${idBase}-tab-${tabKey}`} hidden={!active}>
    {children}
  </div>
);

export function Disclosure({ label, count, aside, open: controlled, defaultOpen = false, onToggle, children }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const id = useId();
  return (
    <div className="ast-disc">
      <button type="button" className="ast-disc__toggle" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { if (controlled === undefined) setOwn(!open); onToggle?.(!open); }}>
        <span className="ast-chevron" aria-hidden="true" />
        <span className="ast-disc__label">{label}</span>
        {count != null && <span className="ast-count">{count}</span>}
        {aside}
      </button>
      {open && <div className="ast-disc__body" id={id}>{children}</div>}
    </div>
  );
}

/** A titled group. `lead` is one sentence saying what the group is, for a reader who has not seen it before. */
export function Section({ title, count, aside, lead, children }) {
  return (
    <section className="ast-section">
      <div className="ast-section__head">
        <h3 className="ast-section__title">{title}</h3>
        {count != null && <span className="ast-count">{count}</span>}
        {aside && <span className="ast-section__aside">{aside}</span>}
      </div>
      {lead && <p className="ast-section__lead">{lead}</p>}
      {children}
    </section>
  );
}

/** tone: neutral | warning | danger | lit */
export const Chip = ({ tone = "neutral", children }) => (
  <span className={cx("ast-chip", tone !== "neutral" && `ast-chip--${tone}`)}>{children}</span>
);

/** tone: neutral | warning | danger. Pass role="alert" for a failure that just happened. */
export const Notice = ({ tone = "neutral", role, detail, action, children }) => (
  <div className={cx("ast-notice", tone !== "neutral" && `ast-notice--${tone}`)} role={role}>
    <div className="ast-notice__body">
      <p>{children}</p>
      {detail && <p className="ast-notice__detail">{detail}</p>}
    </div>
    {action}
  </div>
);

/**
 * The star. Its size says how a memory's uses have gone so far; hollow means it
 * is not in use; a ring means the last reply drew on it.
 * level: easily | sometimes | rarely | off     tone: plain | warning | danger
 */
export const Star = ({ level = "sometimes", tone = "plain", lit = false, label }) => (
  <span className="ast-star-box" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
    <span className={cx("ast-star", `ast-star--${level}`, tone !== "plain" && `ast-star--${tone}`, lit && "ast-star--lit")} />
  </span>
);

/** A whole row that opens something. The text is the button; nothing else in the row is interactive. */
export const RowButton = forwardRef(function RowButton({ lead, title, detail, meta, note, className, ...rest }, ref) {
  return (
    <button type="button" {...rest} ref={ref} className={cx("ast-row", className)}>
      {lead}
      <span className="ast-row__main">
        {/* What the mark shows, in words, read after the text it belongs to. */}
        <span className="ast-row__title">{title}{note && <span className="ast-sr">. {note}.</span>}</span>
        {detail && <span className="ast-row__detail">{detail}</span>}
        {meta && <span className="ast-row__meta">{meta}</span>}
      </span>
      <Glyph name="next" size={14} />
    </button>
  );
});

/** A link to another memory inside running text or a list. */
export const TextLink = ({ children, ...rest }) => <button type="button" {...rest} className="ast-link">{children}</button>;

/** rows: [label, value]. Rows without a value are left out. */
export function Facts({ rows }) {
  const shown = rows.filter(([, value]) => value != null && value !== "" && value !== false);
  if (!shown.length) return null;
  return <dl className="ast-facts">{shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

/** A vertical chain of points, each a step in an account: the icon's lines and nodes, carrying meaning. */
export const Trace = ({ children }) => <ol className="ast-trace">{children}</ol>;
export const TracePoint = ({ mark = "solid", tone = "plain", children }) => (
  <li className="ast-trace__point">
    <span className={cx("ast-trace__mark", `ast-trace__mark--${mark}`, tone !== "plain" && `ast-trace__mark--${tone}`)} aria-hidden="true" />
    <div className="ast-trace__body">{children}</div>
  </li>
);

/** One broken view must not blank the panel. Shows what failed and a way out. */
export class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(previous) { if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return <Notice tone="danger" role="alert" detail={this.state.error.message} action={this.props.action}>{this.props.message}</Notice>;
  }
}

/** Lines that stand in for text that is on its way. */
export const Skeleton = ({ lines = 2 }) => (
  <div className="ast-skeleton" aria-hidden="true">{Array.from({ length: lines }, (_, n) => <span key={n} />)}</div>
);

/**
 * State for the destructive-action pattern: a trigger opens a Confirm in
 * place; cancelling returns focus to the trigger.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!open && restoreFocus.current) { restoreFocus.current = false; triggerRef.current?.focus(); }
  }, [open]);
  return { open, triggerRef, ask: () => setOpen(true), cancel: () => { restoreFocus.current = true; setOpen(false); } };
}
/**
 * Inline confirmation. Focus starts on Cancel, Escape cancels, and the confirm
 * button names the action. `children` is what will be affected, spelled out.
 */
export function Confirm({ message, confirmLabel, cancelLabel, busy, blocked = false, onConfirm, onCancel, children }) {
  const cancelRef = useRef(null);
  const id = useId();
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className="ast-confirm" role="alertdialog" aria-modal="false" aria-label={confirmLabel} aria-describedby={id}
      onKeyDown={e => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); } }}>
      <div id={id}>
        <p className="ast-confirm__msg">{message}</p>
        {children}
      </div>
      <div className="ast-actions">
        <Button ref={cancelRef} onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant="danger" busy={busy} disabled={blocked} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  );
}
