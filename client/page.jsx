// The shell: where you are, how to get back, and what is always in view.
//
//   Review     what is waiting for you, and what the last reply had in view
//   Memory     everything it has learned; a row opens the full account
//   Activity   what it does while nobody is waiting, and why
//   Charter    what you told it to be; nothing learned can change this
//
// A memory's account and the settings open over the tabs and close with Back
// or Escape, returning focus and scroll to where they were opened from.
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { translate } from "./copy.mjs";
import { arriveAt } from "./arrive.mjs";
import { setLanguage } from "./format.mjs";
import { ICON_PATH, ICON_CIRCLES, ICON_STROKE } from "./icon.mjs";
import { ReviewTab } from "./review.jsx";
import { TalkTab } from "./talk.jsx";
import { MemoryTab } from "./memory.jsx";
import { ActivityTab } from "./activity.jsx";
import { CharterTab } from "./charter.jsx";
import { MemoryDetail, HabitDetail } from "./detail.jsx";
import { SettingsView } from "./settings.jsx";
import { Boundary, Button, Glyph, IconButton, Notice, Select, Spinner, TabPanel, Tabs } from "./ui.jsx";

// How long a success notice stays in the header.
const NOTICE_MS = 4000;

export function AstemeIcon({ size = 18, lit = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ overflow: "visible" }}>
      <path d={ICON_PATH} />
      {ICON_CIRCLES.map(([cx, cy, r], n) => lit && n === LIT
        ? <g key="lit" className="ast-navlit"><circle cx={cx} cy={cy} r={5.4} stroke="none" fill="currentColor" opacity={.26} /><circle cx={cx} cy={cy} r={2.7} stroke="none" fill="currentColor" /></g>
        : <circle key={cx + ":" + cy} cx={cx} cy={cy} r={r} />)}
    </svg>
  );
}
// The star of the mark that lights when Asteme has said something unseen: the one at the upper right.
const LIT = 2;
// What the mark in the side bar last counted, for whoever opens the panel next.
let unseenNow = 0;

// Beside Asteme's name in DSH's side bar: when it has said something that has not been in front of you (a greeting it promised,
// the end of work it gave out, a reply that came after you went elsewhere), one star of its mark is lit. Nothing is laid over the icon.
// It asks now and then while DSH is showing, and at once when DSH is come back to; the conversation says when it has been seen.
export function AstemeNavIcon({ ask, label, size = 18 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    const look = async () => { if (document.visibilityState === "hidden") return; try { const r = await ask(); if (live) { unseenNow = Number(r?.n) || 0; setN(unseenNow); } } catch { /* not started yet, or no connection: no mark */ } };
    const seen = (e) => { if (e.data?.asteme === "seen") { unseenNow = 0; setN(0); } };
    void look(); const timer = setInterval(look, 15000);
    window.addEventListener("message", seen); window.addEventListener("focus", look); document.addEventListener("visibilitychange", look);
    return () => { live = false; clearInterval(timer); window.removeEventListener("message", seen); window.removeEventListener("focus", look); document.removeEventListener("visibilitychange", look); };
  }, [ask]);
  return <span className={n > 0 ? "ast-navicon ast-navicon--lit" : "ast-navicon"} role={n > 0 ? "status" : undefined} aria-label={n > 0 ? label?.(n) : undefined} title={n > 0 ? label?.(n) : undefined}><AstemeIcon size={size} lit={n > 0} /></span>;
}

