// Review: the first thing a person sees. Two questions, in this order:
// is anything waiting for me, and what did it just do with what it knows.
//
// Every answer given here is an outcome the core learns from. That is why the
// questions are asked where the evidence is in front of the person, and why
// each takes one click.
import React, { useState } from "react";
import { formatDateTime } from "./format.mjs";
import { say, useWord, outcomeWord, calledWord, decisionWord } from "./words.mjs";
import { Button, Disclosure, Notice, Section, Star, TextLink, Trace, TracePoint } from "./ui.jsx";

// --- A verdict on one memory in the last reply --------------------------------
function Verdict({ request, item, used, outcome, ctx }) {
  const { t, state, model, projectId } = ctx;
  const [changing, setChanging] = useState(false);
  const key = kind => `verdict:${item}:${kind}`;
  const give = kind => model.perform("feedback", { projectId, request, item, kind }, { key: key(kind), notice: "verdictSaved" }).then(() => setChanging(false));
  if (outcome && !changing) {
    const mine = outcome.by === "user";
    return (
      <p className="ast-verdict ast-verdict--given">
        <span>{say(t, mine ? "youSaid" : "itRead", { what: outcomeWord(t, outcome.kind) })}</span>
        {!mine && outcome.reason && <span className="ast-verdict__why">{outcome.reason}</span>}
        {mine
          ? <TextLink disabled={state.busy} onClick={() => model.perform("feedback", { projectId, request, item, undo: true }, { key: key("undo"), notice: "verdictUndone" })}>{t("undo")}</TextLink>
          : <TextLink disabled={state.busy} onClick={() => setChanging(true)}>{t("disagree")}</TextLink>}
      </p>
    );
  }
  const choices = used ? [["helped", "verdictHelped"], ["irrelevant", "verdictMisplaced"], ["wrong", "verdictWrong"]] : [["missed", "verdictMissed"]];
  return (
    <div className="ast-verdict" role="group" aria-label={t(used ? "askRight" : "askMissed")}>
      {used && <span className="ast-verdict__ask">{t("askRight")}</span>}
      <span className="ast-verdict__choices">
        {choices.map(([kind, label]) => (
          <Button key={kind} className="ast-btn--choice" busy={state.busyKey === key(kind)} disabled={state.busy} onClick={() => give(kind)}>{t(label)}</Button>
        ))}
      </span>
    </div>
  );
}

