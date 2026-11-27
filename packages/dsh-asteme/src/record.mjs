// The record, searchable. Every round of every conversation (what the user
// said, what was answered, when) can be found by meaning, in the language it
// was said in. Memories are a reading of the record; this is the record
// itself, so what a reading left out can still be reached, and so can what
// the assistant said.
//
// What is kept here is a derived index and nothing else: one small vector for
// each message, made from its first words. It is rebuilt from the records whenever
// it is missing, it is removed with the record it was made from, and it is
// never exported. Private conversations, conversations kept out, what tools
// returned, anything with the shape of a secret and the answer to it are not
// indexed.
import { cut } from "./log.mjs";
import { identityKey } from "./log.mjs";
import { secret, categories } from "./policy.mjs";

export const RECORD = {
  chars: 1400,       // how much of a message its vector is made from (the embedding model reads about this much)
  batch: 32,         // messages indexed in one piece of idle work
  said: 700,         // how much of each side of a round is shown to whoever decides
  replied: 1600,
};
// A vector is kept as one signed byte for each of its numbers, scaled so that its largest number is 127: only its direction matters for nearness,
// so the scale need not be kept. A quarter of the room (under half a kilobyte for each message), and what is nearest comes out the same
// (measured on 600 passages and 30 questions: the same nearest passage for all 30, and the same ten nearest but for one in a hundred).
const pack = vector => { const most = Math.max(...vector.map(Math.abs)) || 1; return new Uint8Array(Int8Array.from(vector, x => Math.round(x / most * 127)).buffer); };
const unpack = data => Float32Array.from(new Int8Array(data.buffer, data.byteOffset, data.byteLength), x => x / 127);
const cosine = (a, b) => { let dot = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? dot / Math.sqrt(na * nb) : 0; };
const spoken = e => e && !e.erased && typeof e.content === "string" && e.content.trim() && (e.role === "user" || e.role === "assistant") && !e.metadata?.inherited;
export const roundId = id => `round:${id}`;
export const isRound = id => typeof id === "string" && id.startsWith("round:");

