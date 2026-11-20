// After a turn: read the original records and write down what they support.
// The turn also becomes an episode, with a salience that says how much it
// deserves to be read again while asleep. Salience directs attention; it never
// makes a single event into a general rule.
import { cut } from "./log.mjs";
import { reflectionBatch, iso, failed, endedOf } from "./mind.mjs";
import { bounded, compactItem, pageRaw } from "./memory.mjs";
import { reflectionPrompt } from "./prompts.mjs";

// What makes an episode stand out. A signal counts only with an exact quote
// (model) or a fact the program can see for itself (code).
const SIGNALS = {
  correction: { mild: 0.3, strong: 0.45 },   // the user corrected the assistant
  surprise: { mild: 0.15, strong: 0.35 },    // something went against what was expected
  failure: { mild: 0.2, strong: 0.35 },      // something broke or had to be redone
  explicit: { mild: 0.3, strong: 0.3 },      // the user asked for it to be remembered
  commitment: { mild: 0.15, strong: 0.15 },  // a promise was made
  recurrence: { mild: 0.2, strong: 0.2 },    // the same kind of situation came up in an earlier exchange (counted by code)
};
const BASE_SALIENCE = 0.1;
export const salienceOf = signals => Math.min(1, Number((BASE_SALIENCE + signals.reduce((sum, s) => sum + SIGNALS[s.kind][s.strength], 0)).toFixed(3)));