// --- What the last reply had in view --------------------------------------------
function LastReply({ delivery, items, ctx }) {
  const { t, nav } = ctx;
  if (!delivery) return <Section title={t("lastReply")}><p className="ast-empty">{t("noReplyYet")}</p></Section>;
  const byId = new Map(items.map(i => [i.id, i]));
  // What the reply used from another project, or from the conversation with Asteme: it exists, it is only not in this project's list.
  const away = new Map((delivery.elsewhere ?? []).map(i => [i.id, i]));
  const outcomeOf = id => (delivery.outcomes ?? []).find(o => o.item === id);
  const used = delivery.delivered ?? [], usedIds = new Set(used.map(i => i.id));
  const held = (delivery.heldBack?.suppressed ?? []).filter(h => byId.has(h.id) || away.has(h.id));
  const heldIds = new Set(held.map(h => h.id));
  // Considered and left out: an explicit "not now", a decision the code dropped, or a clear match admission did not answer.
  const passed = [
    ...(delivery.decisions ?? []).filter(d => (byId.has(d.id) || away.has(d.id)) && !usedIds.has(d.id) && !heldIds.has(d.id)).map(d => ({ id: d.id, why: decisionWord(t, d) })),
    ...(delivery.undecided ?? []).filter(id => (byId.has(id) || away.has(id)) && !usedIds.has(id)).map(id => ({ id, why: t("why_undecided") })),
  ].filter((p, n, all) => all.findIndex(o => o.id === p.id) === n);
  const at = formatDateTime(delivery.at);
  const open = id => byId.has(id) ? <TextLink onClick={() => nav.memory(id)}>{byId.get(id).text}</TextLink>
    : away.has(id) ? <>{away.get(id).private ? t("private") : away.get(id).text} <span className="ast-soft">({t("memoryElsewhere")}{away.get(id).where ? ": " + away.get(id).where : ""})</span></>
      : <span className="ast-soft">{t("goneMemory")}</span>;

  return (
    <Section title={t("lastReply")} aside={at && <time dateTime={new Date(delivery.at).toISOString()}>{at}</time>}>
      <Trace>
        {delivery.asked && (
          <TracePoint mark="hollow">
            <p className="ast-trace__label">{t("youAsked")}</p>
            <p className="ast-quote">{delivery.asked}</p>
          </TracePoint>
        )}
        <TracePoint mark="hollow">
          <p className="ast-trace__label">{t("readAs")}</p>
          <p>{delivery.scene?.from === "message" ? t("sceneFromMessage") : delivery.scene?.scene ?? t("sceneUnread")}</p>
        </TracePoint>

        {delivery.private && <TracePoint><p>{t("privateConversation")}</p></TracePoint>}
        {delivery.error && <TracePoint mark="cross" tone="danger"><Notice tone="danger" detail={delivery.error}>{t("readingFailed")}</Notice></TracePoint>}

        {used.map(item => (
          <TracePoint key={item.id} mark="lit">
            <p className="ast-trace__label">{useWord(t, item.use)}</p>
            <p className="ast-used__text">{open(item.id)}</p>
            <dl className="ast-used__facts">
              {item.relevance && <div><dt>{t("because")}</dt><dd>{item.relevance}</dd></div>}
              {item.by === "judge" && <div><dt>{t("because")}</dt><dd>{say(t, "byJudge", { n: Math.round((item.confidence ?? 0) * 100) })}</dd></div>}
              {item.anchor && <div><dt>{t("yourWords")}</dt><dd className="ast-quote">{item.anchor}</dd></div>}
              {item.matched?.scene && <div><dt>{t("calledBy")}</dt><dd>{item.matched.scene} <span className="ast-soft">({calledWord(t, item.matched.kind)})</span></dd></div>}
              {item.expect && <div><dt>{t("expected")}</dt><dd>{item.expect}</dd></div>}
            </dl>
            {(item.stale || item.conflict?.length > 0) && <p className="ast-soft">{t(item.conflict?.length ? "askedBecauseDisputed" : "askedBecauseOld")}</p>}
            {(byId.has(item.id) || away.has(item.id)) && <Verdict request={delivery.request} item={item.id} used outcome={outcomeOf(item.id)} ctx={ctx} />}
          </TracePoint>
        ))}

        {!used.length && !delivery.error && (
          <TracePoint mark="hollow">
            <p className="ast-trace__label">{t("usedNothing")}</p>
            <p className="ast-soft">{t(held.length || passed.length ? "usedNothingHeld" : "usedNothingNone")}</p>
          </TracePoint>
        )}

        {held.map(h => (
          <TracePoint key={h.id} mark="dotted">
            <p className="ast-trace__label">{t("heldBack")}</p>
            <p>{open(h.id)}</p>
            <p className="ast-soft">{say(t, "heldBackWhy", { scene: h.against?.cue ?? "" })}</p>
            <Verdict request={delivery.request} item={h.id} outcome={outcomeOf(h.id)} ctx={ctx} />
          </TracePoint>
        ))}
      </Trace>

      {delivery.session && (
        <div className="ast-convo">
          <p className="ast-hint">{t(delivery.sessionPrivate ? "conversationOffHint" : "conversationOnHint")}</p>
          <Button variant="ghost" disabled={ctx.state.busy} busy={ctx.state.busyKey === "private"}
            onClick={() => ctx.model.perform("private", { session: delivery.session, on: !delivery.sessionPrivate, projectId: ctx.projectId }, { key: "private", notice: "saved" })}>
            {t(delivery.sessionPrivate ? "conversationRemember" : "conversationForget")}
          </Button>
        </div>
      )}

      {passed.length > 0 && (
        <Disclosure label={t("considered")} count={passed.length}>
          <ul className="ast-plain-list">
            {passed.map(p => (
              <li key={p.id}>
                <p>{open(p.id)}</p>
                {p.why && <p className="ast-soft">{p.why}</p>}
                <Verdict request={delivery.request} item={p.id} outcome={outcomeOf(p.id)} ctx={ctx} />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {delivery.text && (
        <Disclosure label={t("exactNote")}>
          <p className="ast-hint">{t("exactNoteHint")}</p>
          <pre className="ast-pre" tabIndex={0}>{delivery.text}</pre>
        </Disclosure>
      )}
    </Section>
  );
}

// --- What is waiting for the person -----------------------------------------------
function Question({ ask, why, children, actions }) {
  return (
    <li className="ast-question">
      <p className="ast-question__ask">{ask}</p>
      {children}
      {why && <p className="ast-soft">{why}</p>}
      <div className="ast-actions">{actions}</div>
    </li>
  );
}
function NeedsYou({ review, items, ctx }) {
  const { t, state, model, projectId, nav } = ctx;
  const byId = new Map(items.map(i => [i.id, i]));
  const act = (item, operation, notice) => model.perform("memory", { projectId, item: item.id, revision: item.revision, operation }, { key: `need:${item.id}:${operation}`, notice });
  const settle = (a, b, keep) => model.perform("dispute", { projectId, a, b, keep }, { key: `settle:${a}:${b}:${keep}`, notice: "settled" });
  const text = item => <p className="ast-question__text"><TextLink onClick={() => nav.memory(item.id)}>{item.text}</TextLink></p>;
  const yesNo = item => <>
    <Button busy={state.busyKey === `need:${item.id}:confirm`} disabled={state.busy} onClick={() => act(item, "confirm", "confirmed")}>{t("stillTrue")}</Button>
    <Button busy={state.busyKey === `need:${item.id}:retire`} disabled={state.busy} onClick={() => act(item, "retire", "closed")}>{t("noLongerTrue")}</Button>
  </>;
  const unsure = review.unsure.map(id => byId.get(id)).filter(Boolean);
  const stale = review.stale.map(id => byId.get(id)).filter(Boolean);
  const disputes = review.disputes.map(d => [byId.get(d.a), byId.get(d.b)]).filter(([a, b]) => a && b);
  if (!unsure.length && !stale.length && !disputes.length) return null;
  return (
    <Section title={t("needsYou")} count={unsure.length + stale.length + disputes.length} lead={t("needsYouLead")}>
      <ul className="ast-questions">
        {disputes.map(([a, b]) => (
          <Question key={a.id + b.id} ask={t("askWhich")} actions={<>
            <Button busy={state.busyKey === `settle:${a.id}:${b.id}:both`} disabled={state.busy} onClick={() => settle(a.id, b.id, "both")}>{t("bothHold")}</Button>
          </>}>
            {[a, b].map(side => (
              <div className="ast-question__side" key={side.id}>
                {text(side)}
                <Button busy={state.busyKey === `settle:${a.id}:${b.id}:${side.id}`} disabled={state.busy} onClick={() => settle(a.id, b.id, side.id)}>{t("keepThis")}</Button>
              </div>
            ))}
          </Question>
        ))}
        {unsure.map(item => (
          <Question key={item.id} ask={t("askStillTrue")} why={say(t, item.doubt?.by === "user" ? "doubtYou" : "doubtLater", { why: item.doubt?.reason ?? item.against?.at(-1)?.reason ?? t("putInDoubt") })} actions={yesNo(item)}>{text(item)}</Question>
        ))}
        {stale.map(item => (
          <Question key={item.id} ask={t("askOutOfDate")} why={say(t, "lastConfirmed", { when: formatDateTime(item.lastCheckedAt) ?? "" })} actions={yesNo(item)}>{text(item)}</Question>
        ))}
      </ul>
    </Section>
  );
}

export function ReviewTab({ snapshot: s, ctx }) {
  const { t } = ctx;
  const items = s.memory.state.items;
  const review = s.review ?? { unsure: items.filter(i => i.status === "doubtful" && !i.paused).map(i => i.id), stale: [], disputes: [] };
  const live = items.filter(i => !i.paused && (i.status === "active" || i.status === "doubtful"));
  return (
    <>
      {s.settings?.enabled === false && <Notice tone="warning" action={<Button variant="ghost" onClick={ctx.nav.settings}>{t("openSettings")}</Button>}>{t("memoryOffNote")}</Notice>}
      {s.settings?.enabled !== false && s.pending > 0 && s.diagnosis?.reflection?.failing?.length > 0 &&
        <Notice tone="warning" action={<Button variant="ghost" onClick={ctx.nav.settings}>{t("openSettings")}</Button>}>{say(t, s.pending === 1 ? "unreadOne" : "unreadMany", { n: s.pending })}</Notice>}
      <NeedsYou review={review} items={items} ctx={ctx} />
      <LastReply delivery={s.memory.delivery} items={items} ctx={ctx} />
      {!items.length && <p className="ast-empty">{t("nothingStored")}</p>}
      {items.length > 0 && (
        <p className="ast-footnote">
          <Star level="easily" /> {say(t, live.length === 1 ? "inUseOne" : "inUseMany", { n: live.length })}
          <TextLink onClick={() => ctx.nav.tab("memory")}>{t("seeAll")}</TextLink>
        </p>
      )}
    </>
  );
}
