// When to wait for the model, when to ask again and when to stop asking.
// Kept apart from the host so it can be tested without one.
import { isRead } from "../src/mind.mjs";

/** Calls made while the reply waits: reading the scene and choosing what to pass. */
export const isWaiting = purpose => ["asteme-read", "asteme-scene", "asteme-select"].includes(purpose);

/**
 * One model call under the policy. `call(tokens, timeoutMs)` makes the call;
 * `note(row)` records how it went; `breaker` is shared state across calls.
 *
 * - A waiting call gets the shorter time limit.
 * - After two timeouts in a row, waiting calls are skipped for five minutes
 *   instead of holding up every reply for a model that is not answering.
 * - An answer cut off at the output limit is asked for again with twice the
 *   room: once while the reply waits, twice in the background. Without this a
 *   long turn fails the same way on every retry and is never read into memory.
 */
/**
 * How long a call may hold up the reply. The configured limit, or twice what
 * this kind of call has usually taken when that is longer, and never more than
 * twice the configured limit. On a real host choosing took 22 s at the median
 * under a 30 s limit, so an ordinary slow answer was thrown away; a call that
 * stalls outright is still given up at the same point as before.
 */
export const waitLimit = (base, took = []) => {
  if (took.length < 3) return base;
  const usual = [...took].sort((a, b) => a - b)[Math.floor(took.length / 2)];
  return Math.round(Math.max(base, Math.min(2 * base, 2 * usual)));
};
/** The longest pause a provider can impose: past this it is asked again and may refuse again. */
export const REST_LIMIT = 600000;
export async function guardedCall(breaker, { purpose, tokens, timeouts, call, note = () => {}, aborted = () => false, now = Date.now }) {
  const waiting = isWaiting(purpose);
  if (waiting && now() < breaker.until)
    throw Object.assign(new Error("The model has not been answering in time; not asked while the reply waits"), { skipped: true });
  // A provider that said when to come back is not asked before then, by any
  // kind of call: asking sooner only earns the same refusal.
  if (now() < (breaker.rest ?? 0))
    throw Object.assign(new Error("The provider asked for a pause; not asked until it is over"), { skipped: true });
  // A model that needed more room for this kind of call last time is given it
  // from the start. On a real host every reflection was first cut off at the
  // usual allowance after a minute and a half, and only then asked again.
  const learned = breaker.tokens ??= {};
  if (learned[purpose] > tokens) tokens = learned[purpose];
  const took = (breaker.took ??= {})[purpose] ??= [];
  for (let attempt = 0; ; attempt++) {
    const started = now();
    try {
      const value = await call(tokens, waiting ? waitLimit(timeouts.waiting, took) : timeouts.background);
      note({ purpose, ok: true, ms: now() - started, tokens, ...(attempt ? { attempt } : {}) });
      took.push(now() - started); if (took.length > 9) took.shift();
      if (waiting) { breaker.failures = 0; breaker.until = 0; }
      if (attempt && learned[purpose] !== tokens) { learned[purpose] = tokens; breaker.onLearn?.(learned); }
      return value;
    } catch (e) {
      if (aborted()) throw e;
      const timeout = e?.name === "TimeoutError" || /timed? ?out/i.test(e?.message ?? "");
      // An answer cut off at the limit is asked for again with more room. That
      // attempt is recorded as one that was asked again, not as a call that failed.
      const again = !!e?.incomplete && /max|length/i.test(e.incomplete) && attempt < (waiting ? 1 : 2) && tokens < 24000;
      note({ purpose, ok: false, ms: now() - started, tokens, ...(attempt ? { attempt } : {}), ...(again ? { again: true } : {}), error: String(e?.message ?? e).slice(0, 200),
        ...(timeout ? { timeout: true } : {}), ...(e?.incomplete ? { incomplete: e.incomplete } : {}),
        ...(e?.failure?.code ? { code: e.failure.code } : {}), ...(e?.failure?.status ? { status: e.failure.status } : {}) });
      const pause = Number(e?.failure?.retryAfterMs);
      if (pause > 0) breaker.rest = now() + Math.min(pause, REST_LIMIT);
      if (waiting && timeout && ++breaker.failures >= 2) breaker.until = now() + 300000;
      if (again) { tokens *= 2; continue; }
      throw e;
    }
  }
}

