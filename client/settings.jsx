// Settings: the switch, the model, and the health of the background work.
// Both controls apply as soon as they change.
import React from "react";
import { currentLanguage, formatBytes, formatDateTime, formatNumber, labelFor } from "./format.mjs";
import { idleWord, say } from "./words.mjs";
import { arriveAt, setArriveAt } from "./arrive.mjs";
import { Button, Confirm, Disclosure, Field, Notice, Section, Select, Spinner, Switch, Tabs, TextInput } from "./ui.jsx";

// Copies out, copies back in, and the automatic copies. Each button writes
// files on this computer and says where; nothing is sent anywhere.
// A folder this plugin wrote to: open it in the file manager, or copy where it
// is. Nobody should have to retype a path the panel already knows.
function PathActions({ path, ctx }) {
  const { t, model } = ctx;
  const [state, setState] = React.useState(null);
  const open = async () => {
    setState(null);
    try { await model.request("reveal", { path }); } catch (e) { setState({ error: e.message }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(path); setState({ copied: true }); }
    catch { setState({ error: path }); }
  };
  return (
    <span className="ast-path-actions">
      <Button variant="ghost" onClick={open}>{t("openFolder")}</Button>
      <Button variant="ghost" onClick={copy}>{t("copyPath")}</Button>
      {state?.copied && <span className="ast-soft" role="status">{t("copied")}</span>}
      {state?.error && <span className="ast-soft" role="alert">{state.error}</span>}
    </span>
  );
}

function Keeping({ snapshot: s, ctx }) {
  const { t, model, projectId } = ctx;
  const [busy, setBusy] = React.useState(null), [done, setDone] = React.useState(null), [error, setError] = React.useState(null), [path, setPath] = React.useState("");
  const savedTo = s.settings.exportDirectory ?? "", [to, setTo] = React.useState(savedTo);
  const [asking, setAsking] = React.useState(null);   // which confirmation is open
  const [sure, setSure] = React.useState(false);      // said, before everything is erased, that it cannot be undone
  const file = React.useRef(null);
  const keeping = s.keeping;
  const run = async (key, action, payload, describe) => {
    if (busy) return;
    setBusy(key); setError(null); setDone(null);
    try {
      const value = await model.request(action, payload);
      setDone({ ...describe(value), key });
      await model.refresh(projectId);
    } catch (e) { setError({ key, message: e.message }); }
    setBusy(null);
  };
  // What was done is kept as what happened, and worded when it is shown: the
  // sentence follows the language even if that is changed afterwards.
  const wrote = v => ({ text: t => say(t, "wroteTo", { n: v.files.length, size: formatBytes(v.bytes) }), path: v.path });
  const added = v => ({ text: t => v.total ? say(t, "importAdded", { n: v.total }) : t("importNothing"), path: null });
  const save = (kind) => run(kind, "export", { kind, locale: currentLanguage() }, wrote);
  const read = async event => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (/\.(sqlite|db|gz)$/i.test(chosen.name)) return setError({ key: "import", message: t("importSqliteByPath") });
    const content = await chosen.text();
    void run("import", "import", { content }, added);
  };
  // The computer's own file chooser, opened where the files are. If it cannot
  // be opened, typing a path still works, and for an archive so does the
  // browser's own chooser.
  const choose = async (kind, then) => {
    if (busy) return null;
    setBusy(`pick:${kind}`); setError(null);
    try { const { path: chosen } = await model.request("pick", { kind }); setBusy(null); if (chosen) then(chosen); return chosen ?? null; }
    catch (e) { setBusy(null); setError({ key: kind === "file" ? "import" : "folder", message: e.message }); return undefined; }
  };
  const chooseAndImport = async () => {
    const chosen = await choose("file", () => {});
    if (chosen) void run("importPath", "import", { path: chosen }, added);
    else if (chosen === undefined) file.current?.click();
  };
  const setFolder = value => model.perform("settings", { patch: { exportDirectory: value }, projectId }, { key: "settings:export", notice: "saved" });
  // What happened is said next to where it was asked for.
  const upper = key => ["archive", "diary", "report"].includes(key);
  const lower = key => key === "import" || key === "importPath" || String(key).startsWith("saved:");
  if (!keeping) return null;
  const saved = keeping.saved ?? [];
  return (
    <Section title={t("keeping")} lead={t("keepingLead")}>
      <div className="ast-keep">
        <div className="ast-keep__row">
          <div><p className="ast-keep__what">{t("exportArchive")}</p><p className="ast-hint">{t("exportArchiveHint")}</p></div>
          <Button busy={busy === "archive"} disabled={!!busy} onClick={() => save("archive")}>{t("save")}</Button>
        </div>
        <div className="ast-keep__row">
          <div><p className="ast-keep__what">{t("exportDiary")}</p><p className="ast-hint">{t("exportDiaryHint")}</p></div>
          <Button busy={busy === "diary"} disabled={!!busy} onClick={() => save("diary")}>{t("save")}</Button>
        </div>
        <div className="ast-keep__row">
          <div><p className="ast-keep__what">{t("exportReport")}</p><p className="ast-hint">{t("exportReportHint")}</p></div>
          <Button busy={busy === "report"} disabled={!!busy} onClick={() => setAsking("report")}>{t("save")}</Button>
        </div>
        {asking === "report" && <Confirm message={t("exportReportWarning")} confirmLabel={t("exportReportConfirm")} cancelLabel={t("cancel")}
          onCancel={() => setAsking(null)} onConfirm={() => { setAsking(null); void save("report"); }} />}
      </div>
      {done && upper(done.key) && <Notice tone="success" role="status" detail={done.path} action={<PathActions path={done.path} ctx={ctx} />}>{done.text(t)}</Notice>}
      {error && (upper(error.key) || error.key === "folder") && <Notice tone="danger" role="alert">{error.message}</Notice>}
      <p className="ast-hint ast-path">{savedTo ? say(t, "savedIn", { where: savedTo }) : t("savedBeside")}</p>
      {s.settings.exportDirectory !== undefined && (
        <Disclosure label={t("saveElsewhere")}>
          <div className="ast-actions"><Button disabled={!!busy} busy={busy === "pick:folder"} onClick={() => choose("folder", setTo)}>{t("chooseFolder")}</Button></div>
          <Field label={t("exportTo")} hint={t("exportToHint")}>
            <TextInput value={to} onChange={e => setTo(e.target.value)} disabled={!!busy} />
          </Field>
          <div className="ast-actions">
            <Button disabled={!!busy || !to.trim() || to.trim() === savedTo} onClick={() => setFolder(to.trim())}>{t("exportToRemember")}</Button>
            {savedTo && <Button variant="ghost" disabled={!!busy} onClick={() => { setTo(""); void setFolder(""); }}>{t("exportToReset")}</Button>}
          </div>
        </Disclosure>
      )}

      <h4 className="ast-subhead">{t("importTitle")}</h4>
      <p className="ast-hint">{t("importHint")}</p>
      {saved.length > 0 && (
        <>
          <p className="ast-keep__what ast-gap-top">{t("savedCopies")}</p>
          <ul className="ast-plain-list ast-backups">
            {saved.map(c => (
              <li key={c.path}>
                <span><time>{formatDateTime(c.at)}</time> <span className="ast-soft">{formatBytes(c.bytes)}</span></span>
                <Button variant="ghost" disabled={!!busy} busy={busy === `saved:${c.path}`} onClick={() => run(`saved:${c.path}`, "import", { path: c.path }, added)}>{t("importFromPath")}</Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="ast-actions">
        <Button busy={busy === "pick:file" || busy === "import"} disabled={!!busy} onClick={chooseAndImport}>{t("chooseFile")}</Button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={read} />
      </div>
      <Disclosure label={t("importElsewhere")}>
        <Field label={t("importPath")} hint={t("importPathHint")}>
          <TextInput value={path} onChange={e => setPath(e.target.value)} disabled={!!busy} />
        </Field>
        <div className="ast-actions"><Button disabled={!!busy || !path.trim()} busy={busy === "importPath"} onClick={() => run("importPath", "import", { path: path.trim() }, added)}>{t("importFromPath")}</Button></div>
      </Disclosure>
      {done && lower(done.key) && <Notice tone="success" role="status">{done.text(t)}</Notice>}
      {error && lower(error.key) && <Notice tone="danger" role="alert">{error.message}</Notice>}

      <h4 className="ast-subhead">{t("backups")}</h4>
      <p className="ast-hint">{keeping.every ? say(t, "backupsLead", { hours: keeping.every }) : t("backupsOff")}</p>
      {keeping.backups.length === 0 ? <p className="ast-empty">{t("backupsNone")}</p> : (
        <ul className="ast-plain-list ast-backups">
          {keeping.backups.map(b => (
            <li key={b.name}>
              <span><time>{formatDateTime(b.at)}</time> <span className="ast-soft">{formatBytes(b.bytes)}</span></span>
              <Button variant="ghost" disabled={!!busy} busy={busy === b.name} onClick={() => setAsking(b.name)}>{t("backupRestore")}</Button>
              {asking === b.name && <Confirm message={t("backupRestoreWarning")} confirmLabel={t("backupRestoreConfirm")} cancelLabel={t("cancel")}
                onCancel={() => setAsking(null)} onConfirm={() => { setAsking(null); void run(b.name, "import", { backup: b.name }, added); }} />}
            </li>
          ))}
        </ul>
      )}
      <div className="ast-actions"><Button disabled={!!busy} busy={busy === "backup"} onClick={() => run("backup", "backup", { projectId }, () => ({ text: t => t("backupMade"), path: null }))}>{t("backupNow")}</Button></div>
      <p className="ast-hint ast-path">{say(t, "keptIn", { where: keeping.directory })}</p>
      <PathActions path={keeping.directory} ctx={ctx} />
      {keeping.usage && (
        <>
          <h4 className="ast-subhead">{t("space")}</h4>
          <p className="ast-hint">{say(t, "usage", { store: formatBytes(keeping.usage.store), backups: formatBytes(keeping.usage.backups), exports: formatBytes(keeping.usage.exports) })}</p>
          <div className="ast-keep__row ast-gap-top">
            <div><p className="ast-keep__what">{t("reclaimTitle")}</p><p className="ast-hint">{t("reclaimHint")}</p></div>
            <Button busy={busy === "reclaim"} disabled={!!busy} onClick={() => setAsking("reclaim")}>{t("reclaimTitle")}</Button>
          </div>
          {asking === "reclaim" && <Confirm message={t("reclaimWarning")} confirmLabel={t("reclaimTitle")} cancelLabel={t("cancel")}
            onCancel={() => setAsking(null)} onConfirm={() => { setAsking(null); void run("reclaim", "reclaim", { projectId, trim: true }, v => ({ text: t => say(t, "reclaimDone", { size: formatBytes(v.freed), rows: v.rows }), path: null })); }} />}
        </>
      )}
      <h4 className="ast-subhead">{t("startOver")}</h4>
      <div className="ast-keep__row">
        <div><p className="ast-hint">{t("startOverHint")}</p></div>
        <Button variant="quiet-danger" busy={busy === "reset"} disabled={!!busy} onClick={() => setAsking("reset")}>{t("startOverButton")}</Button>
      </div>
      {/* Erasing everything says how much that is, and is not done by one press: the person says they know it cannot be undone before the button answers. */}
      {asking === "reset" && <Confirm message={t("startOverWarning")} confirmLabel={t("startOverButton")} cancelLabel={t("cancel")} blocked={!sure}
        onCancel={() => { setAsking(null); setSure(false); }} onConfirm={() => { setAsking(null); setSure(false); void run("reset", "reset", { projectId, confirm: "erase everything" }, () => ({ text: t => t("startOverDone"), path: null })); }}>
        <p className="ast-confirm__msg"><strong>{say(t, "startOverCount", { memories: keeping.memories ?? 0, copies: keeping.copies ?? keeping.backups.length + saved.length })}</strong></p>
        <label className="ast-confirm__sure"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} /> <span>{t("startOverSure")}</span></label>
      </Confirm>}
      {done && !upper(done.key) && !lower(done.key) && <Notice tone="success" role="status" detail={done.path}>{done.text(t)}</Notice>}
      {error && !upper(error.key) && !lower(error.key) && <Notice tone="danger" role="alert">{error.message}</Notice>}
    </Section>
  );
}

const modelValue = (provider, id) => JSON.stringify([provider, id]);

// The quick judge: an outside decision model, so its address, model and key
// are typed in by hand. The key is write-only: the panel is told whether one
// is saved, never what it is.
function Judge({ snapshot: s, ctx }) {
  const { t, model, state, projectId } = ctx;
  const v = s.settings;
  const [key, setKey] = React.useState(""), [url, setUrl] = React.useState(v.judgeUrl ?? ""), [name, setName] = React.useState(v.judgeModel ?? "");
  const [tested, setTested] = React.useState(null), [testing, setTesting] = React.useState(false);
  const dirty = key !== "" || url !== (v.judgeUrl ?? "") || name !== (v.judgeModel ?? "");
  const failed = state.error?.key?.startsWith("settings:judge") ? state.error : null;
  const save = async patch => { setTested(null); await model.perform("settings", { patch, projectId }, { key: "settings:judge", notice: "saved" }); setKey(""); };
  const test = async () => {
    setTesting(true); setTested(null);
    try { const r = await model.request("judgeTest", { projectId }); setTested({ ok: true, text: say(t, "judgeTestOk", { ms: r.ms, model: r.model }) }); }
    catch (e) { setTested({ ok: false, text: e.message }); }
    setTesting(false);
  };
  if (v.judgeMode === undefined) return null;   // an older backend
  return (
    <Disclosure label={t("judge")} aside={<span className="ast-disc__aside">{t(s.judge ? "stateOn" : "stateOff")}</span>}>
      <p className="ast-section__lead">{t("judgeLead")}</p>
      <p className="ast-hint ast-gap">{s.judge ? say(t, "judge_" + s.judge.mode, { model: s.judge.model }) : t("judgeOff")}</p>
      {s.judge?.compared > 0 && <p className="ast-hint ast-gap">{say(t, "judgeAgreed", { agree: s.judge.agree, compared: s.judge.compared })} {t(s.judge.compared >= 30 && s.judge.agree / s.judge.compared >= 0.9 ? "judgeReady" : "judgeNotYet")}</p>}
      <Field label={t("judgeKey")} hint={t(s.judgeKeySet ? "judgeKeySaved" : "judgeKeyHint")}>
        <TextInput type="password" autoComplete="off" value={key} placeholder={s.judgeKeySet ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : ""} onChange={e => setKey(e.target.value)} disabled={state.busy} />
      </Field>
      <Field label={t("judgeUrl")} hint={t("judgeUrlHint")}>
        <TextInput value={url} placeholder="https://api.typesafe.ai/v1/systemone" onChange={e => setUrl(e.target.value)} disabled={state.busy} />
      </Field>
      <Field label={t("judgeModel")} hint={t("judgeModelHint")}>
        <TextInput value={name} placeholder="jev-1.13.0" onChange={e => setName(e.target.value)} disabled={state.busy} />
      </Field>
      <Field label={t("judgeMode")} hint={t("judgeModeHint_" + v.judgeMode)}>
        <Select value={v.judgeMode} disabled={state.busy} onChange={e => save({ judgeMode: e.target.value })}>
          <option value="shadow">{t("judgeMode_shadow")}</option>
          <option value="judge">{t("judgeMode_judge")}</option>
          <option value="model">{t("judgeMode_model")}</option>
        </Select>
      </Field>
      <p className="ast-hint">{t("judgePrivacy")}</p>
      {failed && <Notice tone="danger" role="alert">{failed.message}</Notice>}
      {tested && <Notice tone={tested.ok ? "success" : "danger"} role="status">{tested.text}</Notice>}
      <div className="ast-actions">
        <Button variant="primary" disabled={!dirty || state.busy} busy={state.busyKey === "settings:judge"} onClick={() => save({ judgeUrl: url, judgeModel: name, ...(key ? { judgeKey: key } : {}) })}>{t("saveChanges")}</Button>
        <Button disabled={!s.judge || dirty || state.busy} busy={testing} onClick={test}>{t("judgeTest")}</Button>
        {s.judgeKeySet && <Button variant="ghost" disabled={state.busy} onClick={() => save({ judgeKey: "" })}>{t("judgeKeyRemove")}</Button>}
      </div>
    </Disclosure>
  );
}

// How long to wait for the model and how often to work in the background.
// Shown in seconds, minutes and hours; stored as the backend counts them.
const PACE = [
  ["prepareTimeoutMs", 1000, "sec"], ["timeoutMs", 1000, "sec"], ["outcomeDelayMs", 1000, "sec"], ["sleepIntervalMs", 60000, "min"],
  ["roundCalls", 1, "count"], ["roundEveryMs", 1000, "sec"], ["backupEveryHours", 1, "hours"], ["backupKeep", 1, "count"], ["exportKeep", 1, "count"],
];
function Pace({ snapshot: s, ctx }) {
  const { t, model, state, projectId } = ctx;
  const v = s.settings, limits = s.limits;
  const shown = k => PACE.find(p => p[0] === k)[1];
  const start = () => Object.fromEntries(PACE.filter(([k]) => v[k] !== undefined).map(([k, unit]) => [k, String(v[k] / unit)]));
  const [draft, setDraft] = React.useState(start);
  if (!limits || v.prepareTimeoutMs === undefined) return null;   // an older backend
  const patch = {}, bad = {};
  for (const [k, unit] of PACE) {
    if (draft[k] === undefined) continue;
    const n = Number(draft[k]) * unit, lim = limits[k];
    if (draft[k].trim() === "" || !Number.isFinite(n) || n < lim.min || n > lim.max) bad[k] = true;
    else if (Math.round(n) !== v[k]) patch[k] = Math.round(n);
  }
  const dirty = Object.keys(patch).length > 0, invalid = Object.keys(bad).length > 0;
  const failed = state.error?.key === "settings:pace" ? state.error : null;
  const defaults = () => setDraft(Object.fromEntries(PACE.map(([k, unit]) => [k, String(limits[k].default / unit)])));
  return (
    <Disclosure label={t("pace")}>
      <p className="ast-section__lead">{t("paceLead")}</p>
      <div className="ast-pace">
        {PACE.filter(([k]) => draft[k] !== undefined).map(([k, unit, word]) => (
          <Field key={k} label={t("pace_" + k)} hint={<>{t("paceHint_" + k)} {say(t, "paceRange", { min: limits[k].min / unit, max: limits[k].max / unit, unit: t("unit_" + word) })}</>}>
            <span className="ast-number">
              <TextInput inputMode="decimal" value={draft[k]} aria-invalid={bad[k] || undefined} onChange={e => setDraft({ ...draft, [k]: e.target.value })} disabled={state.busy} />
              <span className="ast-soft">{t("unit_" + word)}</span>
            </span>
          </Field>
        ))}
      </div>
      {failed && <Notice tone="danger" role="alert">{failed.message}</Notice>}
      <div className="ast-actions">
        <Button variant="primary" disabled={!dirty || invalid || state.busy} busy={state.busyKey === "settings:pace"}
          onClick={() => model.perform("settings", { patch, projectId }, { key: "settings:pace", notice: "saved" })}>{t("saveChanges")}</Button>
        <Button variant="ghost" disabled={state.busy} onClick={defaults}>{t("paceDefaults")}</Button>
      </div>
    </Disclosure>
  );
}

// Each assistant and user pair has its own memory. This lists the ones kept on
// this computer; which one is in use follows who is talking in the host.
function PeopleList({ ctx }) {
  const { t, model, projectId } = ctx;
  const [people, setPeople] = React.useState(null), [error, setError] = React.useState(null);
  React.useEffect(() => { let live = true; model.request("people", { projectId }).then(v => live && setPeople(v), e => live && setError(e.message)); return () => { live = false; }; }, [model, projectId]);
  if (error) return <Notice tone="danger" role="alert">{error}</Notice>;
  if (!people) return <p className="ast-empty"><Spinner /> {t("loading")}</p>;
  return (
    <>
      <p className="ast-section__lead">{t("peopleLead")}</p>
      <ul className="ast-plain-list ast-backups">
        {people.map(p => (
          <li key={p.id}>
            <span>{p.name || t("peopleUnnamed")}{p.userName ? say(t, "peopleFor", { user: p.userName }) : ""}{p.current && <span className="ast-soft"> {t("peopleCurrent")}</span>}</span>
            <span className="ast-soft">{say(t, p.memories === 1 ? "inUseOne" : "peopleCount", { n: p.memories })}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
// Plays a fixed set of situations with the model memory uses and says how many
// came out as designed. It is the only way to know whether a given model works
// with this memory, so it is run where the model is: here.
function CheckBody({ snapshot: s, ctx }) {
  const { t, model, state, projectId } = ctx;
  const running = s.selfcheck?.running, last = s.selfcheck?.last;
  React.useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => { void model.refresh(projectId); }, 5000);
    return () => clearInterval(timer);
  }, [!!running, model, projectId]);
  const failed = state.error?.key === "selfcheck" ? state.error : null;
  return (
    <>
      <p className="ast-section__lead">{t("checkLead")}</p>
      {running && <p className="ast-hint ast-gap"><Spinner /> {say(t, "checkRunning", { done: running.done, total: running.total || "\u2026" })}</p>}
      {!running && last && (last.error
        ? <Notice tone="danger" detail={last.error}>{t("checkFailed")}</Notice>
        : <>
            <p className="ast-gap">{say(t, "checkResult", { passed: last.passed, total: last.total, model: last.model, when: formatDateTime(last.at) })}</p>
            <ul className="ast-plain-list ast-backups">
              {last.scenarios.map(sc => <li key={sc.name}><span>{sc.name}</span><span className="ast-soft">{sc.passed}/{sc.total}</span></li>)}
            </ul>
          </>)}
      {!running && !last && <p className="ast-empty">{t("checkNever")}</p>}
      {failed && <Notice tone="danger" role="alert">{failed.message}</Notice>}
      <div className="ast-actions"><Button disabled={!!running || state.busy} busy={state.busyKey === "selfcheck"} onClick={() => model.perform("selfcheck", { projectId }, { key: "selfcheck", notice: "checkStarted" })}>{t("checkRun")}</Button></div>
    </>
  );
}
const Check = ({ snapshot, ctx }) => snapshot.selfcheck ? <Disclosure label={ctx.t("check")}><CheckBody snapshot={snapshot} ctx={ctx} /></Disclosure> : null;
const People = ({ ctx }) => <Disclosure label={ctx.t("people")}><PeopleList ctx={ctx} /></Disclosure>;

// Where opening Asteme from the side bar leads: the conversation, or straight to looking after memory. Kept with this screen.
function ArriveSwitch({ t }) {
  const [talk, setTalk] = React.useState(arriveAt() === "talk");
  return <Switch label={t("arriveTalk")} hint={t("arriveTalkHint")} checked={talk} onChange={on => { setArriveAt(on ? "talk" : "review"); setTalk(on); }} />;
}

export function SettingsView({ snapshot: s, ctx, onTalkSettings }) {
  const { t, state, model, projectId } = ctx;
  const idBase = React.useId();
  const v = s.settings;
  const failed = ["settings:enabled", "settings:model", "settings:language"].includes(state.error?.key) ? state.error : null;
  // Sends only what changed; the backend keeps the rest.
  const apply = (field, change) => model.perform("settings", { patch: change, projectId }, { key: `settings:${field}`, notice: "saved" });
  const current = v.learningModel ? modelValue(v.learningProvider, v.learningModel) : "";
  const listed = s.models.some(m => m.provider === v.learningProvider && m.id === v.learningModel);
  const d = s.diagnosis, h = d?.health;
  const slow = h && h.calls >= 4 && h.failed / h.calls >= 0.25;
  // 0.8.0-alpha.2 sent sentences only; later versions send a code with each.
  const idle = d?.sleep.idle?.map((i, n) => ({ ...i, text: d.sleep.idleBecause?.[n] })) ?? (d?.sleep.idleBecause ?? []).map(text => ({ code: text, text }));

  // The settings were one long column of nine parts. They are four short pages, each answering one question: what is remembered; how this is shown and which model
  // does the work; what is kept and how to take it away; and how it is doing. The first is where one arrives, since it is what people come to change.
  const [group, setGroup] = React.useState("scope");
  const groups = [{ key: "scope", label: t("settingsScope") }, { key: "show", label: t("settingsShow") }, { key: "data", label: t("settingsData") }, { key: "state", label: t("settingsState") }];
  const near = key => state.error?.key === key ? <Notice tone="danger" role="alert">{state.error.message}</Notice> : null;
  return (
    <article className="ast-account">
      <header className="ast-account__head"><h3 className="ast-account__claim">{t("settings")}</h3></header>
      <Tabs idBase={idBase} label={t("settings")} tabs={groups} value={group} onChange={setGroup} />
      {group === "show" && s.canTalk && onTalkSettings && (
        <Section title={t("talkSettings")} lead={t("talkSettingsLead")}>
          <ArriveSwitch t={t} />
          <div className="ast-actions"><Button onClick={onTalkSettings}>{t("talkSettingsOpen")}</Button></div>
        </Section>
      )}
      {group === "scope" && <Section title={t("memory")} lead={t("scopeAllLead")}>
        <Switch label={t(v.enabled ? "memoryOn" : "memoryOff")} hint={t(v.enabled ? "memoryOnHint" : "memoryOffHint")} checked={!!v.enabled}
          disabled={state.busy} busy={state.busyKey === "settings:enabled"} onChange={enabled => apply("enabled", { enabled })} />
        {/* What happens to a conversation nothing was chosen for. Either way the mark in each conversation's input says which it is and switches it. */}
        {v.enabled && s.quietDefault !== undefined && (
          <Switch label={t("rememberNew")} hint={t(s.quietDefault ? "rememberNewOffHint" : "rememberNewOnHint")} checked={!s.quietDefault}
            disabled={state.busy} busy={state.busyKey === "privateDefault"} onChange={on => ctx.model.perform("privateDefault", { on: !on, projectId: ctx.projectId }, { key: "privateDefault", notice: "saved" })} />
        )}
        {near("privateDefault")}
        {group === "scope" && ["settings:enabled"].includes(state.error?.key) && <Notice tone="danger" role="alert">{state.error.message}</Notice>}
      </Section>}
      {group === "scope" && (s.wall !== undefined || s.projectOff !== undefined) && (
        <Section title={t("scopeProject")} lead={t("scopeProjectLead")}>
          {/* The two switches below act on one project. It is named here, and can be changed here. */}
          <label className="ast-scope">
            <span>{t("project")}</span>
            {s.projects.length > 1
              ? <Select value={s.projectId} disabled={state.busy || state.loading} onChange={e => model.refresh(e.target.value)}>
                  {s.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              : <strong className="ast-scope__one">{s.projects.find(p => p.id === s.projectId)?.label ?? t("scopeProjectNone")}</strong>}
          </label>
          {s.wall !== undefined && (
            <Switch label={t("wall")} hint={t(s.wall ? "wallOnHint" : "wallOffHint")} checked={!!s.wall} disabled={state.busy} busy={state.busyKey === "wall"}
              onChange={on => model.perform("wall", { projectId, on }, { key: "wall", notice: "saved" })} />
          )}
          {s.projectOff !== undefined && (
            <Switch label={t("projectOff")} hint={t(s.projectOff ? "projectOffOnHint" : "projectOffOffHint")} checked={!!s.projectOff} disabled={state.busy} busy={state.busyKey === "projectOff"}
              onChange={on => model.perform("projectOff", { projectId, on }, { key: "projectOff", notice: "saved" })} />
          )}
          {near("wall")}{near("projectOff")}
        </Section>
      )}

      {group === "show" && v.language !== undefined && (
        <Section title={t("language")}>
          <Field label={t("languageLabel")} hint={t("languageHint")}>
            <Select value={v.language} disabled={state.busy} onChange={e => apply("language", { language: e.target.value })}>
              <option value="">{t("languageHost")}</option>
              <option value="en">English</option>
              <option value="ja">{"\u65e5\u672c\u8a9e"}</option>
              <option value="zh">{"\u4e2d\u6587"}</option>
              <option value="de">Deutsch</option>
              <option value="es">{"Espa\u00f1ol"}</option>
              <option value="fr">{"Fran\u00e7ais"}</option>
              <option value="pt">{"Portugu\u00eas"}</option>
              <option value="ru">{"\u0420\u0443\u0441\u0441\u043a\u0438\u0439"}</option>
            </Select>
          </Field>
        </Section>
      )}
      {group === "show" && <Section title={t("thinkingModel")} lead={t("thinkingModelLead")}>
        <Field label={<>{t("model")}{state.busyKey === "settings:model" && <Spinner />}</>} hint={t("modelHint")}>
          <Select value={current} disabled={state.busy} onChange={e => {
            const [learningProvider, learningModel] = e.target.value ? JSON.parse(e.target.value) : ["", ""];
            void apply("model", { learningProvider, learningModel });
          }}>
            <option value="">{t("sameModel")}</option>
            {v.learningModel && !listed && <option value={current}>{v.learningModel} ({t("unavailable")})</option>}
            {s.models.map(m => <option key={modelValue(m.provider, m.id)} value={modelValue(m.provider, m.id)}>{m.label}</option>)}
          </Select>
        </Field>
        {s.modelErrors.length > 0 && <Notice tone="warning" detail={s.modelErrors.join(", ")}>{t("catalogError")}</Notice>}
        {failed && failed.key !== "settings:enabled" && <Notice tone="danger" role="alert">{failed.message}</Notice>}
        {v.judgeMode === undefined && <p className="ast-hint">{s.judge ? say(t, "judge_" + s.judge.mode, { model: s.judge.model }) : t("judgeOff")}</p>}
      </Section>}

      {group === "state" && <Section title={t("health")} aside={s.usage?.day}>
        {s.error && <Notice tone="danger" detail={s.error}>{t("lastError")}</Notice>}
        {slow && <Notice tone="warning" detail={h.lastError}>{say(t, "modelSlow", { n: h.failed, total: h.calls, timeouts: h.timeouts })}</Notice>}
        {d?.reflection?.unread > 0 && d.reflection.failing?.length > 0 && <Notice tone="warning" detail={d.reflection.failing[0].error}>{say(t, d.reflection.unread === 1 ? "unreadOne" : "unreadMany", { n: d.reflection.unread })}</Notice>}
        <dl className="ast-stats">
          <div><dt>{t("statCalls")}</dt><dd>{formatNumber(s.usage?.calls)}</dd></div>
          <div><dt>{t("statTokens")}</dt><dd>{formatNumber(s.usage?.tokens)}</dd></div>
          <div><dt>{t("statPending")}</dt><dd>{formatNumber(s.pending)}</dd></div>
          {d && <div><dt>{t("statQueued")}</dt><dd>{formatNumber(Object.values(d.sleep.queued).reduce((a, b) => a + b, 0))}</dd></div>}
        </dl>
        {d && (
          <ul className="ast-plain-list ast-soft">
            <li>{d.sleep.last ? say(t, "healthSlept", { when: formatDateTime(d.sleep.last) }) : t("healthNeverSlept")}</li>
            <li>{say(t, "healthEpisodes", { n: d.sleep.episodes, out: d.sleep.standingOut })}</li>
            <li>{say(t, "healthOutcomes", { done: d.outcomes.assessed, total: d.outcomes.deliveries, waiting: d.outcomes.waiting.length })}</li>
            {d.sleep.failed > 0 && <li>{say(t, "healthFailed", { n: d.sleep.failed })}</li>}
            {idle.map(i => <li key={i.code}>{idleWord(t, i)}</li>)}
          </ul>
        )}
        {s.notice && <p className="ast-hint">{labelFor(t, s.notice, s.notice)}</p>}
        <div className="ast-actions">
          <Button busy={state.loading} disabled={state.busy} onClick={() => model.refresh(projectId)}>{t("refresh")}</Button>
          {s.canTidy && <Button variant="ghost" disabled={state.busy} busy={state.busyKey === "tidy"}
            onClick={() => model.perform("tidy", { projectId }, { key: "tidy", notice: "tidyStarted" })}>{t("tidyNow")}</Button>}
        </div>
        {s.canTidy && <p className="ast-hint">{t("tidyHint")}</p>}
      </Section>}
      {group === "data" && <Keeping snapshot={s} ctx={ctx} />}
      {group === "state" && v.judgeMode !== undefined && (
        <Section title={t("advanced")} lead={t("advancedLead")}>
          <Judge snapshot={s} ctx={ctx} />
          <Pace snapshot={s} ctx={ctx} />
          <Check snapshot={s} ctx={ctx} />
          <People ctx={ctx} />
        </Section>
      )}
    </article>
  );
}