export function AstemePage({ model, t: hostT, openSession }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const s = state.snapshot;
  // The panel follows the host's language unless one was chosen in Settings.
  const chosen = s?.settings?.language || "";
  const t = useMemo(() => chosen ? translate(chosen) : hostT, [chosen, hostT]);
  const [tab, setTab] = useState("review");
  // The conversation is where one arrives, once, when the host offers it;
  // after that the tab the user chose stays.
  const arrived = React.useRef(false);
  const [stack, setStack] = useState([]);       // what is open over the tabs
  const [saveBar, setSaveBar] = useState(null); // the charter's unsaved draft, if any
  const idBase = useId();
  const body = useRef(null), backButton = useRef(null), root = useRef(null);
  // The host says nothing about its theme, and a native control (the list a
  // select opens) is drawn by the browser in the scheme it believes in. The
  // text colour the page inherits tells which one that should be: light text
  // means a dark surface. Without this the list opens white with white text.
  const [scheme, setScheme] = useState(null);
  useLayoutEffect(() => {
    const read = () => {
      const el = root.current?.parentElement ?? root.current;
      if (!el) return;
      // DSH marks a dark theme on the body; where that mark is in use it decides.
      if (document.body?.hasAttribute("data-ds-dark-theme")) return setScheme("dark");
      const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(getComputedStyle(el).color);
      if (m) setScheme((0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 > 0.55 ? "dark" : "light");
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true });
    if (document.body) watch.observe(document.body, { attributes: true });
    return () => watch.disconnect();
  }, []);
  const cameFrom = useRef([]);                  // per open level: where focus and scroll were

  // Dates and numbers follow the language the copy is in.
  setLanguage(t("_lang"));
  useEffect(() => { void model.refresh(); }, [model]);
  // The conversation is another window onto the same store. What was settled or learned there is read again on the way to any other tab, so a thing answered in the conversation is not still waiting here.
  const stale = useRef(false), wasTalk = useRef(false);
  // The conversation's own settings (look, names, voice) are made in the conversation; from here they are one press away.
  const [talkSettings, setTalkSettings] = useState(0);
  useEffect(() => { if (wasTalk.current && tab !== "talk") { stale.current = false; void model.refresh(state.snapshot?.projectId); } wasTalk.current = tab === "talk"; }, [tab]);
  // Where one arrives is the conversation unless this screen was told to start with memory; with something of Asteme's unseen, it is the conversation either way.
  useEffect(() => { if (state.snapshot?.canTalk && !arrived.current) { arrived.current = true; if (arriveAt() === "talk" || unseenNow > 0) setTab("talk"); } }, [state.snapshot?.canTalk]);
  useEffect(() => {
    if (!state.notice) return undefined;
    const timer = setTimeout(() => model.clearNotice(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [state.notice, model]);

  const open = entry => {
    cameFrom.current.push({ focus: document.activeElement?.closest?.("[data-focus]")?.getAttribute("data-focus"), scroll: body.current?.scrollTop ?? 0 });
    setStack(list => [...list, entry]);
  };
  const back = () => setStack(list => list.slice(0, -1));
  const depth = useRef(0);
  useLayoutEffect(() => {
    if (stack.length > depth.current) { if (body.current) body.current.scrollTop = 0; backButton.current?.focus(); }
    else if (stack.length < depth.current) {
      const from = cameFrom.current.pop();
      cameFrom.current.length = stack.length;
      if (body.current) body.current.scrollTop = from?.scroll ?? 0;
      const target = from?.focus && root.current?.querySelector(`[data-focus="${CSS.escape(from.focus)}"]`);
      (target ?? root.current?.querySelector('[role="tab"][aria-selected="true"]'))?.focus();
    }
    depth.current = stack.length;
  }, [stack.length]);

  const ready = !!s?.memory?.state?.items;
  const nav = {
    tab: key => { cameFrom.current = []; setStack([]); setTab(key); },
    memory: id => open({ type: "memory", id }),
    habit: key => open({ type: "habit", key }),
    settings: () => { if (stack.at(-1)?.type !== "settings") open({ type: "settings" }); },
    back,
  };
  const ctx = { t, state, model, nav, projectId: s?.projectId, snapshot: s };
  // Failures that belong to one control are shown next to it instead.
  const globalError = state.error && !state.error.key ? state.error : null;
  const waiting = ready && s.review ? s.review.unsure.length + s.review.stale.length + s.review.disputes.length : 0;
  const tabs = [
    { key: "review", label: t("tabReview"), count: waiting, countLabel: t("waitingForYou") },
    { key: "memory", label: t("tabMemory") },
    { key: "activity", label: t("tabActivity") },
    { key: "charter", label: t("tabCharter"), flag: saveBar ? t("unsaved") : null },
  ];
  const top = stack.at(-1);
  const on = s?.settings?.enabled !== false;

  // Arriving is arriving at the conversation: it takes the whole pane, and the
  // panel's own header and tabs come back when the user asks to manage things.
  const talking = !!(ready && s.canTalk && tab === "talk" && !top);
  return (
    <div className={talking ? "asteme-page asteme-page--talk" : "asteme-page"} ref={root} style={scheme ? { colorScheme: scheme } : undefined} aria-busy={state.loading || state.busy}
      onKeyDown={e => { if (e.key === "Escape" && stack.length && !e.defaultPrevented) back(); }}>
      <div className="ast-top" hidden={talking}>
        <header className="ast-header">
          {/* The conversation is home and this panel is where one goes to look after memory: so the way back to it is not a tab among the others, it is the way out, at the top left. */}
          {s?.canTalk
            ? <button type="button" className="ast-brand ast-home" onClick={() => nav.tab("talk")} title={t("backToTalk")}><Glyph name="back" /><AstemeIcon /><h2>ASTEME</h2><span className="ast-home__word">{t("backToTalk")}</span></button>
            : <div className="ast-brand"><AstemeIcon /><h2>ASTEME</h2></div>}
          {ready && (
            <button type="button" className={on ? "ast-power" : "ast-power ast-power--off"} onClick={nav.settings} title={t("openSettings")}>
              <span className="ast-power__dot" aria-hidden="true" />{t(on ? "memoryOn" : "memoryOff")}
            </button>
          )}
          <IconButton glyph="refresh" label={t("refresh")} busy={state.loading} disabled={state.busy || state.loading} onClick={() => model.refresh(s?.projectId)} />
          {ready && <IconButton glyph="settings" label={t("settings")} onClick={nav.settings} aria-pressed={top?.type === "settings"} />}
        </header>

        {ready && (top ? (
          <div className="ast-backbar">
            <button type="button" className="ast-back" ref={backButton} onClick={back}>
              <Glyph name="back" />{stack.length > 1 ? t("back") : t("backTo_" + tab)}
            </button>
          </div>
        ) : <Tabs idBase={idBase} label="ASTEME" tabs={tabs} value={tab} onChange={setTab} />)}

        {ready && !top && ["review", "memory"].includes(tab) && s.projects.length > 1 && (
          <label className="ast-scope">
            <span>{t("project")}</span>
            <Select value={s.projectId} disabled={state.busy || state.loading} onChange={e => model.refresh(e.target.value)}>
              {s.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </label>
        )}
        {s && globalError && (
          <Notice tone="danger" role="alert" action={<Button variant="ghost" onClick={() => model.clearError()}>{t("dismiss")}</Button>}>{globalError.message}</Notice>
        )}
      </div>

      <div className="ast-body" ref={body}>
        {!s ? (
          state.error
            ? <Notice tone="danger" role="alert" detail={state.error.message} action={<Button variant="primary" onClick={() => model.refresh()}>{t("retry")}</Button>}>{t("loadFailed")}</Notice>
            : <p className="ast-loading" role="status"><Spinner />{t("loading")}</p>
        ) : !ready ? (
          <Notice tone="warning" role="status">{t("restartRequired")}</Notice>
        ) : (
          <Boundary resetKey={`${tab}:${stack.length}:${top?.id ?? top?.key ?? ""}`} message={t("viewFailed")}
            action={<Button onClick={() => (stack.length ? back() : model.refresh(s.projectId))}>{stack.length ? t("back") : t("refresh")}</Button>}>
            {/* The tabs stay mounted underneath, so a draft or a search survives a look at something else. */}
            <div hidden={!!top}>
              {s.canTalk && <TabPanel idBase={idBase} tabKey="talk" active={tab === "talk"}><TalkTab ctx={ctx} active={tab === "talk" && !top} onManage={(to) => { if (to === "settings") nav.settings(); else nav.tab(["review", "memory", "activity", "charter"].includes(to) ? to : "review"); }} onOpenSession={openSession} onChanged={() => { stale.current = true; }} settingsAsked={talkSettings} /></TabPanel>}
              <TabPanel idBase={idBase} tabKey="review" active={tab === "review"}><ReviewTab key={s.projectId} snapshot={s} ctx={ctx} /></TabPanel>
              <TabPanel idBase={idBase} tabKey="memory" active={tab === "memory"}><MemoryTab key={s.projectId} snapshot={s} ctx={ctx} /></TabPanel>
              <TabPanel idBase={idBase} tabKey="activity" active={tab === "activity"}><ActivityTab snapshot={s} ctx={ctx} /></TabPanel>
              <TabPanel idBase={idBase} tabKey="charter" active={tab === "charter"}><CharterTab snapshot={s} ctx={ctx} onDirty={setSaveBar} /></TabPanel>
            </div>
            {top?.type === "memory" && <MemoryDetail key={top.id} id={top.id} snapshot={s} ctx={ctx} />}
            {top?.type === "habit" && <HabitDetail key={top.key} habitKey={top.key} snapshot={s} ctx={ctx} />}
            {top?.type === "settings" && <SettingsView snapshot={s} ctx={ctx} onTalkSettings={() => { setStack([]); setTab("talk"); setTalkSettings(n => n + 1); }} />}
          </Boundary>
        )}
      </div>

      <p className="ast-said" role="status">{state.notice && <><span className="ast-said__mark" aria-hidden="true" />{t(state.notice)}</>}</p>

      {ready && saveBar && !top && tab === "charter" && (
        <div className="ast-foot" role="region" aria-label={t("unsaved")}>
          <span className="ast-foot__text">{t("unsaved")}</span>
          <Button variant="ghost" disabled={state.busy} onClick={saveBar.discard}>{t("discard")}</Button>
          <Button variant="primary" busy={saveBar.saving} disabled={state.busy} onClick={saveBar.save}>{t("saveChanges")}</Button>
        </div>
      )}
    </div>
  );
}

// Asteme's place in DSH's own settings. It is the same view the panel shows under "Memory settings", fed by the same model: one thing drawn in two places, so a
// change made in either is the change in both, and a setting added to it appears in both without being written twice. What belongs to the conversation (its look,
// names, voice) stays in the conversation, which is where it can be seen.
export function AstemeSettingsSection({ model, t: hostT }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const s = state.snapshot;
  const chosen = s?.settings?.language || "";
  const t = useMemo(() => chosen ? translate(chosen) : hostT, [chosen, hostT]);
  useEffect(() => { void model.refresh(model.getSnapshot().snapshot?.projectId); }, [model]);
  useEffect(() => { if (!state.notice) return undefined; const timer = setTimeout(() => model.clearNotice(), NOTICE_MS); return () => clearTimeout(timer); }, [state.notice, model]);
  setLanguage(t("_lang"));
  const ready = !!s?.memory?.state?.items;
  const nothing = () => {};
  const ctx = { t, state, model, nav: { tab: nothing, memory: nothing, habit: nothing, settings: nothing, back: nothing }, projectId: s?.projectId, snapshot: s };
  return (
    <div className="asteme-page asteme-page--section" aria-busy={state.loading || state.busy}>
      {!s ? (state.error
        ? <Notice tone="danger" role="alert" detail={state.error.message} action={<Button variant="primary" onClick={() => model.refresh()}>{t("retry")}</Button>}>{t("loadFailed")}</Notice>
        : <p className="ast-loading" role="status"><Spinner />{t("loading")}</p>)
        : !ready ? <Notice tone="warning" role="status">{t("restartRequired")}</Notice>
        : <Boundary resetKey="section" message={t("viewFailed")} action={<Button onClick={() => model.refresh(s.projectId)}>{t("refresh")}</Button>}><SettingsView snapshot={s} ctx={ctx} /></Boundary>}
      <p className="ast-said" role="status">{state.notice && <><span className="ast-said__mark" aria-hidden="true" />{t(state.notice)}</>}</p>
    </div>
  );
}
