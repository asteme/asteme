// The account of one memory: what it says, whose words it rests on, where it
// applies, how it comes to mind, how its use has gone, what it is tied to, and
// every action that can be taken on it. This is where "why do you think that"
// and "how do I remove it" are answered, on one page, ending at the user's own
// messages.
import React, { useEffect, useState } from "react";
import { formatDateTime } from "./format.mjs";
import { calledWord, inUse, keepsWord, kindWord, outcomeTitle, recallLevel, recallReason, say, sharesSources, stateWord, verdictWord, reasonWord } from "./words.mjs";
import { Button, Chip, Confirm, Disclosure, Facts, Notice, Section, Skeleton, Star, TextLink, Trace, TracePoint, useConfirm } from "./ui.jsx";

/** Loads the full account. The snapshot already holds enough to show the page at once; this fills in the rest. */
function useAccount(model, item) {
  const [account, setAccount] = useState({ status: "loading" });
  const key = item ? `${item.id}:${item.revision}:${item.accessibility}` : null;
  const load = () => {
    let live = true;
    setAccount(a => ({ ...a, status: "loading" }));
    model.request("why", { item: item.id }).then(
      value => live && setAccount({ status: "ready", why: value }),
      error => live && setAccount({ status: "error", message: error.message }));
    return () => { live = false; };
  };
  useEffect(() => (key ? load() : undefined), [key]);
  return [account, load];
}

function Sources({ item, why, ctx }) {
  const { t, model, projectId } = ctx;
  const [full, setFull] = useState(null);
  const show = async () => {
    setFull({ status: "loading" });
    try { setFull({ status: "ready", events: (await model.request("sources", { item: item.id, projectId })).events ?? [] }); }
    catch (error) { setFull({ status: "error", message: error.message }); }
  };
  const supports = why?.supports ?? item.evidence.map(e => ({ id: e.id, quote: e.quote }));
  const who = role => role === "user" ? t("you") : role === "assistant" ? t("theAssistant") : role === "tool" ? t("aTool") : "";
  return (
    <Section title={t("restsOn")} lead={t(item.level === "lesson" ? "restsOnLessonLead" : "restsOnLead")}>
      <Trace>
        {full?.status === "ready"
          ? full.events.map(e => (
              <TracePoint key={e.id} mark="solid">
                <p className="ast-trace__label">{who(e.role)}{formatDateTime(e.occurredAt ?? e.observedAt) ? `, ${formatDateTime(e.occurredAt ?? e.observedAt)}` : ""}</p>
                <p className="ast-quote ast-quote--full">{e.content}</p>
              </TracePoint>))
          : supports.map(sup => (
              <TracePoint key={sup.id + sup.quote} mark="solid">
                <p className="ast-trace__label">{who(sup.role) || t("you")}{sup.at ? `, ${formatDateTime(sup.at)}` : ""}</p>
                <p className="ast-quote">{sup.quote}</p>
              </TracePoint>))}
        {(why?.against ?? item.against ?? []).map(a => (
          <TracePoint key={"against" + a.id + a.quote} mark="cross" tone="danger">
            <p className="ast-trace__label">{t("speaksAgainst")}{a.at ? `, ${formatDateTime(a.at)}` : ""}</p>
            {a.quote && <p className="ast-quote">{a.quote}</p>}
            {a.reason && <p className="ast-soft">{a.reason}</p>}
          </TracePoint>
        ))}
      </Trace>
      {full?.status === "error" && <Notice tone="danger" role="alert" detail={full.message} action={<Button onClick={show}>{t("retry")}</Button>}>{t("loadFailed")}</Notice>}
      {full?.status !== "ready" && <Button variant="ghost" busy={full?.status === "loading"} onClick={show}>{t("showFull")}</Button>}
    </Section>
  );
}

