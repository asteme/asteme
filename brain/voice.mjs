// A voice for what Asteme says, and the shape of a recording it is given.
//
// Reading aloud has two makers. One is in the page: the voice the device
// already has, which costs nothing and sends nothing anywhere. The other is
// lent by whoever started Asteme: DeepSeek's text-to-speech, reached with the
// key that is already there. This file holds what both need (what of a reply
// is read) and the second maker.
//
// Only marks are read here, never meaning: a fenced block is not read out, a
// link is read by its words or by the name of its site.

const DEEPSEEK = "https://api.deepseek.com/v1/tools";
export const VOICES = ["stella", "tide"];
// One request may carry 10,000 billed characters (a Chinese character counts
// as two) and 64 KiB. What is read stops well inside both.
const BILLED = 9000,
  BYTES = 60000;
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

const billed = (text) => {
  let n = 0;
  for (const ch of text) n += HAN.test(ch) ? 2 : 1;
  return n;
};

/** What of a written reply is said aloud: its words, without the marks that are for the eye. */
export function forVoice(text) {
  let t = String(text ?? "");
  t = t.replace(/^```[^\n]*\n[\s\S]*?(^```[^\n]*\n?|(?![\s\S]))/gm, "");
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
  // A bare address is read by the name of its site; the full stop or bracket after it belongs to the sentence.
  t = t.replace(
    /https?:\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]*/g,
    (all, host) => host.replace(/^www\./, "") + (all.match(/[.,;:!?'")\]]+$/)?.[0] ?? ""),
  );
  t = t.replace(/`([^`\n]+)`/g, "$1").replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  t = unsayable(t);
  t = t.replace(/^#{1,4} +/gm, "").replace(/^(\s*)[-*] +/gm, "$1");
  t = t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (billed(t) <= BILLED && Buffer.byteLength(t) <= BYTES) return t;
  // Too long for one reading: it stops at the end of a sentence, and says nothing it was not given.
  let out = "",
    n = 0,
    bytes = 0,
    last = 0;
  for (const ch of t) {
    const add = HAN.test(ch) ? 2 : 1,
      size = Buffer.byteLength(ch);
    if (n + add > BILLED || bytes + size > BYTES) break;
    out += ch;
    n += add;
    bytes += size;
    if (/[.!?。！？\n]/.test(ch)) last = out.length;
  }
  return (last > out.length / 2 ? out.slice(0, last) : out).trim();
}

// What nobody wants read out: a string made for a machine to tell things apart
// by. It is known by its shape alone, never by what it is about: a UUID, a
// long run of hex, a run of letters and digits joined by hyphens or
// underscores that is long and mostly not words (an id with a word in front
// keeps the word: "schedule-7662e608-f6fc-..." is read as "schedule"), a long
// string in base64's letters. A path is read by the name of its file. A date,
// a version, a number, a word with a hyphen in it are left as they are.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const randomish = (s) => {
  const digits = (s.match(/\d/g) ?? []).length,
    letters = (s.match(/[A-Za-z]/g) ?? []).length;
  if (s.length >= 8 && /^[0-9a-f]+$/i.test(s) && digits >= 4 && letters >= 1) return true; // hex
  if (s.length >= 20 && digits >= 3 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /^[A-Za-z0-9+/=_-]+$/.test(s)) return true; // base64 and the like
  if (
    s.length >= 8 &&
    digits >= 3 &&
    letters >= 2 &&
    digits + letters === s.length &&
    !/^[A-Za-z]+\d{1,4}$/.test(s) &&
    !/^\d+[A-Za-z]{1,3}$/.test(s)
  ) {
    let turns = 0;
    for (let i = 1; i < s.length; i++) if (/\d/.test(s[i]) !== /\d/.test(s[i - 1])) turns++;
    return turns >= 3;
  } // letters and digits shuffled together
  return false;
};
export function unsayable(text) {
  let t = String(text ?? "");
  // A path is read by its last name: where it is kept is for the eye.
  t = t.replace(/(?:[A-Za-z]:\\|\\\\|\/)(?:[^\s\\/:*?"<>|()（）「」、。]+[\\/])+([^\s\\/:*?"<>|()（）「」、。]*)/g, (all, last) => last || "");
  t = t.replace(UUID, "\u0000");
  t = t.replace(/[A-Za-z0-9][A-Za-z0-9+/=_\u0000-]{7,}[A-Za-z0-9=\u0000]/g, (token) => {
    if (!/[\u0000\d]/.test(token)) return token;
    // Taken apart at its joins: what is made for a machine goes, a word in front of it stays.
    const parts = token.split(/[-_]/),
      kept = parts.filter((part) => part && !part.includes("\u0000") && !randomish(part));
    if (kept.length === parts.length && !randomish(token.replace(/[-_]/g, ""))) return token;
    const words = kept.filter((part) => /^[A-Za-z]{2,}$/.test(part));
    return words.length && words.length < parts.length ? words.join(" ") : kept.length === parts.length ? "" : words.join(" ");
  });
  t = t.replace(/\u0000/g, "").replace(/…/g, " ");
  // What was only there to hold one is left empty, and goes with it.
  t = t
    .replace(/[(（[]\s*(?:ID|id|Id)?\s*[:：]?\s*[)）\]]/g, "")
    .replace(/\b(ID|id)\s*[:：]\s*(?=[\s,.;、。)）]|$)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:、。)）])/g, "$1");
  return t;
}

/**
 * DeepSeek's text-to-speech as a voice to lend.
 * `auth` gives the headers of one request (or null when there is no key);
 * `ready` says, without asking anything, whether one is expected to be there.
 * The key is asked for at each reading and kept nowhere.
 */
export function deepseekVoice({ auth, ready = () => true, same = () => true, base = DEEPSEEK, fetch: ask = globalThis.fetch } = {}) {
  if (typeof auth !== "function") throw new Error("A voice needs a way to ask for its key");
  return {
    state: () => (ready() ? { maker: "deepseek", voices: VOICES, same: !!same() } : null),
    async speak(text, { voice = VOICES[0], signal } = {}) {
      const headers = await auth(base);
      if (!headers) throw new Error("There is no DeepSeek key to read aloud with");
      const res = await ask(`${base.replace(/\/$/, "")}/tts`, {
        method: "POST",
        signal,
        headers: { ...headers, "content-type": "application/json" },
        // The marks were already taken out here, so that what is read is the same whichever voice reads it.
        // Raw samples (16-bit, mono, 24 kHz), so the page can begin to play while the rest is still being made.
        body: JSON.stringify({ text, voice_id: VOICES.includes(voice) ? voice : VOICES[0], format: "pcm", filter_markdown: false }),
      });
      if (!res.ok) {
        let why = "";
        try {
          const said = await res.json();
          why = String(said?.error?.message ?? said?.message ?? said?.error ?? "");
        } catch {
          /* no reason given */
        }
        throw new Error(`DeepSeek did not read it (${res.status}${why ? `: ${why.slice(0, 160)}` : ""})`);
      }
      return { type: "audio/pcm", rate: 24000, body: res.body };
    },
  };
}

/**
 * Any service that speaks the "audio/speech" shape many do: OpenAI's, and the
 * local servers made to match it, which is how a voice that runs on one's own
 * computer is connected. It is asked for raw samples (16-bit, mono), so the
 * page can begin to play while the rest is made; `rate` says how many a
 * second the service gives (24,000 unless told otherwise).
 */
export function speechVoice({
  url,
  auth = async () => ({}),
  model = "tts-1",
  voices = ["alloy"],
  rate = 24000,
  same = () => false,
  fetch: ask = globalThis.fetch,
} = {}) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("A voice service needs its address");
  const names = (Array.isArray(voices) ? voices : [])
    .map((v) => String(v))
    .filter((v) => /^[\w .:-]{1,60}$/.test(v))
    .slice(0, 12);
  if (!names.length) throw new Error("A voice service needs the name of at least one voice");
  return {
    state: () => ({ maker: "service", voices: names, same: !!same() }),
    async speak(text, { voice = names[0], signal } = {}) {
      const res = await ask(`${url.replace(/\/$/, "")}/audio/speech`, {
        method: "POST",
        signal,
        headers: { ...((await auth()) ?? {}), "content-type": "application/json" },
        body: JSON.stringify({ model, input: text, voice: names.includes(voice) ? voice : names[0], response_format: "pcm" }),
      });
      if (!res.ok) {
        let why = "";
        try {
          const said = await res.json();
          why = String(said?.error?.message ?? said?.message ?? said?.error ?? "");
        } catch {
          /* no reason given */
        }
        throw new Error(`The voice service did not read it (${res.status}${why ? `: ${why.slice(0, 160)}` : ""})`);
      }
      return { type: "audio/pcm", rate, body: res.body };
    },
  };
}

/**
 * A recording as the plainest WAV there is: 16-bit PCM under a 44-byte header.
 * Recorders differ in what they write around the sound (a longer `fmt `, a
 * `LIST` before `data`, a length left open); a recognizer that wants the plain
 * shape should not have to care. The samples are passed on untouched.
 */
export function plainWav(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 44) throw new Error("Nothing was recorded");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("The recording is not a WAV file");
  let fmt = null,
    data = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at),
      stated = v.getUint32(at + 4, true),
      start = at + 8;
    // A stream that was never closed leaves the length open; then the sound runs to the end.
    const size = id === "data" && (stated === 0 || stated === 0xffffffff || start + stated > bytes.length) ? bytes.length - start : stated;
    if (id === "fmt " && size >= 16)
      fmt = {
        format: v.getUint16(start, true),
        channels: v.getUint16(start + 2, true),
        rate: v.getUint32(start + 4, true),
        bits: v.getUint16(start + 14, true),
        // "Extensible" says the real format further on.
        sub: size >= 26 ? v.getUint16(start + 24, true) : null,
      };
    if (id === "data") {
      data = bytes.subarray(start, start + size);
      break;
    }
    at = start + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("The recording is not a WAV file");
  const pcm = fmt.format === 1 || (fmt.format === 0xfffe && fmt.sub === 1);
  if (!pcm || fmt.bits !== 16 || !fmt.channels || !fmt.rate) throw new Error("The recording must be 16-bit PCM");
  const even = data.length - (data.length % (fmt.channels * 2)),
    out = new Uint8Array(44 + even),
    o = new DataView(out.buffer),
    put = (at, t) => {
      for (let i = 0; i < 4; i++) out[at + i] = t.charCodeAt(i);
    };
  put(0, "RIFF");
  o.setUint32(4, 36 + even, true);
  put(8, "WAVE");
  put(12, "fmt ");
  o.setUint32(16, 16, true);
  o.setUint16(20, 1, true);
  o.setUint16(22, fmt.channels, true);
  o.setUint32(24, fmt.rate, true);
  o.setUint32(28, fmt.rate * fmt.channels * 2, true);
  o.setUint16(32, fmt.channels * 2, true);
  o.setUint16(34, 16, true);
  put(36, "data");
  o.setUint32(40, even, true);
  out.set(data.subarray(0, even), 44);
  return out;
}
