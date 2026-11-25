// Outcomes: what happened after a memory was used, and what that does to the
// memory. This is the half of the loop that "store and retrieve" leaves out.
//
// An outcome is a fact about one scene, grounded in a later record. From the
// set of outcomes the code derives, every time it is asked:
//   - the scenes a memory answers to and stays out of   (recall.mjs: cues)
//   - how easily it comes to mind                        (accessibility)
//   - whether its content has to be looked at again      (queued for sleep)
// Nothing is counted twice, and nothing fades because time passed.
import { cut } from "./log.mjs";
import { JUDGE, judgeOutcome } from "./judge.mjs";
import { iso, endedOf, ratingOf } from "./mind.mjs";
import { LIVE, evidenceOf } from "./memory.mjs";
import { outcomePrompt } from "./prompts.mjs";

// helped: it was right and its use worked.   missed: it was needed and not recalled.
// irrelevant: right, but it did not belong in that scene.   wrong: its content was wrong.
// unused: it was delivered and the reply did not apply it.   judgment: a judgment of
// the assistant's was later supported or refuted.
export const OUTCOMES = ["helped", "irrelevant", "missed", "judgment", "wrong", "unused"];
const EXTERNAL = ["helped", "irrelevant", "judgment", "wrong"];
export const NEGATIVE = ["irrelevant", "wrong"];

/** Distinct scenes per outcome kind. A repeated scene is one piece of evidence. */
export function useStats(feedback, revision) {
  const scenes = (kind, current = false) => new Set(feedback
    .filter(f => f.kind === kind && (!current || f.revision === revision))
    .map(f => f.scene?.scene ?? f.request)).size;
  return { helped: scenes("helped"), missed: scenes("missed"), irrelevant: scenes("irrelevant"), wrong: scenes("wrong", true), unused: scenes("unused") };
}

/**
 * How easily a memory comes to mind, in (0, 1]. It starts undecided at 0.5,
 * rises with scenes where it helped or was missed, and falls with scenes where
 * it did not belong, was wrong, or was ignored. A salient memory resists the
 * fall. It never reaches zero: a hard-to-recall memory is still there for a
 * strong enough cue and for deliberate search. Age is not an input.
 */
export function accessibility(item, stats) {
  const up = stats.helped + stats.missed, down = stats.irrelevant + 2 * stats.wrong + 0.5 * stats.unused;
  const utility = (1 + up) / (2 + up + down);
  const kept = utility ** (1 - 0.5 * Math.min(1, Math.max(0, item.salience ?? 0)));
  const standing = { active: 1, doubtful: 0.7 }[item.status] ?? 0.15;
  return Math.max(0.02, Number((kept * standing).toFixed(4)));
}

