// Activity: what it does when nobody is waiting for a reply, said the way a
// person would say it, with the reason for each thing and a link to what
// changed. When nothing is happening, it says why.
import React from "react";
import { formatDateTime } from "./format.mjs";
import { say, signalWord, verdictWord, reasonWord, idleWord } from "./words.mjs";
import { Chip, Disclosure, Section, Star, TextLink, Trace, TracePoint } from "./ui.jsx";

/** One finished job as a sentence, and what came of it. */
function told(t, job, text) {
  const changed = job.applied?.length ? say(t, job.applied.length === 1 ? "changedOne" : "changedMany", { n: job.applied.length }) : t("changedNothing");
  switch (job.type) {
    case "replay": return [(job.read ?? 1) > 1 ? say(t, "didReplay", { n: job.read - 1 }) : t("didReplayAlone"), changed];
    case "integrate": return job.lesson ? [t("didLesson"), null] : [t("didLessonNone"), job.declined];
    case "imagine": return job.scenes ? [t("didImagine"), job.scenes.join(" / ")] : [t("didImagineNone"), null];
    case "revise": return [say(t, "didRevise", { text: text(job.target) }), job.kept ? job.reason || t("keptAsIs") : changed];
    case "reconcile": return [t("didCompare"), verdictWord(t, job.verdict)];
    default: return [job.type, null];
  }
}
const queuedWord = (t, type) => t({ replay: "willReplay", integrate: "willLesson", imagine: "willImagine", revise: "willRevise", reconcile: "willCompare" }[type] ?? "willWork");

