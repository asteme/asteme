// Explanation: every answer about memory ends at a stored record.
//
//   why(id)          what a memory rests on, what speaks against it, what it
//                    was drawn from, what was drawn from it, how its use went
//                    and how it changed
//   explain(request) what one reply had in view: the scene that was read, what
//                    recall brought up and held back, what was admitted or
//                    dropped and why, and what happened afterwards
//
// The honest limit: this shows what was put in front of the answering model.
// Whether the model used it is known only where the reply was checked against
// it afterwards (outcomes) or the model said so itself (premise).
import { cut } from "./log.mjs";
import { iso } from "./mind.mjs";
import { accessibility, useStats } from "./outcome.mjs";

export const explain = {
  /** id -> { accessibility, stats } for many items at once. */
  recallState(items = this.items({ closed: true })) {
    const byItem = new Map(items.map(i => [i.id, []]));
    for (const f of this.feedback()) byItem.get(f.item)?.push(f);
    return new Map(items.map(i => { const stats = useStats(byItem.get(i.id), i.revision); return [i.id, { accessibility: accessibility(i, stats), stats }]; }));
  },
  why(id) {
    const item = this.item(id);
    if (!item) return null;
    const quote = ref => {
      const e = this.log.event(ref.id);
      return { id: ref.id, quote: ref.quote, role: e?.role, at: iso(e?.occurredAt ?? e?.observedAt), ...(ref.reason ? { reason: ref.reason } : {}) };
    };
    const brief = other => other && { id: other.id, text: cut(other.text, 200), status: other.status, level: other.level, paused: !!other.paused };
    const feedback = this.feedback().filter(f => f.item === id), stats = useStats(feedback, item.revision);
    const links = this.links(id), cues = this.cues(item, feedback);
    return {
      item,
      supports: item.evidence.map(quote),
      against: (item.against ?? []).map(quote),
      drawnFrom: (item.premises ?? []).map(p => brief(this.item(p))).filter(Boolean),
      usedBy: [
        ...links.filter(l => l.type === "derived" && l.dst === id).map(l => brief(this.item(l.src))).filter(Boolean),
        ...this.habitSummary().filter(h => (h.from ?? []).includes(id)).map(h => ({ habit: h.key, text: h.text, status: h.status })),
      ],
      replaced: brief(item.supersedes && this.item(item.supersedes)) || undefined,
      replacedBy: brief(item.supersededBy && this.item(item.supersededBy)) || undefined,
      disputes: links.filter(l => l.type === "contradicts").map(l => ({ with: brief(this.item(l.src === id ? l.dst : l.src)), state: l.state, verdict: l.verdict, reason: l.reason })),
      // Why it comes to mind, or does not.
      recall: { accessibility: accessibility(item, stats), salience: item.salience ?? 0, stats,
        answersTo: cues.positive.map(c => ({ scene: c.text, because: c.origin })),
        staysOutOf: cues.negative.map(c => ({ scene: c.text, because: c.origin })) },
      outcomes: feedback.map(f => ({ kind: f.kind, scene: f.scene?.scene, reason: f.reason, at: iso(f.at), revision: f.revision, evidence: f.evidence })),
      history: this.revisions(id).map(r => r.item
        ? { at: iso(r.at), reason: r.reason, revision: r.item.revision, status: r.item.status, text: r.item.text }
        : { at: iso(r.at), reason: r.reason, changed: Object.keys(r.dynamics ?? {}) }),
    };
  },
  explain(request) {
    const event = this.log.event(request);
    if (!event) return null;
    const events = this.log.events(event.scope, event.sessionId), at = events.findIndex(e => e.id === request);
    const reply = at >= 0 ? events.slice(at + 1).find(e => e.role === "assistant") : null;
    const traces = this.traces(request);
    const readings = traces.filter(t => t.scene || t.error).map(t => ({
      at: iso(t.at), scene: t.scene, charter: t.charter, error: t.error,
      considered: (t.candidates ?? []).map(c => ({ id: c.item.id, text: cut(c.item.text, 160), score: c.score,
        matched: c.cue && { scene: c.cue, because: c.origin }, via: c.via, entity: c.entity || undefined, due: c.due || undefined })),
      heldBack: t.heldBack,
      decisions: (t.decisions ?? []).map(d => ({ id: d.id, use: d.use, reason: d.reason, anchor: d.anchor, dropped: d.dropped, adjusted: d.adjusted })),
      delivered: (t.delivered ?? []).map(i => ({ id: i.id, use: i.use, text: i.text, anchor: i.anchor, because: i.relevance, expect: i.expect,
        matched: i.matched, revision: i.revision, evidence: i.evidence })),
      // Rounds of earlier conversation it was given, as they were said.
      record: (t.passages ?? []).map(p => ({ id: p.id, on: iso(p.at)?.slice(0, 10), use: p.use, said: p.said, replied: p.replied, ...(p.sensitive ? { sensitive: true } : {}), because: p.relevance, anchor: p.anchor })),
      ...(t.inFront?.length ? { inFront: t.inFront } : {}),
      admittedBy: t.admittedBy,
      note: t.text,
    }));
    return {
      request: { id: request, text: event.content, at: iso(event.occurredAt ?? event.observedAt) },
      reply: reply ? { id: reply.id, text: cut(reply.content, 2000) } : null,
      readings,
      // What the answering model itself said it relied on.
      premises: traces.filter(t => t.declared).map(t => ({ text: t.premise, items: t.used, at: iso(t.at) })),
      // What later records showed about the memories used here.
      outcomes: this.feedback().filter(f => f.request === request).map(f => ({ item: f.item, kind: f.kind, reason: f.reason, at: iso(f.at), evidence: f.evidence })),
    };
  },
};
