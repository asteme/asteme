// A complete copy out and back in, the diary, and the developer report.
//
// Nothing here decides what is worth keeping. The archive holds every table as
// it is, the conversation records included; importing adds what is missing and
// never removes or overwrites what is already there, except that a memory is
// replaced by a later revision of itself (its earlier revisions stay in its
// history). What the user has forgotten here stays forgotten: an import cannot
// bring it back.
import { readFileSync } from "node:fs";
import { iso, isRead, isMark } from "./mind.mjs";
import { cut } from "./log.mjs";
import { TUNING } from "./recall.mjs";
import { keptTrace } from "./attend.mjs";
import { JUDGE } from "./judge.mjs";
import { DIARY } from "./diary.locales.mjs";

// The version that wrote a report or an archive: the first thing anyone
// reading one needs to know.
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version; } catch { return null; } })();
export const ARCHIVE = { format: "asteme-archive", version: 1 };
/** A value that survives JSON unchanged: no undefined, no NaN. Tools and RPC return through this. */
export const plain = value => JSON.parse(JSON.stringify(value ?? null));

// Derived and private state is not carried: vectors are recomputed, and
// anything stored under secret: never leaves the machine.
const PRIVATE_STATE = /^(secret:|vector:|record-index:)/;
const quote = name => `"${String(name).replace(/"/g, '""')}"`;
const tablesOf = db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(c => c.name);

/** Every table of a database as { columns, rows }. Used for the archive and for reading a backup file. */
export function dumpTables(db, { vectors = false } = {}) {
  const tables = {};
  for (const name of tablesOf(db)) {
    // The index of the record is worked out again from the records wherever they are brought in.
    if (name === "passage" || (name === "vector" && !vectors)) continue;
    const columns = columnsOf(db, name);
    let rows = db.prepare(`SELECT * FROM ${quote(name)}`).all().map(r => columns.map(c => r[c] instanceof Uint8Array ? { $base64: Buffer.from(r[c]).toString("base64") } : r[c]));
    if (name === "state") rows = rows.filter(r => !PRIVATE_STATE.test(String(r[columns.indexOf("key")])));
    tables[name] = { columns, rows };
  }
  return tables;
}

const dayKey = (at, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const clock = (at, timeZone) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(at));
const oneLine = (text, n) => cut(String(text ?? "").replace(/\s+/g, " ").trim(), n) + (String(text ?? "").length > n ? "…" : "");
const block = text => String(text ?? "").trim().split("\n").map(l => `> ${l}`).join("\n");

