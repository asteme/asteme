// Sleep: the work done while nobody is waiting for a reply.
//
// Awake, the system only ever sees one turn. Asleep, it goes back over the
// record with everything else in view and does what one turn cannot:
//
//   replay     read a salient episode again, next to earlier episodes like it
//   reconcile  put two memories that may disagree side by side with their evidence
//   revise     rewrite a memory in the light of how its use turned out
//   integrate  draw one lesson from cases that turned out to be the same case
//   imagine    name future scenes where a lesson would matter, so they can call it
//   habits     promote what was earned often enough, demote what stopped holding
//
// The program decides what is worth looking at and checks every citation. The
// model reads the evidence and words the result. Sleep never touches the
// charter, and it never deletes: what it changes keeps its history.
import { digest, cut } from "./log.mjs";
import { iso, isEvidence } from "./mind.mjs";
import { secret } from "./policy.mjs";
import { LIVE, bounded, compactItem, pageRaw, norm, pairKey, sameEntity, commonNames } from "./memory.mjs";
import { useStats } from "./outcome.mjs";
import { TUNING } from "./recall.mjs";
import { salienceOf } from "./reflect.mjs";
import { replayPrompt, reconcilePrompt, revisePrompt, lessonPrompt, imaginePrompt } from "./prompts.mjs";

const DAY = 86400000;
// Reasons are read by people in the panel, so they are written as sentences.
const STOOD_OUT = { correction: "the user corrected something", surprise: "something went against what was expected", failure: "something failed",
  explicit: "the user asked for something to be remembered", commitment: "a promise was made", recurrence: "the same kind of situation had come up before" };
const cosine = (a, b) => { let dot = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? dot / Math.sqrt(na * nb) : 0; };

// When two memories are close enough to be put side by side as perhaps the same thing (closeness above what an empty scene reaches, as recall measures it),
// how many new ones are held against how many others at one look, and how many such pairs one look may add.
const SAME = { close: 0.8, fresh: 300, against: 3000, most: 12 };

// A model call whose answer is thrown away, with an error that says so, when something was taken back while the model was answering: what it read
// may be among what was taken back, and what it wrote may carry it.
export const afterErasure = (core, infer) => async (...args) => {
  const before = core.log.state("erasure-revision", 0), epoch = core.log.epoch ?? 0;
  const value = await infer(...args);
  if (before !== core.log.state("erasure-revision", 0) || epoch !== (core.log.epoch ?? 0)) throw Object.assign(new Error("Something was taken back while this was being read"), { erasedMeanwhile: true });
  return value;
};

