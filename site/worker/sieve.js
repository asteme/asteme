// What is plainly not a line is thrown away before anyone has to read it. The sieve only throws away; it never shows anything by itself.
// Why a line is refused, or null when the sieve has nothing against it. `banned` is a list of lower-case words and phrases; `already` is what is there.
export const letters = (s) => String(s).toLowerCase().normalize("NFKC");
export const refuse = (text, banned = [], already = [], least = 2) => {
  const t = letters(text),
    n = [...text].length;
  if (n < least || n > 120) return "length";
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
