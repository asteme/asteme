const W = __WORDS__,
  $ = (id) => document.getElementById(id);
// Inside another page's frame a cookie may not travel, so the token rides on each address instead.
const HOST = __HOST__;
// Inside DSH the page wears the colours DSH is wearing, whatever skin that is.
// Inside DSH the ground is whatever DSH is standing on at the moment: one of its two themes, or a skin. The page and text colours come from the host; the rest follows from them.
const ROOT = document.documentElement,
  COLOUR = (c) => /^#[0-9a-f]{6}$/i.test(c ?? "");
let hostAsked = null; // what the host last asked the page to wear, as it arrived
// The ground the page stands on. As it starts out it is whatever the host has (or the device, alone); the user may instead have white, black or any colour, and the text is then whichever of the two inks can be read on it.
const BORN = ROOT.dataset.theme ?? "",
  LUM = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
const GROUNDS = { white: ["light", "#ffffff", "#0f1115"], black: ["dark", "#151517", "#f9fafb"] };
let ownGround = "auto",
  ownInk = "";
const dress = () => {
  const own =
    ownGround && ownGround !== "auto"
      ? (GROUNDS[ownGround] ??
        (COLOUR(ownGround) ? [LUM(ownGround) > 0.55 ? "light" : "dark", ownGround, LUM(ownGround) > 0.55 ? "#0f1115" : "#f9fafb"] : null))
      : null;
  const [theme, bg, ink] = own ?? [hostAsked?.theme || BORN, hostAsked?.bg, hostAsked?.ink];
  if (["dark", "light"].includes(theme)) ROOT.dataset.theme = theme;
  else delete ROOT.dataset.theme;
  if (COLOUR(bg) && COLOUR(ink)) {
    ROOT.style.setProperty("--bg", bg);
    ROOT.style.setProperty("--ink", ink);
  } else {
    ROOT.style.removeProperty("--bg");
    ROOT.style.removeProperty("--ink");
  }
  // Letters of the user's own colour, on whatever ground there is.
  if (ownInk) ROOT.style.setProperty("--ink", ownInk);
};
const wear = (theme, bg, ink) => {
  hostAsked = { theme: String(theme ?? "").slice(0, 12), bg: String(bg ?? "").slice(0, 12), ink: String(ink ?? "").slice(0, 12) };
  dress();
};
if (HOST.bg) wear(ROOT.dataset.theme, HOST.bg, HOST.ink);
addEventListener("message", (e) => {
  if (e.source !== parent || e.data?.asteme !== "theme") return;
  wear(e.data.theme, e.data.bg, e.data.ink);
  if (typeof kick === "function") kick();
  if (typeof shown === "function") shown("host");
});
const TOKEN = "__TOKEN__",
  api = (path) => (TOKEN ? path + (path.includes("?") ? "&" : "?") + "token=" + TOKEN : path);
// Once it has a name of its own, the page speaks of it by that name: "Asteme" in a sentence is whoever this is.
let called = "";
const say = (key, values = {}) => {
  const words = W[key] ?? key,
    own = called && called !== "Asteme" ? words.replace(/Asteme/g, () => called) : words;
  return own.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
};
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const thread = $("thread"),
  scroller = $("scroller"),
  seen = new Set(),
  taskLines = new Map(),
  askBoxes = new Map();
// How much sky: full, quiet (no motion, fewer and fainter stars) or off. Kept
// for this browser only; everything the sky shows is also said in words.
// Less movement where the device asks for it, unless the person chose, here, to have it move all the same. Then the rules this page keeps for the one case are taken out and those for the other are made to hold.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let moveAnyway = false;
try {
  moveAnyway = localStorage.getItem("asteme-motion") === "full";
} catch {
  /* not kept */
}
if (reduce && moveAnyway)
  for (const sheet of document.styleSheets) {
    try {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const r = sheet.cssRules[i],
          m = r.media?.mediaText ?? "";
        if (/prefers-reduced-motion:\s*reduce/.test(m)) sheet.deleteRule(i);
        else if (/prefers-reduced-motion:\s*no-preference/.test(m)) r.media.mediaText = "all";
      }
    } catch {
      /* a sheet that cannot be read is left as it is */
    }
  }
const calm = reduce && !moveAnyway,
  LEVELS = ["full", "quiet", "off"];
document.documentElement.classList.toggle("calm", calm);
let level = "full";
try {
  const kept = localStorage.getItem("asteme-sky");
  if (LEVELS.includes(kept)) level = kept;
} catch {
  /* not kept, then */
}
let still = calm || level !== "full";
const setLevel = (next) => {
  level = next;
  still = calm || level !== "full";
  try {
    localStorage.setItem("asteme-sky", level);
  } catch {
    /* not kept */
  }
  document.body.classList.toggle("sky-off", level === "off");
  $("skyset").textContent = say("brainSettings");
  kick();
};
let state = "awake",
  thinking = false,
  online = true,
  loaded = false,
  name = "",
  you = "",
  faces = { it: null, you: null },
  lastSaid = { role: "", at: 0 },
  lastDay = null;
