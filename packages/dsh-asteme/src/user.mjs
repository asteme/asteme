// What the user says directly, through the panel rather than in conversation.
//
// The loop learns from outcomes, and outcomes are scarce: a later message has
// to happen to speak to an earlier use. A person looking at what was recalled
// can say in one click what no later message may ever say. These operations
// take that statement as what it is: the strongest evidence there is, made by
// the user, at a known time. They are recorded as the user's, never dressed up
// as a quote, and a model's later reading does not overrule them.
import { cut } from "./log.mjs";
import { LIVE, pairKey } from "./memory.mjs";
import { isStale } from "./recall.mjs";

const SAID = { helped: "The user said this was right to use", irrelevant: "The user said this did not belong here",
  wrong: "The user said this is wrong", missed: "The user said this should have been used" };

export const user = {
  /** The user's verdict on one memory in one reply. */
  userOutcome(request, id, kind, note = "") {
    if (!SAID[kind]) throw Error("Unknown outcome");
    return this.log.transaction(() => {
      const trace = this.traces(request).filter(t => t.scene).at(-1), item = this.item(id);
      if (!trace || !item) throw Error("Unknown reply or memory");
      const delivered = trace.delivered?.some(i => i.id === id);
      if (kind === "missed" ? delivered : !delivered) throw Error(kind === "missed" ? "It was used in this reply" : "It was not used in this reply");
      const value = { item: id, kind, reason: cut(String(note).trim(), 400) || SAID[kind], evidence: [], by: "user",
        request, scene: trace.scene, at: this.log.now(), revision: item.revision };
      this.log.db.prepare("INSERT INTO experience_feedback VALUES (?,?,?,?) ON CONFLICT(owner,request,item) DO UPDATE SET data=excluded.data").run(this.owner, request, id, JSON.stringify(value));
      this.reconsolidate(value, item, trace);
      return value;
    });
  },
  /** Takes back a verdict given by mistake. */
  userOutcomeUndo(request, id) {
    const row = this.log.db.prepare("SELECT data FROM experience_feedback WHERE owner=? AND request=? AND item=?").get(this.owner, request, id);
    if (!row || JSON.parse(row.data).by !== "user") throw Error("No verdict of yours to take back");
    this.log.db.prepare("DELETE FROM experience_feedback WHERE owner=? AND request=? AND item=?").run(this.owner, request, id);
  },
  /** "This is still true." Clears doubt and resets the date it was last confirmed. */
  userConfirm(id, revision) {
    return this.log.transaction(() => {
      const item = this.item(id);
      if (!item || item.revision !== revision) throw Error("Memory changed. Refresh and try again.");
      if (item.paused || !LIVE.includes(item.status)) throw Error("Only a memory in use can be confirmed");
      const { against, doubt, ...kept } = item, now = this.log.now();
      this.write({ ...kept, status: "active", revision: item.revision + 1, lastCheckedAt: now }, "Confirmed by the user");
      // Whatever was waiting to re-examine it has its answer.
      this.log.db.prepare("DELETE FROM job WHERE owner=? AND type='revise' AND target=? AND state='queued'").run(this.owner, id);
      return this.item(id);
    });
  },
  /** "This is not true any more." Closed, kept on record, and what was drawn from it is re-read. */
  userRetire(id, revision, note = "") {
    return this.log.transaction(() => {
      const item = this.item(id);
      if (!item || item.revision !== revision) throw Error("Memory changed. Refresh and try again.");
      if (!LIVE.includes(item.status)) throw Error("Already closed");
      const now = this.log.now();
      this.write({ ...item, status: "retired", revision: item.revision + 1, closedAt: now, validUntil: new Date(now).toISOString(),
        closeReason: cut(String(note).trim(), 300) || "The user said it no longer holds" }, "Closed by the user");
      this.propagate(id, "was closed by the user");
      return this.item(id);
    });
  },
  /**
   * A change the user asked for in conversation, carried out by the assistant
   * through a tool. The ground is the user's own message; the old text stays
   * in the record either way.
   */
  userAmend(id, { action, text }, request) {
    const event = this.log.event(request), item = this.item(id);
    if (!event || event.role !== "user" || event.erased) throw Error("No current message from the user to act on");
    if (!item) throw Error("Unknown memory");
    if (!LIVE.includes(item.status)) throw Error("Already closed");
    if (action === "close") {
      const closed = this.userRetire(id, item.revision, `Asked in conversation: ${cut(event.content, 200)}`);
      return { closed: true, id: closed.id };
    }
    if (action !== "correct" || typeof text !== "string" || !text.trim()) throw Error("action is \"correct\" with the new text, or \"close\"");
    const { applied, rejected } = this.apply([{ op: "supersede", id, kind: item.kind, text: cut(text.trim(), 600), reason: "Corrected at the user's request in conversation",
      concrete: item.concrete, general: item.general, certainty: "explicit", tested: item.tested, hypothesis: item.hypothesis, about: item.about, entities: item.entities,
      volatility: item.volatility, category: item.category, ...(item.closure ? { closure: item.closure } : {}), evidence: [{ id: event.id, quote: cut(event.content, 200) }] }], [event]);
    if (!applied.length) throw Error(rejected[0]?.reason ?? "The change was not accepted");
    return { corrected: true, replaced: id, id: applied.at(-1).id ?? null };
  },
  // --- Where a memory may be used -----------------------------------------
  // Memory is shared across conversations on purpose: that is where its
  // value comes from. Two walls are the user's to put up. A project can keep
  // what is learned in it to itself, and a single memory can be kept to the
  // project it was learned in. A walled memory is not deleted or hidden; it
  // is simply not recalled anywhere else.
  walled(projectId) { return !!projectId && this.log.state(`project-wall:${this.owner}:${projectId}`, false) === true; },
  setWall(projectId, on) {
    if (!projectId) throw Error("A project is required");
    this.log.save(`project-wall:${this.owner}:${projectId}`, on === true);
    return this.walled(projectId);
  },
  /** Whether this memory stays inside the project it was learned in. */
  confinedTo(item) { return item.confined === true || this.walled(item.projectId) ? item.projectId ?? null : null; },
  userConfine(id, revision, on) {
    const item = this.item(id);
    if (!item || item.revision !== revision) throw Error("Memory changed. Refresh and try again.");
    return this.write({ ...item, confined: on === true, revision: item.revision + 1 }, on ? "Kept inside its project by the user" : "Released to every project by the user");
  },
  // A conversation the user marked private is neither read into memory nor
  // given anything from it. Turns already read before that stay as they are.
  // The same holds for every conversation in a project the user switched
  // memory off for.
  // A conversation is remembered or not by what was chosen for it; one nothing was chosen for goes by the default, which is the user's too
  // (remember everything unless told not to, or remember nothing unless told to).
  quiet(sessionId, projectId) {
    const own = sessionId ? this.log.state(`private:${this.owner}:${sessionId}`, null) : null;
    return (!!sessionId && (typeof own === "boolean" ? own : this.quietByDefault())) || this.projectOff(projectId);
  },
  quietByDefault() { return this.log.state(`private-default:${this.owner}`, false) === true; },
  setQuietByDefault(on) { this.log.save(`private-default:${this.owner}`, on === true); return this.quietByDefault(); },
  projectOff(projectId) { return !!projectId && this.log.state(`project-off:${this.owner}:${projectId}`, false) === true; },
  setProjectOff(projectId, on) {
    if (!projectId) throw Error("A project is required");
    this.log.save(`project-off:${this.owner}:${projectId}`, on === true);
    return this.projectOff(projectId);
  },
  setQuiet(sessionId, on) {
    if (!sessionId) throw Error("A conversation is required");
    this.log.save(`private:${this.owner}:${sessionId}`, on === true);
    return this.quiet(sessionId);
  },
  /** Takes back a "no longer true": a memory the user closed is put back in use. */
  userReopen(id, revision) {
    return this.log.transaction(() => {
      const item = this.item(id);
      if (!item || item.revision !== revision) throw Error("Memory changed. Refresh and try again.");
      if (item.status !== "retired") throw Error("Only a memory that was closed can be put back in use");
      const { closedAt, closeReason, validUntil, ...kept } = item, now = this.log.now();
      this.write({ ...kept, status: "active", revision: item.revision + 1, lastCheckedAt: now }, "Put back in use by the user");
      this.propagate(id, "was put back in use by the user");
      return this.item(id);
    });
  },
  /** The user settles a disagreement between two memories: keep one, or keep both. */
  userSettle(a, b, keep) {
    return this.log.transaction(() => {
      const [x, y] = [this.item(a), this.item(b)], now = this.log.now();
      if (!x || !y) throw Error("Unknown memory");
      if (keep !== "both" && keep !== a && keep !== b) throw Error("Choose one of the two, or both");
      if (keep !== "both") {
        const kept = keep === a ? x : y, dropped = keep === a ? y : x;
        if (LIVE.includes(dropped.status)) {
          this.write({ ...dropped, status: "superseded", supersededBy: kept.id, validUntil: new Date(now).toISOString(), closedAt: now,
            closeReason: "The user chose the other of two memories that disagreed", revision: dropped.revision + 1 }, "Settled by the user");
          this.link(kept.id, dropped.id, "supersedes", { at: now });
          this.propagate(dropped.id, "was set aside by the user");
        }
      }
      const verdict = keep === "both" ? "distinct" : "supersede";
      for (const tie of this.links(a).filter(l => l.type === "contradicts" && [l.src, l.dst].includes(b)))
        this.link(tie.src, tie.dst, "contradicts", { state: "resolved", verdict, reason: "Settled by the user", at: now });
      this.log.db.prepare("DELETE FROM job WHERE owner=? AND type='reconcile' AND target=? AND state='queued'").run(this.owner, pairKey(a, b));
      for (const pair of [[x, y], [this.item(a), this.item(b)]]) if (pair.every(Boolean)) this.log.save(this.judgedKey("reconcile", pair), { at: now, verdict, by: "user" });
    });
  },
  /** What is waiting for the user: doubts, facts that may be out of date, and open disagreements. */
  review(now = this.log.now()) {
    const items = this.items(), byItem = new Map(items.map(i => [i.id, []]));
    for (const f of this.feedback()) byItem.get(f.item)?.push(f);
    const live = new Set(items.map(i => i.id));
    return {
      unsure: items.filter(i => i.status === "doubtful").map(i => i.id),
      stale: items.filter(i => i.status === "active" && isStale(i, byItem.get(i.id), now)).map(i => i.id),
      disputes: this.links().filter(l => l.type === "contradicts" && l.state === "open" && live.has(l.src) && live.has(l.dst)).map(l => ({ a: l.src, b: l.dst })),
    };
  },
};
