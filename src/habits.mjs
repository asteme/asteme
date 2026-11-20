// Habits: the few things earned often enough to be present in every reply.
// Promotion into the always-present core is gated by program-visible
// repetition, then worded by the model. Every habit keeps the source items and
// exact quotes, so it can be demoted or erased later.
import { digest, cut } from "./log.mjs";
import { iso, isEvidence } from "./mind.mjs";
import { LIVE, norm } from "./memory.mjs";
import { NEGATIVE } from "./outcome.mjs";
import { habitPrompt } from "./prompts.mjs";

export const habits = {
  habits() { return this.core().habits ?? {}; },
  habitLog() { return this.log.state(`habits:${this.owner}`, {}); },
  habitSummary() {
    const habits = this.habits();
    return Object.entries(this.habitLog()).map(([key, entry]) => ({
      key, status: entry.status, text: entry.text, reason: entry.reason, at: entry.at,
      from: entry.from, tested: entry.tested, hypothesis: entry.hypothesis,
      demotedAt: entry.demotedAt, demoteReason: entry.demoteReason,
      active: entry.status === "active" && habits[key] === entry.text,
    }));
  },
  saveHabitLog(value) { return this.log.save(`habits:${this.owner}`, value); },
  // A correction is a user message that answers an assistant message. Structural
  // only: whether the reason is shared stays a judgment for the model.
  corrections(item) {
    const out = [];
    for (const ref of item.evidence ?? []) {
      const e = this.log.event(ref.id);
      if (!e || e.role !== "user" || (e.content ?? "").length > 600) continue;
      const seq = this.log.events(e.scope, e.sessionId), at = seq.findIndex(x => x.id === e.id);
      const prev = seq.slice(0, Math.max(0, at)).reverse().find(x => ["user", "assistant"].includes(x.role));
      if (prev?.role === "assistant" && (e.occurredAt ?? e.observedAt) >= (prev.occurredAt ?? prev.observedAt)) out.push(e);
    }
    return [...new Map(out.map(e => [e.id, e])).values()];
  },
  promotable(now = this.log.now()) {
    const feedback = this.feedback(), out = [];
    for (const item of this.items()) {
      // A sensitive record is remembered, searched and corrected, but it never
      // becomes an always-present habit.
      if (item.sensitive?.length) continue;
      // The always-present layer reaches every reply, so a wrong entry there
      // does the most harm. Nothing enters it that the user did not say.
      if (this.grounds(item) === "seen") continue;
      const mine = feedback.filter(f => f.item === item.id && f.revision === item.revision);
      const helped = mine.filter(f => f.kind === "helped" && f.reason);
      const newest = helped.reduce((at, f) => Math.max(at, f.at), 0);
      // An understanding already summarized stays settled. A demoted habit is
      // only reconsidered after new helpful outcomes, never on the old ones.
      if (Object.values(this.habitLog()).some(h => (h.from ?? []).includes(item.id) &&
        (h.status === "active" || (h.demotedAt ?? 0) >= newest))) continue;
      if (mine.some(f => NEGATIVE.includes(f.kind) && f.at >= newest)) continue; // Later dissatisfaction reopens it.
      const scenes = [...new Set(helped.map(f => f.scene?.scene).filter(Boolean))];
      const corrections = this.corrections(item);
      // Declined on exactly this evidence already: wait for more.
      if (this.log.state(this.habitAsked(item, helped, corrections))) continue;
      if (helped.length >= 2 && scenes.length >= 2)
        out.push({ item, basis: "helped in distinct scenes", helped, corrections });
      else if (item.certainty === "explicit" && corrections.length >= 2 &&
        new Set(corrections.map(e => e.sessionId)).size >= 2)
        out.push({ item, basis: "corrected in distinct exchanges", helped, corrections });
    }
    return out;
  },
  // Asked again when the evidence has roughly doubled, not at every new outcome.
  habitAsked(item, helped, corrections) {
    const step = n => Math.floor(Math.log2(Math.max(1, n)));
    return `habit-asked:${this.owner}:${digest([item.id, item.revision, step(helped.length), step(corrections.length)])}`;
  },
  demotable(now = this.log.now()) {
    const closed = this.items({ closed: true }), feedback = this.feedback(), out = [];
    for (const [key, entry] of Object.entries(this.habitLog())) {
      if (entry.status !== "active" || this.habits()[key] !== entry.text) continue;
      const sources = closed.filter(i => (entry.from ?? []).includes(i.id));
      const lost = sources.length < new Set(entry.from ?? []).size ||
        sources.every(i => i.paused || !LIVE.includes(i.status));
      const irrelevant = feedback.filter(f => (entry.from ?? []).includes(f.item) && f.at > entry.at && NEGATIVE.includes(f.kind));
      const scenes = new Set(irrelevant.map(f => f.scene?.scene).filter(Boolean));
      if (this.log.state(`habit-drop-asked:${this.owner}:${digest([key, entry.text, lost, irrelevant.length])}`)) continue;
      if (lost) out.push({ key, text: entry.text, entry, basis: "sources retired, paused or erased", irrelevant });
      else if (irrelevant.length >= 2 && scenes.size >= 2)
        out.push({ key, text: entry.text, entry, basis: "unhelpful in distinct scenes", irrelevant });
    }
    return out;
  },
  // What the user asked and what the assistant actually wrote in one scene.
  // Context for judging a rule; only the cited records are evidence.
  delivery(feedback) {
    const request = this.log.event(feedback.request);
    if (!request) return {};
    const events = this.log.events(request.scope, request.sessionId);
    const at = events.findIndex(e => e.id === request.id);
    const reply = at >= 0 ? events.slice(at + 1).find(e => e.role === "assistant") : null;
    return { asked: cut(request.content, 300), did: cut(reply?.content, 500) };
  },
  habitEvidence(refs, from, byId) {
    // A habit may quote the understanding's own source and the later outcome
    // records that made it repeat; nothing else.
    const allowed = new Set(from.flatMap(id => [
      ...byId.get(id).item.evidence.map(e => e.id),
      ...(byId.get(id).helped ?? []).flatMap(f => (f.evidence ?? []).map(e => e.id)),
    ]));
    if (!Array.isArray(refs) || !refs.length) throw Error("a habit needs its exact evidence");
    return refs.map(r => {
      if (typeof r?.id !== "string" || typeof r?.quote !== "string" || !r.quote.trim()) throw Error("a habit needs its exact evidence");
      if (!allowed.has(r.id)) throw Error("habit evidence is outside the cited understanding");
      const e = this.log.event(r.id);
      if (!e || e.erased || !isEvidence(e) || !e.content.includes(r.quote)) throw Error("a habit needs its exact evidence");
      return { id: r.id, quote: r.quote };
    });
  },
  promote(op, byId, record, now, report) {
    const text = typeof op.text === "string" ? op.text.trim() : "", reason = typeof op.reason === "string" ? op.reason.trim() : "";
    if (text.length < 8 || text.length > 300) throw Error("a habit is one short sentence");
    if (!reason || reason.length > 400) throw Error("a habit needs a reason");
    const from = [...new Set((op.from ?? []).filter(id => typeof id === "string"))];
    if (!from.length || from.some(id => !byId.has(id))) throw Error("a habit must summarize established understanding");
    const key = /^[a-z0-9][a-z0-9._-]{1,39}$/i.test(String(op.key ?? "")) ? String(op.key).toLowerCase() : `h-${digest(text).slice(0, 10)}`;
    if (record[key]?.status === "active" && record[key].text === text) return;
    const p = this.core();
    // A habit may not restate, and so quietly take the place of, something the
    // user chose explicitly: a name, an agreement, the purpose or a value.
    if ([p.name, p.userName, p.purpose, ...(p.commitments ?? []), ...(p.values ?? [])].some(v => v && norm(v) === norm(text)))
      throw Error("this is already an explicit core choice");
    if (!(key in (p.habits ?? {})) && Object.keys(p.habits ?? {}).length >= 12) throw Error("too many habits for a one-page core");
    const evidence = this.habitEvidence(op.evidence, from, byId);
    const receipt = `habit-op:${this.owner}:${digest({ op: "set", key, text, from })}`;
    if (this.log.state(receipt)) return;
    const habits = { ...(p.habits ?? {}), [key]: text }, next = { ...p, habits };
    if (JSON.stringify(next).length > 4000) throw Error("core exceeds one-page implementation budget");
    const tested = cut(op.tested, 300), hypothesis = cut(op.hypothesis, 300);
    if (!tested || !hypothesis) throw Error("a habit states where it applies and what remains untested");
    this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, "core",
      JSON.stringify({ at: now, before: { habits: p.habits ?? {} }, habit: { key, text }, from, evidence, reason, tested, hypothesis }));
    // Like an explicit core choice, this is not a later manual edit.
    this.log.save(`profile:${this.owner}`, next);
    record[key] = { text, at: now, reason, from, evidence, tested, hypothesis, status: "active" };
    this.saveHabitLog(record); this.log.save(receipt, true);
    report.applied.push({ op: "set", key, text });
  },
  demote(op, record, now, report) {
    const key = String(op.key ?? "").toLowerCase(), entry = record[key];
    if (!entry || entry.status !== "active") throw Error("unknown habit");
    if (!this.demotable(now).some(d => d.key === key)) throw Error("the habit's sources still hold");
    const reason = typeof op.reason === "string" ? op.reason.trim() : "";
    if (!reason) throw Error("a demotion needs a reason");
    const evidence = (op.evidence ?? []).map(r => {
      const e = this.log.event(r?.id);
      if (!e || e.erased || typeof r.quote !== "string" || !e.content.includes(r.quote)) throw Error("a demotion needs its exact evidence");
      return { id: e.id, quote: r.quote };
    });
    const p = this.core(), habits = { ...(p.habits ?? {}) };
    const receipt = `habit-op:${this.owner}:${digest({ op: "drop", key, text: entry.text })}`;
    if (this.log.state(receipt)) return;
    if (habits[key] === entry.text) {
      delete habits[key];
      this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, "core",
        JSON.stringify({ at: now, before: { habits: p.habits ?? {} }, habit: { key, text: entry.text, demoted: true }, reason, evidence }));
      this.log.save(`profile:${this.owner}`, { ...p, habits });
    }
    record[key] = { ...entry, status: "demoted", demotedAt: now, demoteReason: reason };
    this.saveHabitLog(record); this.log.save(receipt, true);
    report.applied.push({ op: "drop", key });
  },
  forgetHabit(key, reason = "Removed by the user") {
    this.log.transaction(() => {
      const record = this.habitLog(), entry = record[key], p = this.core(), habits = { ...(p.habits ?? {}) };
      if (!entry && !(key in habits)) throw Error("unknown habit");
      const text = habits[key] ?? entry?.text;
      if (key in habits) {
        delete habits[key];
        this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, "core",
          JSON.stringify({ at: this.log.now(), before: { habits: p.habits ?? {} }, habit: { key, text, demoted: true }, reason, evidence: entry?.evidence ?? [] }));
        this.log.save(`profile:${this.owner}`, { ...p, habits });
      }
      if (entry) { record[key] = { ...entry, status: "demoted", demotedAt: this.log.now(), demoteReason: reason }; this.saveHabitLog(record); }
    });
  },
  // A habit the user removed can be put back as it was, with its provenance.
  restoreHabit(key) {
    this.log.transaction(() => {
      const record = this.habitLog(), entry = record[key], p = this.core();
      if (!entry || entry.status !== "demoted") throw Error("unknown habit");
      const habits = { ...(p.habits ?? {}), [key]: entry.text };
      if (Object.keys(habits).length > 12 || JSON.stringify({ ...p, habits }).length > 4000) throw Error("too many habits for a one-page core");
      this.log.db.prepare("INSERT INTO experience_history(owner,id,data) VALUES (?,?,?)").run(this.owner, "core",
        JSON.stringify({ at: this.log.now(), before: { habits: p.habits ?? {} }, habit: { key, text: entry.text }, from: entry.from, evidence: entry.evidence ?? [], reason: "Restored by the user" }));
      this.log.save(`profile:${this.owner}`, { ...p, habits });
      const { demotedAt, demoteReason, ...kept } = entry;
      record[key] = { ...kept, status: "active", at: this.log.now() };
      this.saveHabitLog(record);
    });
  },
  async consolidate({ infer, now = this.log.now() }) {
    const candidates = this.promotable(now), drops = this.demotable(now);
    const report = { at: now, basis: { candidates: candidates.map(c => ({ id: c.item.id, basis: c.basis })), drops: drops.map(d => d.key) }, applied: [], rejected: [] };
    if (!candidates.length && !drops.length) return report;
    const value = await infer("asteme-habit", habitPrompt({
      now: iso(now), core: this.charter(), habits: this.habitSummary(),
      candidates: candidates.map(c => ({
        id: c.item.id, basis: c.basis, text: c.item.text, concrete: c.item.concrete, general: c.item.general,
        certainty: c.item.certainty, tested: c.item.tested, hypothesis: c.item.hypothesis,
        outcomes: c.helped.map(f => ({ ...this.delivery(f), scene: f.scene?.scene, kind: f.kind, reason: cut(f.reason, 300), at: iso(f.at),
          evidence: (f.evidence ?? []).map(e => ({ id: e.id, quote: cut(e.quote, 300) })) })),
        corrections: c.corrections.slice(0, 4).map(e => ({ id: e.id, at: iso(e.occurredAt ?? e.observedAt), text: cut(e.content, 400) })),
        evidence: c.item.evidence.map(e => ({ id: e.id, quote: cut(e.quote, 300) })),
      })),
      drops: drops.map(d => ({
        key: d.key, text: d.text, basis: d.basis, at: iso(d.entry.at),
        sources: (d.entry.from ?? []).map(id => { const i = this.item(id); return i && { id, text: i.text, status: i.status, paused: !!i.paused }; }).filter(Boolean),
        outcomes: d.irrelevant.slice(0, 4).map(f => ({ scene: f.scene?.scene, kind: f.kind, reason: cut(f.reason, 300), at: iso(f.at) })),
      })),
    }), 2600);
    const proposals = Array.isArray(value?.habits) ? value.habits : [];
    // Diagnostics for the settings panel: a silent "no habit" must be visible.
    report.response = Array.isArray(value?.habits) ? { habits: proposals.length } : { unexpected: cut(JSON.stringify(value ?? null), 1200) };
    report.skipped = (Array.isArray(value?.skip) ? value.skip : [])
      .map(s => ({ candidate: s?.candidate ?? s?.id ?? null, reason: cut(s?.reason, 300) }))
      .filter(s => s.reason);
    if (!report.applied.length && !report.rejected.length && !Array.isArray(value?.habits)) report.raw = cut(JSON.stringify(value ?? null), 1500);
    const byId = new Map(candidates.map(c => [c.item.id, c])), record = this.habitLog();
    this.log.transaction(() => {
      for (const op of proposals) try {
        if (op?.op === "drop") this.demote(op, record, now, report);
        else this.promote(op ?? {}, byId, record, now, report);
      } catch (e) { report.rejected.push({ habit: op, reason: e.message }); }
      // Whatever was asked and not acted on is settled for the evidence it was
      // asked with. New outcomes reopen it; time alone does not.
      const promoted = new Set(Object.values(record).filter(h => h.status === "active").flatMap(h => h.from ?? []));
      for (const c of candidates) if (!promoted.has(c.item.id)) this.log.save(this.habitAsked(c.item, c.helped, c.corrections), { at: now });
      for (const d of drops) if (record[d.key]?.status === "active")
        this.log.save(`habit-drop-asked:${this.owner}:${digest([d.key, d.text, d.basis.startsWith("sources"), d.irrelevant.length])}`, { at: now });
    });
    return report;
  },
};
