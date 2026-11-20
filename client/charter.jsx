// Charter: the part that is the user's to write and that nothing learned can
// change. It is kept apart from Memory on purpose: one tab is what you told it
// to be, the other is what it worked out.
import React, { useEffect, useRef, useState } from "react";
import { Button, Chip, Disclosure, Field, Notice, Section, TextArea, TextInput } from "./ui.jsx";

const lines = text => text.split("\n").map(line => line.trim()).filter(Boolean);
const toDraft = profile => ({
  purpose: profile.purpose ?? "",
  values: (profile.values ?? []).join("\n"),
  name: profile.name ?? "",
  userName: profile.userName ?? "",
  tone: profile.style?.tone ?? "",
  // Kept as typed, and split into lines only when saving, so Enter works.
  commitments: (profile.commitments ?? []).join("\n"),
});
/** Only the fields that differ from what is saved. */
function toPatch(draft, profile) {
  const saved = toDraft(profile), patch = {};
  if (draft.purpose.trim() !== saved.purpose.trim()) patch.purpose = draft.purpose.trim();
  if (lines(draft.values).join("\n") !== lines(saved.values).join("\n")) patch.values = lines(draft.values);
  if (draft.name !== saved.name) patch.name = draft.name;
  if (draft.userName !== saved.userName) patch.userName = draft.userName;
  if (draft.tone !== saved.tone) patch.style = { ...profile.style, tone: draft.tone };
  if (lines(draft.commitments).join("\n") !== lines(saved.commitments).join("\n")) patch.commitments = lines(draft.commitments);
  return patch;
}

function CharterForm({ snapshot: s, ctx, onDirty }) {
  const { t, state, model, projectId } = ctx;
  const [draft, setDraft] = useState(() => toDraft(s.profile));
  // The charter can change while this form is open and out of sight: a name or a way of speaking given in the conversation, a store erased and woken anew. The form
  // was filled once, when it was first shown, and went on showing what it had then (an empty way of speaking after one was given), and would have written that back
  // over the new on the next save. What is stored is taken up whenever it changes: every field the user has not touched follows it; one they are in the middle of
  // changing is left as they have it.
  const stored = toDraft(s.profile), storedKey = JSON.stringify(stored), base = useRef(stored);
  useEffect(() => {
    const was = base.current; base.current = stored;
    setDraft(now => Object.fromEntries(Object.keys(stored).map(k => [k, now[k] === was[k] ? stored[k] : now[k]])));
  }, [storedKey]);
  const edit = key => e => setDraft({ ...draft, [key]: e.target.value });
  const patch = toPatch(draft, s.profile), dirty = Object.keys(patch).length > 0;
  const failed = state.error?.key === "profile" ? state.error : null;
  const charter = s.charter, isDefault = charter?.isDefault && !draft.purpose.trim() && !lines(draft.values).length;
  const save = () => model.perform("profile", { patch, projectId }, { key: "profile", notice: "saved" });
  // The save bar sits outside the scrolling area, so the page owns it.
  useEffect(() => { onDirty(dirty ? { save, discard: () => setDraft(toDraft(s.profile)), saving: state.busyKey === "profile" } : null); }, [dirty, JSON.stringify(patch), state.busyKey]);
  useEffect(() => () => onDirty(null), []);

  return (
    <form className="ast-form" onSubmit={e => { e.preventDefault(); if (dirty) void save(); }}>
      <Section title={t("charterStands")} lead={t("charterLead")}>
        {isDefault && charter && (
          <div className="ast-default">
            <p className="ast-default__head"><Chip>{t("usingDefault")}</Chip>
              <Button variant="ghost" onClick={() => setDraft({ ...draft, purpose: charter.purpose, values: charter.values.join("\n") })}>{t("startFromDefault")}</Button></p>
            <p>{charter.purpose}</p>
            <ul>{charter.values.map(value => <li key={value}>{value}</li>)}</ul>
          </div>
        )}
        <Field label={t("purpose")} hint={t("purposeHint")}><TextArea value={draft.purpose} onChange={edit("purpose")} rows={2} /></Field>
        <Field label={t("values")} hint={t("valuesHint")}><TextArea value={draft.values} onChange={edit("values")} rows={4} /></Field>
      </Section>
      <Section title={t("addressing")} lead={t("addressingLead")}>
        <Field label={t("assistantName")}><TextInput value={draft.name} onChange={edit("name")} autoComplete="off" /></Field>
        <Field label={t("yourName")}><TextInput value={draft.userName} onChange={edit("userName")} autoComplete="off" /></Field>
        <Field label={t("style")} hint={t("styleHint")}><TextArea value={draft.tone} onChange={edit("tone")} rows={2} /></Field>
      </Section>
      <Section title={t("agreements")} lead={t("agreementsLead")}>
        <Field label={<span className="ast-sr">{t("agreements")}</span>} hint={t("onePerLine")}><TextArea value={draft.commitments} onChange={edit("commitments")} rows={4} /></Field>
      </Section>
      {failed && <Notice tone="danger" role="alert">{failed.message}</Notice>}
      {/* Enter in a text field submits; the visible buttons are in the bar below. */}
      <button type="submit" hidden />
    </form>
  );
}

export function CharterTab({ snapshot: s, ctx, onDirty }) {
  const { t } = ctx;
  return (
    <>
      {/* Remounts when the saved profile changes, which resets the draft to it. */}
      <CharterForm key={JSON.stringify(s.profile)} snapshot={s} ctx={ctx} onDirty={onDirty} />
      <Disclosure label={t("sentEveryTime")}>
        <p className="ast-hint">{t("sentEveryTimeHint")}</p>
        <pre className="ast-pre" tabIndex={0}>{s.prompt}</pre>
      </Disclosure>
    </>
  );
}