export const sleep = {
  // A pair or a memory is judged once per state. If either side changes, the
  // question is open again.
  judgedKey(type, items) { return `judged:${this.owner}:${digest([type, ...items.map(i => [i.id, i.revision]).sort()])}`; },
  detail(item) {
    return { ...compactItem(item), reason: bounded(item.reason, 300), learnedAt: iso(item.learnedAt), lastEvidenceAt: iso(item.lastEvidenceAt),
      evidence: item.evidence.map(e => ({ id: e.id, quote: cut(e.quote, 300) })),
      against: (item.against ?? []).map(e => ({ id: e.id, quote: cut(e.quote, 300), reason: e.reason })) };
  },
  records(ids) {
    return [...new Set(ids)].map(id => this.log.event(id)).filter(e => e && !e.erased && isEvidence(e));
  },
  outcomesOf(item) {
    return this.feedback().filter(f => f.item === item.id).slice(0, 8)
      .map(f => ({ kind: f.kind, scene: cut(f.scene?.scene, 200), reason: cut(f.reason, 300), at: iso(f.at), current: f.revision === item.revision,
        evidence: (f.evidence ?? []).map(e => ({ id: e.id, quote: cut(e.quote, 300) })) }));
  },

  // --- Planning: code decides what deserves a look --------------------------
  async plan(now = this.log.now()) {
    const since = this.log.state(`plan-at:${this.owner}`, 0);
    const items = this.items(), understandings = items.filter(i => i.kind === "understanding");
    // A situation that has come up before, in another exchange, is worth
    // reading side by side with the earlier one even when nothing in it was
    // dramatic: recurrence is what lessons are made of, and it is something
    // the program can see for itself. Each episode is checked once.
    const all = this.episodes(), unchecked = all.filter(e => !e.recurrenceChecked && e.scene);
    if (unchecked.length && all.length >= 2 && this.embed) {
      const vectors = await this.vectors(all.filter(e => e.scene).map(e => e.scene), "passage");
      const nulls = await this.vectors(TUNING.nullScenes, "query");
      if (vectors && nulls) for (const e of unchecked.sort((a, b) => a.at - b.at)) {
        const mine = vectors.get(e.scene), floor = Math.max(...[...nulls.values()].map(n => cosine(n, mine)));
        const informative = [...nulls.values()].some(n => cosine(n, mine) < 0.999);
        const earlier = !informative ? [] : all.filter(o => o.id !== e.id && o.sessionId !== e.sessionId && o.scene && o.at <= e.at &&
          (cosine(mine, vectors.get(o.scene)) - floor) / Math.max(1e-6, 1 - floor) >= TUNING.fit.strong);
        // Once per situation: when an earlier exchange like this one was already
        // read again, or already marked as recurring, the cross-reading has
        // been done. From then on only what stands out brings it back.
        const recurs = earlier.length > 0 && !earlier.some(o => o.replays > 0 || o.signals.some(s => s.kind === "recurrence"));
        if (recurs) e.signals = [...e.signals, { kind: "recurrence", strength: "mild", by: "code" }];
        e.salience = Math.max(e.salience, salienceOf(e.signals)); e.recurrenceChecked = true;
        this.saveEpisode(e);
      }
    }
    // Replay goes to what stood out, not to what is recent. A second pass is
    // reserved for episodes that stood out strongly.
    for (const e of this.episodes()) {
      if (e.salience >= 0.3 && e.replays === 0) this.enqueue("replay", e.id, e.salience, { reasons: [`It stood out: ${e.signals.map(s => STOOD_OUT[s.kind] ?? s.kind).join(", ")}`] });
      else if (e.salience >= 0.6 && e.replays === 1 && now - (e.lastReplayAt ?? 0) > DAY) this.enqueue("replay", e.id, e.salience * 0.5, { reasons: ["Stood out strongly; read once more"] });
    }
    // Possible disagreements: the same subject named twice, or a changed memory
    // that shares a named person or thing with another.
    const pair = (a, b, priority, reason) => {
      if (a.id === b.id || this.log.state(this.judgedKey("reconcile", [a, b]))) return;
      this.enqueue("reconcile", pairKey(a.id, b.id), priority, { reasons: [reason] });
    };
    const bySubject = new Map();
    for (const i of understandings) if (i.about) bySubject.set(norm(i.about), [...(bySubject.get(norm(i.about)) ?? []), i]);
    // Each with the two after it, not each with every other: a subject with thirty memories would otherwise ask for four hundred comparisons, where a disagreement
    // between two that are far apart is reached through the ones between them.
    for (const group of bySubject.values()) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < Math.min(group.length, a + 3); b++)
      pair(group[a], group[b], 0.6, "Two memories are about the same subject");
    const who = this.core?.() ?? {}, common = commonNames(understandings, [who.name, who.userName]);
    for (const changed of understandings.filter(i => (i.lastEvidenceAt ?? 0) > since)) {
      const names = (changed.entities ?? []).filter(n => !common.has(norm(n)));
      understandings.filter(o => o.id !== changed.id && (o.entities ?? []).some(e => names.some(n => sameEntity(e, n))))
        .slice(0, 2).forEach(other => pair(changed, other, 0.3, "A memory that changed names the same person or thing as another"));
    }
    // The same thing noted twice, in other words: two memories whose words mean nearly the same, whatever subject each was filed under and whether or not
    // they name anyone. Only these two ways above put memories side by side, and a thing said again a week later in other words was neither: it stayed
    // twice, and memories only grew. Each memory noted since the last look is held against every other, and the nearest is put side by side with it when
    // it is very near; what to do (one, both, or one in place of the other) is decided there, as for any other pair. A few at a time.
    const fresh = understandings.filter(i => LIVE.includes(i.status) && (i.lastEvidenceAt ?? i.learnedAt ?? 0) > since && i.text).slice(-SAME.fresh);
    if (fresh.length && understandings.length >= 2 && this.embed) {
      const live = understandings.filter(i => LIVE.includes(i.status) && i.text).slice(-SAME.against);
      const vectors = await this.vectors(live.map(i => i.text), "passage");
      const nulls = await this.vectors(TUNING.nullScenes, "query");
      if (vectors && nulls) {
        let put = 0;
        for (const a of fresh) {
          const va = vectors.get(a.text);
          if (!va || ![...nulls.values()].some(n => cosine(n, va) < 0.999)) continue;
          const floor = Math.max(...[...nulls.values()].map(n => cosine(n, va)));
          let best = null, near = -1;
          for (const b of live) {
            if (b.id === a.id || (a.level === "lesson") !== (b.level === "lesson") || (a.premises ?? []).includes(b.id) || (b.premises ?? []).includes(a.id)) continue;
            const s = cosine(va, vectors.get(b.text));
            if (s > near) { near = s; best = b; }
          }
          if (best && (near - floor) / Math.max(1e-6, 1 - floor) >= SAME.close && put < SAME.most) {
            const before = this.jobs().length;
            pair(a, best, 0.5, "Two memories may say the same thing in other words");
            if (this.jobs().length > before) put++;
          }
        }
      }
    }
    // Possible lessons: two cases from different exchanges whose general
    // situations are each other's nearest, and nearer than an empty scene.
    const inLesson = new Set(items.filter(i => i.level === "lesson").flatMap(i => i.premises ?? []));
    const cases = understandings.filter(i => i.level === "case" && i.status === "active" && !i.sensitive?.length && !inLesson.has(i.id) && i.general).slice(-200);
    if (cases.length >= 2 && this.embed) {
      const vectors = await this.vectors(cases.map(c => c.general), "passage");
      const nulls = await this.vectors(TUNING.nullScenes, "query");
      if (vectors && nulls) {
        const v = c => vectors.get(c.general), floor = c => Math.max(...[...nulls.values()].map(n => cosine(n, v(c))));
        const sessions = c => new Set(c.evidence.map(e => this.log.event(e.id)?.sessionId));
        const nearest = new Map(cases.map(c => [c.id, cases.filter(o => o !== c).map(o => ({ o, s: cosine(v(c), v(o)) })).sort((x, y) => y.s - x.s).slice(0, 2)]));
        for (const a of cases) for (const { o: b, s } of nearest.get(a.id)) {
          if (a.id > b.id || !nearest.get(b.id).some(x => x.o === a)) continue;
          if (![...sessions(b)].some(id => !sessions(a).has(id))) continue;
          if (s <= Math.max(floor(a), floor(b)) && [...nulls.values()].some(n => cosine(n, v(a)) < 0.999)) continue;
          if (this.log.state(this.judgedKey("integrate", [a, b]))) continue;
          this.enqueue("integrate", pairKey(a.id, b.id), 0.4 + 0.2 * Math.max(a.salience ?? 0, b.salience ?? 0), { reasons: ["Two things noted in different conversations describe the same kind of situation"] });
        }
      }
    }
    // Future scenes are imagined for what has proved itself or stood out.
    const feedback = this.feedback();
    for (const i of understandings) {
      if (i.imagined?.length || i.status !== "active" || i.sensitive?.length || this.log.state(this.judgedKey("imagine", [i]))) continue;
      const helped = useStats(feedback.filter(f => f.item === i.id), i.revision).helped;
      if (i.level === "lesson" || helped >= 1 || (i.salience ?? 0) >= 0.5) this.enqueue("imagine", i.id, 0.2, { reasons: ["It has proved itself, so situations it has not met yet should be able to call it up"] });
    }
    this.log.save(`plan-at:${this.owner}`, now);
  },
  lastSleep() { return this.log.state(`sleep-last:${this.owner}`, null); },
  // Why the background work is, or is not, doing anything right now. Counts
  // only; nothing here calls a model. Meant for the panel and for a host
  // harness that wants to know what a short run could not have triggered.
  diagnose(now = this.log.now(), { delay = 60000 } = {}) {
    const feedback = this.feedback();
    const traces = this.log.db.prepare(`SELECT data FROM attention WHERE owner=? AND json_extract(data,'$.scene') IS NOT NULL
      AND json_array_length(json_extract(data,'$.delivered')) > 0 ORDER BY json_extract(data,'$.at') DESC LIMIT 24`).all(this.owner).map(r => JSON.parse(r.data));
    const waiting = [];
    let assessed = 0;
    for (const trace of traces) {
      const open = (trace.delivered ?? []).filter(i => !feedback.some(f => f.request === trace.request && f.item === i.id));
      if (!open.length) { assessed++; continue; }
      const request = this.log.event(trace.request);
      const later = request ? this.log.events(request.scope, request.sessionId).filter(e => e.role === "user" && e.content && e.id !== request.id && (e.occurredAt ?? e.observedAt) > trace.at) : [];
      const marker = this.log.state(`outcome-check:${trace.id}`, null);
      // code is what a panel translates; because is the same thing in English.
      const [code, because] = now - trace.at < delay ? ["recent", "too recent to judge"]
        : !later.length ? ["no-later-message", "the user has not written again in that conversation"]
        : marker?.last === later.at(-1).id ? ["read-nothing", "the later message was read and said nothing about it"]
        : ["ready", "ready to be read"];
      waiting.push({ request: trace.request, at: trace.at, items: open.length, code, because });
    }
    const episodes = this.episodes(), jobs = this.jobs(), cases = this.items().filter(i => i.kind === "understanding" && i.level === "case");
    const count = list => list.reduce((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {});
    const idle = [], codes = [];
    const say = (code, text, params) => { idle.push(text); codes.push({ code, ...(params ? { params } : {}) }); };
    if (!jobs.length) {
      const highest = episodes.length ? Math.max(...episodes.map(e => e.salience)) : 0;
      if (!episodes.length) say("no-reflection", "no turn has been reflected on yet");
      else if (!episodes.some(e => e.salience >= 0.3)) say("nothing-stood-out", `no exchange stood out (highest salience ${highest}, replay starts at 0.3)`, { highest });
      else if (episodes.every(e => e.salience < 0.3 || e.replays > 0)) say("all-reread", "every exchange that stood out has been read again");
      if (cases.length < 2) say("few-cases", "a lesson needs two cases from different conversations");
      if (!feedback.some(f => f.kind === "helped")) say("no-success", "no memory has a recorded success yet, so nothing is imagined or promoted");
    }
    // Turns that ended and have not been read into memory yet. While any are
    // waiting, something the user said there (a correction, say) is not known.
    const unread = this.log.pending(this.identity, "experienced");
    const failing = this.log.db.prepare(`SELECT data FROM attention WHERE owner=? AND json_extract(data,'$.stage')='reflection' ORDER BY rowid DESC LIMIT 5`).all(this.owner)
      .map(r => JSON.parse(r.data)).filter(t => unread.some(u => u.id === t.request)).map(t => ({ request: t.request, at: t.at, error: t.error }));
    return {
      at: now,
      outcomes: { deliveries: traces.length, assessed, recorded: count(feedback.map(f => f.kind)), waiting },
      sleep: {
        last: this.lastSleep()?.at ?? null, queued: count(jobs.map(j => j.type)), failed: this.jobs("failed").length,
        episodes: episodes.length, standingOut: episodes.filter(e => e.salience >= 0.3).length,
        signals: count(episodes.flatMap(e => e.signals.map(s => `${s.kind} (${s.by})`))),
        idleBecause: idle, idle: codes,
      },
      reflection: { unread: unread.length, failing },
      health: this.health(now),
    };
  },
  async sleepDue(now = this.log.now()) {
    await this.plan(now);
    return this.jobs().length > 0 || this.promotable(now).length > 0 || this.demotable(now).length > 0;
  },

  // --- The jobs ---------------------------------------------------------------
  async relatedEpisodes(episode, limit = 3) {
    const others = this.episodes().filter(e => e.id !== episode.id && e.scene && e.events?.length);
    if (!others.length || !episode.scene || !this.embed) return [];
    const vectors = await this.vectors([episode.scene, ...others.map(e => e.scene)], "passage");
    if (!vectors) return [];
    const mine = vectors.get(episode.scene);
    // Earlier exchanges come first: the point is to read across them.
    return others.map(e => ({ e, s: cosine(mine, vectors.get(e.scene)) + (e.sessionId !== episode.sessionId ? 0.05 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.e);
  },
  async replay(job, infer, now) {
    const episode = this.episode(job.target);
    const events = episode ? this.records(episode.events ?? []) : [];
    if (!events.length) return { skipped: "episode no longer has records" };
    const related = await this.relatedEpisodes(episode);
    const relatedEvents = related.map(r => this.records((r.events ?? []).slice(0, 10)));
    const known = this.items({ closed: true });
    const linked = new Set([...(episode.memories ?? []), ...related.flatMap(r => r.memories ?? [])]);
    const near = (await this.candidates({ scene: episode.scene, need: "", entities: [] }, now, null, { purpose: "reflection" })).slice(0, 12).map(c => c.item.id);
    const shown = known.filter(i => linked.has(i.id) || near.includes(i.id)).slice(0, 24);
    const value = await infer("asteme-replay", replayPrompt({
      now: iso(now), core: this.charter(),
      episode: { id: episode.id, at: iso(episode.at), scene: episode.scene, stoodOut: episode.signals.map(s => s.kind), RAW: pageRaw(events.slice(0, 16), 1000) },
      earlier: related.map((r, n) => ({ id: r.id, at: iso(r.at), scene: r.scene, RAW: pageRaw(relatedEvents[n], 800) })),
      understanding: shown.map(compactItem),
    }), 4000);
    if (!value || !Array.isArray(value.changes)) throw Error("Invalid replay response");
    const report = this.apply(value.changes.filter(op => op.op !== "core"), [...events, ...relatedEvents.flat()], { known });
    const written = report.applied.map(a => a.id);
    this.saveEpisode({ ...this.episode(episode.id), replays: episode.replays + 1, lastReplayAt: now,
      memories: [...new Set([...(episode.memories ?? []), ...written])] });
    for (const id of written) this.raiseSalience(id, episode.salience, "Revisited in a replayed episode");
    return { applied: report.applied, rejected: report.rejected.map(r => r.reason), read: related.length + 1 };
  },
  async reconcile(job, infer, now) {
    const [a, b] = job.target.split("|").map(id => this.item(id));
    if (!a || !b || a.paused || b.paused) return { skipped: "one side is gone or paused" };
    if (!LIVE.includes(a.status) && !LIVE.includes(b.status)) return { skipped: "neither side is in use" };
    const events = this.records([a, b].flatMap(i => [...i.evidence, ...(i.against ?? [])].map(e => e.id)));
    const value = await infer("asteme-reconcile", reconcilePrompt({ now: iso(now), core: this.charter(),
      why: job.reasons ?? [], a: this.detail(a), b: this.detail(b), outcomes: { [a.id]: this.outcomesOf(a), [b.id]: this.outcomesOf(b) }, RAW: pageRaw(events, 1000) }), 2600);
    const verdicts = ["distinct", "supersede", "split", "merge", "retract", "ask"];
    if (!value || !verdicts.includes(value.verdict) || !Array.isArray(value.changes ?? [])) throw Error("Invalid reconcile response");
    // Only the two memories on the table, or a new question to the user.
    const allowed = (value.changes ?? []).filter(op => op.op !== "core" && (!op.id || op.id === a.id || op.id === b.id));
    const report = this.apply(allowed, events);
    // Judged as they were, and as they are now: a repair is not a new dispute.
    const after = [this.item(a.id), this.item(b.id)];
    for (const pair of [[a, b], ...(after.every(Boolean) ? [after] : [])]) this.log.save(this.judgedKey("reconcile", pair), { at: now, verdict: value.verdict });
    const [src, dst] = [a.id, b.id].sort();
    this.link(src, dst, "contradicts", { state: "resolved", verdict: value.verdict, reason: cut(value.reason, 300), at: now });
    // The pair was filed in the order it was flagged; close that entry too.
    for (const tie of this.links(a.id).filter(l => l.type === "contradicts" && l.state === "open" && [l.src, l.dst].includes(b.id)))
      this.link(tie.src, tie.dst, "contradicts", { state: "resolved", verdict: value.verdict, reason: cut(value.reason, 300), at: now });
    return { verdict: value.verdict, applied: report.applied, rejected: report.rejected.map(r => r.reason) };
  },
  async revise(job, infer, now) {
    const item = this.item(job.target);
    if (!item || item.paused) return { skipped: "gone or paused" };
    if (!LIVE.includes(item.status)) return { skipped: "no longer in use" };
    const outcomes = this.outcomesOf(item);
    const events = this.records([...item.evidence, ...(item.against ?? []), ...outcomes.flatMap(o => o.evidence)].map(e => e.id));
    const premises = (item.premises ?? []).map(id => this.item(id)).filter(Boolean).map(p => ({ id: p.id, text: bounded(p.text, 300), status: p.status, paused: !!p.paused }));
    const value = await infer("asteme-revise", revisePrompt({ now: iso(now), core: this.charter(),
      item: this.detail(item), why: job.reasons ?? [], outcomes, premises, RAW: pageRaw(events, 1000) }), 2400);
    if (!value || !Array.isArray(value.changes)) throw Error("Invalid revise response");
    const report = this.apply(value.changes.filter(op => op.op !== "core" && op.id === item.id), events);
    // Remember what this answer covered, so the same evidence does not ask again.
    const after = this.item(item.id), mine = this.feedback().filter(f => f.item === item.id);
    this.log.save(`revised:${this.owner}:${item.id}`, { at: now, revision: after?.revision ?? item.revision,
      irrelevant: new Set(mine.filter(f => f.kind === "irrelevant").map(f => f.scene?.scene ?? f.request)).size,
      widened: [...new Set(mine.filter(f => f.kind === "helped").map(f => f.scene?.scene).filter(Boolean))] });
    return { kept: !report.applied.length, reason: cut(value.reason, 300), applied: report.applied, rejected: report.rejected.map(r => r.reason) };
  },
  async integrate(job, infer, now) {
    const cases = job.target.split("|").map(id => this.item(id));
    if (cases.some(c => !c || c.paused || c.status !== "active")) return { skipped: "a case changed" };
    const key = this.judgedKey("integrate", cases);
    const outcomes = Object.fromEntries(cases.map(c => [c.id, this.outcomesOf(c)]));
    const events = this.records([...cases.flatMap(c => c.evidence), ...Object.values(outcomes).flat().flatMap(o => o.evidence)].map(e => e.id));
    const value = await infer("asteme-lesson", lessonPrompt({ now: iso(now), core: this.charter(),
      cases: cases.map(c => this.detail(c)), outcomes, RAW: pageRaw(events, 1000) }), 2200);
    this.log.save(key, { at: now });
    const l = value?.lesson;
    if (!l) return { declined: cut(value?.skip?.reason ?? value?.skip ?? "no shared lesson", 300) };
    const text = String(l.text ?? "").trim(), from = [...new Set((l.from ?? []).filter(id => cases.some(c => c.id === id)))];
    if (text.length < 8 || text.length > 400) throw Error("a lesson is one short statement");
    if (from.length < 2) throw Error("a lesson needs at least two cases");
    for (const k of ["reason", "concrete", "general", "tested", "hypothesis"]) if (typeof l[k] !== "string" || !l[k].trim()) throw Error(`a lesson states its ${k}`);
    if (norm(l.tested) === norm(l.hypothesis)) throw Error("a lesson separates what is established from what is not");
    const raw = this.evidence(l.evidence, events);
    // The quotes must come from the cases themselves, and from each of them.
    const sources = new Map(cases.map(c => [c.id, new Set(c.evidence.map(e => e.id))]));
    if (raw.some(e => ![...sources.values()].some(ids => ids.has(e.id)))) throw Error("lesson evidence is outside the cited cases");
    if (from.some(id => !raw.some(e => sources.get(id).has(e.id)))) throw Error("a lesson cites every case it is drawn from");
    // Cases about a private matter are never offered for a lesson; a secret
    // that slipped into the wording is refused here by its shape.
    if (secret([text, l.concrete, l.general].join("\n"))) throw Error("a sensitive record stays a case");
    const at = Math.max(...raw.map(e => e.occurredAt ?? e.observedAt));
    const lesson = { id: `lesson-${digest([text, ...from]).slice(0, 24)}`, kind: "understanding", level: "lesson", status: "active",
      text, reason: l.reason.trim(), concrete: l.concrete.trim(), general: l.general.trim(), certainty: "inferred",
      tested: l.tested.trim(), hypothesis: l.hypothesis.trim(), about: typeof l.about === "string" ? cut(l.about.trim(), 120) : "", volatility: "stable",
      entities: [...new Set(cases.flatMap(c => c.entities ?? []))].slice(0, 12), trigger: { at: null, until: null },
      // A lesson is as well grounded as its weakest case.
      grounds: cases.filter(c => from.includes(c.id)).every(c => this.grounds(c) === "said") ? "said" : "seen",
      premises: from, learnedAt: at, projectId: cases[0].projectId, sensitive: [],
      revision: 1, lastCheckedAt: at, lastEvidenceAt: at, evidence: l.evidence.map(r => ({ id: r.id, quote: r.quote })) };
    this.log.transaction(() => {
      this.write(lesson, `Drawn from ${from.length} cases: ${cut(l.reason, 200)}`);
      for (const id of from) this.link(lesson.id, id, "derived", { at: now });
      this.raiseSalience(lesson.id, Math.max(...cases.map(c => c.salience ?? 0)), "Carries the salience of its cases");
    });
    return { lesson: lesson.id, from };
  },
  async imagine(job, infer, now) {
    const item = this.item(job.target);
    if (!item || item.paused || item.status !== "active") return { skipped: "gone or not in use" };
    const value = await infer("asteme-imagine", imaginePrompt({ core: this.charter(), item: compactItem(item),
      helpedIn: this.outcomesOf(item).filter(o => o.kind === "helped").map(o => o.scene) }), 900);
    this.log.save(this.judgedKey("imagine", [item]), { at: now });
    const taken = new Set([item.concrete, item.general, ...(item.imagined ?? [])].map(norm));
    const scenes = [...new Set((Array.isArray(value?.scenes) ? value.scenes : []).filter(s => typeof s === "string").map(s => s.trim()))]
      .filter(s => s.length >= 12 && s.length <= 240 && !taken.has(norm(s))).slice(0, 3);
    if (!scenes.length) return { declined: "no usable scene" };
    // Imagined scenes are an index, not evidence: they widen what can call the
    // memory, and a real outcome there confirms or removes them.
    this.setDynamics(item.id, { imagined: scenes }, "Imagined future scenes where this may apply (untested)");
    return { scenes };
  },

  // --- One night ----------------------------------------------------------------
  async sleep({ infer, now = this.log.now(), budget = 6 } = {}) {
    const erased = this.log.state("erasure-revision", 0), intact = () => erased === this.log.state("erasure-revision", 0);
    // What a model wrote after reading records is not applied when one of them was taken back while it was writing: the job stays, untried, and is
    // read again from what is left. (It was checked only between jobs, after the job had applied what it was given.)
    const guarded = afterErasure(this, infer);
    const report = { at: now, ran: [], failed: [], left: 0 };
    const run = { replay: this.replay, reconcile: this.reconcile, revise: this.revise, integrate: this.integrate, imagine: this.imagine };
    const tried = new Set();
    // Planned twice: what the first pass produced (a new lesson, a revised
    // memory) may itself need work, and that should not wait for another night.
    for (let pass = 0; pass < 2 && budget > 0 && intact(); pass++) {
      await this.plan(now);
      for (const job of this.jobs()) {
        if (budget <= 0 || !intact()) break;
        if (tried.has(job.id)) continue;
        tried.add(job.id);
        const finish = (state, patch) => this.log.db.prepare("UPDATE job SET state=?,data=? WHERE id=?")
          .run(state, JSON.stringify({ at: job.at, attempts: job.attempts ?? 0, reasons: job.reasons, ...patch, finishedAt: now }), job.id);
        try {
          const result = await run[job.type].call(this, job, guarded, now);
          if (!intact()) break;
          if (!result.skipped) budget--;
          finish("done", { result });
          report.ran.push({ type: job.type, target: job.target, why: job.reasons, ...result });
        } catch (e) {
          // Stopped from outside (the program closing, the plugin loaded again) is not the job failing: it stays as it was, untried, and is not reported as something that went wrong.
          if (e?.name === "AbortError" || e?.erasedMeanwhile || /\babort(ed)?\b/i.test(String(e?.message ?? ""))) break;
          budget--;
          const attempts = (job.attempts ?? 0) + 1;
          // Tried again on later nights, then set aside with the reason kept.
          finish(attempts >= 3 ? "failed" : "queued", { attempts, error: cut(e.message, 300) });
          report.failed.push({ type: job.type, target: job.target, reason: cut(e.message, 300) });
        }
      }
    }
    if (budget > 0 && intact() && (this.promotable(now).length || this.demotable(now).length))
      report.habits = await this.consolidate({ infer: guarded, now }).catch(e => { if (e?.erasedMeanwhile) return null; throw e; });
    report.left = this.jobs().length;
    this.log.save(`sleep-last:${this.owner}`, report);
    return report;
  },
};
