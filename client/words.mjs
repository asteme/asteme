// Plain words for what the core reports. The panel never shows a field name,
// an enum or a score: every value from the data is turned into a phrase here,
// and a value the copy does not know yet falls back to itself.
import { labelFor } from "./format.mjs";

/** Copy with {placeholders}. The host's `t` is not asked to interpolate. */
export const say = (t, key, values = {}) => t(key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");

export const inUse = item => !item.paused && (item.status === "active" || item.status === "doubtful");

/** lesson | noted | matter: the three kinds a person can tell apart. */
export const kindOf = item => item.kind === "concern" ? "matter" : item.level === "lesson" ? "lesson" : "noted";
export const kindWord = (t, item) => t("kind_" + kindOf(item));

export function stateWord(t, item) {
  if (item.paused) return t("state_paused");
  return labelFor(t, "state_" + item.status, item.status);
}

/**
 * How its uses have gone so far, as the size of its star: easily (it helped more often than it was out of place or wrong) | rarely (the
 * other way round) | sometimes (neither) | off (not in use). The names are the star sizes and are older than their meaning: what comes to
 * mind is decided by nearness, not by this.
 */
export function recallLevel(item) {
  if (!inUse(item)) return "off";
  const s = item.stats ?? {}, up = s.helped ?? 0, down = (s.irrelevant ?? 0) + (s.wrong ?? 0);
  return up > down ? "easily" : down > up ? "rarely" : "sometimes";
}
/**
 * A standing ask that is in front of every reply here. Only so many fit in front (the most recent come first); one that does not fit is
 * still a standing ask, and is recalled like any other memory. Whoever lists the memories says which it is (inFront): the panel does not guess.
 */
export const inFront = item => item.standing === true && item.inFront === true;
/** A standing ask that is not in front because nothing is, here: memory is off, the project is left out, or conversations are private by default. */
export const standingOff = item => item.standing === true && item.inFront !== true && item.frontOff === true;
/** A standing ask that did not fit in front. */
export const standingOver = item => item.standing === true && item.inFront !== true && item.frontOff !== true;
/** The few words a row says about a memory in use: a standing ask in front is in front always, whatever its uses were. */
export const recallWord = (t, item) => t(inFront(item) ? "recall_standing" : standingOff(item) ? "recall_standingOff" : standingOver(item) ? "recall_standingOver" : "recall_" + recallLevel(item));
/** How its uses have gone, counted out in one sentence, from the outcomes behind it. */
export function recallReason(t, item) {
  const s = item.stats ?? {};
  const parts = [
    s.helped && say(t, s.helped === 1 ? "helpedOnce" : "helpedTimes", { n: s.helped }),
    s.missed && say(t, s.missed === 1 ? "missedOnce" : "missedTimes", { n: s.missed }),
    s.irrelevant && say(t, s.irrelevant === 1 ? "misplacedOnce" : "misplacedTimes", { n: s.irrelevant }),
    s.wrong && t("wasWrong"),
    s.unused && say(t, s.unused === 1 ? "unusedOnce" : "unusedTimes", { n: s.unused }),
  ].filter(Boolean);
  return parts.join(", ");
}

/** Whether a reply was given nothing: no memory, no round of earlier conversation and no standing ask in front of it. */
export const gaveNothing = delivery => !(delivery.delivered ?? []).length && !(delivery.passages ?? []).length && !(delivery.inFront ?? []).length && !delivery.error;

export const useWord = (t, use) => labelFor(t, "use_" + use, use);
export const outcomeWord = (t, kind) => labelFor(t, "outcome_" + kind, kind);
export const outcomeTitle = (t, kind) => labelFor(t, "outcomeTitle_" + kind, kind);
export const calledWord = (t, kind) => labelFor(t, "called_" + kind, kind);
export const signalWord = (t, kind) => labelFor(t, "signal_" + kind, kind);
export const verdictWord = (t, verdict) => labelFor(t, "verdict_" + verdict, verdict);
export const keepsWord = (t, volatility) => labelFor(t, "keeps_" + (volatility ?? "slow"), volatility ?? "");

/** Why admission dropped or changed a decision, in the reader's terms. */
export function decisionWord(t, d) {
  const known = { "no exact anchor": "why_noAnchor", "learned from this message": "why_echo", "over cap": "why_cap",
    "incomplete decision": "why_incomplete", "unknown or repeated id": "why_incomplete" };
  if (d.dropped) return known[d.dropped] ? t(known[d.dropped]) : d.dropped;
  if (d.use === "not-now") return d.reason || t("why_notNow");
  return d.reason ?? "";
}

// Reasons the core writes itself are fixed English sentences. Each has an
// entry in the copy under r_<its words>; one the copy does not know is shown
// as it is. What a model wrote is already in the user's language.
const STOOD = { "the user corrected something": "correction", "something went against what was expected": "surprise", "something failed": "failure",
  "the user asked for something to be remembered": "explicit", "a promise was made": "commitment", "the same kind of situation had come up before": "recurrence" };
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_/, "").slice(0, 48).replace(/_$/, "");
export function reasonWord(t, text) {
  if (typeof text !== "string" || !text) return "";
  const stood = /^It stood out: (.+)$/.exec(text);
  if (stood) return say(t, "r_it_stood_out", { what: stood[1].split(", ").map(p => STOOD[p] ? signalWord(t, STOOD[p]) : p).join(t("listComma")) });
  return labelFor(t, "r_" + slug(text), text);
}
/** Why nothing is happening in the background, from the code the core gives. */
export const idleWord = (t, idle) => labelFor(t, "idle_" + idle.code, idle.text ?? idle.code);

/** Other memories that rest on any of the same source messages: what "forget" would also remove. */
export function sharesSources(item, items) {
  const mine = new Set((item.evidence ?? []).map(e => e.id));
  return items.filter(other => other.id !== item.id && (other.evidence ?? []).some(e => mine.has(e.id)));
}