export const outcome = {
  feedback() {
    return this.log.db.prepare("SELECT data FROM experience_feedback WHERE owner=? ORDER BY json_extract(data,'$.at') DESC").all(this.owner).map(r => JSON.parse(r.data))
      .filter(f => this.intact(f.request) && f.evidence.every(e => this.intact(e.id)));
  },
  assess(feedback, events, known, traces) {
    const report = { applied: [], rejected: [] };
    for (const f of feedback) try {
      const trace = traces.find(t => t.id === f.trace && t.scene), item = known.find(i => i.id === f.item);
      if (!trace || !item || !f.reason || !OUTCOMES.includes(f.kind)) throw Error("unknown scene, item or outcome");
      const delivered = trace.delivered?.some(i => i.id === f.item);
      if (f.kind === "missed" ? delivered : !delivered) throw Error("outcome contradicts actual delivery");
      if (f.kind === "helped" && f.applied === "no") throw Error("credit needs use: the reply did not apply this item");
      const request = this.log.event(trace.request);
      const created = this.log.db.prepare("SELECT data FROM experience_history WHERE owner=? AND id=? ORDER BY seq LIMIT 1").get(this.owner, item.id);
      if (!request || !created || JSON.parse(created.data).at > trace.at) throw Error("no subsequent external outcome");
      let raw = [], at = trace.at;
      if (f.kind === "unused") {
        // Not using a memory leaves no later record to quote. It is the one
        // outcome read from the reply itself, and it carries the least weight.
        if (f.applied !== "no") throw Error("unused needs a reply that did not apply the item");
      } else {
        raw = this.evidence(f.evidence, events);
        at = Math.max(...raw.map(e => e.occurredAt ?? e.observedAt));
        if (!raw.some(e => ["user", "tool"].includes(e.role) && (e.occurredAt ?? e.observedAt) >= (request.occurredAt ?? request.observedAt) &&
              (e.id !== trace.request || f.kind === "missed"))) throw Error("no subsequent external outcome");
      }
      const old = this.log.db.prepare("SELECT data FROM experience_feedback WHERE owner=? AND request=? AND item=?").get(this.owner, trace.request, f.item);
      const previous = old && JSON.parse(old.data);
      if (previous && at <= previous.at) continue; // One scene/outcome, never a growing success counter.
      if (previous?.by === "user") continue; // What the user said about this use stands.
      const value = { ...f, evidence: f.kind === "unused" ? [] : f.evidence, request: trace.request, scene: trace.scene, at, revision: item.revision };
      this.log.db.prepare("INSERT INTO experience_feedback VALUES (?,?,?,?) ON CONFLICT(owner,request,item) DO UPDATE SET data=excluded.data").run(this.owner, trace.request, f.item, JSON.stringify(value));
      this.reconsolidate(value, item, trace);
      report.applied.push(value);
    } catch (e) { report.rejected.push({ feedback: f, reason: e.message }); }
    return report;
  },
  // What one outcome changes beyond its own row. The scene itself already
  // counts: cues and accessibility are derived from the outcome table. Here the
  // code decides only whether the content has to be read again, and by whom.
  reconsolidate(f, item, trace) {
    const reason = cut(f.reason, 200);
    if (f.kind === "wrong") {
      const current = this.item(item.id);
      if (current && current.revision === item.revision && LIVE.includes(current.status) && !current.paused) {
        this.write({ ...current, status: "doubtful", revision: current.revision + 1,
          // Why it is in doubt, in words, whoever said so: a later record or the user directly.
          doubt: { reason, at: f.at, by: f.by ?? "model" },
          against: [...(current.against ?? []), ...f.evidence.map(e => ({ id: e.id, quote: e.quote, reason }))] }, `Outcome showed it was wrong: ${reason}`);
        this.propagate(item.id, "was contradicted by what happened next");
      }
      this.enqueue("revise", item.id, 0.9, { reasons: [`Its use was shown to be wrong: ${reason}`] });
      this.stir(trace.request, 0.3, "A delivered memory turned out to be wrong");
    } else if (f.kind === "irrelevant") {
      // Asked when it has been out of place in two scenes, then again only
      // when that number has doubled since the last answer: the scenes it
      // stays out of already do the day-to-day work.
      const mine = this.feedback().filter(x => x.item === item.id && x.kind === "irrelevant");
      const count = new Set(mine.map(x => x.scene?.scene ?? x.request)).size, last = this.log.state(`revised:${this.owner}:${item.id}`, null);
      if (count >= 2 && count >= 2 * (last?.irrelevant ?? 0))
        this.enqueue("revise", item.id, 0.6, { reasons: [`It did not belong in ${count} different scenes; its stated scope may be too wide`] });
    } else if (f.kind === "helped") {
      // Success outside the scenes it was learned in is the evidence that a
      // hypothesis has become established scope.
      const origin = trace.candidates?.find(c => c.item?.id === item.id)?.origin;
      const last = this.log.state(`revised:${this.owner}:${item.id}`, null);
      if (["anticipated", "imagined"].includes(origin) && !(last?.widened ?? []).includes(trace.scene?.scene))
        this.enqueue("revise", item.id, 0.3, { reasons: [`It helped in a scene beyond where it was learned: ${cut(trace.scene?.scene, 160)}`] });
      // Memories that help together come to mind together.
      const helped = new Set(this.feedback().filter(x => x.request === trace.request && x.kind === "helped").map(x => x.item));
      for (const other of helped) if (other !== item.id) {
        const [a, b] = [item.id, other].sort();
        const tie = this.links(a).find(l => l.type === "coactive" && l.src === a && l.dst === b);
        this.link(a, b, "coactive", { weight: (tie?.weight ?? 0) + 1, at: f.at });
      }
    }
    // An expectation that failed is a surprise; surprises are looked at first.
    if (f.surprise === true) {
      this.raiseSalience(item.id, (this.dynamics(item.id).salience ?? 0) + 0.2, "Its use did not go as expected");
      this.stir(trace.request, 0.3, "An expectation about this memory failed");
    }
  },
  // Deferred credit assignment. Reflection runs when a turn ends, so the
  // outcome cannot exist yet. This is the only place that reads later records.
  outcomeCandidates(now = this.log.now(), { delay = 60000, limit = 24 } = {}) {
    const rows = this.log.db.prepare(`SELECT data FROM attention WHERE owner=? AND json_extract(data,'$.scene') IS NOT NULL
      AND json_array_length(json_extract(data,'$.delivered')) > 0 ORDER BY json_extract(data,'$.at') DESC LIMIT ?`)
      .all(this.owner, limit).map(r => JSON.parse(r.data));
    const feedback = this.feedback(), out = [];
    for (const trace of rows) {
      if (now - trace.at < delay) continue;
      const request = this.log.event(trace.request);
      if (!request) continue;
      const events = this.log.events(request.scope, request.sessionId);
      const at = events.findIndex(e => e.id === request.id);
      if (at < 0) continue;
      const reply = events.slice(at + 1).find(e => e.role === "assistant");
      const later = events.slice(at + 1).filter(e => e.role === "user" && e.content &&
        (e.occurredAt ?? e.observedAt) > trace.at).slice(-3);
      if (!later.length) continue;
      const items = (trace.delivered ?? []).filter(i => !feedback.some(f => f.request === trace.request && f.item === i.id));
      if (!items.length) continue;
      const marker = this.log.state(`outcome-check:${trace.id}`, null);
      if (marker && marker.last === later.at(-1).id) continue;
      // How the turn that carried the reply ended, when it did not simply
      // finish: the user stopping it is a fact about the reply.
      const ended = endedOf(events.slice(at + 1));
      // The user's own thumbs up or down on that reply, when the host has one.
      const rated = ratingOf(events, reply?.metadata?.messageId);
      out.push({ trace, request, reply, later, items, ...(ended ? { ended } : {}), ...(rated ? { rated } : {}) });
    }
    return out;
  },
  // judge is optional. mode says who reads the outcome when there is one:
  // "model" (the judge only when the model fails), "shadow" (both; the model's
  // reading counts and the judge's is kept beside it) or "judge".
  async outcomes({ infer, judge = null, mode = "model", now = this.log.now(), limit = 2, delay }) {
    const report = { at: now, checked: [], applied: [], rejected: [] };
    for (const c of this.outcomeCandidates(now, delay === undefined ? {} : { delay }).slice(0, limit)) {
      const current = new Map(this.items({ closed: true }).map(i => [i.id, i]));
      const delivered = c.items.map(i => ({ snapshot: i, item: current.get(i.id) }));
      // A revised understanding no longer matches what was delivered.
      const usable = delivered.filter(x => x.item && x.item.revision === x.snapshot.revision).map(x => x.item);
      if (!usable.length) {
        this.log.save(`outcome-check:${c.trace.id}`, { at: now, last: c.later.at(-1).id, skipped: "item revised" });
        continue;
      }
      const viaModel = async () => {
        const value = await infer("asteme-outcome", outcomePrompt({
          now: iso(now), scene: c.trace.scene, ...(c.ended ? { turnEnded: c.ended } : {}), ...(c.rated ? { replyRated: c.rated } : {}),
          delivered: c.items.map(i => ({ id: i.id, use: i.use, text: i.text, anchor: i.anchor, expect: i.expect })),
          asked: cut(c.request.content, 800), replied: cut(c.reply?.content, 1200),
          later: c.later.map(evidenceOf),
        }), 1600);
        return Array.isArray(value?.feedback) ? value.feedback : [];
      };
      // A judge's reading is recorded only when it is confident, and never as
      // "unclear": no record is better than a guessed one.
      const viaJudge = async () => {
        const read = await judgeOutcome(judge, { asked: c.request.content, reply: c.reply?.content, later: c.later, items: usable, ended: c.ended, rated: c.rated });
        marker.judge = read.map(r => ({ item: r.item, kind: r.kind, confidence: r.confidence }));
        return read.filter(r => ["helped", "irrelevant", "wrong"].includes(r.kind) && r.confidence >= JUDGE.outcome)
          .map(r => ({ item: r.item, kind: r.kind, by: "judge", confidence: r.confidence, evidence: r.evidence,
            reason: `Read from what the user wrote next (${Math.round(r.confidence * 100)}% sure)` }));
      };
      const marker = {};
      // Read from what the user wrote next: taken back while it was being read, nothing is recorded and the delivery is read again later.
      const erased = this.log.state("erasure-revision", 0);
      let list;
      if (judge && mode === "judge") list = await viaJudge();
      else {
        const beside = judge && mode === "shadow" ? viaJudge().catch(e => { marker.judgeError = e.message; return null; }) : null;
        try { list = await viaModel(); }
        catch (e) {
          if (!judge) throw e;
          marker.modelError = e.message;
          list = beside ? (await beside) ?? (() => { throw e; })() : await viaJudge();
        }
        if (beside) await beside;
      }
      if (erased !== this.log.state("erasure-revision", 0)) continue;
      const byId = new Map(usable.map(i => [i.id, i]));
      this.log.transaction(() => {
        for (const f of list) {
          try {
            if (!byId.has(f?.item)) throw Error("outcome is for an item that was not delivered");
            // "Applied" is only believed with the words of the reply that show it.
            const applied = f.by === "judge" ? undefined
              : f.applied === "yes" && !(typeof f.reply_quote === "string" && f.reply_quote && c.reply?.content?.includes(f.reply_quote)) ? "unclear" : f.applied;
            const assessment = this.assess([{ ...f, applied, trace: c.trace.id }], c.later, [byId.get(f.item)], [c.trace]);
            report.applied.push(...assessment.applied);
            report.rejected.push(...assessment.rejected);
          } catch (e) { report.rejected.push({ feedback: f, reason: e.message }); }
        }
        this.log.save(`outcome-check:${c.trace.id}`, { at: now, last: c.later.at(-1).id, feedback: list.length, ...(c.ended ? { ended: c.ended } : {}), ...(c.rated ? { rated: c.rated.rating } : {}), ...marker });
        report.checked.push(c.trace.id);
      });
    }
    return report;
  },
};
