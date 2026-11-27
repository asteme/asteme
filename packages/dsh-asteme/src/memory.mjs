// The write path. Everything that changes a stored memory goes through here:
// structural validation, exact evidence, revisions, links between memories and
// the queue of work left for sleep. The code checks structure; it never decides
// what is true.
import { randomUUID, identityKey, digest, cut, scrubTrace } from "./log.mjs";
import { terms, iso, isEvidence } from "./mind.mjs";
import { sensitivity, secret, matterWord } from "./policy.mjs";

export const LIVE = ["active", "doubtful"];
const CLOSURES = ["fulfilled", "withdrawn", "expired", "retired", "superseded"];
const VOLATILITY = ["stable", "slow", "state"];
const CORE_FIELDS = ["name", "userName", "tone", "agreement", "purpose", "values"];
const RELATIONSHIP_FIELDS = ["agreement", "purpose", "values"];
const LIST_FIELDS = { agreement: "commitments", values: "values" };

// Absent fields are left out, never set to undefined: what this returns goes
// to tools and to the panel, and a host may refuse a value that does not
// survive JSON unchanged.
export const evidenceOf = e => ({ id: e.id, role: e.role, text: e.content ?? "", at: iso(e.occurredAt) ?? null, recordedAt: iso(e.observedAt) ?? null,
  ...(e.metadata?.tool ? { tool: e.metadata.tool } : {}), ...(e.metadata?.interrupted ? { interrupted: true } : {}) });
// Prompts are bounded at the boundary, and a cut record says so: a silent cut
// would look like a complete source and make exact quotes unverifiable.
export const bounded = (text, n = 1200) => {
  const value = String(text ?? "");
  return value.length <= n ? value : `${value.slice(0, n)} …[truncated ${value.length - n} chars]`;
};
export const compactItem = item => ({
  id: item.id, kind: item.kind, level: item.level ?? "case", text: bounded(item.text, 600), concrete: bounded(item.concrete, 300),
  general: bounded(item.general, 300), certainty: item.certainty, status: item.status,
  tested: bounded(item.tested, 200), hypothesis: bounded(item.hypothesis, 200),
  about: item.about || undefined, volatility: item.volatility ?? "slow",
  // When it was learned, so that of two things said at different times the later can be told from the earlier.
  learned: iso(item.learnedAt)?.slice(0, 10), standing: item.standing === true || undefined,
  entities: (item.entities ?? []).slice(0, 8),
  // Reflection needs these to keep paused records untouched and to close concerns.
  paused: item.paused === true,
  trigger: item.trigger ? { at: item.trigger.at ?? null, until: item.trigger.until ?? null } : null,
  closure: item.closure ? { when: bounded(item.closure.when, 200), expiresAt: item.closure.expiresAt ?? null } : null,
  premises: item.premises?.length ? item.premises : undefined,
  supersedes: item.supersedes || undefined,
});
// Each record is shown up to `n` characters. `wide` names records given more
// room: what the user has just written, or what has just come back, is the
// thing being answered and is read whole where it fits.
export const pageRaw = (events, n = 1200, wide = null) => events.map(e => ({ ...evidenceOf(e), text: bounded(e.content, wide?.ids?.has(e.id) ? wide.n : n) }));
export const norm = s => String(s).toLocaleLowerCase().trim();
const situation = i => [i.concrete, i.general].filter(Boolean).join("\n");
const date = x => x == null ? null : Number.isFinite(Date.parse(x)) ? new Date(x).toISOString() : undefined;
const strip = ({ salience, imagined, accessibility, stats, ...data }) => data;
const mergeRefs = (a, b) => [...new Map([...(a ?? []), ...(b ?? [])].map(r => [r.id + r.quote, r])).values()];
export const pairKey = (a, b) => [a, b].sort().join("|");
/**
 * Names that most memories carry say nothing about any one of them: the
 * user's own name or nickname ends up in nearly every record. On a real store
 * that one name paired every memory with every other for comparison and made
 * a bare greeting call memories up. A name counts as common when at least four
 * memories, and more than a third of them, carry it; and the names in `always`
 * (the user's and the assistant's own) are common whatever the count.
 */
// The words for the two who are talking, which a model gives as a name when it has none ("user", "the assistant"): they name nobody.
export const NOBODY = ["user", "the user", "assistant", "the assistant", "ai", "me", "myself", "you", "ユーザー", "アシスタント", "私", "用户", "助手", "我"];
export function commonNames(items, always = []) {
  const count = new Map();
  for (const i of items) for (const name of new Set((i.entities ?? []).map(norm))) count.set(name, (count.get(name) ?? 0) + 1);
  const floor = Math.max(4, items.length / 3);
  // The user's own name and the assistant's are common from the first memory on, however few there are: a store of eleven
  // memories, two of them naming the user, took every message that mentioned nobody as naming those two.
  return new Set([...[...count].filter(([, n]) => n >= floor && n > items.length / 3).map(([name]) => name), ...always.filter(n => typeof n === "string" && n.trim()).map(norm)]);
}

