// Once a day: fetches the lines visitors chose to share, sieves them, and adds what is left to site/lines.json, where a person reads it before it is merged.
// The sieve only throws away; it never lets anything through by itself. What it drops: words on a public list (LDNOOBW, CC BY 4.0, a fixed revision, fetched
// here and not kept in this repository), anything that looks like an address, a link, a number to call or a handle, lines that shout or repeat, and what
// is already there. Usage: LINES_URL=... LINES_KEY=... node scripts/sieve-lines.mjs   (prints how many were kept and dropped, never the dropped text)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WORDS = "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/5faf2ba42d7b1c0977169ec3611df25a3c08eb13/";
const LISTS = ["en", "ja", "zh", "de", "es", "fr", "pt", "ru", "ko"];
export const MAX_SHOWN = 80;
const letters = (s) => s.toLowerCase().normalize("NFKC");
// Why a line is dropped, or null when the sieve has nothing against it. `banned` is a list of lower-case words and phrases.
export const refuse = (text, banned, already = []) => {
  const t = letters(text), n = [...text].length;
  if (n < 2 || n > 120) return "length";
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/.test(t)) return "address";
  if (/https?:|www\.|[a-z0-9-]+\.(com|net|org|io|ai|ru|cn|jp|xyz|top|info|biz|co|me|ly|gg|tv|app|dev|shop|site|online)\b/.test(t)) return "link";
  if (/(?:\d[\s\-().]*){7,}/.test(t)) return "number";
  if (/(^|\s)[@#][\w.]{2,}/.test(t) || /\b(telegram|whatsapp|wechat|weixin|line id|discord|t\.me|vx|qq)\b|微信|加我|薇信|ライン交換/.test(t)) return "handle";
  if (/(.)\1{5,}/u.test(t) || (/[a-z]/.test(text) === false && /[A-Z]{12,}/.test(text))) return "noise";
  for (const w of banned) {
    if (!w) continue;
    // A word of letters must stand as a word; in writing without spaces between words it is looked for anywhere.
    if (/^[\x00-\x7f]+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t) : t.includes(w)) return "listed";
  }
  if (already.some((a) => letters(a) === t)) return "said";
  return null;
};
export const sieve = (pending, banned, shown) => {
  const kept = [], dropped = {};
  for (const line of pending) {
    const why = refuse(line.text, banned, [...shown.map((s) => s.text), ...kept.map((k) => k.text)]);
    if (why) dropped[why] = (dropped[why] ?? 0) + 1;
    else kept.push({ text: line.text, lang: line.lang, at: new Date(line.at).toISOString().slice(0, 10) });
  }
  return { kept, dropped };
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { LINES_URL, LINES_KEY } = process.env, file = fileURLToPath(new URL("../site/lines.json", import.meta.url));
  if (!LINES_URL || !LINES_KEY) { console.log("LINES_URL or LINES_KEY is not set: nothing to fetch."); process.exit(0); }
  const auth = { authorization: `Bearer ${LINES_KEY}` };
  const got = await fetch(new URL("/pending", LINES_URL), { headers: auth });
  if (!got.ok) throw new Error(`The lines could not be fetched: ${got.status}`);
  const { lines } = await got.json();
  if (!lines.length) { console.log("Nothing is waiting."); process.exit(0); }
  const banned = [];
  for (const name of LISTS) { const r = await fetch(WORDS + name); if (!r.ok) throw new Error(`The word list "${name}" could not be fetched (${r.status}); nothing is let through without it.`); banned.push(...(await r.text()).split(/\r?\n/).map((w) => letters(w.trim())).filter(Boolean)); }
  const shown = JSON.parse(readFileSync(file, "utf8")), { kept, dropped } = sieve(lines, banned, shown);
  if (kept.length) writeFileSync(file, JSON.stringify([...kept.reverse(), ...shown], null, 2) + "\n");
  // What was fetched is removed from the queue either way: it is now in the proposal, or it was dropped.
  const done = await fetch(new URL("/taken", LINES_URL), { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ ids: lines.map((l) => l.id) }) });
  if (!done.ok) throw new Error(`The queue could not be cleared: ${done.status}`);
  console.log(`kept ${kept.length}; dropped ${JSON.stringify(dropped)}`);
}
