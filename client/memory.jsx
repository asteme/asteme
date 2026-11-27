// Memory: everything it has learned, grouped by what kind of thing it is.
// A row says what is remembered and why in two lines and opens the full
// account. Nothing in a row is a control; every action lives in the account,
// next to the evidence it acts on.
import React, { useState } from "react";
import { inFront, inUse, kindOf, recallLevel, recallWord, say, stateWord, reasonWord } from "./words.mjs";
import { Button, Chip, Disclosure, Glyph, RowButton, Section, Star, TextInput } from "./ui.jsx";

const matches = (item, needle) => !needle || [item.text, item.reason, item.concrete, item.general, item.about, ...(item.entities ?? [])]
  .some(value => value?.toLowerCase().includes(needle));
// What needs a look comes first, then what the last reply used, then the rest by how their uses have gone.
const order = used => (a, b) => (b.status === "doubtful") - (a.status === "doubtful") || used.has(b.id) - used.has(a.id) || (b.accessibility ?? 0.5) - (a.accessibility ?? 0.5);

function MemoryRow({ item, used, ctx }) {
  const { t, nav } = ctx, live = inUse(item);
  // A standing ask in front of every reply has a full star, as a habit has. One that did not fit in front has the star its uses gave it.
  const level = live && inFront(item) ? "easily" : recallLevel(item);
  return (
    <li>
      <RowButton
        data-focus={`memory:${item.id}`}
        className={live ? undefined : "ast-row--closed"}
        lead={<Star level={level} tone={item.status === "doubtful" && live ? "warning" : "plain"} lit={used} />}
        note={live ? recallWord(t, item) : stateWord(t, item)}
        title={item.text}
        detail={reasonWord(t, item.reason)}
        meta={(item.status === "doubtful" && live) || used || item.sensitive?.length > 0 || !live ? <>
          {!live && <Chip>{stateWord(t, item)}</Chip>}
          {item.status === "doubtful" && live && <Chip tone="warning">{t("state_doubtful")}</Chip>}
          {used && <Chip tone="lit">{t("usedLast")}</Chip>}
          {item.sensitive?.length > 0 && <Chip>{t("private")}</Chip>}
        </> : null}
        onClick={() => nav.memory(item.id)}
      />
    </li>
  );
}

export function MemoryTab({ snapshot: s, ctx }) {
  const { t, nav, state, model, projectId } = ctx;
  const [query, setQuery] = useState("");
  const items = s.memory.state.items, needle = query.trim().toLowerCase();
  const habits = (s.learning?.habits ?? []).filter(h => !needle || h.text.toLowerCase().includes(needle));
  const watched = s.learning?.candidates ?? [];
  const removed = (s.learning?.history ?? []).filter(h => h.status === "demoted" && (!needle || h.text.toLowerCase().includes(needle)));
  const used = new Set((s.memory.delivery?.delivered ?? []).map(i => i.id));
  const shown = items.filter(i => matches(i, needle));
  const live = shown.filter(inUse).sort(order(used)), closed = shown.filter(i => !inUse(i));
  const group = kind => live.filter(i => kindOf(i) === kind);
  const row = item => <MemoryRow key={item.id} item={item} used={used.has(item.id)} ctx={ctx} />;
  const unsure = items.filter(i => inUse(i) && i.status === "doubtful").length;
  const nothing = !items.length && !(s.learning?.habits ?? []).length;

  if (nothing) return <div className="ast-blank"><p className="ast-blank__title">{t("nothingStored")}</p><p className="ast-soft">{t("nothingStoredHint")}</p></div>;
  return (
    <>
      <div className="ast-search">
        <Glyph name="search" />
        <TextInput type="search" value={query} placeholder={t("search")} aria-label={t("search")} onChange={e => setQuery(e.target.value)} />
      </div>
      <p className="ast-summary">
        {say(t, "summary", { live: items.filter(inUse).length })}
        {unsure > 0 && <> {say(t, "summaryUnsure", { n: unsure })}</>}
        {items.length - items.filter(inUse).length > 0 && <> {say(t, "summaryClosed", { n: items.length - items.filter(inUse).length })}</>}
      </p>
      <p className="ast-legend" aria-hidden="true">
        <span>{t("legend")}</span>
        <span><Star level="easily" />{t("legend_easily")}</span><span><Star level="sometimes" />{t("legend_sometimes")}</span>
        <span><Star level="rarely" />{t("legend_rarely")}</span><span><Star level="off" />{t("legend_off")}</span>
      </p>

      {needle && !shown.length && !habits.length && !removed.length && <p className="ast-empty">{say(t, "noMatch", { query: query.trim() })}</p>}

      {(habits.length > 0 || (!needle && watched.length > 0)) && (
        <Section title={t("group_habits")} count={habits.length} lead={t("group_habitsLead")}>
          {habits.length > 0 && (
            <ul className="ast-rows">
              {habits.map(h => (
                <li key={h.key}>
                  <RowButton data-focus={`habit:${h.key}`} lead={<Star level="easily" />} note={t("alwaysOn")} title={h.text} detail={reasonWord(t, h.reason)} onClick={() => nav.habit(h.key)} />
                </li>
              ))}
            </ul>
          )}
          {!needle && watched.length > 0 && (
            <Disclosure label={t("watched")} count={watched.length}>
              <p className="ast-hint">{t("watchedHint")}</p>
              <ul className="ast-rows">
                {watched.map(c => (
                  <li key={c.id}>
                    <RowButton lead={<Star level="sometimes" />} title={c.text} detail={c.basis === "helped in distinct scenes" ? say(t, "watchedHelped", { n: c.helped }) : say(t, "watchedCorrected", { n: c.corrections })} onClick={() => nav.memory(c.id)} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </Section>
      )}
      {[["lesson", "group_lessons", "group_lessonsLead"], ["noted", "group_noted", "group_notedLead"], ["matter", "group_matters", "group_mattersLead"]].map(([kind, title, lead]) => {
        const list = group(kind);
        return list.length > 0 && <Section key={kind} title={t(title)} count={list.length} lead={t(lead)}><ul className="ast-rows">{list.map(row)}</ul></Section>;
      })}

      {(closed.length > 0 || removed.length > 0) && (
        <Disclosure label={t("group_closed")} count={closed.length + removed.length} open={needle ? true : undefined}>
          <p className="ast-hint">{t("group_closedLead")}</p>
          <ul className="ast-rows">
            {closed.map(row)}
            {removed.map(h => (
              <li key={h.key} className="ast-row ast-row--static ast-row--closed">
                <Star level="off" />
                <span className="ast-row__main">
                  <span className="ast-row__title">{h.text}</span>
                  <span className="ast-row__detail">{h.demoteReason}</span>
                  <span className="ast-row__meta"><Chip>{t("removedHabit")}</Chip></span>
                </span>
                <Button busy={state.busyKey === `habit:${h.key}`} disabled={state.busy}
                  onClick={() => model.perform("habit", { key: h.key, restore: true, projectId }, { key: `habit:${h.key}`, notice: "habitRestored" })}>{t("restore")}</Button>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}