export const record = {
  passages() {
    this.log.db.exec(`CREATE TABLE IF NOT EXISTS passage(event TEXT PRIMARY KEY,owner TEXT NOT NULL,model TEXT NOT NULL,round TEXT NOT NULL,session TEXT NOT NULL,project TEXT,at INTEGER NOT NULL,data BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS passage_owner ON passage(owner,model)`);
    this.passages = () => {};
  },
  /**
   * Indexes messages that are not indexed yet: those after the last one indexed first (what was just said), then further back, a batch at a time.
   * Called where a turn is read into memory and while idle. Returns how many were indexed; 0 when there is nothing left to do or no embedder.
   */
  async indexRecord({ limit = RECORD.batch } = {}) {
    if (!this.embed) return 0;
    this.passages();
    const db = this.log.db, model = this.embed.model ?? "default", key = `record-index:${this.owner}`;
    const top = () => db.prepare("SELECT MAX(rowid) AS n FROM events").get().n ?? 0;
    const idAt = rowid => (rowid > 0 && db.prepare("SELECT id FROM events WHERE rowid=?").get(rowid)?.id) || null;
    const restart = dims => { db.prepare("DELETE FROM passage WHERE owner=?").run(this.owner); this._record = null; const n = top(); return { model, ...(dims ? { dims } : {}), high: n, highId: idAt(n), low: n + 1, lowId: null }; };
    let mark = this.log.state(key, null);
    // Another embedding model: its vectors cannot be compared with the old ones, so the index starts again.
    // The start is kept at once, so that a first call that fails halfway does not begin again from nothing and make twice what it had made.
    if (!mark || mark.model !== model) { mark = restart(); this.log.save(key, mark); }
    // The place reached is kept as two row numbers (everything from `low` to `high` has been looked at; low 0 when there is nothing further back),
    // and a row number is a place only while the rows stay where they were. Records nobody reads are dropped from time to time and the file is
    // packed, after which a number can belong to another record. So each end is kept with the record that stood there; when that is no longer
    // so, the ends are found again from what has been indexed, and what lies outside them is looked at again (what is indexed is not made twice).
    else if (mark.high > top() || (mark.high > 0 && idAt(mark.high) !== (mark.highId ?? null)) || (mark.lowId != null && idAt(mark.low) !== mark.lowId)) {
      const span = db.prepare("SELECT MIN(e.rowid) AS low, MAX(e.rowid) AS high FROM passage p JOIN events e ON e.id=p.event WHERE p.owner=? AND p.model=?").get(this.owner, model);
      const whole = mark.low === 0, n = top();
      const kept = { model, dims: mark.dims, ...(mark.again ? { again: mark.again } : {}), ...(mark.passedOver ? { passedOver: mark.passedOver } : {}) };
      mark = span?.high ? { ...kept, high: span.high, highId: idAt(span.high), low: whole ? 0 : span.low, lowId: whole ? null : idAt(span.low) }
        : whole ? { ...kept, high: 0, highId: null, low: 0, lowId: null } : { ...kept, high: n, highId: idAt(n), low: n + 1, lowId: null };
    }
    const erased = this.log.state("erasure-revision", 0), epoch = this.log.epoch ?? 0;
    const take = (rows) => rows.map(r => ({ rowid: r.rowid, e: JSON.parse(r.data) }));
    // Only what was said is read: a store is mostly what tools returned, and looking at each of those would make this take days on a large one.
    const SAID = "erased=0 AND json_extract(data,'$.role') IN ('user','assistant')", want = limit * 3;
    const has = db.prepare("SELECT 1 FROM passage WHERE event=? AND owner=? AND model=?"), opening = new Map();
    // The round a message belongs to is opened by the user's message before it in the same conversation (or by itself).
    const opens = (e) => {
      if (e.role === "user") return e;
      let list = opening.get(e.sessionId);
      if (!list) opening.set(e.sessionId, list = this.log.events(e.scope, e.sessionId).filter(x => x.role === "user" && x.content));
      let found = null; for (const u of list) { if (u.seq < e.seq) found = u; else break; }
      return found ?? e;
    };
    // What the embedder would not take is tried again at the next calls, three times in all, before it is passed over: a refusal that passes (a
    // service that is busy) is not the message's fault. More than sixty-four waiting at once are passed over, oldest first.
    const again = new Map((mark.again ?? []).map(a => [a.id, a.tries]));
    // The record that stood at the place reached when it was reached (see settle).
    let highId = mark.high > 0 ? idAt(mark.high) : null;
    const reach = () => { const n = top(); if (n > mark.high) { mark.high = n; highId = idAt(n); } };
    const settle = () => {
      // Rows dropped while this was working, and their places taken by what was said meanwhile, leave another record at the place reached. Then
      // the place is the last message that was indexed, and what lies above it is looked at again.
      if (mark.high > 0 && idAt(mark.high) !== highId) {
        mark.high = db.prepare("SELECT MAX(e.rowid) AS n FROM passage p JOIN events e ON e.id=p.event WHERE p.owner=? AND p.model=?").get(this.owner, model).n ?? 0;
        highId = mark.high > 0 ? idAt(mark.high) : null;
      }
      mark.highId = highId; mark.lowId = mark.low > 0 && mark.low <= mark.high ? idAt(mark.low) : null;
      const waiting = [...again];
      if (waiting.length > 64) mark.passedOver = (mark.passedOver ?? 0) + waiting.length - 64;
      if (waiting.length) mark.again = waiting.slice(-64).map(([id, tries]) => ({ id, tries })); else delete mark.again;
      this.log.save(key, mark);
    };
    // Whether a message may be indexed; gives the message that opened its round.
    const may = (e) => {
      if (!spoken(e) || identityKey(e.scope) !== this.owner || this.log.excludes(e.sessionId) || this.quiet(e.sessionId, e.scope?.projectId) || secret(e.content)) return null;
      // What was answered to a secret usually repeats it, in a shape nothing would recognize: the whole round is left out.
      const head = opens(e);
      return head !== e && secret(head.content) ? null : head;
    };
    // Newer than anything looked at, oldest first; then older than anything looked at, newest first. A stretch with nothing to index in it (a
    // private conversation, another agent's) is gone through in the same call, so that 0 comes back only when there is nothing left to do
    // (or after some twenty thousand messages in a row with nothing to index among them).
    const mine = [], taking = new Set();
    for (const [id] of [...again].slice(0, Math.max(1, limit >> 1))) {
      const e = this.log.event(id), head = e && may(e);
      if (head && !has.get(id, this.owner, model)) { mine.push({ e, round: head.id }); taking.add(id); } else again.delete(id);
    }
    for (let pass = 0; mine.length < limit && pass < 200; pass++) {
      let rows = take(db.prepare(`SELECT rowid,data FROM events WHERE rowid>? AND ${SAID} ORDER BY rowid LIMIT ?`).all(mark.high, want)), forward = true;
      if (!rows.length) {
        reach();
        if (mark.low <= 0) break;
        rows = take(db.prepare(`SELECT rowid,data FROM events WHERE rowid<? AND ${SAID} ORDER BY rowid DESC LIMIT ?`).all(mark.low, want)); forward = false;
        if (!rows.length) { mark.low = 0; break; }
      }
      let looked = 0;
      for (const { rowid, e } of rows) {
        if (mine.length >= limit) break;
        looked++;
        if (!forward) mark.low = Math.min(mark.low, rowid); else if (rowid >= mark.high) { mark.high = rowid; highId = e.id; }
        const head = may(e);
        if (!head || again.has(e.id) || taking.has(e.id) || has.get(e.id, this.owner, model)) continue;
        mine.push({ e, round: head.id }); taking.add(e.id);
      }
      // Fewer than asked for, and all of them looked at: there is nothing more that way.
      if (rows.length < want && looked === rows.length) { if (forward) reach(); else mark.low = 0; }
    }
    if (!mine.length) { settle(); return 0; }
    const text = e => cut(e.content, RECORD.chars);
    // One message the embedder will not take must not hold up all the others: when a batch is refused, each is tried by itself, and one refused
    // alone waits for the next call (see `again`). When none is taken and the embedder does not answer for a plain word either, it is the
    // embedder that is away: nothing is moved on, and the same messages are tried the next time.
    const embedded = async (part) => {
      try { return await this.embed(part.map(x => text(x.e)), "passage"); }
      catch (error) {
        const out = []; let took = 0, last = error;
        for (const x of part) { try { out.push((await this.embed([text(x.e)], "passage"))[0]); took++; } catch (again) { out.push(null); last = again; } }
        if (!took) { try { await this.embed(["ok"], "passage"); } catch { throw last; } }
        return out;
      }
    };
    let done = 0;
    for (let start = 0; start < mine.length; start += 16) {
      const part = mine.slice(start, start + 16), vectors = await embedded(part);
      // Taken back, or everything wiped, while this was being worked out: nothing is written, and the place reached is not moved on.
      if (erased !== this.log.state("erasure-revision", 0) || epoch !== (this.log.epoch ?? 0)) return done;
      const dims = vectors.find(Boolean)?.length;
      // The same model's name over vectors of another size: nothing made before can be compared with these, so the index starts again.
      if (dims && mark.dims && dims !== mark.dims) { this.log.save(key, restart(dims)); return 0; }
      if (dims) mark.dims = dims;
      const put = db.prepare("INSERT OR REPLACE INTO passage VALUES (?,?,?,?,?,?,?,?)");
      this.log.transaction(() => { part.forEach(({ e, round }, n) => { if (vectors[n]) put.run(e.id, this.owner, model, round, e.sessionId, e.scope?.projectId ?? null, e.occurredAt ?? e.observedAt ?? 0, pack(vectors[n])); }); });
      part.forEach(({ e }, n) => {
        if (vectors[n]) { again.delete(e.id); done++; return; }
        const tries = (again.get(e.id) ?? 0) + 1;
        if (tries >= 3) { again.delete(e.id); mark.passedOver = (mark.passedOver ?? 0) + 1; } else again.set(e.id, tries);
      });
    }
    this._record = null;
    settle();
    return done;
  },
  /** Whether anything of the record can be found beyond what the model already has in front of it. */
  recordBeyond(view) {
    if (!this.embed) return false;
    return this.recordVectors().some(r => !view?.has(r.event));
  },
  // The vectors, read once and kept until the index changes (here, or through another connection to the same store).
  recordVectors() {
    this.passages();
    const db = this.log.db, model = this.embed?.model ?? "default";
    const mark = db.prepare("SELECT COUNT(*) AS n, MAX(rowid) AS top FROM passage WHERE owner=? AND model=?").get(this.owner, model);
    const stamp = `${model}:${mark.n}:${mark.top}:${this.log.state("erasure-revision", 0)}:${this.log.epoch ?? 0}`;
    if (this._record?.stamp !== stamp)
      this._record = { stamp, rows: db.prepare("SELECT event,round,session,project,at,data FROM passage WHERE owner=? AND model=?").all(this.owner, model)
        .map(r => ({ event: r.event, round: r.round, session: r.session, project: r.project, at: r.at, vector: unpack(r.data) })) };
    return this._record.rows;
  },
  /**
   * The rounds nearest to the present, a round being as near as its nearest message. Rounds the model already has in front of it (`view`) are left
   * out, and so are those of a project that keeps to itself when the present is elsewhere, those a memory kept to another project rests on, those
   * of a conversation since made private, and anything erased.
   */
  recordNear(queryVectors, { here = null, view = null, limit = 4, floor = 0, allow = null } = {}) {
    if (!this.embed || !queryVectors?.length) return [];
    const rows = this.recordVectors();
    if (!rows.length) return [];
    const seen = view ?? new Set(), best = new Map();
    let other = 0;
    for (const r of rows) {
      if (r.vector.length !== queryVectors[0].length) { other++; continue; }
      if (seen.has(r.event) || seen.has(r.round)) continue;
      const s = Math.max(...queryVectors.map(q => cosine(q, r.vector)));
      const had = best.get(r.round);
      if (!had) best.set(r.round, { round: r.round, session: r.session, project: r.project, at: r.at, score: s, vector: r.vector, events: [r.event] });
      else { had.events.push(r.event); if (s > had.score) { had.score = s; had.vector = r.vector; } had.at = Math.min(had.at, r.at); }
    }
    // Every vector is of another size than the question's: the embedder changed under the same name. The index is made again by the next idle work.
    if (other === rows.length) { this.log.save(`record-index:${this.owner}`, null); return []; }
    const out = [], all = this.items({ closed: true });
    const sensitiveSources = new Set(all.filter(i => i.sensitive?.length).flatMap(i => (i.evidence ?? []).map(e => e.id)));
    // What a memory kept to another project rests on stays there with it: the words it was learned from are not handed over where it is not.
    // Where the present project is not given, a wall is not open: what is kept to a project is shown only to someone known to be in it.
    const fenced = new Set(all.filter(i => { const home = this.confinedTo(i); return home && home !== here; }).flatMap(i => (i.evidence ?? []).map(e => e.id)));
    for (const r of [...best.values()].sort((a, b) => b.score - a.score)) {
      if (out.length >= limit) break;
      if (r.score < floor) break;
      if (r.project && r.project !== here && this.walled(r.project)) continue;
      if (this.quiet(r.session, r.project)) continue;
      const events = r.events.map(id => this.log.event(id)).filter(spoken).sort((a, b) => a.seq - b.seq);
      const said = events.filter(e => e.role === "user"), replied = events.filter(e => e.role === "assistant");
      if (!events.length) continue;
      // A round whose every message the model can already see adds nothing.
      if (events.every(e => seen.has(e.id))) continue;
      if (fenced.has(r.round) || events.some(e => fenced.has(e.id))) continue;
      // The answer to a secret is not given without it either (it was indexed by a version that did not look).
      const head = this.log.event(r.round);
      if ((head && secret(head.content)) || events.some(e => secret(e.content))) continue;
      const mine = said.map(e => e.content).join("\n");
      const round = { id: roundId(r.round), round: r.round, at: r.at, sessionId: r.session, score: r.score, events: events.map(e => e.id),
        said: cut(mine, RECORD.said), replied: cut(replied.map(e => e.content).join("\n"), RECORD.replied),
        cutSaid: mine.length > RECORD.said, cutReplied: replied.reduce((n, e) => n + e.content.length, 0) > RECORD.replied,
        // About a private matter: a memory that is cites it, or the user's own words there name one.
        sensitive: events.some(e => sensitiveSources.has(e.id)) || sensitiveSources.has(r.round) || categories(mine).length > 0 };
      // `allow` is given the round and the vector of its nearest message (for a test of its own on how near that is).
      if (!allow || allow(round, r.vector)) out.push(round);
    }
    return out;
  },
  /** What is derived from records that were erased goes with them. */
  forgetPassages(references) {
    this.passages();
    const drop = this.log.db.prepare("DELETE FROM passage WHERE owner=? AND (event=? OR round=?)");
    for (const id of references) drop.run(this.owner, id, id);
    this._record = null;
  },
};