function Actions({ item, items, ctx }) {
  const { t, state, model, projectId } = ctx;
  const remove = useConfirm(), forget = useConfirm();
  const live = inUse(item), busy = op => state.busyKey === `memory:${item.id}:${op}`;
  const act = (operation, notice) => model.perform("memory", { projectId, item: item.id, revision: item.revision, operation }, { key: `memory:${item.id}:${operation}`, notice });
  const failed = state.error?.key?.startsWith(`memory:${item.id}:`) ? state.error : null;
  const also = sharesSources(item, items), sources = new Set(item.evidence.map(e => e.id)).size;
  if (remove.open) return (
    <Confirm message={t("deleteWarning")} confirmLabel={t("deleteConfirm")} cancelLabel={t("cancel")} busy={busy("delete")} onConfirm={() => act("delete", "deleted")} onCancel={remove.cancel} />
  );
  if (forget.open) return (
    <Confirm message={say(t, sources === 1 ? "forgetWarningOne" : "forgetWarningMany", { n: sources })} confirmLabel={t("forgetConfirm")} cancelLabel={t("cancel")}
      busy={busy("forget")} onConfirm={() => act("forget", "forgotten")} onCancel={forget.cancel}>
      {also.length > 0 && <>
        <p className="ast-confirm__msg">{say(t, also.length === 1 ? "forgetAlsoOne" : "forgetAlsoMany", { n: also.length })}</p>
        <ul className="ast-confirm__list">{also.map(o => <li key={o.id}>{o.text}</li>)}</ul>
      </>}
      <p className="ast-confirm__msg">{t("forgetKeeps")}</p>
      <p className="ast-confirm__msg">{t("forgetCopies")}</p>
    </Confirm>
  );
  return (
    <>
      {failed && <Notice tone="danger" role="alert">{failed.message}</Notice>}
      <div className="ast-actions">
        {live && item.status === "doubtful" && <Button variant="primary" busy={busy("confirm")} disabled={state.busy} onClick={() => act("confirm", "confirmed")}>{t("stillTrue")}</Button>}
        {live && <Button busy={busy("pause")} disabled={state.busy} onClick={() => act("pause", "paused")}>{t("stopUsing")}</Button>}
        {item.paused && <Button variant="primary" busy={busy("resume")} disabled={state.busy} onClick={() => act("resume", "resumed")}>{t("useAgain")}</Button>}
        {live && <Button busy={busy("retire")} disabled={state.busy} onClick={() => act("retire", "closed")}>{t("noLongerTrue")}</Button>}
        {live && item.projectId && ctx.snapshot?.wall === false && (item.confined
          ? <Button busy={busy("release")} disabled={state.busy} onClick={() => act("release", "saved")}>{t("useEverywhere")}</Button>
          : <Button busy={busy("confine")} disabled={state.busy} onClick={() => act("confine", "saved")}>{t("useHereOnly")}</Button>)}
        {!item.paused && item.status === "retired" && <Button busy={busy("reopen")} disabled={state.busy} onClick={() => act("reopen", "reopened")}>{t("putBack")}</Button>}
      </div>
      <div className="ast-actions ast-actions--quiet">
        {item.paused && <Button variant="quiet-danger" ref={remove.triggerRef} disabled={state.busy} onClick={remove.ask}>{t("delete")}</Button>}
        <Button variant="quiet-danger" ref={forget.triggerRef} disabled={state.busy} onClick={forget.ask}>{t("forget")}</Button>
      </div>
      <p className="ast-hint">{t(item.paused ? "actionsHintPaused" : live ? "actionsHintLive" : "actionsHintClosed")}</p>
      {live && (item.confined || ctx.snapshot?.wall) && <p className="ast-hint">{t(ctx.snapshot?.wall ? "confinedByProject" : "confinedNote")}</p>}
    </>
  );
}

