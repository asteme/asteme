// Reading a model's JSON reply. The baseline asks for a strict JSON object, but
// a model can still append a closing remark, wrap the object in a fence, or
// leave an inner quote unescaped inside a quoted string. Losing the whole
// reflection because of that formatting noise would drop the learning itself,
// so the noise is removed here and the answer is read as posed.
const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/;

const unfence = (text) => {
  const match = text.match(fence);
  return match ? match[1] : text;
};

// Quotes that only look like delimiters: inside a string literal a quote that
// is followed by ordinary text must be content, not the end of the string.
const requote = (text) => {
  let out = "", inside = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inside) {
      if (ch === '"') inside = true;
      out += ch;
      continue;
    }
    if (ch === "\\") { out += ch + (text[++i] ?? ""); continue; }
    if (ch === "\n" || ch === "\r") { out += "\\n"; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      if (next === undefined || ",:}]".includes(next)) { inside = false; out += ch; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
};

// Every balanced value in the text, in order. Strings are tracked so braces and
// brackets that appear inside quotes never unbalance the scan.
const balanced = (text) => {
  const found = [];
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0, inside = false, quote = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inside) {
        if (ch === "\\") { i++; continue; }
        if (ch === quote) inside = false;
        else if ((ch === "\n" || ch === "\r") && quote === '"') break; // unterminated string
        continue;
      }
      if (ch === '"' || ch === "'") { inside = true; quote = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (!depth) { found.push(text.slice(start, i + 1)); break; }
      }
    }
  }
  return found;
};

const parse = (text) => {
  try { return { value: JSON.parse(text) }; } catch (error) { return { error }; }
};

export function readModelJson(text) {
  if (typeof text !== "string" || !text.trim()) throw Error("Empty memory response");
  const source = unfence(text).trim();
  let last;
  for (const candidate of [source, ...balanced(source)]) {
    const direct = parse(candidate);
    if (!direct.error) return direct.value;
    last = direct.error;
    const repaired = parse(requote(candidate));
    if (!repaired.error) return repaired.value;
    last = repaired.error;
  }
  const value = new Error(`Unreadable memory JSON: ${last.message}`);
  value.raw = text.slice(0, 4000);
  throw value;
}
