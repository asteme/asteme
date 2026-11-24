import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const canonical = (x) =>
  x === null || typeof x !== "object"
    ? JSON.stringify(x)
    : Array.isArray(x)
      ? `[${x.map(canonical)}]`
      : `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
          .join(",")}}`;
export const digest = (x) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : canonical(x))
    .digest("hex");
export const scopeKey = (s) =>
  canonical({ userId: s.userId, agentId: s.agentId, projectId: s.projectId });
export const identityKey = (s) =>
  canonical({ userId: s.userId, agentId: s.agentId });
export const cut = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
const decode = (row) => (row ? JSON.parse(row.data) : null);

/**
 * The layout of the store on disk. Raised only when a change would make an
 * older version misread the store; tables and columns added in a way older
 * versions ignore do not raise it.
 */
export const STORE_FORMAT = 1;

/** Sources retain the v0.3 schema and IDs; notes and checkpoints share this database. */
export class Log {
  constructor(path, now = () => Date.now()) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.now = now;
    // Modules that keep derived data register here, so one erasure removes
    // every trace in the same transaction.
    this.erasers = [];
    this.db = new DatabaseSync(path);
    // A store written by a later version may hold things this one would
    // misread or drop. It is refused before anything is touched.
    const written = this.db.prepare("PRAGMA user_version").get().user_version;
    if (written > STORE_FORMAT) {
      this.db.close();
      throw new Error(`This memory was written by a newer version of Asteme (store format ${written}; this version reads up to ${STORE_FORMAT}). Update the plugin. Nothing was changed.`);
    }
    // secure_delete: what is erased is overwritten, not left in freed pages.
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA user_version=${STORE_FORMAT};
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,scope TEXT NOT NULL,session_id TEXT NOT NULL,seq INTEGER NOT NULL,erased INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,UNIQUE(scope,session_id,seq));
      CREATE TABLE IF NOT EXISTS cursors(scope TEXT NOT NULL,session_id TEXT NOT NULL,next_seq INTEGER NOT NULL,PRIMARY KEY(scope,session_id));
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS received(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS forgotten(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,identity TEXT NOT NULL,project TEXT,kind TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS notes_scope ON notes(identity,project,kind,status);
      CREATE TABLE IF NOT EXISTS budgets(scope TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL,tokens INTEGER NOT NULL,PRIMARY KEY(scope,day));`);
  }
  close() {
    this.db.close();
  }
  /**
   * Counts the writes to the conversation's records other than adding at the end: erasing, wiping, thinning, bringing an archive in. Whoever keeps a
   * copy of records read before (the conversation, in brain/mind.mjs) reads again when it has moved: how many rows there are, and which is last, can
   * come out the same after any of them (a store wiped and an archive of the same length brought in).
   */
  rewrote() {
    this.rewrites = (this.rewrites ?? 0) + 1;
  }
  onErase(fn) {
    this.erasers.push(fn);
  }
  /**
   * Starts over: everything remembered, said and recorded is removed, and the
   * file is rewritten so that none of it is left in freed pages. Two things
   * stay. The place reached in each of the host's session logs stays, because
   * without it every earlier conversation would be read in again and learned
   * a second time. State whose key starts with one of `keep` stays (settings
   * and the like); it holds no conversation.
   */
  wipe({ keep = [] } = {}, again = false) {
    this.rewrote();
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
    const removed = {};
    // Work that was under way when this ran still holds what was erased, and
    // would write it back when it finishes. `epoch` lets it notice (see
    // `rewipe` and the guard in core.mjs).
    if (!again) { this.epoch = (this.epoch ?? 0) + 1; this.lastWipe = { keep }; }
    this.transaction(() => {
      for (const name of tables) {
        if (name === "cursors") continue;
        if (name === "state") {
          const rows = this.db.prepare("SELECT key FROM state").all().filter(r => !keep.some(k => r.key === k || r.key.startsWith(k)));
          const drop = this.db.prepare("DELETE FROM state WHERE key=?");
          for (const r of rows) drop.run(r.key);
          removed.state = rows.length;
          continue;
        }
        removed[name] = Number(this.db.prepare(`DELETE FROM "${name}"`).run().changes);
      }
    });
    this.db.exec("VACUUM");
    try { this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    return removed;
  }
  /** Erases again what work that began before the last wipe has written since. */
  rewipe() { if (this.lastWipe) this.wipe(this.lastWipe, true); }
  transaction(fn) {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const x = fn();
      this.db.exec("COMMIT");
      return x;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  state(key, fallback = null) {
    return (
      decode(this.db.prepare("SELECT data FROM state WHERE key=?").get(key)) ??
      fallback
    );
  }
  save(key, value) {
    this.db
      .prepare(
        "INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      )
      .run(key, JSON.stringify(value));
    return value;
  }
  legacy(namespace, key) {
    if (
      !this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='documents'")
        .get()
    )
      return null;
    return decode(
      this.db
        .prepare("SELECT data FROM documents WHERE namespace=? AND key=?")
        .get(namespace, key),
    );
  }
  cursor(scope, session) {
    return (
      this.db
        .prepare("SELECT next_seq FROM cursors WHERE scope=? AND session_id=?")
        .get(scopeKey(scope), session)?.next_seq ?? 0
    );
  }
  ingest(scope, sessionId, events) {
    return this.transaction(() => {
      let next = this.cursor(scope, sessionId);
      const forgotten = this.db.prepare("SELECT 1 FROM forgotten WHERE id=?");
      for (const raw of events) {
        if (raw.seq < next) continue;
        if (raw.seq !== next) throw new Error("Source sequence gap");
        // An event the caller has no use for is passed over: the cursor moves
        // on and no row is written.
        if (raw.skip) { next++; continue; }
        const e = {
          ...raw,
          scope,
          sessionId,
          id: raw.kind === "user/message" && raw.metadata?.messageId
            ? digest({ scope, sessionId, messageId: raw.metadata.messageId })
            : digest({ scope, sessionId, seq: raw.seq }),
          observedAt: this.now(),
          erased: false,
        };
        if (forgotten.get(e.id)) Object.assign(e, { erased: true, content: "", metadata: {} });
        this.db.prepare("INSERT INTO events(id,scope,session_id,seq,erased,data) VALUES (?,?,?,?,?,?)")
          .run(e.id, scopeKey(scope), sessionId, e.seq, Number(e.erased), JSON.stringify(e));
        next++;
      }
      this.db
        .prepare(
          "INSERT INTO cursors VALUES (?,?,?) ON CONFLICT(scope,session_id) DO UPDATE SET next_seq=excluded.next_seq",
        )
        .run(scopeKey(scope), sessionId, next);
      return next;
    });
  }
  event(id) {
    const event = decode(
      this.db.prepare("SELECT data FROM events WHERE id=?").get(id) ?? this.db.prepare("SELECT data FROM received WHERE id=?").get(id),
    );
    return event && !this.excludes(event.sessionId) ? event : null;
  }
  excludes(sessionId) {
    return this.state("excluded-sessions", []).includes(sessionId);
  }
  // DSH claims a real user message before committing its event. Capture that
  // original input now, under the same ID ingestion will use. No synthetic turn.
  receive(scope, sessionId, messageId, content) {
    const id = digest({ scope, sessionId, messageId });
    if (this.db.prepare("SELECT 1 FROM forgotten WHERE id=?").get(id)) return null;
    const e = { id, scope, sessionId, kind: "user/message", role: "user", content, observedAt: this.now(), metadata: { messageId } };
    this.db.prepare("INSERT OR IGNORE INTO received VALUES (?,?)").run(id, JSON.stringify(e));
    return this.event(id);
  }
  events(scope, session, from = 0) {
    if (this.excludes(session)) return [];
    return this.db
      .prepare(
        "SELECT data FROM events WHERE scope=? AND session_id=? AND seq>=? AND erased=0 ORDER BY seq",
      )
      .all(scopeKey(scope), session, from)
      .map(decode);
  }
  sessions(identity) {
    return this.db
      .prepare("SELECT DISTINCT scope,session_id FROM events")
      .all()
      .map((r) => ({ scope: JSON.parse(r.scope), sessionId: r.session_id }))
      .filter((r) => identityKey(r.scope) === identityKey(identity) && !this.excludes(r.sessionId));
  }
  // Each stage keeps its own checkpoints, so summary memory ("reflected") and
  // state ("appraised") can each be built from the same source records.
  pending(identity, stage = "reflected") {
    const turns = [];
    for (const { scope, sessionId } of this.sessions(identity)) {
      const key = `${stage}:${scopeKey(scope)}:${sessionId}`;
      const events = this.events(scope, sessionId, this.state(key, 0));
      let start = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].kind !== "turn/end") continue;
        const part = events.slice(start, i + 1);
        start = i + 1;
        const request = part.find(
          (e) => e.role === "user" && !e.metadata?.inherited,
        );
        if (request) {
          turns.push({
            id: request.id,
            scope,
            sessionId,
            key,
            end: events[i].seq + 1,
            events: part,
            shown: this.shown(request),
            at: request.occurredAt ?? request.observedAt,
          });
        }
      }
    }
    return turns.sort((a, b) => a.at - b.at || a.end - b.end);
  }
  shown(event) {
    return this.state(
      `shown:${event.metadata?.messageId}`,
      this.state(`shown:${event.id}`, []),
    );
  }
  usage(identity) {
    const key = identityKey(identity),
      day = new Date(this.now()).toISOString().slice(0, 10);
    const used = this.db
      .prepare("SELECT calls,tokens FROM budgets WHERE scope=? AND day=?")
      .get(key, day) ?? { calls: 0, tokens: 0 };
    return {
      key,
      day,
      ...used,
    };
  }
  beginCall(identity, prompt, output) {
    return this.transaction(() => {
      const b = this.usage(identity),
        estimate = Math.ceil(Buffer.byteLength(prompt) / 3) + output;
      this.db
        .prepare(
          "INSERT INTO budgets VALUES (?,?,1,?) ON CONFLICT(scope,day) DO UPDATE SET calls=calls+1,tokens=tokens+excluded.tokens",
        )
        .run(b.key, b.day, estimate);
      return { ...b, estimate };
    });
  }
  settle(reservation, usage, output) {
    const input = usage?.inputTokens ?? usage?.input_tokens,
      completion = usage?.outputTokens ?? usage?.output_tokens;
    const actual =
      Number.isFinite(input) && Number.isFinite(completion)
        ? input + completion
        : Math.max(
            0,
            reservation.estimate -
              output.limit +
              Math.ceil(Buffer.byteLength(output.text) / 3),
          );
    this.db
      .prepare("UPDATE budgets SET tokens=tokens+? WHERE scope=? AND day=?")
      .run(actual - reservation.estimate, reservation.key, reservation.day);
  }
  erase(ids) {
    this.rewrote();
    this.transaction(() => {
      this.save("erasure-revision", this.state("erasure-revision", 0) + 1);
      const affected = new Set();
      for (const id of ids) {
        const e = this.event(id);
        if (!e) continue;
        if (e.metadata?.messageId) affected.add(`shown:${e.metadata.messageId}`);
        affected.add(`shown:${id}`);
        this.db.prepare("INSERT OR IGNORE INTO forgotten VALUES (?)").run(id);
        e.erased = true;
        e.content = "";
        e.metadata = {};
        this.db
          .prepare("UPDATE events SET erased=1,data=? WHERE id=?")
          .run(JSON.stringify(e), id);
        this.db.prepare("DELETE FROM received WHERE id=?").run(id);
      }
      const exists = name => this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      let erasedReferences = [...ids];
      if (exists("experience")) {
        const dependent = this.db.prepare("SELECT id,data FROM experience").all()
          .filter(r => decode(r).evidence.some(e => ids.includes(e.id))).map(r => r.id);
        for (const id of dependent) {
          affected.add(id);
          this.db.prepare("DELETE FROM experience WHERE id=?").run(id);
          this.db.prepare("DELETE FROM experience_history WHERE id=?").run(id);
        }
        const references = [...ids, ...dependent];
        erasedReferences = references;
        if (exists("experience_feedback")) for (const row of this.db.prepare("SELECT rowid,data FROM experience_feedback").all())
          if (references.some(id => row.data.includes(id))) this.db.prepare("DELETE FROM experience_feedback WHERE rowid=?").run(row.rowid);
        // A reading names, beside each memory it held, the records its words were drawn from (the scene a memory was found, used or held back by, when
        // that scene was learned from a later use): those entries are found by the erased ids and go, wherever they are, and no others do.
        for (const row of this.db.prepare("SELECT id,data FROM attention").all()) {
          if (!references.some(id => row.data.includes(id))) continue;
          const kept = scrubTrace(row.data, references);
          if (kept) this.db.prepare("UPDATE attention SET data=? WHERE id=?").run(kept, row.id);
          else this.db.prepare("DELETE FROM attention WHERE id=?").run(row.id);
        }
        for (const row of this.db.prepare("SELECT seq,owner,id,data FROM experience_history").all()) {
          if (!references.some(id => row.data.includes(id))) continue;
          const entry = decode(row);
          if (row.id === "core" && entry.patch) {
            const key = `profile:${row.owner}`, current = this.state(key, {});
            for (const [field, value] of Object.entries(entry.patch))
              if (canonical(current[field]) === canonical(value)) delete current[field];
            this.save(key, current);
          }
          // A habit whose evidence was erased must leave the always-present core.
          if (row.id === "core" && entry.habit && !entry.habit.demoted) {
            const key = `profile:${row.owner}`, current = this.state(key, {});
            const habits = { ...(current.habits ?? {}) };
            if (habits[entry.habit.key] === entry.habit.text) {
              delete habits[entry.habit.key];
              this.save(key, { ...current, habits });
            }
          }
          this.db.prepare("DELETE FROM experience_history WHERE seq=?").run(row.seq);
        }
        for (const row of this.db.prepare("SELECT key,data FROM state WHERE key LIKE 'habits:%'").all()) {
          const record = decode(row) ?? {}, kept = {};
          for (const [key, entry] of Object.entries(record))
            if (![...(entry.evidence ?? []), ...(entry.from ?? []).map(id => ({ id }))]
              .some(ref => references.includes(ref.id))) kept[key] = entry;
          if (Object.keys(kept).length === Object.keys(record).length) continue;
          const owner = row.key.slice("habits:".length), profileKey = `profile:${owner}`, current = this.state(profileKey, {});
          const habits = { ...(current.habits ?? {}) };
          for (const [key, entry] of Object.entries(record))
            if (!kept[key] && habits[key] === entry.text) delete habits[key];
          this.save(profileKey, { ...current, habits });
          this.save(row.key, kept);
        }
        this.db.prepare("DELETE FROM state WHERE key LIKE 'vector:%'").run();
      }
      for (const fn of this.erasers) fn(erasedReferences);
      for (const row of this.db.prepare("SELECT id,data FROM notes").all()) {
        const note = decode(row);
        if (note.evidence.some((id) => ids.includes(id))) {
          note.status = "erased";
          note.body = "";
          note.cue = "";
          note.evidence = [];
          this.db
            .prepare("UPDATE notes SET status='erased',data=? WHERE id=?")
            .run(JSON.stringify(note), row.id);
        }
      }
      // Display snapshots are derived data too; they must not resurrect removed text.
      for (const row of this.db
        .prepare("SELECT key,data FROM state WHERE key LIKE 'shown:%'")
        .all()) {
        const shown = affected.has(row.key) ? [] : decode(row).filter(
          (n) => !n.evidence?.some((id) => ids.includes(id)) && !n.items?.some(id => affected.has(id)),
        );
        this.save(row.key, shown);
      }
    });
  }
}

/** Explicit profile remains separate from model-written notes. */
export function profile(log, identity, patch) {
  const key = `profile:${identityKey(identity)}`;
  let value = log.state(key);
  if (!value) {
    value = {
      name: "",
      userName: "",
      style: {},
      habits: {},
      commitments: [],
      commitmentRules: [],
      purpose: "",
      values: [],
    };
    const history =
      log.legacy(
        `persona:${JSON.stringify([identity.userId, identity.agentId])}`,
        "state",
      )?.history ?? [];
    const snapshots = new Map([[0, structuredClone(value)]]),
      candidates = new Map();
    for (const entry of history) {
      if (!entry.erased) {
        const p = entry.payload;
        if (entry.action === "explicit") {
          for (const k of [
            "name",
            "userName",
            "commitments",
            "commitmentRules",
          ])
            if (k in p) value[k] = p[k];
          for (const k of ["style", "habits"])
            for (const [field, v] of Object.entries(p[k] ?? {})) {
              if (v === null) delete value[k][field];
              else value[k][field] = v;
            }
        } else if (entry.action === "propose") candidates.set(p.id, p);
        else if (entry.action === "review" && p.decision === "accept") {
          const c = candidates.get(p.id);
          if (c && ["style", "habit"].includes(c.kind))
            value[c.kind === "style" ? "style" : "habits"][c.key] = c.value;
        } else if (entry.action === "rollback" && snapshots.has(p.revision))
          value = structuredClone(snapshots.get(p.revision));
      }
      snapshots.set(entry.revision, structuredClone(value));
    }
    log.save(key, value);
  }
  if (patch) {
    for (const k of Object.keys(patch))
      if (
        ![
          "name",
          "userName",
          "style",
          "habits",
          "commitments",
          "commitmentRules",
          "purpose",
          "values",
        ].includes(k)
      )
        throw new Error("Unknown profile field");
    if (JSON.stringify({ ...value, ...patch }).length > 4000) throw new Error("Core exceeds one-page implementation budget");
    log.save(`${key}:history:${randomUUID()}`, { at: log.now(), before: value, patch });
    value = log.save(key, { ...value, ...patch });
    log.save(`${key}:editedAt`, log.now());
  }
  return value;
}
export { randomUUID };

/**
 * Takes what was removed out of one reading and keeps the rest. A reading
 * lists every memory that was considered, so deleting a reading whenever one
 * of those memories was removed used to wipe nearly all of them at once, and
 * the panel went on showing a reply from long before. Returns null when the
 * reading cannot be kept: its own request is gone, it is not a reading made
 * before a reply, or something removed is still in it after scrubbing.
 */
export function scrubTrace(text, references) {
  const trace = JSON.parse(text);
  if (!Array.isArray(trace.candidates) || references.includes(trace.request)) return null;
  const has = value => { const s = JSON.stringify(value) ?? ""; return references.some(id => s.includes(id)); };
  for (const key of ["candidates", "decisions", "delivered", "undecided", "outcomes"])
    if (Array.isArray(trace[key])) trace[key] = trace[key].filter(entry => !has(entry));
  // What was held back is a list of its own: only the entries that hold what was erased go.
  if (Array.isArray(trace.heldBack?.suppressed)) trace.heldBack = { ...trace.heldBack, suppressed: trace.heldBack.suppressed.filter(entry => !has(entry)) };
  for (const key of ["heldBack", "shadow", "immediate"]) if (trace[key] !== undefined && has(trace[key])) delete trace[key];
  // The note given to the assistant may have carried the removed words.
  trace.text = "";
  trace.scrubbed = true;
  const out = JSON.stringify(trace);
  return references.some(id => out.includes(id)) ? null : out;
}