export function ActivityTab({ snapshot: s, ctx }) {
  const { t, nav } = ctx;
  const sleep = s.learning?.sleep, diagnosis = s.diagnosis;
  const items = new Map(s.memory.state.items.map(i => [i.id, i]));
  const text = id => items.get(id)?.text ?? t("goneMemory");
  const link = id => items.has(id) ? <TextLink onClick={() => nav.memory(id)}>{items.get(id).text}</TextLink> : null;
  const pairOf = target => String(target ?? "").split("|").filter(id => items.has(id));
  const brief = id => { const text = items.get(id).text ?? ""; return <TextLink onClick={() => nav.memory(id)}>{text.length > 44 ? text.slice(0, 43) + "…" : text}</TextLink>; };
  if (!sleep) return <div className="ast-blank"><p className="ast-blank__title">{t("activityNone")}</p><p className="ast-soft">{t("activityOld")}</p></div>;

  const last = sleep.last, ran = last?.ran ?? [], failed = (last?.failed ?? []).filter(j => !/\babort/i.test(j.reason ?? "")), habits = last?.habits?.applied ?? [];
  const waiting = diagnosis?.outcomes.waiting ?? [];
  // 0.8.0-alpha.2 sent sentences only; later versions send a code with each.
  const idle = diagnosis?.sleep.idle?.map((i, n) => ({ ...i, text: diagnosis.sleep.idleBecause?.[n] })) ?? (diagnosis?.sleep.idleBecause ?? []).map(text => ({ code: text, text }));
  const reasonKey = { "too recent to judge": "waitRecent", "the user has not written again in that conversation": "waitSilent",
    "the later message was read and said nothing about it": "waitNothing", "ready to be read": "waitReady" };
  const kinds = [...sleep.queued.reduce((m, job) => m.set(job.type, [...(m.get(job.type) ?? []), job]), new Map())];
  const byReason = waiting.reduce((n, w) => ({ ...n, [w.because]: (n[w.because] ?? 0) + 1 }), {});

  return (
    <>
      <Section title={t("whileAway")} aside={last && formatDateTime(last.at)} lead={t("whileAwayLead")}>
        {!last ? <p className="ast-empty">{t("neverSlept")}</p> : !ran.length && !failed.length && !habits.length ? <p className="ast-empty">{t("sleptNothing")}</p> : (
          <Trace>
            {ran.map((job, n) => {
              const [what, result] = told(t, job, text);
              const target = job.lesson ?? (["revise", "imagine"].includes(job.type) ? job.target : null);
              return (
                <TracePoint key={n} mark={job.lesson || job.applied?.length || job.scenes ? "solid" : "hollow"}>
                  <p>{what}</p>
                  {target && link(target) && <p>{link(target)}</p>}
                  {job.type === "reconcile" && <p>{job.target.split("|").map(id => link(id)).filter(Boolean).map((el, k) => <span key={k}>{k > 0 && <span className="ast-soft"> {t("and")} </span>}{el}</span>)}</p>}
                  {result && <p className="ast-soft">{result}</p>}
                  {job.why?.[0] && <p className="ast-soft">{reasonWord(t, job.why[0])}</p>}
                </TracePoint>
              );
            })}
            {habits.map((h, n) => (
              <TracePoint key={"h" + n} mark="solid">
                <p>{t(h.op === "set" ? "didHabit" : "didHabitDrop")}</p>
                {h.op === "set" ? <p><TextLink onClick={() => nav.habit(h.key)}>{h.text}</TextLink></p> : <p className="ast-soft">{h.key}</p>}
              </TracePoint>
            ))}
            {failed.map((job, n) => (
              <TracePoint key={"f" + n} mark="cross" tone="danger"><p>{t("didFail")}</p><p className="ast-soft">{job.reason}</p></TracePoint>
            ))}
          </Trace>
        )}
      </Section>

      <Section title={t("upNext")} count={sleep.queued.length}>
        {sleep.queued.length > 0 ? (
          <ul className="ast-plain-list">
            {/* Jobs of one kind are said once, with how many, and under that what each is about: three comparisons read as one thing to do with three pairs, not as the same line three times. */}
            {kinds.map(([type, jobs]) => (
              <li key={type}>
                <p>{queuedWord(t, type)}{jobs.length > 1 && <span className="ast-soft"> {jobs.length}</span>}</p>
                {jobs.every(j => j.reasons?.[0] === jobs[0].reasons?.[0]) && jobs[0].reasons?.[0] && <p className="ast-soft">{reasonWord(t, jobs[0].reasons[0])}</p>}
                <ul className="ast-plain-list ast-queue">
                  {jobs.map((job, n) => {
                    const pair = ["reconcile", "integrate"].includes(job.type) ? pairOf(job.target) : [], one = ["revise", "imagine"].includes(job.type) ? link(job.target) : null;
                    const own = !jobs.every(j => j.reasons?.[0] === jobs[0].reasons?.[0]) && job.reasons?.[0];
                    if (!pair.length && !one && !own) return null;
                    return <li key={n}>{one}{pair.map((id, i) => <React.Fragment key={id}>{i > 0 ? <span className="ast-soft"> ／ </span> : ""}{brief(id)}</React.Fragment>)}{own && <span className="ast-soft"> {reasonWord(t, own)}</span>}</li>;
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="ast-empty">{t("nothingQueued")}</p>
            {idle.length > 0 && <ul className="ast-plain-list ast-soft">{idle.map(i => <li key={i.code}>{idleWord(t, i)}</li>)}</ul>}
          </>
        )}
      </Section>

      {waiting.length > 0 && (
        <Section title={t("stillUnknown")} count={waiting.length} lead={t("stillUnknownLead")}>
          <ul className="ast-plain-list">
            {Object.entries(byReason).map(([because, n]) => <li key={because}>{say(t, reasonKey[because] ?? "waitOther", { n })}</li>)}
          </ul>
        </Section>
      )}

      <Section title={t("stoodOut")} lead={t("stoodOutLead")}>
        {!sleep.episodes.some(e => e.signals.length) ? <p className="ast-empty">{t("nothingStoodOut")}</p> : (
          <ul className="ast-rows">
            {sleep.episodes.filter(e => e.signals.length).map(e => (
              <li key={e.id} className="ast-row ast-row--static">
                <Star level={e.salience >= 0.5 ? "easily" : e.salience >= 0.3 ? "sometimes" : "rarely"} />
                <span className="ast-row__main">
                  <span className="ast-row__title ast-row__title--plain">{e.scene}</span>
                  <span className="ast-row__meta">
                    {e.signals.map(kind => <Chip key={kind}>{signalWord(t, kind)}</Chip>)}
                    <span className="ast-soft">{formatDateTime(e.at)}{e.replays > 0 ? `, ${say(t, e.replays === 1 ? "rereadOnce" : "rereadTimes", { n: e.replays })}` : ""}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