// Two names for the same person or thing rarely arrive in the same form: the
// scene says "project A", the memory says "A". They match when one is a whole
// run of the other's words. Words are split where the script changes, so a
// name written against kana or Han still stands alone. A single letter only
// counts when it is written as a name (a capital or a digit), never as "a".
const NAME_PARTS = /[\p{Script=Latin}\p{N}]+|(?:(?![\p{Script=Latin}])\p{L})+/gu;
const standsAlone = (short, long) => new RegExp(`(^|[^\\p{Script=Latin}\\p{N}])${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{Script=Latin}\\p{N}]|$)`, "u").test(long);
export function sameEntity(a, b) {
  const x = String(a ?? "").trim(), y = String(b ?? "").trim();
  if (!x || !y) return false;
  if (norm(x) === norm(y)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const s = norm(short).match(NAME_PARTS) ?? [], l = norm(long).match(NAME_PARTS) ?? [];
  if (!s.length || s.length >= l.length && s.length !== 1) return false;
  const run = l.some((_, at) => s.every((part, n) => l[at + n] === part));
  // Scripts written without spaces: a name of two or more characters inside a longer one.
  const within = s.length === 1 && [...s[0]].length >= 2 && !/[\p{Script=Latin}\p{N}]/u.test(s[0]) && l.some(part => part.includes(s[0]));
  if (!run) return within;
  if (s.length === 1 && [...s[0]].length === 1 && /[\p{Script=Latin}\p{N}]/u.test(s[0]))
    return /[\p{Lu}\p{N}]/u.test(short) && standsAlone(short.toUpperCase(), long);
  return true;
}

/**
 * The names the stored memories carry that occur in a text as written: a word or a run of words standing alone, or, in scripts written without
 * spaces, a name of two or more characters. Names that most memories carry are left out (see commonNames). This is reading, not judging: it lets a
 * message bring what it names before any model has read it, so that a reply does not wait for a second call only because the name was found late.
 */
export function namesIn(text, items, common = new Set(), most = 12) {
  const value = String(text ?? ""), lower = norm(value);
  if (!lower) return [];
  const found = new Map();
  for (const i of items) for (const name of i.entities ?? []) {
    if (typeof name !== "string") continue;
    const key = norm(name);
    if (key.length < 2 || found.has(key) || common.has(key)) continue;
    const latin = /^[\p{Script=Latin}\p{N}\s._'-]+$/u.test(key);
    // A name in katakana is a word, and is not found inside a longer one (ジョン is not in バージョン).
    const kana = /^[\p{Script=Katakana}ー]+$/u.test(key);
    if (!lower.includes(key)) continue;
    if (latin ? alone(key, lower) : kana ? new RegExp(`(?<![\\p{Script=Katakana}ー])${key}(?![\\p{Script=Katakana}ー])`, "u").test(lower) : lower.includes(key)) found.set(key, name);
    if (found.size >= most) return [...found.values()];
  }
  return [...found.values()];
}
const alone = (word, within) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, m => "\\" + m)}([^\\p{L}\\p{N}]|$)`, "u").test(within);

/**
 * Stored names a text uses in part, written as a name is: "Tanaka" for "Mira Tanaka", 田中 for 田中美羅. For a name of several words, one of
 * its words that begins with a capital and is written so in the text; for a name in Han, its first or last two characters. A part that more than
 * three stored names share points at none of them ("Project" of fourteen projects), and a word that is in every sentence is no part ("The Hague").
 * These come after the whole names and never in their place: `whole` is what namesIn found, and at most `most` more are given. They put a memory on
 * the table; they do not press for an answer about it (see attend).
 */
export function namesInPart(text, items, common = new Set(), { whole = [], most = 4 } = {}) {
  const value = String(text ?? "");
  if (!value.trim()) return [];
  // A word of a name the text gives whole is that name's, and brings no other ("New York Times" does not bring "New York City").
  const had = new Set(whole.map(norm)), taken = new Set(whole.flatMap(n => String(n).trim().split(/\s+/))), parts = new Map(), seen = new Set();
  for (const i of items) for (const raw of i.entities ?? []) {
    if (typeof raw !== "string") continue;
    const name = raw.trim(), key = norm(name);
    if (key.length < 2 || seen.has(key) || common.has(key)) continue;
    seen.add(key);
    const words = name.split(/\s+/);
    const mine = words.length > 1
      ? words.filter(w => /^\p{Lu}[\p{L}'’-]{2,}$/u.test(w) && !common.has(norm(w)) && matterWord(w))
      : /^\p{Script=Han}[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,}$|^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,}\p{Script=Han}$/u.test(name)
        ? [[...name].slice(0, 2).join(""), [...name].slice(-2).join("")].filter(p => /^\p{Script=Han}{2}$/u.test(p) && matterWord(p))
        : [];
    for (const part of new Set(mine)) { if (!parts.has(part)) parts.set(part, []); parts.get(part).push(name); }
  }
  const out = [];
  for (const [part, of] of parts) {
    if (of.length > 3 || taken.has(part) || !value.includes(part) || (/\p{Lu}/u.test(part) && !alone(part, value))) continue;
    for (const name of of) { if (!had.has(norm(name)) && !out.includes(name)) out.push(name); if (out.length >= most) return out; }
  }
  return out;
}

// Literals with a shape, in any language: mail addresses, links, runs of seven
// or more digits. Lower-cased, without the punctuation a sentence leaves on them.
const LITERAL = /[^\s@<>()"'`]+@[^\s@<>()"'`]+\.[a-z]{2,}|https?:\/\/[^\s<>()"'`]+|\d{7,}/gi;
export const literals = text => [...new Set((String(text ?? "").match(LITERAL) ?? []).map(l => l.toLowerCase().replace(/[.,;:!?\])}]+$/, "")))];

const deepFreeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; };

