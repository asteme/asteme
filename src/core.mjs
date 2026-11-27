// ASTEME core. Host-independent: `infer` and `embed` are the only model
// ports, and the host supplies immutable records through Log.
//
// The loop, and where each part lives:
//
//   prepare()   attend.mjs   the present scene calls memory up; a few items are admitted
//   reflect()   reflect.mjs  after the turn, the records are read and written down
//   outcomes()  outcome.mjs  later records show how each use went; the memory changes
//   sleep()     sleep.mjs    replay, reconcile, revise, integrate, imagine, habits
//   why()/explain()  explain.mjs  every answer about memory ends at a stored record
//
//   memory.mjs  the write path: validation, revisions, links, the sleep queue
//   recall.mjs  activation: what a memory answers to, the nearest few, the scenes it stays out of
//   record.mjs  the record itself, searchable: the rounds of earlier conversations nearest to the present
//   habits.mjs  the always-present rules and their gates
//   charter.mjs what experience does not move
//   user.mjs    what the user says directly: verdicts, confirmations, settling a disagreement
//   judge.mjs   the optional judge port: closed questions answered with probabilities
//   archive.mjs a complete copy out and back in, the diary, the developer report
//   journal.mjs what was done and how it went: one row per model call
//
// Each module contributes methods to one class, so they share a single `this`
// (log, owner, embed) without passing a context object around.
import { identityKey, profile } from "./log.mjs";
import { charterOf } from "./charter.mjs";
import { memory } from "./memory.mjs";
import { recall } from "./recall.mjs";
import { record } from "./record.mjs";
import { attend } from "./attend.mjs";
import { reflect } from "./reflect.mjs";
import { outcome } from "./outcome.mjs";
import { habits } from "./habits.mjs";
import { sleep } from "./sleep.mjs";
import { explain } from "./explain.mjs";
import { user } from "./user.mjs";
import { journal } from "./journal.mjs";
import { archive } from "./archive.mjs";

export { renderExperience } from "./attend.mjs";
export { TUNING, isStale } from "./recall.mjs";
export { RECORD, isRound } from "./record.mjs";
export { sameEntity } from "./memory.mjs";
export { accessibility, useStats, OUTCOMES } from "./outcome.mjs";
export { DEFAULT_CHARTER, charterOf } from "./charter.mjs";
export { JUDGE, judgeAdmission, judgeOutcome } from "./judge.mjs";
export { plain } from "./archive.mjs";

export class Asteme {
  constructor({ log, identity, embed }) {
    this.log = log; this.identity = identity; this.owner = identityKey(identity); this.embed = embed;
    // Starting over must hold against work already under way. A reading, a
    // reflection or a night's work that began before the store was wiped has
    // erased memories in hand and would write them into its records when it
    // lands. Each such piece of work checks the epoch it started in: if the
    // store was wiped meanwhile, what it wrote is wiped again and it reports
    // nothing. Anything recorded in those few seconds goes too; that is the
    // price of "erase everything" meaning it.
    const nothing = { prepare: v => ({ ...v, text: "", delivered: [], candidates: [], decisions: [], stale: true }) };
    for (const name of ["prepare", "sceneLater", "reflect", "outcomes", "sleep", "consolidate"]) {
      const work = this[name];
      this[name] = async (...args) => {
        const epoch = this.log.epoch ?? 0;
        const value = await work.apply(this, args);
        if ((this.log.epoch ?? 0) === epoch) return value;
        this.log.rewipe();
        this._vectors?.clear?.(); this._intact = null;
        return nothing[name] ? nothing[name](value ?? {}) : { stale: true };
      };
    }
    // The first four tables are unchanged from 0.7, so an existing database
    // opens as it is. The rest hold what is derived and can be rebuilt.
    log.db.exec(`CREATE TABLE IF NOT EXISTS experience(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS experience_owner ON experience(owner);
      CREATE TABLE IF NOT EXISTS experience_history(seq INTEGER PRIMARY KEY,owner TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS experience_history_item ON experience_history(owner,id);
      CREATE TABLE IF NOT EXISTS attention(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS attention_request ON attention(owner,request);
      CREATE TABLE IF NOT EXISTS experience_feedback(owner TEXT NOT NULL,request TEXT NOT NULL,item TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,request,item));
      CREATE TABLE IF NOT EXISTS dynamics(owner TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS link(owner TEXT NOT NULL,src TEXT NOT NULL,dst TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(owner,src,dst,type));
      CREATE TABLE IF NOT EXISTS episode(id TEXT PRIMARY KEY,owner TEXT NOT NULL,salience REAL NOT NULL,replays INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job(id TEXT PRIMARY KEY,owner TEXT NOT NULL,type TEXT NOT NULL,target TEXT NOT NULL,priority REAL NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS job_queue ON job(owner,state,priority);
      CREATE TABLE IF NOT EXISTS vector(key TEXT PRIMARY KEY,data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS journal(seq INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS journal_at ON journal(at);`);
    log.onErase(references => this.forgetDerived(references));
  }
  /** The profile as stored: names, manner, agreements, habits, and the user's own purpose and values if written. */
  core() { return profile(this.log, this.identity); }
  coreText() { return JSON.stringify(this.core()); }
  /**
   * The profile with the charter in force (the user's, or the defaults), and what the user asked to be held to. `here` is the project the
   * present conversation is in: an ask kept to its project is in front only there, so where the project is not given it is left out.
   */
  charter({ here = null } = {}) { const asks = this.standingAsks({ here }); return { ...charterOf(this.core()), ...(asks.length ? { standing: asks } : {}) }; }
}

Object.assign(Asteme.prototype, memory, recall, record, attend, reflect, outcome, habits, sleep, explain, user, journal, archive);
