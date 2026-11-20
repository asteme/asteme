export const failed = (e) =>
  e?.role === "tool" &&
  (e.metadata?.tool?.execution === "error" ||
    (Number.isInteger(e.metadata?.tool?.exitCode) &&
      e.metadata.tool.exitCode !== 0));
export const iso = (value) => {
  const time = new Date(value ?? NaN);
  return Number.isFinite(time.getTime()) ? time.toISOString() : undefined;
};
// The host events memory has a use for: what was said, what was done, how
// each turn ended, and the marks the user or the host left on a message or a
// session. A host's session log holds a good deal more (steps, jobs, request
// headers); none of it is read here, so none of it needs to be stored.
const READ_KINDS = new Set(["user/message", "assistant/message", "tool/call", "tool/result", "turn/end"]);
// Marks: a person's own judgement arriving as an event rather than as words
// (feedback on a message, an approval given or refused), and the preset a
// session was switched to. Their payload belongs to the host and is stored as
// it came; nothing interprets it until its shape has been seen in real use.
const MARK_KINDS = new Set(["approval/decided", "agent-preset/selected"]);
export const isMark = kind => MARK_KINDS.has(kind) || String(kind ?? "").startsWith("feedback/");
export const isRead = kind => READ_KINDS.has(kind) || isMark(kind);
// The user's own rating of one reply, as the host records it: the latest
// "feedback/message-put" for that message, unless a later
// "feedback/message-delete" took it back. Read by shape only: a rating is
// "positive" or "negative", a note is the user's words about the reply.
export const ratingOf = (events, messageId) => {
  if (!messageId) return null;
  let found = null;
  for (const e of events) {
    if (e.kind !== "feedback/message-put" && e.kind !== "feedback/message-delete") continue;
    let data = null; try { data = JSON.parse(e.content || "null"); } catch {}
    if (e.kind === "feedback/message-delete") { if (data?.messageId === messageId) found = null; continue; }
    const item = data?.item;
    if (item?.messageId === messageId && (item.rating === "positive" || item.rating === "negative"))
      found = { rating: item.rating, ...(typeof item.note === "string" && item.note.trim() ? { note: item.note.trim().slice(0, 600) } : {}) };
  }
  return found;
};
// How a turn ended, when it did not simply finish.
export const endedOf = events => { const end = events.find(e => e.kind === "turn/end")?.metadata?.ended; return end && end.kind !== "completed" ? end : null; };
export const isEvidence = e => e.content && !e.metadata?.inherited &&
  (["user", "assistant", "tool"].includes(e.role) || e.kind === "tool/call");
// Resume inside a long turn without discarding its remaining evidence. The
// original records stay intact; only the model request is divided into pages.
// toolChars, when given, keeps only the head of each tool result. A turn of
// forty tool calls used to be read in six pages, each a model call of a minute
// or more, and nearly all of it was command output that memory has no use for.
export function reflectionBatch(turn, offset = 0, pageSize = 16000, { toolChars } = {}) {
  const parts = turn.events.filter(isEvidence)
    .flatMap(e => toolChars && e.role === "tool" && e.content.length > toolChars
      ? [{ ...e, content: `${e.content.slice(0, toolChars)} \u2026[${e.content.length - toolChars} more characters not shown]` }]
      : Array.from({ length: Math.ceil(e.content.length / 4000) }, (_, i) =>
      ({ ...e, content: e.content.slice(i * 4000, (i + 1) * 4000) })));
  const events = [];
  let size = 0, next = offset;
  while (next < parts.length) {
    const length = JSON.stringify(parts[next]).length;
    if (events.length && size + length > pageSize) break;
    events.push(parts[next++]);
    size += length;
  }
  return { ...turn, request: turn.events.find((e) => e.role === "user"), events, offset, next, done: next === parts.length };
}
// Source search uses word overlap. CJK bigrams
// preserve a useful lexical signal without requiring a language-specific parser.
export function terms(text) {
  const s = String(text).toLocaleLowerCase();
  return new Set([
    ...(s.match(/[\p{L}\p{N}_./:-]+/gu) ?? []),
    ...[
      ...s.matchAll(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu,
      ),
    ].flatMap(([word]) =>
      Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)),
    ),
  ]);
}