const MARK = $("mark").outerHTML;
const face = (role) => {
  const n = el("span", "face"),
    src = role === "user" ? faces.you : faces.it;
  n.dataset.role = role;
  if (src) {
    const i = new Image();
    i.src = src;
    i.alt = "";
    n.append(i);
  } else if (role === "user") n.textContent = (you || say("brainYou")).slice(0, 1);
  else n.innerHTML = MARK;
  return n;
};
// The look this person was given: a picture behind the sky, a colour for the user's side, a text size.
const applyLook = (k = {}) => {
  document.body.classList.toggle("walled", !!k.wall);
  $("wall").style.backgroundImage = k.wall ? `url("${k.wall}")` : "";
  $("wall").style.filter = k.wall && k.blur ? `blur(${k.blur}px)` : "";
  document.documentElement.style.setProperty("--dim", String(k.dim ?? 0.45));
  // Under each kind of words a colour, and for the letters on it either the user's own or whichever of two inks can be read there.
  const tone = (name, ink, value, letters) => {
    if (COLOUR(value)) ROOT.style.setProperty(name, value);
    else ROOT.style.removeProperty(name);
    if (COLOUR(letters)) ROOT.style.setProperty(ink, letters);
    else if (COLOUR(value)) ROOT.style.setProperty(ink, LUM(value) > 0.6 ? "#14181f" : "#f4f6f9");
    else ROOT.style.removeProperty(ink);
  };
  tone("--mine", "--mine-ink", k.accent, k.mineInk);
  tone("--its-own", "--its-ink", k.its, k.itsInk);
  ownGround = k.ground || "auto";
  ownInk = COLOUR(k.ink) ? k.ink : "";
  dress();
  // Any typeface the device has, and letters of the size asked for (the older small, medium and large are still understood).
  document.body.style.fontFamily = k.font ? `"${k.font}", system-ui, -apple-system, "Segoe UI", var(--cjk), sans-serif` : "";
  document.body.style.fontSize = (k.px ?? { s: 14.5, l: 18 }[k.size] ?? 16) + "px";
  document.body.classList.toggle("no-tips", k.tips === false);
  if (typeof kick === "function") kick();
};
let look = {},
  faceOf = new Map();
const refaces = () => {
  for (const n of document.querySelectorAll(".entry .face")) n.replaceWith(face(n.dataset.role));
  const h = face("it");
  h.id = "face";
  h.setAttribute("role", "button");
  h.tabIndex = 0;
  h.onclick = () => openSelf();
  $("face").replaceWith(h);
};
const svg = (inner, w = 20, stroke = 1.8) =>
  `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const CROSS = '<path d="M6 6l12 12M18 6L6 18"/>';
const SPEAKER = '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  STOP = '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/>';
const SMILE = '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 14.2a4.2 4.2 0 0 0 6.8 0"/><path d="M9.2 9.8h.01M14.8 9.8h.01"/>',
  REPLY = '<path d="M10 8L5 12.5 10 17"/><path d="M5 12.5h8a6 6 0 0 1 6 6v.5"/>',
  SIGNS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const UNDO = '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.6 4.6v4.2h-4.2"/><path d="M9.6 9.6l4.8 4.8M14.4 9.6l-4.8 4.8"/>';
const COPY = '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  TICK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
for (const [id, inner, w, stroke, label] of [
  ["send", '<path d="M12 19V5M5 12l7-7 7 7"/>', 18, 2.2, "brainSend"],
  ["attach", '<path d="M12 5v14M5 12h14"/>', 20, 1.8, "brainAttach"],
  ["mic", '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 20, 1.8, "brainVoice"],
  ["halt", STOP, 20, 0, "brainStop"],
  ["newest", '<path d="M12 5v14M5 12l7 7 7-7"/>', 18, 2, "brainNewest"],
  ["recno", CROSS, 18, 1.8, "brainVoiceCancel"],
  ["recok", '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>', 20, 0, "brainVoiceStop"],
]) {
  $(id).innerHTML = svg(inner, w, stroke);
  $(id).setAttribute("aria-label", say(label));
  $(id).title = say(label);
}
$("send").removeAttribute("title");
$("skylabel").textContent = say("brainSkyLabel");
// A day in another year says its year, as the day lines in the conversation do: "learned March 3" of three years ago is not this March.
const yearOf = (d) => (d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {});
const time = (at) => {
  const d = new Date(at);
  return d.toLocaleString(document.documentElement.lang, { ...yearOf(d), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
// A time said short: the hour when it is today, the day when it is not.
const when = (at) => {
  const d = new Date(at),
    lang = document.documentElement.lang;
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(lang, { ...yearOf(d), month: "short", day: "numeric" });
};
// To the end of the conversation. Once the conversation is drawn, this is its own doing (carry, where it is drawn): what was on the page is seen to travel there.
let carryNow = null;
const down = () => {
  if (carryNow) carryNow(true);
  else scroller.scrollTop = scroller.scrollHeight;
};