export function MemoryDetail({ id, snapshot: s, ctx }) {
  const { t, nav, model } = ctx;
  const items = s.memory.state.items, item = items.find(i => i.id === id);
  const [account, reload] = useAccount(model, item);
  // Deleted or forgotten from here: there is nothing left to show.
  useEffect(() => { if (!item) nav.back(); }, [!item]);
  if (!item) return null;
  const why = account.why, live = inUse(item), level = recallLevel(item);
  const used = (s.memory.delivery?.delivered ?? []).some(i => i.id === id);
  const link = other => other && <TextLink onClick={() => nav.memory(other.id)}>{other.text}</TextLink>;
  const replacedBy = item.supersededBy && items.find(i => i.id === item.supersededBy);
  const replaced = item.supersedes && items.find(i => i.id === item.supersedes);
  const pending = account.status === "loading" && !why;

  return (
    <article className="ast-account">
      <header className="ast-account__head">
        <p className="ast-account__kind">
          <Star level={level} tone={item.status === "doubtful" && live ? "warning" : "plain"} lit={used} />
          {kindWord(t, item)}
          <Chip tone={item.status === "doubtful" && live ? "warning" : "neutral"}>{stateWord(t, item)}</Chip>
          {used && <Chip tone="lit">{t("usedLast")}</Chip>}
          {item.sensitive?.length > 0 && <Chip>{t("private")}</Chip>}
        </p>
        <h3 className="ast-account__claim">{item.text}</h3>
        {item.reason && <p className="ast-account__reason">{reasonWord(t, item.reason)}</p>}
        {item.grounds === "seen" && live && <p className="ast-soft">{t("readNotSaid")}</p>}
        {!live && !item.paused && <p className="ast-soft">
          {item.closeReason}{item.validUntil ? ` ${say(t, "heldUntil", { when: formatDateTime(item.validUntil) })}` : ""}
          {replacedBy && <> {t("replacedBy")} {link(replacedBy)}</>}
        </p>}
        {item.status === "doubtful" && live && <p className="ast-soft">{say(t, item.doubt?.by === "user" ? "doubtYou" : "doubtLater", { why: item.doubt?.reason ?? item.against?.at(-1)?.reason ?? t("putInDoubt") })}</p>}
      </header>

      <Sources item={item} why={why} ctx={ctx} />

      <Section title={t("applies")}>
        <Facts rows={[
          [t("appliesWhen"), item.concrete],
          [t("appliesGenerally"), item.general],
          [t("established"), item.tested],
          [t("untried"), item.hypothesis],
          [t("endsWhen"), item.closure?.when],
          [t("overTime"), item.kind === "understanding" && keepsWord(t, item.volatility)],
        ]} />
      </Section>

      <Section title={t("comesToMind")} lead={!live ? t("notRecalled") : recallReason(t, item) ? `${t("recall_" + level)}: ${recallReason(t, item)}.` : `${t("recall_" + level)}.`}>
        {pending ? <Skeleton lines={3} /> : why && (
          <ul className="ast-scenes">
            {why.recall.answersTo.map(c => <li key={"+" + c.scene}><span className="ast-scenes__mark" aria-hidden="true" />{c.scene}<span className="ast-soft"> ({calledWord(t, c.because)})</span></li>)}
            {why.recall.staysOutOf.map(c => <li key={"-" + c.scene} className="ast-scenes__out"><span className="ast-scenes__mark" aria-hidden="true" />{say(t, "staysOut", { scene: c.scene })}</li>)}
          </ul>
        )}
      </Section>

      <Section title={t("useSoFar")}>
        {pending ? <Skeleton lines={2} /> : !why?.outcomes.length ? <p className="ast-empty">{t("noUseYet")}</p> : (
          <Trace>
            {why.outcomes.map((o, n) => (
              <TracePoint key={n} mark={o.kind === "helped" || o.kind === "missed" ? "solid" : o.kind === "wrong" ? "cross" : "hollow"} tone={o.kind === "wrong" ? "danger" : "plain"}>
                <p className="ast-trace__label">{outcomeTitle(t, o.kind)}{o.at ? `, ${formatDateTime(o.at)}` : ""}</p>
                {o.scene && <p>{o.scene}</p>}
                {o.evidence?.[0]?.quote ? <p className="ast-quote">{o.evidence[0].quote}</p> : o.reason && <p className="ast-soft">{o.reason}</p>}
              </TracePoint>
            ))}
          </Trace>
        )}
      </Section>

      {(why?.drawnFrom.length > 0 || why?.usedBy.length > 0 || replaced || why?.disputes.length > 0) && (
        <Section title={t("connected")}>
          <Facts rows={[
            [t("drawnFrom"), why?.drawnFrom.length > 0 && <ul className="ast-plain-list">{why.drawnFrom.map(p => <li key={p.id}>{link(p)}</li>)}</ul>],
            [t("builtOn"), why?.usedBy.length > 0 && <ul className="ast-plain-list">{why.usedBy.map(u => <li key={u.id ?? u.habit}>{u.habit ? <TextLink onClick={() => nav.habit(u.habit)}>{u.text}</TextLink> : link(u)}</li>)}</ul>],
            [t("replaces"), replaced && link(replaced)],
            [t("disagrees"), why?.disputes.length > 0 && <ul className="ast-plain-list">{why.disputes.map((d, n) => <li key={n}>{link(d.with)} <span className="ast-soft">({d.state === "open" ? t("disputeOpen") : verdictWord(t, d.verdict)})</span></li>)}</ul>],
          ]} />
        </Section>
      )}

      {account.status === "error" && <Notice tone="danger" role="alert" detail={account.message} action={<Button onClick={reload}>{t("retry")}</Button>}>{t("loadFailed")}</Notice>}
      {why?.history.length > 0 && (
        <Disclosure label={t("history")} count={why.history.length}>
          <ol className="ast-history">
            {why.history.map((h, n) => <li key={n}><time>{formatDateTime(h.at)}</time><span>{reasonWord(t, h.reason)}</span></li>)}
          </ol>
        </Disclosure>
      )}

      <Section title={t("actions")}><Actions item={item} items={items} ctx={ctx} /></Section>
    </article>
  );
}

