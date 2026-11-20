// What may be remembered and what may be brought up are different questions
// (see DESIGN: "remember but do not bring up").
//
// Whether a record is about a private matter is a judgement about meaning, so
// the model that reads the turn makes it, in whatever language the turn is in,
// and names the categories. Code only checks that the names are ones it knows.
//
// Two things stay on the code side. A secret has a shape (a key, a token
// assignment) and a shape can be matched in any language. And when the model
// names nothing at all, the word list below is used on the user's own words as
// a conservative stand-in. It is English-only: patterns for other languages
// are data, in an optional policy.local.json next to this file, as
// {"credentials": ["..."], "health": ["..."], ...} of regular expression sources.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = ["credentials", "security", "health", "money", "privacy"];

const builtin = {
  credentials: [
    /\bpassword\b|\bpassphrase\b|\bcredential\b|\bprivate key\b/i,
    /\b(api|access|auth|bearer)[ _-]?token\b|\btoken\s*[:=]\s*\S+/i,
    /\bsk-[A-Za-z0-9_-]{8,}/,
  ],
  security: [
    /\bprivilege escalation\b|\brootkit\b|\bexploit\b|\bbackdoor\b|\bjailbreak\b/i,
    /\buac\b|\bauth(?:entication)? bypass\b|\bacl bypass\b/i,
  ],
  health: [/\bdiagnos|\bmedication\b|\btherapy\b|\bsymptom|\bhealth record\b|\bprescription\b/i],
  money: [/\bsalary\b|\bbank\b|\bloan\b|\bdebt\b|\bcredit card\b|\bincome\b|\btax return\b/i],
  privacy: [/\bhome address\b|\bphone number\b|\bpassport\b|\bnational id\b|\bemail address\b/i],
};

function local() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "policy.local.json");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Object.fromEntries(CATEGORIES.map((category) =>
      [category, (raw[category] ?? []).map((source) => new RegExp(source, "i"))]));
  } catch {
    return {};
  }
}

const extra = local();
const patterns = Object.fromEntries(CATEGORIES.map((category) =>
  [category, [...(builtin[category] ?? []), ...(extra[category] ?? [])]]));

/** Every category the text speaks about, in a stable order. */
export function categories(text) {
  const value = String(text ?? "");
  return CATEGORIES.filter((category) => patterns[category].some((re) => re.test(value)));
}

export function classify(text) {
  return categories(text)[0] ?? null;
}

export function allowed(text, list) {
  const matched = categories(text);
  return Array.isArray(list) && matched.some((category) => list.includes(category));
}

// An anchor must carry the distinguishing content of the request, not just the
// instruction that happened to contain it. "Take over this session" is a
// generic instruction; it cannot justify recalling an unrelated project.
// Localized filler words belong in policy.local.json under "generic".
const generic = [
  "the", "this", "that", "please", "help", "continue", "handle", "take", "over",
  "session", "task", "work", "thing", "again", "now", "then", "about", "with",
  "for", "and", "can", "you", "restart", "look", "check", "confirm", "review",
];

function extraGeneric() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "policy.local.json");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(raw.generic) ? raw.generic : [];
  } catch {
    return [];
  }
}

const filler = [...generic, ...extraGeneric()].sort((a, b) => b.length - a.length);

// Script-neutral: what counts is content left after the filler is removed, in
// whatever script the user writes. Kana, Hangul, Cyrillic and the rest count
// the same way Han does, and an identifier with a digit ("Q3", "v2") counts too.
export function isSpecificAnchor(text) {
  let rest = ` ${String(text ?? "")} `;
  for (const word of filler) rest = rest.split(new RegExp(`\\b${word}\\b`, "gi")).join(" ");
  const han = (rest.match(/\p{Script=Han}/gu) ?? []).length;
  const other = (rest.match(/(?![\p{Script=Latin}\p{Script=Han}])\p{L}/gu) ?? []).length;
  const words = rest.match(/[A-Za-z]{3,}/g) ?? [];
  const identifiers = rest.match(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{2,}\b/g) ?? [];
  return han >= 2 || other >= 2 || words.length >= 1 || identifiers.length >= 1;
}

// The shape of a secret, whatever the language around it.
const SECRET = [
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\b(?:password|passphrase|secret|token|api[ _-]?key)\s*[:=]\s*\S{6,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
export const secret = (text) => SECRET.some((re) => re.test(String(text ?? "")));

/**
 * The categories a record carries. `named` is what the model that read the
 * turn said; when it said nothing, what the record carried before stands, and
 * failing that the word list reads the user's own words (never the model's
 * paraphrase of them: "a bug diagnosis" is not a health matter).
 */
export function sensitivity(named, before, said, everything) {
  const from = Array.isArray(named) ? named.filter((c) => CATEGORIES.includes(c))
    : Array.isArray(before) ? before : categories(said);
  const found = new Set([...from, ...(secret(everything) ? ["credentials"] : [])]);
  return CATEGORIES.filter((c) => found.has(c));
}
