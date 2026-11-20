// What is stored of one host event. Nothing here needs the host, so it can be
// tested without one: the host only hands each event over.
import { capRecord, keepRecord, withPreset } from "./calls.mjs";
import { isMark } from "../src/mind.mjs";

// In a conversation marked private the order of events is still recorded, so
// the record has no gap, but not what was said or done.
// What tools did there is not recorded at all, not even as an empty row: a
// store sent back held 2,500 such rows, seven tenths of everything in it, from
// working sessions that were marked as not to be remembered.
const unsaid = (quiet, e) => quiet && String(e.kind ?? "").startsWith("tool/") ? { seq: e.seq, skip: true } : quiet && e.kind !== "turn/end" ? { ...e, content: "", metadata: e.metadata ? { ...(e.metadata.messageId ? { messageId: e.metadata.messageId } : {}), ...(e.metadata.inherited ? { inherited: true } : {}) } : undefined } : e;

export const textOf = (m) =>
  (m?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
export const redact = (s) =>
  String(s)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]");
export function projectEvent(e, inherited = 0, outcome) {
  const m = e.type === "user/message" ? e.data : e.data?.message,
    foreign = e.seq < inherited;
  const role = foreign
    ? "unknown"
    : e.type === "user/message" && m?.source?.kind === "user"
      ? "user"
      : e.type === "assistant/message"
        ? "assistant"
        : e.type === "tool/result"
          ? "tool"
          : "unknown";
  const tool =
    e.type === "tool/call"
      ? { phase: "call", callId: e.data.callId, name: e.data.name }
      : role === "tool"
        ? {
            phase: "result",
            callId: m.toolCallId,
            ...outcome,
            execution:
              outcome?.execution ??
              (m.isError === true
                ? "error"
                : m.isError === false
                  ? "completed"
                  : "unknown"),
          }
        : null;
  // How the turn ended is evidence: a reply the user stopped, or one that
  // failed or was cut off, is not a finished reply.
  const ended = e.type === "turn/end" && e.data?.reason?.kind
    ? { kind: String(e.data.reason.kind), ...(e.data.reason.reason?.kind ? { by: String(e.data.reason.reason.kind) } : {}) } : null;
  // A mark (see isMark). Its shape is the host's; it is kept as it came so
  // that it can be read once it is known.
  const feedback = isMark(e.type) && !foreign;
  const content =
    feedback ? JSON.stringify(e.data ?? {}) : role === "unknown"
      ? e.type === "tool/call" && !foreign
        ? typeof e.data.arguments === "string"
          ? e.data.arguments
          : JSON.stringify(e.data.arguments ?? {})
        : ""
      : textOf(m);
  return {
    seq: e.seq,
    kind: e.type,
    role,
    content: redact(content),
    occurredAt: e.time,
    metadata: {
      inherited: foreign,
      messageId: m?.id,
      source: { kind: m?.source?.kind ?? "unknown" },
      ...(tool ? { tool } : {}),
      ...(ended ? { ended } : {}),
      interrupted: e.data?.interrupted === true,
    },
  };
}

/**
 * One host event as it is stored: read into the shape memory uses, marked
 * with the session's preset, cut to the stored length, passed over when
 * memory has no use for its kind, and emptied in a private conversation.
 */
export const record = (e, { inherited = 0, outcome, preset, quiet = false } = {}) =>
  unsaid(quiet, keepRecord(capRecord(withPreset(preset, projectEvent(e, inherited, outcome)))));

// The host's codes for a call that was cancelled: by the user stopping the
// turn, or before the tool body ran at all.
const CANCELLED = new Set(["ABORTED", "ABORTED_BEFORE_DISPATCH"]);
/**
 * How one tool call went, kept beside its result. A cancelled call is not a
 * failed one: nothing about the tool or its arguments was wrong. The host's
 * error code is kept when there is one, so a refusal can be told from a crash.
 */
export function toolOutcome(name, result) {
  const v = result?.value, code = result?.isError ? result.error?.info?.code : undefined;
  const processResult = ["bash", "pwsh", "shell", "exec_command"].includes(name) && v?.kind === "foreground" &&
    (v.exitCode === null || Number.isInteger(v.exitCode));
  return {
    name,
    execution: CANCELLED.has(code) ? "cancelled"
      : result?.isError || (processResult && (v.timedOut || v.aborted || v.exitCode !== 0)) ? "error" : "completed",
    ...(typeof code === "string" && code ? { code: code.slice(0, 80) } : {}),
    ...(processResult ? { exitCode: v.exitCode, timedOut: v.timedOut, aborted: v.aborted } : {}),
  };
}