export function HabitDetail({ habitKey, snapshot: s, ctx }) {
  const { t, nav, state, model, projectId } = ctx;
  const habit = (s.learning?.habits ?? []).find(h => h.key === habitKey), remove = useConfirm();
  useEffect(() => { if (!habit) nav.back(); }, [!habit]);
  if (!habit) return null;
  const items = s.memory.state.items, key = `habit:${habit.key}`;
  return (
    <article className="ast-account">
      <header className="ast-account__head">
        <p className="ast-account__kind"><Star level="easily" />{t("kind_habit")}<Chip>{t("alwaysOn")}</Chip></p>
        <h3 className="ast-account__claim">{habit.text}</h3>
        {habit.reason && <p className="ast-account__reason">{reasonWord(t, habit.reason)}</p>}
      </header>
      <Section title={t("applies")}>
        <Facts rows={[[t("established"), habit.tested], [t("untried"), habit.hypothesis], [t("since"), formatDateTime(habit.at)]]} />
      </Section>
      <Section title={t("drawnFrom")} lead={t("habitFromLead")}>
        <ul className="ast-plain-list">
          {(habit.from ?? []).map(id => { const item = items.find(i => i.id === id); return <li key={id}>{item ? <TextLink onClick={() => nav.memory(id)}>{item.text}</TextLink> : <span className="ast-soft">{t("goneMemory")}</span>}</li>; })}
        </ul>
      </Section>
      <Section title={t("actions")}>
        {remove.open ? (
          <Confirm message={t("habitRemoveWarning")} confirmLabel={t("habitRemoveConfirm")} cancelLabel={t("cancel")} busy={state.busyKey === key}
            onConfirm={() => model.perform("habit", { key: habit.key, projectId }, { key, notice: "habitRemoved" })} onCancel={remove.cancel} />
        ) : <div className="ast-actions"><Button variant="quiet-danger" ref={remove.triggerRef} disabled={state.busy} onClick={remove.ask}>{t("habitRemove")}</Button></div>}
        <p className="ast-hint">{t("habitRemoveHint")}</p>
      </Section>
    </article>
  );
}