export const memory = {
  // --- Reading ---------------------------------------------------------------
  // A source that was erased, or that belongs to an excluded session, takes
  // every memory built on it out of view. Positive results are cached until
  // the next erasure or exclusion, which are the only events that change them.
  intact(id) { this.intactAsOfNow(); return this.intactKnown(id); },
  // Whether anything was erased or excluded since the last look is asked of
  // the store once for a whole reading of the memories, not once for every
  // source of every memory: with thousands of memories that question alone
  // was most of the time a reading took.
  intactAsOfNow() {
    const stamp = `${this.log.state("erasure-revision", 0)}:${JSON.stringify(this.log.state("excluded-sessions", []))}`;
    if (this._intact?.stamp !== stamp) this._intact = { stamp, ids: new Set() };
  },
  intactKnown(id) {
    if (this._intact.ids.has(id)) return true;
    const e = this.log.event(id);
    if (!e || e.erased) return false;
    this._intact.ids.add(id);
    return true;
  },
  hydrate(row, dynamics, asked = false) {
    if (!row) return null;
    const item = JSON.parse(row.data);
    if (!asked) this.intactAsOfNow();
    if (!item.evidence.every(e => this.intactKnown(e.id))) return null;
    return { ...item, level: item.level ?? "case", ...(dynamics ?? this.dynamics(item.id)) };
  },
  // Reading every memory parses every row, and one recall reads them all
  // several times over: with three thousand memories that was nine readings
  // and four tenths of a second before each reply. The parsed list is kept
  // until anything at all is written to the store, by this connection or by
  // another. What is handed out is a new list of the same objects: they are
  // read, never changed in place (under test they are frozen, so a place that
  // did change one would fail there and not in use).
  items({ closed = false } = {}) {
    const db = this.log.db;
    this._stamps ??= [db.prepare("PRAGMA data_version"), db.prepare("SELECT total_changes() AS n")];
    const stamp = `${this._stamps[0].get().data_version}:${this._stamps[1].get().n}`;
    if (this._items?.stamp !== stamp) {
      const dynamics = new Map(db.prepare("SELECT id,data FROM dynamics WHERE owner=?").all(this.owner).map(r => [r.id, JSON.parse(r.data)]));
      this.intactAsOfNow();
      const all = db.prepare("SELECT id,data FROM experience WHERE owner=?").all(this.owner).map(row => this.hydrate(row, dynamics.get(row.id) ?? {}, true)).filter(Boolean);
      if (process.env.NODE_TEST_CONTEXT) for (const i of all) deepFreeze(i);
      // Reading can itself write (a state the first read sets): the stamp is taken again after it.
      this._items = { stamp: `${this._stamps[0].get().data_version}:${this._stamps[1].get().n}`, all, live: all.filter(i => !i.paused && LIVE.includes(i.status)) };
    }
    return [...(closed ? this._items.all : this._items.live)];
  },
  item(id) {
    return this.hydrate(this.log.db.prepare("SELECT data FROM experience WHERE owner=? AND id=?").get(this.owner, id));
  },
  revisions(id) {
    return this.log.db.prepare("SELECT data FROM experience_history WHERE owner=? AND id=? ORDER BY seq").all(this.owner, id).map(r => JSON.parse(r.data));
  },

  // --- Standing asks: what is not left to recall -------------------------------
  // What the user asked to be held to ("whenever I ask for a recipe, check for peanuts") is put in front of the model at every reply, the way names
  // and agreements are, instead of waiting to be called up. Measured (2026-11): left to recall, such an ask reached the first reply it applied to
  // in 12 of 23 tries; kept in front, 4 of 5. They have a number and a size, newest first; one that does not fit is recalled like any other memory.
  isStanding(item) { return item?.standing === true && item.kind === "understanding" && LIVE.includes(item.status) && !item.paused; },
  standingAsks({ here = null, limit = 24, chars = 3000 } = {}) {
    // One kept to its project is in front only there: where the project is not known, it is not shown.
    const list = this.items().filter(i => this.isStanding(i) && (() => { const home = this.confinedTo(i); return !home || (!!here && home === here); })())
      .sort((a, b) => (b.lastEvidenceAt ?? 0) - (a.lastEvidenceAt ?? 0));
    const out = []; let used = 0;
    for (const i of list) {
      const line = { id: i.id, when: cut(i.concrete, 200), ask: cut(i.text, 400), since: iso(i.learnedAt)?.slice(0, 10), ...(i.status === "doubtful" ? { inDoubt: true } : {}) };
      const size = line.when.length + line.ask.length + 60;
      if (out.length >= limit || used + size > chars) break;
      out.push(line); used += size;
    }
    return out;
  },

  // --- Dynamics: what use changes without changing the claim -----------------
  // Salience and imagined scenes move with experience. They are kept apart from
  // the revisioned content so that learning how to recall a memory is not
  // mistaken for a change in what it says. Each change still leaves a history row.
  dynamics(id) {
    const row = this.log.db.prepare("SELECT data FROM dynamics WHERE owner=? AND id=?").get(this.owner, id);
    return row ? JSON.parse(row.data) : {};
  },
  setDynamics(id, patch, reason) {
    const next = { ...this.dynamics(id), ...patch };
    this.log.db.prepare("INSERT INTO dynamics VALUES (?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=excluded.data").run(this.owner, id, JSON.stringify(next));
    this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, id, JSON.stringify({ at: this.log.now(), reason, dynamics: patch }));
    return next;
  },
  raiseSalience(id, value, reason) {
    const current = this.dynamics(id).salience ?? 0, next = Math.min(1, Math.max(current, value));
    if (next > current) this.setDynamics(id, { salience: Number(next.toFixed(3)) }, reason);
  },

  // --- Links and the sleep queue ---------------------------------------------
  // derived: src was drawn from dst. supersedes: src replaced dst.
  // contradicts: the pair disagrees (open until reconciled). coactive: the pair
  // helped together.
  link(src, dst, type, data = {}) {
    this.log.db.prepare("INSERT INTO link VALUES (?,?,?,?,?) ON CONFLICT(owner,src,dst,type) DO UPDATE SET data=excluded.data")
      .run(this.owner, src, dst, type, JSON.stringify(data));
  },
  links(id) {
    const rows = id
      ? this.log.db.prepare("SELECT src,dst,type,data FROM link WHERE owner=? AND (src=? OR dst=?)").all(this.owner, id, id)
      : this.log.db.prepare("SELECT src,dst,type,data FROM link WHERE owner=?").all(this.owner);
    return rows.map(r => ({ src: r.src, dst: r.dst, type: r.type, ...JSON.parse(r.data) }));
  },
  dependents(id) {
    return this.log.db.prepare("SELECT src FROM link WHERE owner=? AND dst=? AND type='derived'").all(this.owner, id).map(r => r.src);
  },
  enqueue(type, target, priority, data = {}) {
    const row = this.log.db.prepare("SELECT id,priority,data FROM job WHERE owner=? AND type=? AND target=? AND state='queued'").get(this.owner, type, target);
    if (row) {
      const old = JSON.parse(row.data);
      const reasons = [...new Set([...(old.reasons ?? []), ...(data.reasons ?? [])])].slice(-8);
      this.log.db.prepare("UPDATE job SET priority=?,data=? WHERE id=?").run(Math.max(row.priority, priority), JSON.stringify({ ...old, ...data, reasons }), row.id);
      return row.id;
    }
    const id = randomUUID();
    this.log.db.prepare("INSERT INTO job VALUES (?,?,?,?,?,'queued',?)").run(id, this.owner, type, target, priority, JSON.stringify({ at: this.log.now(), attempts: 0, ...data }));
    return id;
  },
  jobs(state = "queued") {
    return this.log.db.prepare("SELECT id,type,target,priority,state,data FROM job WHERE owner=? AND state=? ORDER BY priority DESC, rowid").all(this.owner, state)
      .map(r => ({ id: r.id, type: r.type, target: r.target, priority: r.priority, state: r.state, ...JSON.parse(r.data) }));
  },
  // Truth maintenance: when a memory changes, whatever was drawn from it is
  // looked at again instead of quietly keeping a conclusion whose ground moved.
  propagate(id, why) {
    for (const dependent of this.dependents(id)) this.enqueue("revise", dependent, 0.7, { reasons: [`A memory this was drawn from ${why} (${id})`] });
  },

  // --- Writing ----------------------------------------------------------------
  // Each history row says what kind of change it was, decided from the record
  // itself: created, reworded, closed, reopened, doubted, confirmed, paused,
  // resumed, or touched when only its bookkeeping moved.
  write(item, reason) {
    const data = strip(item);
    const old = this.log.db.prepare("SELECT data FROM experience WHERE id=?").get(data.id), was = old ? JSON.parse(old.data) : null;
    const open = i => ["active", "doubtful"].includes(i.status);
    const action = !was ? "created" : was.text !== data.text ? "reworded" : open(was) && !open(data) ? "closed" : !open(was) && open(data) ? "reopened"
      : was.status !== data.status ? (data.status === "doubtful" ? "doubted" : "confirmed") : !!was.paused !== !!data.paused ? (data.paused ? "paused" : "resumed") : "touched";
    this.log.db.prepare("INSERT INTO experience VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(data.id, this.owner, JSON.stringify(data));
    this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, data.id, JSON.stringify({ at: this.log.now(), action, reason, item: data }));
  },
  evidence(refs, events) {
    if (!Array.isArray(refs) || !refs.length) throw Error("missing exact source evidence");
    return refs.map(r => {
      const original = this.log.event(r.id);
      if (!original || original.erased || identityKey(original.scope) !== this.owner || !r.quote ||
          !events.some(e => e.id === r.id && isEvidence(e) && e.content.includes(r.quote))) throw Error("missing exact source evidence");
      return original;
    });
  },
  // Removes what other tables hold about erased records or deleted memories.
  forgetDerived(references) {
    const hit = text => references.some(id => text.includes(id));
    for (const row of this.log.db.prepare("SELECT rowid,src,dst FROM link WHERE owner=?").all(this.owner))
      if (references.includes(row.src) || references.includes(row.dst)) this.log.db.prepare("DELETE FROM link WHERE rowid=?").run(row.rowid);
    for (const row of this.log.db.prepare("SELECT rowid,id FROM dynamics WHERE owner=?").all(this.owner))
      if (references.includes(row.id)) this.log.db.prepare("DELETE FROM dynamics WHERE rowid=?").run(row.rowid);
    for (const row of this.log.db.prepare("SELECT id,data FROM episode WHERE owner=?").all(this.owner))
      if (references.includes(row.id) || hit(row.data)) this.log.db.prepare("DELETE FROM episode WHERE id=?").run(row.id);
    for (const row of this.log.db.prepare("SELECT id,target,data FROM job WHERE owner=?").all(this.owner))
      if (hit(row.target) || hit(row.data)) this.log.db.prepare("DELETE FROM job WHERE id=?").run(row.id);
    // A surviving memory must not keep a quote from an erased record, or a
    // pointer to a memory that no longer exists.
    for (const row of this.log.db.prepare("SELECT id,data FROM experience WHERE owner=?").all(this.owner)) {
      if (!hit(row.data)) continue;
      const item = JSON.parse(row.data), next = { ...item };
      if (item.against) next.against = item.against.filter(r => !references.includes(r.id));
      if (item.premises) next.premises = item.premises.filter(id => !references.includes(id));
      for (const key of ["supersedes", "supersededBy"]) if (references.includes(item[key])) delete next[key];
      this.log.db.prepare("UPDATE experience SET data=? WHERE id=?").run(JSON.stringify(next), row.id);
    }
    // Vectors are derived from text that may now be gone; rebuild them on demand.
    this.log.db.prepare("DELETE FROM vector").run();
    this._vectors?.clear();
    // What was indexed of the erased records goes with them; the rest of the record's index stays.
    this.forgetPassages(references);
  },
  deletePaused(item) {
    this.log.transaction(() => {
      const current = this.items({ closed: true }).find(i => i.id === item.id);
      if (!current?.paused || current.revision !== item.revision) throw Error("Only unchanged, paused memories can be deleted");
      this.log.save("erasure-revision", this.log.state("erasure-revision", 0) + 1);
      this.propagate(item.id, "was deleted by the user");
      this.log.db.prepare("DELETE FROM experience WHERE owner=? AND id=?").run(this.owner, item.id);
      this.log.db.prepare("DELETE FROM experience_history WHERE owner=? AND id=?").run(this.owner, item.id);
      this.log.db.prepare("DELETE FROM experience_feedback WHERE owner=? AND item=?").run(this.owner, item.id);
      for (const row of this.log.db.prepare("SELECT id,data FROM attention WHERE owner=? AND instr(data, ?) > 0").all(this.owner, item.id)) {
        const kept = scrubTrace(row.data, [item.id]);
        if (kept) this.log.db.prepare("UPDATE attention SET data=? WHERE id=?").run(kept, row.id);
        else this.log.db.prepare("DELETE FROM attention WHERE id=?").run(row.id);
      }
      for (const row of this.log.db.prepare("SELECT key,data FROM state WHERE key LIKE 'shown:%' AND instr(data, ?) > 0").all(item.id)) {
        this.log.save(row.key, JSON.parse(row.data).filter(entry => !entry.items?.includes(item.id)));
      }
      this.log.db.prepare("DELETE FROM state WHERE key LIKE 'vector:%'").run();
      const waiting = this.jobs().filter(job => job.type === "revise" && job.reasons?.some(r => r.includes(item.id)));
      this.forgetDerived([item.id]);
      // The dependents were queued a moment ago; keep that work after the cleanup.
      for (const job of waiting) this.enqueue("revise", job.target, job.priority, { reasons: ["A memory this was drawn from was deleted by the user"] });
    });
  },

  // An explicit choice about the charter or the profile. Only the user's own
  // words in this change can make one, and only in the live exchange.
  applyCore(op, raw, refs, at, immediate) {
    if (!immediate || raw.some(e => e.role !== "user") || !CORE_FIELDS.includes(op.field) || typeof op.text !== "string") throw Error("not an explicit core choice");
    if (RELATIONSHIP_FIELDS.includes(op.field) && op.scope !== "relationship") throw Error("scoped instructions belong in understanding, not the always-present core");
    const lines = text => text.split("\n").map(s => s.trim()).filter(Boolean);
    const before = this.core(), list = LIST_FIELDS[op.field];
    if (list) {
      // Dropping a standing entry is allowed only when the user's own words in
      // this change say so; a truncated reply cannot erase one.
      const next = lines(op.text), dropped = (before[list] ?? []).filter(c => !next.includes(c));
      if (dropped.some(c => !raw.some(e => e.role === "user" && e.content.includes(c))))
        throw Error("removing an agreement needs the user's words in this change");
    }
    const key = `core-source:${this.owner}:${op.field}`;
    if (at < Math.max(this.log.state(key, 0), this.log.state(`profile:${this.owner}:editedAt`, 0))) throw Error("older core choice");
    const patch = op.field === "tone" ? { style: { ...before.style, tone: op.text } } : list ? { [list]: lines(op.text) } : { [op.field]: op.text };
    if (JSON.stringify({ ...before, ...patch }).length > 4000) throw Error("core exceeds one-page implementation budget");
    this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, "core", JSON.stringify({ at: this.log.now(), before, patch, evidence: refs }));
    // Do not stamp a conversational change as a later manual edit.
    this.log.save(`profile:${this.owner}`, { ...before, ...patch }); this.log.save(key, at);
  },
  // Builds the next state of one memory from an operation. Returns every item
  // that has to be written, the subject of the operation last.
  // Whose words a memory rests on. "said": at least one record it cites is
  // the user's own message. "seen": none is; it was drawn from tool output
  // (a file, a web page, a mail) or from the assistant's own words. Text that
  // reaches the assistant through a tool can be written by anyone, so a
  // memory that rests only on it is information, kept apart from what the
  // user said. Decided from the roles of the cited records, never from what
  // the text says. A memory written before this was recorded is looked up.
  grounds(item) {
    if (item?.grounds === "said" || item?.grounds === "seen") return item.grounds;
    const roles = (item?.evidence ?? []).map(r => this.log.event(r.id)?.role).filter(Boolean);
    return !roles.length || roles.includes("user") ? "said" : "seen";
  },
  applyItem(op, old, raw, refs, at, immediate, { idle = false, direct = false } = {}) {
    // Citing a user message beside a tool result does not make the tool's
    // content the user's. A literal someone could act on (an address, a link,
    // a long number) that stands in the memory and in none of the user's cited
    // words, nor in the memory as the user left it, came from somewhere else.
    const voiced = [...raw.filter(e => e.role === "user").map(e => e.content), ...(old && this.grounds(old) === "said" ? [old.text, old.concrete, old.general] : [])].join("\n").toLowerCase();
    const foreign = literals([op.text, op.concrete, op.general].join("\n")).some(l => !voiced.includes(l));
    const user = raw.some(e => e.role === "user") && !foreign;
    // What the user said is not replaced, reworded or retired on the strength
    // of a tool result or of the assistant's own words. Such a record can
    // still speak against it (counter, doubt) or stand beside it as its own
    // memory with the disagreement marked; the user settles it.
    if (old?.kind === "understanding" && !user && this.grounds(old) === "said" &&
        (op.op === "supersede" || (op.op === "close" && ["superseded", "retired"].includes(op.as)) ||
          (op.op === "put" && (foreign || (typeof op.text === "string" && op.text.trim() !== old.text.trim())))))
      throw Error("what the user said is changed only on the user's own words");
    // What the user asked to be held to is ended or narrowed by their own words, said after it, read with the exchange in view (reflection, or
    // the assistant acting on their request). A reading does not put it in doubt: measured, one irritated answer ("I know, stop nagging me") had
    // the reading doubt the ask one time in four, and a doubt has it asked about at the next reply it applies to. Idle work does not end it
    // either: tidying two memories that say the same into one used to close the ask and keep the other.
    if (old && this.isStanding(old)) {
      if (op.op === "doubt" || op.op === "counter") throw Error("a standing ask is ended by the user's own words, not put in doubt");
      const ends = op.op === "close" || op.op === "supersede" || (op.op === "put" && (op.standing === false || op.kind !== "understanding"));
      if (ends && idle) throw Error("idle work does not end a standing ask");
      if (ends && !direct && !raw.some(e => e.role === "user" && !(old.evidence ?? []).some(r => r.id === e.id))) throw Error("a standing ask is ended by something the user said after asking");
    }
    const stamp = (item, evidence, previous = old) => ({ ...item, revision: (previous?.revision ?? 0) + 1, lastCheckedAt: at, lastEvidenceAt: at, evidence });
    const build = base => {
      if (immediate && (op.kind !== "concern" || op.certainty !== "explicit" || raw.some(e => !["user", "assistant"].includes(e.role)))) throw Error("interpretation waits for reflection");
      if (!["understanding", "concern"].includes(op.kind) || ["text", "concrete", "general"].some(k => typeof op[k] !== "string" || !op[k].trim()) || typeof op.tested !== "string" || !["explicit", "observed", "inferred"].includes(op.certainty)) throw Error("incomplete understanding");
      if (op.kind === "concern" && !op.closure?.when) throw Error("concern needs an ending");
      const trigger = { at: date(op.trigger?.at), until: date(op.trigger?.until) };
      const expiresAt = date(op.closure?.expiresAt);
      if (Object.values(trigger).includes(undefined) || expiresAt === undefined) throw Error("invalid absolute date");
      return { id: base?.id ?? randomUUID(), kind: op.kind, level: base?.level ?? "case", status: "active", text: op.text, reason: op.reason,
        concrete: op.concrete, general: op.general,
        certainty: op.certainty === "explicit" && !user ? "observed" : op.certainty,
        tested: op.tested, hypothesis: op.hypothesis ?? base?.hypothesis ?? "",
        about: typeof op.about === "string" ? cut(op.about.trim(), 120) : base?.about ?? "",
        volatility: VOLATILITY.includes(op.volatility) ? op.volatility : base?.volatility ?? "slow",
        entities: (op.entities ?? []).filter(x => typeof x === "string"), trigger,
        ...(op.kind === "concern" ? { closure: { when: op.closure.when, expiresAt } } : {}),
        ...(base?.premises ? { premises: base.premises } : {}),
        ...(base?.supersedes ? { supersedes: base.supersedes } : {}),
        grounds: user || (base && this.grounds(base) === "said") ? "said" : "seen",
        // A standing ask: the user asked, in so many words, for this to hold from now on whenever its situation comes up. Only their own explicit
        // words make one, and only their own words in this change end one. Anything else leaves it as it was: a rewording, a correction that
        // replaces it, or a change that says "standing" without the user's explicit words behind it.
        ...((op.standing === true && user && op.certainty === "explicit" && op.kind === "understanding" ? true
          : op.standing === false && user ? false
          : op.kind === "understanding" && (base ?? (op.op === "supersede" ? old : null))?.standing === true) ? { standing: true } : {}),
        learnedAt: base?.learnedAt ?? at, projectId: base?.projectId ?? raw[0].scope.projectId,
        // The agent preset in use when this was learned, when the host has one.
        // Recorded so that presets can be told apart later; nothing reads it yet.
        ...((base?.preset ?? raw.find(e => e.metadata?.preset)?.metadata.preset) ? { preset: base?.preset ?? raw.find(e => e.metadata?.preset).metadata.preset } : {}),
        // Remembered, but only brought up when the user raises the matter.
        // The model that read the turn names the categories; see policy.mjs.
        sensitive: sensitivity(op.sensitive, base?.sensitive, raw.filter(e => e.role === "user").map(e => e.content).join("\n"),
          [op.text, op.concrete, op.general, ...raw.map(e => e.content)].join("\n")) };
    };
    if (op.op === "put") return [stamp(build(old), mergeRefs(old?.evidence, refs))];
    if (!old) throw Error("unknown operation");
    if (op.op === "doubt") return [stamp({ ...old, status: "doubtful" }, mergeRefs(old.evidence, refs))];
    // Evidence against a memory is kept beside it, not mixed into its support.
    if (op.op === "counter" && !immediate)
      return [{ ...stamp({ ...old, status: old.status === "active" ? "doubtful" : old.status }, old.evidence),
        against: mergeRefs(old.against, refs.map(r => ({ id: r.id, quote: r.quote, reason: cut(op.reason, 300) }))) }];
    if (op.op === "close" && !immediate && CLOSURES.includes(op.as)) {
      const by = op.as === "superseded" && typeof op.by === "string" ? this.item(op.by) : null;
      if (op.as === "superseded" && (!by || by.id === old.id)) throw Error("superseded needs the memory that replaces it");
      return [stamp({ ...old, status: op.as, closedAt: at, closeReason: op.reason,
        ...(by ? { supersededBy: by.id, validUntil: iso(at) } : {}) }, mergeRefs(old.evidence, refs))];
    }
    // A new understanding that replaces an old one. The old one is not edited
    // into the new claim: it stays, closed, with the date it stopped holding.
    if (op.op === "supersede" && !immediate) {
      const next = stamp({ ...build(null), supersedes: old.id }, refs, null);
      const previous = { ...old, status: "superseded", supersededBy: next.id, validUntil: iso(at), closedAt: at, closeReason: op.reason,
        revision: old.revision + 1, lastCheckedAt: at, lastEvidenceAt: at };
      return [previous, next];
    }
    throw Error("unknown operation");
  },
  // Validate references and preserve every revision. This does not claim that
  // code can establish semantic truth: that is evaluated against raw evidence.
  // `idle`: the change comes from idle work, with no new word of the user's behind it. `direct`: the user asked for it themselves, through the assistant.
  apply(operations, events, { immediate = false, known = this.items({ closed: true }), idle = false, direct = false } = {}) {
    const revisions = new Map(known.map(i => [i.id, i.revision]));
    const report = { applied: [], rejected: [] };
    this.log.transaction(() => {
      for (const op of operations ?? []) {
        try {
          const receipt = `experience-op:${this.owner}:${digest(op)}`;
          if (this.log.state(receipt)) continue;
          const refs = op.evidence;
          const raw = this.evidence(refs, events);
          const at = Math.max(...raw.map(e => e.occurredAt ?? e.observedAt));
          const old = op.id && this.item(op.id);
          if (op.id && (!old || revisions.get(op.id) !== old.revision)) throw Error("unknown or concurrently revised item");
          if (old?.paused) throw Error("memory paused by user");
          if (old && at < old.lastEvidenceAt) throw Error("older evidence cannot replace a newer revision");
          if (op.op === "core") {
            this.applyCore(op, raw, refs, at, immediate);
            this.log.save(receipt, true);
            report.applied.push({ op: "core", field: op.field }); continue;
          }
          if (!op.reason) throw Error("missing reason");
          const written = this.applyItem(op, old, raw, refs, at, immediate, { idle, direct }), item = written.at(-1);
          for (const next of written) {
            if (JSON.stringify(next).length > 16000) throw Error("item too large; split independent understanding");
            this.write(next, op.reason); revisions.set(next.id, next.revision);
          }
          this.log.save(receipt, true);
          if (op.op === "supersede") this.link(item.id, old.id, "supersedes", { at });
          if (op.op === "close" && item.supersededBy) this.link(item.supersededBy, item.id, "supersedes", { at });
          // A disagreement the model noticed while writing is settled later,
          // with both sides' evidence in view, not on the spot.
          for (const other of Array.isArray(op.conflicts) ? op.conflicts : []) {
            if (typeof other !== "string" || other === item.id || !this.item(other)) continue;
            this.link(item.id, other, "contradicts", { state: "open", at });
            this.enqueue("reconcile", pairKey(item.id, other), 0.8, { reasons: ["They were marked as disagreeing when the newer one was written"] });
          }
          if (old) this.propagate(old.id, op.op === "put" ? "was revised" : op.op === "supersede" ? "was superseded" : op.op === "close" ? `was closed as ${op.as}` : "was put in doubt");
          if (op.op === "counter") this.enqueue("revise", item.id, 0.8, { reasons: [`Evidence against it: ${cut(op.reason, 200)}`] });
          report.applied.push({ op: op.op, id: item.id });
        } catch (e) { report.rejected.push({ op, reason: e.message }); }
      }
    });
    return report;
  },
  expire(now) {
    this.log.transaction(() => {
      for (const i of this.items()) if (i.kind === "concern" && i.closure.expiresAt && Date.parse(i.closure.expiresAt) <= now)
        this.write({ ...i, status: "expired", revision: i.revision + 1, closedAt: now, closeReason: `Defined ending reached: ${i.closure.expiresAt}` }, "expiry specified when the concern was created");
    });
  },
  // Deliberate search is not recall. It reaches everything that is kept,
  // including what is closed, superseded or hard to bring to mind.
  // What search returns goes back into the conversation as a tool result and
  // is recorded there. Whole memories and whole messages made each answer
  // tens of kilobytes; it gives what is needed to recognize a hit and its id,
  // and asteme_why gives the rest.
  search(query, only) {
    const found = this.searchAll(query, only);
    return {
      understanding: found.understanding.slice(0, 8).map(i => ({ id: i.id, kind: i.kind, level: i.level, status: i.status, text: cut(i.text, 400),
        ...(i.about ? { about: cut(i.about, 120) } : {}), ...(i.entities?.length ? { entities: i.entities.slice(0, 6) } : {}), revision: i.revision, learned: iso(i.learnedAt)?.slice(0, 10),
        evidence: (i.evidence ?? []).slice(-2).map(e => ({ id: e.id, quote: cut(e.quote, 200) })) })),
      sources: found.sources.slice(0, 8).map(e => ({ ...e, text: cut(e.text, 400) })),
    };
  },
  /**
   * Looking on purpose, by meaning and by words, through what is remembered and through the record itself. Words alone miss what was said in other
   * words (and across languages); meaning alone misses a name or a number. The rounds of the record come whole enough to answer from, with their day.
   */
  async seek(query, { here = null, limit = 8 } = {}) {
    // What looking by words finds is kept to the same walls as what looking by meaning finds. A memory kept to another project is not given, nor
    // the records it rests on; nor is a record of a project that keeps to itself, of a conversation the user keeps out of memory, or with the
    // shape of a secret.
    const fenced = new Set(this.items({ closed: true }).filter(i => { const home = this.confinedTo(i); return home && home !== here; }).flatMap(i => (i.evidence ?? []).map(e => e.id)));
    const open = e => !fenced.has(e.id) && !secret(e.content) && !this.quiet(e.sessionId, e.scope?.projectId) && !(e.scope?.projectId && e.scope.projectId !== here && this.walled(e.scope.projectId));
    const mine = i => { const home = this.confinedTo(i); return !home || home === here; };
    const words = this.search(query, { item: mine, event: open }), out = { understanding: [...words.understanding], rounds: [], sources: words.sources };
    if (!this.embed || typeof query !== "string" || !query.trim()) return out;
    try {
      const qm = await this.vectors([query], "query");
      if (!qm) return out;
      const qv = [...qm.values()], all = this.items({ closed: true }).filter(i => !i.paused && i.text && (() => { const home = this.confinedTo(i); return !home || home === here; })());
      const tm = all.length ? await this.vectors(all.map(i => i.text), "passage") : new Map();
      if (!tm) return out;
      const dot = (a, b) => { let d = 0, x = 0, y = 0; for (let k = 0; k < a.length; k++) { d += a[k] * b[k]; x += a[k] * a[k]; y += b[k] * b[k]; } return x && y ? d / Math.sqrt(x * y) : 0; };
      const near = all.map(i => ({ i, s: dot(qv[0], tm.get(i.text)) })).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.i);
      const had = new Set(out.understanding.map(u => u.id));
      out.understanding = [...near.filter(i => !had.has(i.id)).map(i => ({ id: i.id, kind: i.kind, level: i.level, status: i.status, text: cut(i.text, 400),
        ...(i.about ? { about: cut(i.about, 120) } : {}), ...(i.entities?.length ? { entities: i.entities.slice(0, 6) } : {}), revision: i.revision, learned: iso(i.learnedAt)?.slice(0, 10),
        evidence: (i.evidence ?? []).slice(-2).map(e => ({ id: e.id, quote: cut(e.quote, 200) })) })), ...out.understanding].slice(0, 2 * limit);
      out.rounds = this.recordNear(qv, { here, limit }).map(r => ({ id: r.id, on: iso(r.at)?.slice(0, 10), said: r.said, answered: r.replied || undefined, ...(r.sensitive ? { sensitive: true } : {}) }));
      // A record the rounds already carry is not given a second time, cut shorter.
      const carried = new Set(this.recordNear(qv, { here, limit }).flatMap(r => r.events));
      out.sources = out.sources.filter(e => !carried.has(e.id));
    } catch { /* the embedder is not there: what the words found stands */ }
    return out;
  },
  // `only`: what may be given at all ({ item, event }), asked before anything is ranked, so that what may not be given takes no place.
  searchAll(query, only) {
    const { item = null, event = null } = only ?? {};
    const keys = terms(query), rank = text => [...terms(text)].filter(k => keys.has(k)).length;
    return {
      understanding: this.items({ closed: true }).filter(i => !i.paused && (!item || item(i))).map(i => ({ i, score: rank([i.text, situation(i)].join(" ")) })).filter(x => x.score).sort((a, b) => b.score - a.score).slice(0, 12).map(x => x.i),
      sources: this.log.sessions(this.identity).flatMap(s => this.log.events(s.scope, s.sessionId)).filter(isEvidence).filter(e => !event || event(e)).map(e => ({ e, score: rank(e.content) })).filter(x => x.score).sort((a, b) => b.score - a.score).slice(0, 12).map(({ e }) => evidenceOf(e)),
    };
  },
};