/**
 * One reading per message. A turn asks again before every step and after every
 * tool result. A reading that passed nothing is kept; a reading that failed is
 * tried once more, not sooner than twenty seconds later. Readings that
 * delivered something are handled by the caller, which also checks that the
 * delivered memories have not changed since.
 */
export const keepReading = (read, { routeKey, erased, now = Date.now() }) =>
  !!read && !read.delivered && read.routeKey === routeKey && read.erased === erased && (read.ok || read.attempts >= 2 || now < read.retryAt);
export const noteReading = (previous, trace, { routeKey, erased, now = Date.now() }) =>
  ({ routeKey, erased, ok: !trace.error, delivered: trace.delivered.length > 0, attempts: (previous?.attempts ?? 0) + 1, retryAt: now + 20000 });

/**
 * What is stored of one event. What the user and the assistant said is stored
 * whole. Anything else (tool calls, tool output) is stored up to `limit`
 * characters: memory never reads more of it than that, the host keeps the
 * original, and on a real store tool output was half of everything kept.
 */
export const RECORD_LIMIT = 2000;
export function capRecord(e, limit = RECORD_LIMIT) {
  if (e.role === "user" || e.role === "assistant" || typeof e.content !== "string" || e.content.length <= limit) return e;
  return { ...e, content: `${e.content.slice(0, limit)} \u2026[${e.content.length - limit} more characters not stored]` };
}

/**
 * Which host events are recorded at all. A session log is mostly the host's
 * own bookkeeping (steps, jobs, request headers, title requests), none of
 * which memory reads. An event memory has no use for only moves the cursor.
 */
export const keepRecord = e => isRead(e.kind) && !isHostNote(e) && !isRetiredStub(e) && !isWordless(e) ? e : { seq: e.seq, skip: true };
// An assistant turn that only called a tool: the call and its result are
// records of their own, and this one holds no words.
const isWordless = e => e.kind === "assistant/message" && !String(e.content ?? "").trim();
// A "user/message" the host wrote itself (runtime context, the skill
// catalogue, the time): nobody said it, and nothing of it is stored.
const isHostNote = e => e.kind === "user/message" && e.role !== "user" && !e.content;
// The stub this plugin leaves where it retired one of its own earlier tool
// results from the model's view. The result itself was recorded when it happened.
const isRetiredStub = e => e.kind === "tool/result" && typeof e.content === "string" && e.content.startsWith('{"asteme":"prior-task-result-retired"');
/** The agent preset a session was composed from, carried on what the user said in it. */
export const withPreset = (preset, e) => preset && e.role === "user" ? { ...e, metadata: { ...e.metadata, preset: String(preset).slice(0, 120) } } : e;

/**
 * How much background work one round may ask of the model, and how long to
 * wait before the next round. A round is one pass of the background loop;
 * a unit of work is reading one exchange into memory, reading how some
 * replies went, or one step of looking back. `state.next` is when the next
 * round may start; it only moves when a round did something.
 */
export const ROUND = { calls: { min: 1, max: 5, default: 1 }, every: { min: 10000, max: 3600000, default: 30000 } };
export function startRound(state, now, { calls = ROUND.calls.default, every = ROUND.every.default } = {}) {
  const most = Math.min(ROUND.calls.max, Math.max(ROUND.calls.min, Math.round(Number(calls) || ROUND.calls.default)));
  const wait = Math.min(ROUND.every.max, Math.max(ROUND.every.min, Number(every) || ROUND.every.default));
  const round = { left: now < (state.next ?? 0) ? 0 : most, used: 0,
    take(n = 1) { const got = Math.max(0, Math.min(n, this.left)); this.left -= got; this.used += got; return got; },
    end(at) { if (this.used) state.next = at + wait; } };
  return round;
}