export const archive = {
  /**
   * Cuts stored tool output down to its head, the same length new records are
   * stored at (plugin/calls.mjs). It is for stores written before that limit
   * existed. Tool results were most of what a store weighed, and only their
   * first few hundred characters are ever read into memory. A result that any memory or its history rests on is left
   * whole, as is everything the user or the assistant said. This is the one
   * place where a stored record is shortened, it happens only when the user
   * asks, and it cannot be undone.
   */
  slim({ olderThanDays = 0, keep = 2000 } = {}) {
    const db = this.log.db, before = this.log.now() - olderThanDays * 86400000, cited = new Set();
    for (const table of ["experience", "experience_history", "experience_feedback"])
      for (const row of db.prepare(`SELECT data FROM ${table}`).all())
        for (const m of row.data.matchAll(/"id":"([^"]{16,})"/g)) cited.add(m[1]);
    let rows = 0, bytes = 0;
    this.log.transaction(() => {
      const update = db.prepare("UPDATE events SET data=? WHERE id=?");
      this.log.rewrote();
      for (const row of db.prepare("SELECT id,data FROM events WHERE erased=0 AND length(data)>? AND json_extract(data,'$.role')='tool'").all(keep + 400)) {
        if (cited.has(row.id)) continue;
        const e = JSON.parse(row.data);
        if ((e.observedAt ?? e.occurredAt ?? 0) > before || typeof e.content !== "string" || e.content.length <= keep) continue;
        const cutOff = e.content.length - keep;
        e.content = `${e.content.slice(0, keep)} \u2026[${cutOff} more characters removed to save space]`;
        e.slimmed = true;
        const next = JSON.stringify(e);
        update.run(next, row.id); rows++; bytes += row.data.length - next.length;
      }
    });
    this.note("slim", { rows, bytes, olderThanDays });
    return { rows, bytes };
  },
  /**
   * Removes stored host events of kinds memory never reads (steps, jobs,
   * request headers) that hold no words. Nothing said or done is lost, and
   * a row anything kept refers to stays. Newer versions do not store them.
   */
  dropUnread() {
    const db = this.log.db, cited = new Set();
    for (const table of ["experience", "experience_history", "experience_feedback", "attention"])
      for (const row of db.prepare(`SELECT data FROM ${table}`).all())
        for (const m of row.data.matchAll(/"(?:id|request)":"([^"]{16,})"/g)) cited.add(m[1]);
    const kinds = db.prepare("SELECT DISTINCT json_extract(data,'$.kind') AS kind FROM events").all().map(r => r.kind).filter(k => !isRead(k));
    let rows = 0, bytes = 0;
    this.log.transaction(() => {
      const remove = db.prepare("DELETE FROM events WHERE id=?");
      this.log.rewrote();
      for (const kind of kinds)
        for (const row of db.prepare("SELECT id,length(data) AS size FROM events WHERE json_extract(data,'$.kind') IS ? AND coalesce(json_extract(data,'$.content'),'')=''").all(kind)) {
          if (cited.has(row.id)) continue;
          remove.run(row.id); rows++; bytes += row.size;
        }
    });
    if (rows) this.note("drop-unread", { rows, bytes, kinds: kinds.length });
    return { rows, bytes };
  },
  /**
   * Readings stored by versions before 0.12.2 carry a whole copy of every memory they considered, with its history (see keptTrace in attend.mjs). They
   * are brought to what is kept now, a few hundred at a time so that nothing waits on it; what a reading says about why a reply was given is unchanged.
   */
  keepTraces({ most = 400 } = {}) {
    const db = this.log.db, update = db.prepare("UPDATE attention SET data=? WHERE id=?");
    // Every reading is gone through once, in the order kept, not only those that copied memories: one whose every candidate was held back copied none,
    // and named no sources either. Where it got to is kept, so a later call starts there.
    const at = `traces-kept-at:${this.owner}`, from = Number(this.log.state(at, 0)) || 0;
    const rows = db.prepare(`SELECT rowid,id,data FROM attention WHERE owner=? AND rowid>? ORDER BY rowid LIMIT ?`).all(this.owner, from, most);
    // Which records each scene of a memory was learned from, as the store knows it now: what an old reading did not say about where its words came from.
    const learned = new Map();
    if (rows.length)
      for (const f of this.feedback()) {
        const scene = f.scene?.scene;
        if (!scene) continue;
        const key = `${f.item}\u0000${scene}`, ids = learned.get(key) ?? learned.set(key, []).get(key);
        for (const id of [f.request, ...(f.evidence ?? []).map(e => e.id)]) if (id && !ids.includes(id)) ids.push(id);
      }
    const sources = (item, scene) => (scene ? learned.get(`${item}\u0000${scene}`) ?? [] : []);
    let bytes = 0, done = 0;
    this.log.transaction(() => {
      for (const row of rows) {
        let trace; try { trace = JSON.parse(row.data); } catch { continue; }
        const next = JSON.stringify(keptTrace(trace, sources));
        if (next !== row.data) { update.run(next, row.id); bytes += Math.max(0, row.data.length - next.length); done++; }
      }
      if (rows.length) this.log.save(at, rows.at(-1).rowid);
    });
    if (done) this.note("keep-traces", { rows: done, bytes });
    return { rows: done, bytes, more: rows.length === most };
  },
  /** Everything, as one JSON-ready object. */
  exportArchive({ vectors = false } = {}) {
    const tables = dumpTables(this.log.db, { vectors });
    return { ...ARCHIVE, createdAt: iso(this.log.now()), owner: this.owner, embed: this.embed?.model ?? null,
      counts: Object.fromEntries(Object.entries(tables).map(([name, t]) => [name, t.rows.length])), tables };
  },
  /**
   * What a developer needs beside the report, and no more. It has the same
   * shape as the complete copy, so the same tools read it, but it is not one:
   * what the assistant wrote at length is cut to its beginning, what tools were
   * given and printed is left out (its size is kept), readings keep what they
   * decided and not copies of the memories they looked at, the receipts the
   * store keeps so as not to do a thing twice are counted and not listed, and
   * pictures are left out. A real store of three months gave fifty megabytes,
   * nine tenths of it copies, and code from tool calls that no diagnosis
   * reads. What the user said is kept whole, since it is what recall is judged
   * against. It is marked as reduced and cannot be brought back in as a copy.
   */
  exportEvidence({ toolChars = 0, replyChars = 600, readings = 300 } = {}) {
    const full = this.exportArchive(), tables = { ...full.tables };
    const shorten = (table, column, change) => { const t = tables[table]; if (!t) return; const at = t.columns.indexOf(column); if (at < 0) return; tables[table] = { ...t, rows: t.rows.map(r => { const next = change(r[at], r); return next === r[at] ? r : r.map((v, n) => n === at ? next : v); }) }; };
    const trimmed = (text, n) => typeof text === "string" && text.length > n ? `${text.slice(0, n)} …[${text.length - n} more characters left out of this reduced copy]` : text;
    for (const table of ["events", "received"]) shorten(table, "data", (raw) => { let e; try { e = JSON.parse(raw); } catch { return raw; }
      const tool = e.role === "tool" || String(e.kind ?? "").startsWith("tool/"), n = e.role === "user" ? Infinity : tool ? toolChars : replyChars;
      if (typeof e.content !== "string" || e.content.length <= n) return raw;
      if (tool && !n) { const { content, ...rest } = e; return JSON.stringify({ ...rest, content: "", contentChars: content.length, ...(e.metadata ? { metadata: { ...e.metadata, ...(e.metadata.tool ? { tool: { name: e.metadata.tool.name, callId: e.metadata.tool.callId } } : {}) } } : {}) }); }
      return JSON.stringify({ ...e, content: trimmed(e.content, n) }); });
    // Rows of what tools did that nothing remembered rests on are counted by conversation, not listed: they were four fifths of the rows, and what a
    // diagnosis reads of them is how many there were and how much they held. Rows something rests on stay. What a row repeats of its own columns (its id,
    // its conversation, whose it is) is not written twice, and whose it is is written once for all (`scopes`).
    const cited = new Set();
    for (const table of ["experience", "experience_history", "experience_feedback", "attention", "episode"]) { const t = tables[table], at = t?.columns.indexOf("data"); if (!t || at < 0) continue;
      for (const r of t.rows) for (const m of String(r[at]).matchAll(/"(?:id|request)":"([^"]{16,})"/g)) cited.add(m[1]); }
    const scopes = {}, scopeKey = (v) => { const k = Object.keys(scopes).find((x) => scopes[x] === v) ?? `s${Object.keys(scopes).length + 1}`; scopes[k] = v; return k; };
    const toolRows = { rows: 0, chars: 0, conversations: 0 }, toolSessions = new Set();
    { const t = tables.events; if (t) { const at = t.columns.indexOf("data"), id = t.columns.indexOf("id"), sc = t.columns.indexOf("scope");
      tables.events = { ...t, rows: t.rows.flatMap(r => { let e; try { e = JSON.parse(r[at]); } catch { return [r]; }
        if (String(e.kind ?? "").startsWith("tool/") && !cited.has(r[id])) { toolRows.rows++; toolRows.chars += e.contentChars ?? (e.content ?? "").length; toolSessions.add(e.sessionId); return []; }
        const { id: _id, sessionId: _s, scope: _scope, ...rest } = e;
        return [r.map((v, n) => n === at ? JSON.stringify(rest) : n === sc ? scopeKey(v) : v)]; }) }; } }
    toolRows.conversations = toolSessions.size;
    // Readings: what was decided and how each memory was found, not copies of the memories; the newest few hundred of them (the report itself is worked
    // out from all of them, and says how many were left out here).
    shorten("attention", "data", (raw) => { try { const t = JSON.parse(raw), k = keptTrace(t); return k === t ? raw : JSON.stringify(k); } catch { return raw; } });
    let olderReadings = 0;
    if (tables.attention && tables.attention.rows.length > readings) { olderReadings = tables.attention.rows.length - readings; tables.attention = { ...tables.attention, rows: tables.attention.rows.slice(-readings) }; }
    // Receipts: one row per tool call, per operation applied, per message shown, per pair judged. Counted by kind.
    const receipts = {};
    if (tables.state) { const key = tables.state.columns.indexOf("key");
      tables.state = { ...tables.state, rows: tables.state.rows.filter(r => { const kind = /^(outcome|experience-op|shown|judged|outcome-check):/.exec(r[key])?.[1]; if (!kind) return true; receipts[kind] = (receipts[kind] ?? 0) + 1; return false; }) }; }
    // Rows that only mark that a tool ran, with nothing of what it did: counted and left out.
    let marks = 0;
    for (const table of ["events"]) { const t = tables[table], at = t?.columns.indexOf("data"); if (!t || at < 0) continue;
      tables[table] = { ...t, rows: t.rows.filter(r => { try { const e = JSON.parse(r[at]); if (String(e.kind ?? "").startsWith("tool/") && !e.content && !e.contentChars) { marks++; return false; } } catch { /* kept as it is */ } return true; }) }; }
    // Pictures (faces, the wall) say nothing about how memory behaves.
    if (tables.state) { const key = tables.state.columns.indexOf("key"), data = tables.state.columns.indexOf("data");
      tables.state = { ...tables.state, rows: tables.state.rows.map(r => /^brain:(face|yourFace)$/.test(r[key]) ? r.map((v, n) => n === data ? JSON.stringify("(a picture, left out)") : v)
        : r[key] === "brain:look" ? r.map((v, n) => { if (n !== data) return v; try { const look = JSON.parse(v); return JSON.stringify(look?.wall ? { ...look, wall: "(a picture, left out)" } : look); } catch { return v; } }) : r) }; }
    return { ...full, reduced: true, scopes, leftOut: { emptyToolRows: marks, toolContent: "sizes only", toolRows, olderReadings, receipts, eventRowsRepeat: "id, sessionId and scope are the row's own columns; scope is a key of scopes" }, counts: Object.fromEntries(Object.entries(tables).map(([name, t]) => [name, t.rows.length])), tables };
  },
  /**
   * Adds what an archive (or the tables of a backup file) holds and this store
   * does not. Returns what was added per table. Safe to run twice.
   */
  importArchive(source) {
    const tables = source?.tables;
    if (!tables || typeof tables !== "object" || (source.format && source.format !== ARCHIVE.format)) throw Error("This is not an ASTEME archive");
    if (source.version > ARCHIVE.version) throw Error("This archive was written by a newer version");
    if (source.reduced) throw Error("This is the reduced copy that goes with a report, not a complete copy: parts of it were left out, so it cannot be brought back in");
    const db = this.log.db, added = {}, local = new Set(tablesOf(db));
    this.log.rewrote();
    const rowsOf = name => {
      const t = tables[name];
      if (!t || !local.has(name)) return null;
      const mine = columnsOf(db, name), keep = t.columns.map((c, n) => mine.includes(c) ? n : -1).filter(n => n >= 0);
      const value = v => v && typeof v === "object" && typeof v.$base64 === "string" ? Buffer.from(v.$base64, "base64") : v;
      return { columns: keep.map(n => t.columns[n]), rows: t.rows.map(r => keep.map(n => value(r[n]))) };
    };
    const insert = (name, t, { skip = () => false, without = [] } = {}) => {
      const use = t.columns.map((c, n) => without.includes(c) ? -1 : n).filter(n => n >= 0);
      const statement = db.prepare(`INSERT OR IGNORE INTO ${quote(name)} (${use.map(n => quote(t.columns[n])).join(",")}) VALUES (${use.map(() => "?").join(",")})`);
      let count = 0;
      for (const row of t.rows) if (!skip(row)) count += Number(statement.run(...use.map(n => row[n])).changes);
      added[name] = count;
    };
    const result = this.log.transaction(() => {
      // What was forgotten anywhere is forgotten here too, and is applied
      // before any record is read in.
      const forgottenRows = rowsOf("forgotten");
      if (forgottenRows) insert("forgotten", forgottenRows);
      const forgotten = new Set(db.prepare("SELECT id FROM forgotten").all().map(r => r.id));
      for (const name of Object.keys(tables)) {
        const t = rowsOf(name);
        if (!t || name === "forgotten" || name === "vector" || name === "passage") continue;
        const col = c => t.columns.indexOf(c);
        if (name === "events") insert(name, t, { skip: r => forgotten.has(r[col("id")]) });
        else if (name === "experience") {
          let count = 0;
          const get = db.prepare("SELECT data FROM experience WHERE id=?"), put = db.prepare("INSERT INTO experience VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,data=excluded.data");
          for (const r of t.rows) {
            const old = get.get(r[col("id")]), incoming = JSON.parse(r[col("data")]);
            if (old && (JSON.parse(old.data).revision ?? 0) >= (incoming.revision ?? 0)) continue;
            put.run(r[col("id")], r[col("owner")], r[col("data")]); count++;
          }
          added[name] = count;
        } else if (name === "experience_history" || name === "journal") {
          // These are numbered locally, so the same row is recognized by its content.
          const key = name === "journal" ? ["at", "kind", "data"] : ["owner", "id", "data"];
          const seen = new Set(db.prepare(`SELECT ${key.join(",")} FROM ${name}`).all().map(r => key.map(k => r[k]).join("\u0000")));
          insert(name, t, { without: ["seq"], skip: r => seen.has(key.map(k => r[col(k)]).join("\u0000")) });
        } else if (name === "state" || name === "cursors") {
          // Settings already here win. Counters and cursors only move forward.
          const [k, v] = name === "state" ? ["key", "data"] : [null, "next_seq"];
          let count = 0;
          for (const r of t.rows) {
            if (name === "state") {
              if (PRIVATE_STATE.test(String(r[col(k)]))) continue;
              const old = db.prepare("SELECT data FROM state WHERE key=?").get(r[col(k)]);
              if (!old) { db.prepare("INSERT INTO state VALUES (?,?)").run(r[col(k)], r[col(v)]); count++; continue; }
              const a = Number(old.data), b = Number(r[col(v)]);
              if (Number.isFinite(a) && Number.isFinite(b) && b > a && /^\d+(\.\d+)?$/.test(String(r[col(v)]).trim())) { db.prepare("UPDATE state SET data=? WHERE key=?").run(r[col(v)], r[col(k)]); count++; }
            } else {
              const old = db.prepare("SELECT next_seq FROM cursors WHERE scope=? AND session_id=?").get(r[col("scope")], r[col("session_id")]);
              if (!old) { db.prepare("INSERT INTO cursors VALUES (?,?,?)").run(r[col("scope")], r[col("session_id")], r[col(v)]); count++; }
              else if (r[col(v)] > old.next_seq) { db.prepare("UPDATE cursors SET next_seq=? WHERE scope=? AND session_id=?").run(r[col(v)], r[col("scope")], r[col("session_id")]); count++; }
            }
          }
          added[name] = count;
        } else insert(name, t);
      }
      const total = Object.values(added).reduce((n, x) => n + x, 0);
      this.note("import", { from: source.createdAt ?? null, added });
      return { added, total, from: source.createdAt ?? null, unknown: Object.keys(tables).filter(n => !local.has(n)) };
    });
    // Whatever arrived that rests on a forgotten record is removed again by
    // the same path that forgetting itself takes.
    const forgotten = this.log.db.prepare("SELECT id FROM forgotten").all().map(r => r.id);
    if (result.total && forgotten.length) this.log.erase(forgotten);
    // An older archive still carries host events no version reads.
    if (result.total) this.dropUnread();
    return result;
  },

  /**
   * The record as something to read: one Markdown file per month, day by day,
   * and one file with everything it knows now. Built from stored records only.
   */
  diary({ locale = "en", timeZone } = {}) {
    const L = DIARY[String(locale).toLowerCase().split("-")[0]] ?? DIARY.en, lang = DIARY[String(locale).toLowerCase().split("-")[0]] ? locale : "en";
    const days = new Map();
    const day = at => { const key = dayKey(at, timeZone); if (!days.has(key)) days.set(key, { at, talk: new Map(), took: [], recalled: [], went: [], stood: [] }); return days.get(key); };
    const items = new Map(this.items({ closed: true }).map(i => [i.id, i]));
    const textOf = id => items.get(id)?.text ?? null;
    for (const s of this.log.sessions(this.identity)) {
      for (const e of this.log.events(s.scope, s.sessionId)) {
        if (e.erased || !["user", "assistant", "tool"].includes(e.role)) continue;
        const at = e.occurredAt ?? e.observedAt, d = day(at);
        if (!d.talk.has(s.sessionId)) d.talk.set(s.sessionId, []);
        d.talk.get(s.sessionId).push({ at, role: e.role, text: e.content });
      }
    }
    const first = new Set();
    for (const row of this.log.db.prepare("SELECT id,data FROM experience_history WHERE owner=? ORDER BY seq").all(this.owner)) {
      const h = JSON.parse(row.data), fresh = !first.has(row.id);
      first.add(row.id);
      // Rows that record a change of weight, not of content, are not diary material.
      // Nor are rows an earlier version wrote for its own bookkeeping.
      if (!items.has(row.id) || !h.item?.text || /^Screened as /.test(h.reason ?? "")) continue;
      day(h.at).took.push({ at: h.at, fresh, text: h.item.text, reason: L.reason[h.reason] ?? h.reason, closed: !["active", "doubtful"].includes(h.item.status) });
    }
    for (const row of this.log.db.prepare("SELECT data FROM attention WHERE owner=? ORDER BY rowid").all(this.owner)) {
      const t = JSON.parse(row.data);
      if (!t.delivered?.length) continue;
      const asked = this.log.event(t.request);
      if (!asked || asked.erased) continue;
      day(t.at).recalled.push({ at: t.at, asked: asked.content, items: t.delivered.map(i => ({ text: i.text, use: i.use })) });
    }
    for (const f of this.feedback()) if (textOf(f.item)) day(f.at).went.push({ at: f.at, kind: f.kind, text: textOf(f.item), reason: f.reason, by: f.by });
    for (const e of this.episodes()) if (e.signals?.length && e.scene) day(e.at).stood.push({ at: e.at, scene: e.scene, signals: e.signals.map(s => s.kind) });

    const months = new Map();
    for (const [key, d] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
      const month = key.slice(0, 7), out = months.get(month) ?? [];
      months.set(month, out);
      out.push(`## ${new Intl.DateTimeFormat(lang, { timeZone, dateStyle: "full" }).format(new Date(d.at))}`, "");
      // A diary is what was said. Tool runs, and the wordless records between
      // them (an assistant turn that only called a tool, a conversation that
      // was not to be remembered), stay in the store and are not written here.
      for (const messages of d.talk.values()) {
        const said = messages.filter(m => m.role !== "tool" && typeof m.text === "string" && m.text.trim()).sort((a, b) => a.at - b.at);
        if (!said.length) continue;
        for (const m of said) out.push(`**${m.role === "user" ? L.you : L.assistant}** · ${clock(m.at, timeZone)}`, "", block(m.role === "user" ? m.text : oneLine(m.text, 1500)), "");
        out.push("---", "");
      }
      const section = (title, lines) => { if (lines.length) out.push(`### ${title}`, "", ...lines, ""); };
      section(L.took, d.took.map(t => `- ${t.closed ? L.setAside : t.fresh ? L.remembered : L.changed}: ${oneLine(t.text, 300)}${t.reason ? ` (${oneLine(t.reason, 200)})` : ""}`));
      section(L.recalled, d.recalled.map(r => `- ${L.forMessage.replace("{message}", oneLine(r.asked, 80))}\n${r.items.map(i => `  - ${oneLine(i.text, 300)} (${L.use[i.use] ?? i.use})`).join("\n")}`));
      section(L.went, d.went.map(w => `- ${L.outcome[w.kind] ?? w.kind}: ${oneLine(w.text, 200)}${w.by === "user" ? ` (${L.youSaid})` : ""}${w.reason && w.by !== "user" ? ` (${oneLine(w.reason, 200)})` : ""}`));
      section(L.stood, d.stood.map(s => `- ${oneLine(s.scene, 200)} (${s.signals.map(k => L.signal[k] ?? k).join(", ")})`));
    }
    const files = [...months].map(([month, lines]) => ({ name: `${month}.md`,
      text: [`# ${L.title} · ${new Intl.DateTimeFormat(lang, { timeZone, year: "numeric", month: "long" }).format(new Date(`${month}-15T12:00:00Z`))}`, "", ...lines].join("\n") }));
    const now = this.items().filter(i => !i.paused), closed = this.items({ closed: true }).filter(i => !["active", "doubtful"].includes(i.status));
    const group = (title, list) => list.length ? [`## ${title}`, "", ...list.map(i => `- ${oneLine(i.text, 400)}${i.evidence?.at(-1)?.quote ? `\n  > ${oneLine(i.evidence.at(-1).quote, 200)}` : ""}`), ""] : [];
    const core = this.core();
    files.push({ name: "memories.md", text: [`# ${L.title} · ${L.knows}`, "", `*${iso(this.log.now())}*`, "",
      ...(core.habits?.length ? [`## ${L.always}`, "", ...core.habits.filter(h => h.text).map(h => `- ${oneLine(h.text, 300)}`), ""] : []),
      ...group(L.lessons, now.filter(i => i.kind === "understanding" && i.level === "lesson")),
      ...group(L.noted, now.filter(i => i.kind === "understanding" && i.level !== "lesson")),
      ...group(L.open, now.filter(i => i.kind === "concern")),
      ...group(L.past, closed)].join("\n") });
    return files;
  },

  /**
   * What a developer needs to see where it goes wrong: counts, failures and
   * timings, derived by code from the stored records. `extra` is whatever the
   * host wants printed with it (its configuration, without secrets).
   */
  /** How often a judge answering beside the model agreed with it on whether to use a memory. */
  shadowAgreement() {
    let agree = 0, compared = 0;
    for (const row of this.log.db.prepare("SELECT data FROM attention WHERE owner=? AND json_extract(data,'$.shadow') IS NOT NULL").all(this.owner)) {
      const t = JSON.parse(row.data);
      // What is compared is the result: would the same memory have reached the
      // reply. A candidate the model gave no answer for did not reach it.
      for (const s of t.shadow?.decisions ?? []) {
        const m = (t.decisions ?? []).find(x => x.id === s.id);
        compared++; if ((!!m && m.use !== "not-now" && !m.dropped) === (s.use !== "not-now")) agree++;
      }
    }
    return { compared, agree };
  },
  /**
   * What the host has told memory, counted: which kinds of event are stored,
   * how turns ended, which agent presets sessions were composed from, and the
   * shape of the marks whose payload is not known in advance. Shapes are
   * key names and value types only.
   */
  fromHost() {
    const db = this.log.db, tally = (n, k) => { n[k] = (n[k] ?? 0) + 1; return n; };
    const kinds = Object.fromEntries(db.prepare("SELECT json_extract(data,'$.kind') AS kind, COUNT(*) AS n FROM events GROUP BY 1 ORDER BY 2 DESC").all().map(r => [r.kind ?? "unknown", r.n]));
    const endings = {}, marks = {};
    for (const row of db.prepare("SELECT data FROM events WHERE erased=0 AND json_extract(data,'$.kind')='turn/end'").all()) {
      const ended = JSON.parse(row.data).metadata?.ended;
      tally(endings, ended ? [ended.kind, ended.by].filter(Boolean).join(" by ") : "not recorded");
    }
    for (const kind of Object.keys(kinds).filter(isMark)) for (const row of db.prepare("SELECT data FROM events WHERE erased=0 AND json_extract(data,'$.kind')=?").all(kind)) {
      const e = JSON.parse(row.data), mark = marks[e.kind] ??= { count: 0, shapes: {} };
      mark.count++;
      let value = null; try { value = JSON.parse(e.content || "null"); } catch {}
      const shape = value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value).sort().map(k => `${k}:${Array.isArray(value[k]) ? "array" : value[k] === null ? "null" : typeof value[k]}`).join(", ") : e.content ? typeof value : "empty";
      tally(mark.shapes, shape || "empty");
    }
    const presets = {};
    for (const row of db.prepare("SELECT data FROM state WHERE key LIKE 'session:%'").all()) {
      let header = null; try { header = JSON.parse(row.data); } catch {}
      if (header && typeof header === "object") tally(presets, typeof header.agentPreset === "string" ? header.agentPreset : "none");
    }
    const refusals = {};
    for (const j of this.journal({ limit: 2000 })) if (j.kind === "call" && !j.ok && (j.code || j.status)) tally(refusals, [j.code, j.status].filter(Boolean).join(" "));
    // The way of speaking the user set for now: which sessions had it in their
    // prompt when they last assembled one, and which did not (last state of each).
    const spoke = new Map();
    for (const j of this.journal({ kind: "manner", limit: 2000 }).reverse()) if (typeof j.session === "string") spoke.set(j.session, j.on === true);
    const manner = { set: !!this.log.state("brain:manner", null)?.text, sessionsWith: [...spoke].filter(([, on]) => on).map(([id]) => id).slice(-12), sessionsWithout: [...spoke.values()].filter(on => !on).length };
    return { kinds, endings, marks, presets, refusals, manner };
  },
  /**
   * What in a report deserves a second look, said in words. Each line is
   * read off the numbers, so it can be checked against them; the list is a
   * pointer for whoever reads the report, not a judgement of the memory.
   */
  concerns(data) {
    const out = [], p = data.preparation, h = data.health ?? {}, add = (code, text) => out.push({ code, text });
    if (data.selfcheck?.error) add("check-failed", `the model check could not run: ${oneLine(data.selfcheck.error, 160)}`);
    else if (data.selfcheck && data.selfcheck.total && data.selfcheck.passed < data.selfcheck.total)
      add("check-low", `the model check passed ${data.selfcheck.passed} of ${data.selfcheck.total} with ${data.selfcheck.model ?? "the current model"}`);
    const waited = ["asteme-read", "asteme-scene", "asteme-select"].map(k => [k, h.purposes?.[k]]).filter(([, v]) => v?.calls);
    const slow = waited.filter(([, v]) => v.median >= 8000);
    if (slow.length) add("slow-before-reply", `the reply waits on memory: ${slow.map(([k, v]) => `${k} takes ${Math.round(v.median / 100) / 10} s (median of ${v.calls})`).join(", ")}`);
    if ((h.failed ?? 0) + (h.timeouts ?? 0) > 0) add("calls-failing", `${h.failed} of ${h.calls} model calls failed in the last day (${h.timeouts} timed out, ${h.cut} cut short for good)`);
    // Cut off and asked again with more room: the work went on, at the price of a second call.
    const again = Object.entries(h.purposes ?? {}).filter(([, v]) => v.again);
    if ((data.preparation?.crowded ?? 0) > 0) add("candidates-crowded", `in ${data.preparation.crowded} readings more memories were called than one reading has room for; the rest were left out by rank`);
    // Told by the host, from its own process. The embedding model's libraries belong in the embedding process; here they collide with the host's.
    if (data.native?.onnxruntime?.length) add("native-in-host", `the inference runtime is loaded in the host's own process (${data.native.onnxruntime.slice(0, 2).join(", ")}); it stays until the host is restarted`);
    if ((data.native?.copiesOfSharp ?? 0) > 1) add("two-image-libraries", `two copies of the image library are loaded in the host's own process (${data.native.sharp.slice(0, 4).join(", ")}); the host's picture reading can fail until it is restarted`);
    if (again.length) add("calls-asked-again", `answers cut off at the length limit and asked for again with more room: ${again.map(([k, v]) => `${k} ${v.again}`).join(", ")}`);
    if (Object.keys(data.host?.refusals ?? {}).length) add("provider-refusing", `the provider refused calls: ${JSON.stringify(data.host.refusals)}`);
    if ((data.reflection?.unread ?? 0) > 10) add("backlog", `${data.reflection.unread} exchanges are waiting to be read into memory`);
    if (data.reflection?.failing?.length) add("unreadable", `${data.reflection.failing.length} exchanges keep failing to be read into memory`);
    if (p.failed) add("readings-failed", `${p.failed} of ${p.readings} readings before a reply failed`);
    if (p.undecided || p.unanswered) add("undecided", `the model left candidates undecided in ${p.undecided + p.unanswered} of ${p.withCandidates} readings that had any`);
    if (p.readings >= 10 && p.withCandidates === 0 && data.memory.total > 0) add("nothing-recalled", `${data.memory.total} memories, and none was a candidate in ${p.readings} readings`);
    if (data.judge && !p.shadow && p.withCandidates > 0) add("judge-silent", "a judge is set, and no reading with candidates has its answers beside the model's");
    if (data.outcomes.deliveries > 0 && data.outcomes.assessed === 0 && !data.outcomes.waiting?.length) add("no-outcomes", `${data.outcomes.deliveries} deliveries and no outcome read for any`);
    return out;
  },
  report(now = this.log.now(), extra = {}) {
    const d = this.diagnose(now), traces = this.log.db.prepare("SELECT data FROM attention WHERE owner=? ORDER BY rowid").all(this.owner).map(r => JSON.parse(r.data));
    // A conversation that is not remembered leaves a row saying so and nothing was read: it is counted apart.
    const scenes = traces.filter(t => "candidates" in t && !t.private), perRequest = new Map(), unread = new Set(traces.filter(t => t.private).map(t => t.request)).size;
    for (const t of scenes) perRequest.set(t.request, (perRequest.get(t.request) ?? 0) + 1);
    const counts = [...perRequest.values()], errors = {};
    // With when it last happened: an error from a week ago and one from this morning are different news.
    const errorsLast = {};
    for (const t of traces) for (const text of [t.error, t.recallError, t.sceneError].filter(Boolean)) { const k = oneLine(text, 80); errors[k] = (errors[k] ?? 0) + 1; errorsLast[k] = iso(Math.max(Date.parse(errorsLast[k] ?? 0) || 0, Number(t.at) || 0)); }
    let agree = 0, compared = 0;
    for (const t of scenes) for (const s of t.shadow?.decisions ?? []) {
      const m = t.decisions.find(x => x.id === s.id);
      if (!m) continue;
      compared++; if ((m.use !== "not-now" && !m.dropped) === (s.use !== "not-now")) agree++;
    }
    const items = this.items({ closed: true }), tally = list => list.reduce((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {});
    const data = {
      at: iso(now), version: VERSION, storeFormat: this.log.db.prepare("PRAGMA user_version").get().user_version, embed: this.embed?.model ?? null, ...extra,
      preparation: {
        crowded: scenes.filter(t => t.crowded > 0).length, notRemembered: unread,
        // Calling memories to mind, without the model: the part that grows with how many there are.
        recallMs: (() => { const ms = scenes.map(t => t.recallMs).filter(Number.isFinite).sort((a, b) => a - b); return ms.length ? { median: ms[Math.floor(ms.length / 2)], most: ms.at(-1), of: ms.length } : null; })(),
        readings: scenes.length, messages: perRequest.size, most: counts.length ? Math.max(...counts) : 0,
        repeated: counts.filter(n => n > 1).length, failed: scenes.filter(t => t.error).length,
        withCandidates: scenes.filter(t => t.candidates?.length).length, delivered: scenes.filter(t => t.delivered?.length).length,
        unanswered: scenes.filter(t => !t.error && t.candidates?.length && !t.decisions?.length).length,
        askedTwice: scenes.filter(t => t.askedTwice).length, undecided: scenes.filter(t => t.undecided?.length).length,
        sceneFromMessage: scenes.filter(t => t.scene?.from === "message").length, byJudge: scenes.filter(t => t.admittedBy === "judge").length,
        shadow: compared ? { compared, agree, rate: Number((agree / compared).toFixed(3)) } : null,
      },
      // Whether the reply applied what was delivered, as the outcome reading judged it.
      applied: tally(this.feedback().map(f => f.applied ?? "not judged")),
      changes: tally(this.log.db.prepare("SELECT data FROM experience_history WHERE owner=?").all(this.owner).map(r => { const h = JSON.parse(r.data); return h.action ?? (h.dynamics ? "strength adjusted" : h.patch || h.before ? "core changed" : "unlabelled"); })),
      selfcheck: this.log.state("selfcheck", null),
      errors, errorsLast, reflection: d.reflection, outcomes: d.outcomes, sleep: d.sleep, health: d.health,
      memory: { total: items.length, byKind: tally(items.map(i => `${i.kind}/${i.level ?? "case"}`)), byStatus: tally(items.map(i => i.paused ? "paused" : i.status)) },
      events: this.log.db.prepare("SELECT COUNT(*) AS n FROM events").get().n,
      host: this.fromHost(),
      // Failures by what failed and how, newest first: thirty rows that said the same thing three ways were mostly noise.
      failures: (() => { const groups = new Map();
        for (const j of this.journal({ limit: 3000 })) { if (j.kind !== "call" || j.ok) continue; const key = `${j.purpose}|${j.again ? "asked again" : "gave up"}|${oneLine(j.error, 80)}`;
          const g = groups.get(key) ?? groups.set(key, { purpose: j.purpose, error: oneLine(j.error, 80), outcome: j.again ? "asked again" : "gave up", n: 0, last: iso(j.at), first: iso(j.at), ms: [], tokens: 0, ...(j.code ? { code: j.code } : {}), ...(j.status ? { status: j.status } : {}) }).get(key);
          g.n++; g.first = iso(j.at); if (Number.isFinite(j.ms)) g.ms.push(j.ms); g.tokens = Math.max(g.tokens, j.tokens ?? 0); }
        return [...groups.values()].map(g => ({ ...g, ms: g.ms.length ? g.ms.sort((a, b) => a - b)[Math.floor(g.ms.length / 2)] : null })).slice(0, 20); })(),
      // How large the calls were, by purpose: what was sent and what came back, in tokens as the provider counted them.
      sizes: (() => { const by = {}; for (const j of this.journal({ since: now - 86400000, kind: "call", limit: 5000 })) { if (!Number.isFinite(j.in)) continue; const p = by[j.purpose] ??= { in: [], out: [] }; p.in.push(j.in); if (Number.isFinite(j.out)) p.out.push(j.out); }
        const mid = l => l.length ? l.sort((a, b) => a - b)[Math.floor(l.length / 2)] : null; return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { in: mid(v.in), inMost: Math.max(...v.in), out: mid(v.out), outMost: v.out.length ? Math.max(...v.out) : null }])); })(),
      store: (() => { const db = this.log.db, one = q => { try { return db.prepare(q).get().n; } catch { return null; } };
        return { bytes: one("SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()"), vectors: one("SELECT COUNT(*) AS n FROM vector"), episodes: one("SELECT COUNT(*) AS n FROM episode"), journal: one("SELECT COUNT(*) AS n FROM journal"), history: one("SELECT COUNT(*) AS n FROM experience_history") }; })(),
      // The conversation with Asteme itself, when it has been used: work handed over and how it ended.
      talk: (() => { const tasks = this.log.state("brain:tasks", null), work = this.journal({ kind: "work", limit: 500 }); if (!tasks && !work.length) return null;
        const ms = work.map(w => w.ms).filter(Number.isFinite).sort((a, b) => a - b), wake = this.log.state("brain:wake", null);
        return { tasks: tally((tasks ?? []).map(t => t.state)), work: { rounds: work.length, byState: tally(work.map(w => w.state)), medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null, lastError: work.find(w => w.error)?.error ?? null },
          intentions: (wake?.alarms ?? []).length, manner: !!this.log.state("brain:manner", null)?.text, modelChosen: !!this.log.state("brain:model", null), hands: new Set(work.map(w => w.session).filter(Boolean)).size }; })(),
    };
    data.concerns = this.concerns(data);
    const p = data.preparation, row = cells => `| ${cells.join(" | ")} |`;
    const markdown = [
      "# ASTEME developer report", "",
      `Asteme ${data.version ?? "unknown version"}${data.hostVersion ? ` in ${data.hostVersion}` : ""}, written ${data.at}. Store format ${data.storeFormat}. Embedding model: ${data.embed ?? "none"}.`, "",
      "## Worth a look", "",
      ...(data.concerns.length ? data.concerns.map(c => `- ${c.text}`) : ["- nothing stands out in the numbers below"]), "",
      "## Before the reply", "",
      `- ${p.readings} readings for ${p.messages} messages (most for one message: ${p.most}; messages read more than once: ${p.repeated})`,
      `- conversations not remembered (nothing read; set aside by the user, or a session one agent opened for another, which is never read as the user's words): ${p.notRemembered} message(s)`,
      `- failed: ${p.failed}; had candidates: ${p.withCandidates}; delivered something: ${p.delivered}`,
      `- candidates but no decision at all: ${p.unanswered}; asked twice: ${p.askedTwice}; left some candidate unanswered: ${p.undecided}`,
      `- scene taken from the message because the model failed: ${p.sceneFromMessage}; admitted by the judge: ${p.byJudge}`,
      p.shadow ? `- judge beside the model: agreed on ${p.shadow.agree} of ${p.shadow.compared} decisions (${Math.round(p.shadow.rate * 100)}%)` : "- judge beside the model: no comparison recorded",
      "", "## Model calls, last 24 hours", "", row(["purpose", "calls", "failed", "timed out", "cut short", "asked again", "median ms", "slow (95%) ms"]), row(Array(8).fill("---")),
      ...Object.entries(data.health.purposes).map(([name, h]) => row([name, h.calls, h.failed, h.timeouts, h.cut, h.again ?? 0, h.median ?? "", h.slow ?? ""])),
      "", "## Errors recorded with readings", "", "These are from the whole life of the store, not the last day; the date says when each last happened. One that has not happened since an update that fixed it is history.", "", ...(Object.keys(errors).length ? Object.entries(errors).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${n} × ${k} (last ${errorsLast[k]})`) : ["- none"]),
      "", "## After the reply", "",
      `- turns not read into memory yet: ${d.reflection.unread}${d.reflection.failing.length ? `; last failure: ${oneLine(d.reflection.failing[0].error, 120)}` : ""}`,
      `- deliveries: ${d.outcomes.deliveries} (assessed ${d.outcomes.assessed}, waiting ${d.outcomes.waiting.length})`,
      // The two counts are of different things, and read as a contradiction when put side by side.
      `- outcomes recorded, one for each memory: ${Object.keys(d.outcomes.recorded).length ? JSON.stringify(d.outcomes.recorded) : "none"}. "missed" is a memory that was not passed and should have been, so it belongs to no delivery and these need not add up to the deliveries assessed`,
      ...d.outcomes.waiting.slice(0, 8).map(w => `  - ${iso(w.at)}: ${w.because}`),
      `- sleep: last ${d.sleep.last ? iso(d.sleep.last) : "never"}, queued ${Object.keys(d.sleep.queued ?? {}).length ? JSON.stringify(d.sleep.queued) : "none"}, failed jobs ${d.sleep.failed}, episodes ${d.sleep.episodes} (stood out: ${d.sleep.standingOut})`,
      ...d.sleep.idleBecause.map(r => `  - idle: ${r}`),
      "", "## Memory", "", `- ${data.memory.total} items: ${JSON.stringify(data.memory.byKind)}; ${JSON.stringify(data.memory.byStatus)}`, `- ${data.events} conversation records`,
      `- changes to memories: ${JSON.stringify(data.changes)}`,
      `- did the reply apply what was delivered: ${JSON.stringify(data.applied)}`,
      "", "## From the host", "",
      `- records by kind: ${JSON.stringify(data.host.kinds)}`,
      `- how turns ended: ${JSON.stringify(data.host.endings)}`,
      `- agent presets of sessions: ${JSON.stringify(data.host.presets)}`,
      `- way of speaking for now: ${data.host.manner?.set ? "set" : "not set"}; in the prompt of ${data.host.manner?.sessionsWith.length ?? 0} session(s)${data.host.manner?.sessionsWith.length ? ` (${data.host.manner.sessionsWith.join(", ")})` : ""}, not in ${data.host.manner?.sessionsWithout ?? 0}`,
      ...(Object.keys(data.host.marks).length ? Object.entries(data.host.marks).map(([kind, m]) => `- ${kind}: ${m.count}, shaped ${JSON.stringify(m.shapes)}`) : ["- feedback, approval and preset events: none received"]),
      `- provider refusals by code: ${JSON.stringify(data.host.refusals)}`,
      "", "## Failures, grouped", "", ...(data.failures.length ? [row(["purpose", "how it ended", "times", "last", "median ms", "tokens allowed", "error"]), row(Array(7).fill("---")),
        ...data.failures.map(f => row([f.purpose, f.outcome, f.n, f.last, f.ms ?? "", f.tokens || "", f.error]))] : ["- none"]),
      "", "## Where it runs, and how large it is", "",
      ...(data.env ? [`- ${Object.entries(data.env).map(([k, v]) => `${k} ${v}`).join("; ")}`] : []),
      `- store: ${data.store.bytes == null ? "size unknown" : `${Math.round(data.store.bytes / 1048576 * 10) / 10} MB`}; vectors ${data.store.vectors}; episodes ${data.store.episodes}; journal rows ${data.store.journal}; history rows ${data.store.history}`,
      ...(data.embedding ? [`- embedding process: started ${data.embedding.starts} time(s), last start ${data.embedding.lastStartMs ?? "?"} ms, calls ${data.embedding.calls}, failures ${data.embedding.failures}${data.embedding.lastError ? ` (last: ${oneLine(data.embedding.lastError, 100)})` : ""}, ${data.embedding.running ? "running" : "not running"}`] : []),
      !p.recallMs ? "- calling memories to mind: not timed yet"
        : p.recallMs.of < 3 ? `- calling memories to mind (without the model): at most ${p.recallMs.most} ms in ${p.recallMs.of} reading(s); too few for a median`
        : `- calling memories to mind (without the model): median ${p.recallMs.median} ms, most ${p.recallMs.most} ms, over ${p.recallMs.of} readings`,
      ...(Object.keys(data.sizes).length ? ["", row(["purpose", "tokens sent (median)", "most", "tokens back (median)", "most"]), row(Array(5).fill("---")), ...Object.entries(data.sizes).map(([k, v]) => row([k, v.in ?? "", v.inMost ?? "", v.out ?? "", v.outMost ?? ""]))] : []),
      ...(data.talk ? ["", "## The conversation with Asteme", "", `- work handed over: ${data.talk.work.rounds} round(s) ${JSON.stringify(data.talk.work.byState)}, median ${data.talk.work.medianMs ?? "?"} ms${data.talk.work.lastError ? `; last error: ${oneLine(data.talk.work.lastError, 140)}` : ""}`,
        `- tasks kept: ${JSON.stringify(data.talk.tasks)}; times it set itself: ${data.talk.intentions}; sessions it handed work to: ${data.talk.hands}; way of speaking ${data.talk.manner ? "set" : "not set"}; model ${data.talk.modelChosen ? "chosen for it" : "the host's"}`] : []),
      "", "## Checks", "",
      ...(data.native ? [data.native.error ? `- native libraries in this process: could not be read (${oneLine(data.native.error, 120)})`
        : `- native libraries in this process: image library ${data.native.sharp.length ? data.native.sharp.join(", ") : "none"} (${data.native.copiesOfSharp} cop${data.native.copiesOfSharp === 1 ? "y" : "ies"}); inference runtime ${data.native.onnxruntime.length ? data.native.onnxruntime.join(", ") : "none"}`] : []),
      !data.selfcheck ? "- model check: never run"
        : data.selfcheck.error ? `- model check: could not run at ${iso(data.selfcheck.at)} (${oneLine(data.selfcheck.error, 200)})`
        : `- model check: ${data.selfcheck.passed}/${data.selfcheck.total} with ${data.selfcheck.model ?? "the current model"} at ${iso(data.selfcheck.at)}`, "",
    ].join("\n");
    return { markdown, data: plain(data) };
  },
};