export const reflect = {
  episode(id) {
    const row = this.log.db.prepare("SELECT salience,replays,data FROM episode WHERE owner=? AND id=?").get(this.owner, id);
    return row ? { id, salience: row.salience, replays: row.replays, ...JSON.parse(row.data) } : null;
  },
  episodes() {
    return this.log.db.prepare("SELECT id,salience,replays,data FROM episode WHERE owner=?").all(this.owner)
      .map(r => ({ id: r.id, salience: r.salience, replays: r.replays, ...JSON.parse(r.data) }))
      .filter(e => this.intact(e.id));
  },
  saveEpisode({ id, salience, replays = 0, ...data }) {
    this.log.db.prepare("INSERT INTO episode VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET salience=excluded.salience,replays=excluded.replays,data=excluded.data")
      .run(id, this.owner, salience, replays, JSON.stringify(data));
  },
  // Something learned later made an earlier episode matter more: raise it and
  // have it read again.
  stir(id, amount, reason) {
    const episode = this.episode(id);
    if (!episode) return;
    const salience = Math.min(1, Number((episode.salience + amount).toFixed(3)));
    this.saveEpisode({ ...episode, salience, stirred: [...(episode.stirred ?? []), { at: this.log.now(), reason }].slice(-6) });
    this.enqueue("replay", id, salience, { reasons: [reason] });
  },
  noteEpisode(turn, batch, claimed, report) {
    const signals = new Map((this.episode(turn.id)?.signals ?? []).map(s => [s.kind, s]));
    const add = signal => {
      const old = signals.get(signal.kind);
      if (!old || (old.strength === "mild" && signal.strength === "strong")) signals.set(signal.kind, signal);
    };
    for (const s of Array.isArray(claimed?.signals) ? claimed.signals : []) try {
      if (!SIGNALS[s?.kind]) continue;
      const raw = this.evidence(s.evidence, batch.events);
      // A correction or a request to remember is the user's to make.
      if (["correction", "explicit"].includes(s.kind) && !raw.some(e => e.role === "user")) continue;
      add({ kind: s.kind, strength: s.strength === "strong" ? "strong" : "mild", by: "model", evidence: s.evidence.map(r => ({ id: r.id, quote: r.quote })) });
    } catch { /* A signal without its exact words is not a signal. */ }
    if (batch.events.some(failed)) add({ kind: "failure", strength: "mild", by: "code" });
    if (report.applied.some(a => ["doubt", "counter", "supersede"].includes(a.op))) add({ kind: "correction", strength: "mild", by: "code" });
    const previous = this.episode(turn.id), list = [...signals.values()];
    const written = report.applied.filter(a => a.id).map(a => a.id);
    const episode = {
      id: turn.id, sessionId: turn.sessionId, at: turn.at,
      scene: cut(typeof claimed?.scene === "string" && claimed.scene.trim() ? claimed.scene.trim() : previous?.scene ?? batch.request?.content ?? "", 300),
      signals: list, salience: Math.max(previous?.salience ?? 0, salienceOf(list)), replays: previous?.replays ?? 0,
      events: [...new Set([...(previous?.events ?? []), ...batch.events.map(e => e.id)])],
      memories: [...new Set([...(previous?.memories ?? []), ...written])],
      ...(previous?.stirred ? { stirred: previous.stirred } : {}), ...(previous?.lastReplayAt ? { lastReplayAt: previous.lastReplayAt } : {}),
    };
    this.saveEpisode(episode);
    // What was learned in a salient episode is harder to push out of mind.
    for (const id of written) this.raiseSalience(id, episode.salience, "Learned in an episode that stood out");
    return episode;
  },
  async reflect(turn, infer) {
    // A private conversation is passed over, not read: the cursor moves on.
    if (this.quiet(turn.sessionId, turn.scope?.projectId)) { this.log.save(turn.key, turn.end); return { private: true }; }
    if (this.log.state(turn.key, 0) >= turn.end) return;
    const erased = this.log.state("erasure-revision", 0);
    turn = { ...turn, events: turn.events.filter(e => !this.log.event(e.id)?.erased) };
    const partKey = `experience-part:${turn.id}`;
    const batch = reflectionBatch(turn, this.log.state(partKey, 0), 24000, { toolChars: 600 });
    const query = { scene: batch.request?.content ?? "", need: "prior understanding relevant to interpreting this conversation and missed useful experience", entities: [] };
    const known = this.items({ closed: true });
    const relevant = known.length <= 32 ? known : (await this.candidates(query, this.log.now(), null, { purpose: "reflection" })).map(c => c.item);
    if (erased !== this.log.state("erasure-revision", 0)) return;
    const endedAt = Math.max(...turn.events.map(e => e.occurredAt ?? e.observedAt));
    // The program pairs each delivery with the words that came after it. Finding
    // that pairing is counting, not judging; leaving it to the model to hunt
    // through RAW is why no outcome was ever scored.
    const after = t => batch.events
      .filter(e => ["user", "tool"].includes(e.role) && e.content && e.id !== t.request &&
        (e.occurredAt ?? e.observedAt) >= (this.log.event(t.request)?.occurredAt ?? t.at))
      .slice(0, 2).map(e => ({ id: e.id, role: e.role, quote: cut(e.content, 300) }));
    const traces = [...new Map([...this.traces(turn.id), ...this.traces()].map(t => [t.id, t])).values()].filter(t => (t.scene || t.premise) && t.at <= endedAt).map(t => ({
      id: t.id, request: t.request, input: cut(this.log.event(t.request)?.content, 500), at: t.at, scene: t.scene,
      candidates: t.candidates?.map(c => ({ id: c.item.id, score: c.score, due: c.due, entity: c.entity })),
      decisions: t.decisions, delivered: t.delivered?.map(i => ({ id: i.id, text: bounded(i.text, 1200), use: i.use, expect: i.expect })),
      later: after(t),
      premise: t.premise, used: t.used, declared: t.declared, feedback: t.feedback,
    }));
    const visible = { traces: traces.length, delivered: traces.reduce((n, t) => n + (t.delivered?.length ?? 0), 0) };
    const value = await infer("asteme-reflect", reflectionPrompt({ now: iso(this.log.now()), core: this.charter(), partial: !batch.done, ...(endedOf(turn.events) ? { turnEnded: endedOf(turn.events) } : {}),
      RAW: pageRaw(batch.events), understanding: relevant.map(compactItem), traces }), 6000);
    if (erased !== this.log.state("erasure-revision", 0)) return;
    if (!value || !Array.isArray(value.changes) || (value.feedback !== undefined && !Array.isArray(value.feedback))) {
      this.trace({ request: turn.id, stage: "reflection", error: "Invalid reflection response", response: value });
      throw Error("Invalid reflection response");
    }
    value.feedback ??= [];
    // No awaits between compare/apply/checkpoint: concurrent attention cannot be overwritten.
    if (this.log.state(turn.key, 0) >= turn.end || this.log.state(partKey, 0) !== batch.offset) return;
    return this.log.transaction(() => {
      const immediate = this.apply(value.changes.filter(op => op.op === "core"), batch.events, { immediate: true, known });
      const report = this.apply(value.changes.filter(op => op.op !== "core"), batch.events, { known });
      const assessment = this.assess(value.feedback, batch.events, known, traces), feedback = assessment.applied;
      const episode = this.noteEpisode(turn, batch, value.episode, report);
      this.trace({ request: turn.id, reflection: true, raw: batch.events.map(e => e.id), operations: value, report, immediate, feedback, rejectedFeedback: assessment.rejected, visible,
        episode: { salience: episode.salience, signals: episode.signals.map(s => s.kind) } });
      if (batch.done) { this.log.save(turn.key, turn.end); this.log.db.prepare("DELETE FROM state WHERE key=?").run(partKey); }
      else this.log.save(partKey, batch.next);
      return { report, immediate, feedback, episode };
    });
  },
};
