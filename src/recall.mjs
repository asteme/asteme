// Recall: the present scene calls up what is stored. Nothing here searches for
// words. A memory answers to scenes: the one it was learned in, the ones it
// was expected to matter in, the ones sleep imagined for it, and every scene
// where it later helped or was missed. It also remembers the scenes where it
// did not help, and stays quiet when the present looks more like those.
//
// Embeddings are the sensor, not the judge. They measure how close two scene
// descriptions are; competition, the admission step and later outcomes decide
// what is actually used.
import { digest } from "./log.mjs";
import { terms } from "./mind.mjs";
import { isSpecificAnchor } from "./policy.mjs";
import { sameEntity, commonNames, norm } from "./memory.mjs";
import { accessibility, useStats } from "./outcome.mjs";

// Every number that shapes recall, in one place. These are defaults chosen by
// reasoning, not fitted to data; `eval/` exists to tune them.
/**
 * The candidates one reading is given. The best by rank, then those a name or
 * a due time brought (due first), up to a number; and of all those, in that
 * order, as many as fit in the room the prompt has for them. Eight are kept
 * whatever their size.
 */
export function fitCandidates(list, { top = TUNING.top, beside = TUNING.beside, chars = TUNING.candidateChars } = {}) {
  const size = c => Math.min(600, c.item.text?.length ?? 0) + Math.min(300, c.item.concrete?.length ?? 0) + Math.min(300, c.item.general?.length ?? 0)
    + Math.min(200, c.item.tested?.length ?? 0) + Math.min(200, c.item.hypothesis?.length ?? 0) + Math.min(160, c.cue?.length ?? 0) + 320;
  const best = list.slice(0, top), rest = list.slice(top).sort((a, b) => (b.due ? 1 : 0) - (a.due ? 1 : 0)).slice(0, beside);
  const kept = new Set(); let used = 0;
  for (const c of [...best, ...rest]) { const n = size(c); if (kept.size >= 8 && used + n > chars) break; kept.add(c.item.id); used += n; }
  return list.filter(c => kept.has(c.item.id));
}

export const TUNING = {
  // Scenes that call for nothing. A memory must fit the present scene better
  // than it fits these, which gives a relevance floor that does not depend on
  // the embedding model's scale.
  nullScenes: [
    "A greeting with no task",
    "Small talk that asks for nothing",
    "A short acknowledgement or thanks",
    "A request to continue whatever was being done",
  ],
  // Closeness puts a match on a scale that does not depend on the embedding
  // model: 0 is "fits no better than an empty scene", 1 is "the same scene".
  // Raw margins differ by model (0.001 can be noise in one and signal in
  // another); a share of the distance to identity does not.
  minCloseness: 0.05,  // below this the scene alone does not call a memory
  fit: { strong: 0.5, moderate: 0.2 },  // how admission is told a match looks
  negativeMargin: 0,   // how much closer a scene of failure must be before it silences a memory
  top: 24,             // candidates handed to admission
  beside: 16,          // at most this many more, called by a name in the scene or by their time having come
  candidateChars: 28000, // and no more of them than fit in this much of the prompt
  cueWeight: { encoded: 1, anticipated: 1, helped: 1, missed: 1, imagined: 0.85 },
  spreadFrom: 6,       // strongest candidates that pass activation on
  spread: 0.5,         // share of a candidate's activation that reaches a linked memory
  weights: { entity: 0.15, salience: 0.1, spread: 0.3, words: 0.1 },
  // Age never makes a memory harder to recall. It makes a changeable fact less
  // safe to assert, so past these ages it is checked before it is relied on.
  staleDays: { state: 30, slow: 365, stable: Infinity },
  // The earlier rule: the quoted words must also appear in the memory. Off as
  // a gate, because it turns recall by scene back into recall by wording.
  // Shared content words are still used as one signal among others (see
  // weights.words and the floor below).
  requireSharedTerms: false,
};

/** Whether a memory is past the age at which its kind of fact should be confirmed before use. */
export function isStale(item, feedback, now) {
  if (item.kind !== "understanding") return false;
  const confirmed = Math.max(item.lastCheckedAt ?? item.learnedAt ?? now, ...feedback.filter(f => f.kind === "helped").map(f => f.at));
  return (now - confirmed) / DAY > (TUNING.staleDays[item.volatility ?? "slow"] ?? Infinity);
}
// Content words: what is left of a text once instruction words and short
// function words are set aside.
const contentWords = text => new Set([...terms(text)].filter(t => isSpecificAnchor(t)));

const cosine = (a, b) => {
  if (a.length !== b.length) throw Error("Embedding dimensions changed");
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};
const DAY = 86400000;

export const recall = {
  // Derived numeric index only. Passage vectors are kept; scene vectors are not,
  // because every scene is new. Returns null if memory was erased meanwhile.
  async vectors(texts, kind = "passage") {
    if (!this.embed) throw Error("No semantic embedding adapter");
    this._vectors ??= new Map();
    const model = this.embed.model ?? "default", keep = kind === "passage";
    const out = new Map(), missing = [];
    for (const text of new Set(texts)) {
      // The key of a text is its digest. The same cue texts are asked for at every recall, so the digests are kept.
      let hashed = keep ? this._digests?.get(text) : null;
      if (!hashed) { hashed = digest(text); if (keep) { if (!this._digests || this._digests.size > 80000) this._digests = new Map(); this._digests.set(text, hashed); } }
      const key = `${model}:${kind}:${hashed}`;
      let vector = this._vectors.get(key);
      if (!vector && keep) {
        const row = this.log.db.prepare("SELECT data FROM vector WHERE key=?").get(key);
        if (row) this._vectors.set(key, vector = new Float32Array(row.data.buffer.slice(row.data.byteOffset, row.data.byteOffset + row.data.byteLength)));
      }
      if (vector) out.set(text, vector); else missing.push({ text, key });
    }
    const erased = this.log.state("erasure-revision", 0);
    // Bound one embedding allocation, not the number of remembered experiences.
    for (let start = 0; start < missing.length; start += 16) {
      const part = missing.slice(start, start + 16), values = await this.embed(part.map(x => x.text), kind);
      if (erased !== this.log.state("erasure-revision", 0)) return null;
      part.forEach((x, n) => {
        const vector = Float32Array.from(values[n]);
        // Room for the cues of some twenty thousand memories (about 120 MB at most); past that it starts over.
        if (this._vectors.size > 80000) this._vectors.clear();
        this._vectors.set(x.key, vector);
        if (keep) this.log.db.prepare("INSERT OR REPLACE INTO vector VALUES (?,?)").run(x.key, new Uint8Array(vector.buffer));
        out.set(x.text, vector);
      });
    }
    return out;
  },
  // The scenes a memory answers to, and the scenes it has learned to stay out of.
  cues(item, feedback = []) {
    const positive = [], negative = [], seen = new Set();
    const add = (list, sign, text, origin) => {
      if (!text || seen.has(sign + text)) return;
      seen.add(sign + text); list.push({ text, origin });
    };
    add(positive, "+", item.concrete, "encoded");
    add(positive, "+", item.general, "anticipated");
    for (const text of item.imagined ?? []) add(positive, "+", text, "imagined");
    for (const f of feedback) {
      const scene = f.scene?.scene;
      if (["helped", "missed"].includes(f.kind)) add(positive, "+", scene, f.kind);
      // A scene where the content was wrong stops counting once the content is revised.
      else if (f.kind === "irrelevant" || (f.kind === "wrong" && f.revision === item.revision)) add(negative, "-", scene, f.kind);
    }
    if (!positive.length) add(positive, "+", item.text, "encoded");
    return { positive, negative };
  },
  async activate(scene, now = this.log.now(), request = null, { purpose = "delivery", chars = TUNING.candidateChars } = {}) {
    const empty = { candidates: [], suppressed: [], below: 0 };
    const erased = this.log.state("erasure-revision", 0);
    this.expire(now);
    const ask = request?.content ?? "", delivery = purpose === "delivery";
    // A memory kept to its project is not recalled in another one.
    const here = request?.scope?.projectId;
    const items = this.items().filter(i => { const home = this.confinedTo(i); return !home || !here || home === here; });
    if (!items.length) return empty;
    if (!this.embed) throw Error("No semantic embedding adapter");
    const outcomes = new Map(items.map(i => [i.id, []]));
    for (const f of this.feedback()) outcomes.get(f.item)?.push(f);
    const cueSets = new Map(items.map(i => [i.id, this.cues(i, outcomes.get(i.id))]));
    const queries = [...new Set([scene.scene, scene.need].filter(Boolean))];
    const queryMap = await this.vectors(queries.length ? queries : [""], "query");
    const nullMap = delivery ? await this.vectors(TUNING.nullScenes, "query") : new Map();
    const cueMap = await this.vectors([...cueSets.values()].flatMap(c => [...c.positive, ...c.negative].map(x => x.text)), "passage");
    if (!queryMap || !nullMap || !cueMap || erased !== this.log.state("erasure-revision", 0)) return empty;
    const qv = [...queryMap.values()], nv = [...nullMap.values()];
    // If the embedder cannot tell this scene from an empty one it carries no
    // signal, and the floor stands aside instead of guessing.
    const informative = nv.length > 0 && qv.some(q => nv.some(n => cosine(q, n) < 0.999));
    const sim = text => Math.max(...qv.map(q => cosine(q, cueMap.get(text))));
    // How near a cue is to a scene that says nothing does not depend on the
    // present scene: it is worked out once for each cue and kept. With thirty
    // thousand memories this was four fifths of the arithmetic of one recall.
    if (this._floors?.model !== this.embed.model || this._floors.size > 200000) { this._floors = new Map(); this._floors.model = this.embed.model; }
    const floors = this._floors;
    const floor = text => { if (!nv.length) return 0; let f = floors.get(text); if (f === undefined) floors.set(text, f = Math.max(...nv.map(n => cosine(n, cueMap.get(text))))); return f; };
    const named = scene.entities ?? [], asked = contentWords(ask);
    const who = this.core?.() ?? {}, common = commonNames(this.items(), [who.name, who.userName]);

    const rows = items.map(item => {
      const { positive, negative } = cueSets.get(item.id), feedback = outcomes.get(item.id);
      const best = positive.map(c => { const s = sim(c.text); return { ...c, sim: s, weighted: s * (TUNING.cueWeight[c.origin] ?? 1) }; })
        .sort((a, b) => b.weighted - a.weighted)[0];
      const worst = negative.map(c => ({ ...c, sim: sim(c.text) })).sort((a, b) => b.sim - a.sim)[0];
      const stats = useStats(feedback, item.revision);
      const lift = best.sim - floor(best.text), room = 1 - floor(best.text);
      const closeness = !informative ? null : room > 1e-6 ? Math.max(0, lift / room) : 0;
      // A memory's own words change only when it does: worked out once for each revision, not at every recall.
      const wordsKey = `${item.id}:${item.revision}`;
      let mine = this._words?.get(wordsKey);
      if (!mine) { if (!this._words || this._words.size > 60000) this._words = new Map(); this._words.set(wordsKey, mine = contentWords([item.text, item.concrete, item.general, ...(item.entities ?? [])].join(" "))); }
      const due = item.kind === "concern" && item.trigger?.at && Date.parse(item.trigger.at) <= now && (!item.trigger.until || now <= Date.parse(item.trigger.until));
      return {
        item, sim: best.sim, lift, closeness, cue: best.text, origin: best.origin,
        fit: closeness === null ? null : closeness >= TUNING.fit.strong ? "strong" : closeness >= TUNING.fit.moderate ? "moderate" : "weak",
        // The present message and the memory use some of the same content words.
        words: delivery && [...asked].some(t => mine.has(t)),
        // Closer to a scene where it failed than to any scene where it belongs.
        suppressed: delivery && !!worst && worst.sim > best.sim + TUNING.negativeMargin,
        ...(worst ? { against: { cue: worst.text, sim: worst.sim } } : {}),
        feedback: feedback.slice(0, 12), stats, accessibility: accessibility(item, stats),
        entity: (item.entities ?? []).some(e => !common.has(norm(e)) && named.some(n => sameEntity(e, n))), due: !!due,
        stale: isStale(item, feedback, now),
        spread: 0,
      };
    });
    // Relative to the best match in this scene, so the scale of the embedding
    // model does not matter. Accessibility bends the ranking; it never removes.
    const peak = Math.max(...rows.map(r => r.lift));
    for (const r of rows)
      r.score = (peak > 1e-9 ? r.lift / peak : 0) * (0.5 + 0.5 * r.accessibility)
        + TUNING.weights.entity * r.entity + TUNING.weights.salience * (r.item.salience ?? 0) + TUNING.weights.words * r.words;

    // The floor. The scene must fit clearly better than an empty scene would;
    // a marginal fit counts only when the message also shares content words
    // with the memory. Two weak signals that agree are worth one clear one.
    const direct = r => !informative || r.closeness >= TUNING.minCloseness || (r.words && r.lift > 0);
    const own = r => !r.suppressed && (direct(r) || r.entity || r.due);
    // One step of association: what belongs with a strongly recalled memory
    // comes along even if the scene alone would not have called it.
    const byId = new Map(rows.map(r => [r.item.id, r]));
    const ties = this.links().filter(l => l.type === "derived" || (l.type === "coactive" && (l.weight ?? 0) >= 2));
    if (delivery && ties.length)
      for (const source of rows.filter(own).sort((a, b) => b.score - a.score).slice(0, TUNING.spreadFrom))
        for (const tie of ties) {
          const other = byId.get(tie.src === source.item.id ? tie.dst : tie.dst === source.item.id ? tie.src : null);
          const amount = TUNING.spread * Math.max(0, source.score);
          if (other && other !== source && amount > other.spread) { other.spread = amount; other.via = source.item.id; }
        }
    for (const r of rows) r.score += TUNING.weights.spread * r.spread;

    // A record about a private matter is put before admission only when the
    // present scene itself calls it, or on the date the user set for it. A
    // name alone or an association never brings it. Whether the user's message
    // raises the matter is then admission's question, and its use is always in
    // the open (see attend). Reflection sees every record, or it could never
    // correct or close these.
    // Where the embedder carries no signal the floor cannot vouch for the
    // scene, and only the message's own words can.
    const open = r => !r.item.sensitive?.length || r.due
      || (informative ? r.closeness >= TUNING.minCloseness || (r.words && r.lift > 0) : r.words);
    const eligible = r => !delivery || (!r.suppressed && (own(r) || r.spread > 0) && open(r));
    const ranked = rows.filter(eligible).sort((a, b) => b.score - a.score);
    const top = new Set(ranked.slice(0, TUNING.top).map(r => r.item.id));
    // Broad, inspectable union. Admission is always the separate step's job.
    // Beside the best: what a name in the scene calls, and what has come due.
    // With thousands of memories one name can be in hundreds of them, so these
    // have a number too, and all of it has a size: what is left out is counted
    // (`crowded`), not passed over in silence.
    const wide = ranked.filter(r => top.has(r.item.id) || r.entity || r.due);
    const candidates = fitCandidates(wide, { chars });
    // An unsettled disagreement is recalled as a question, never as two facts.
    const present = new Set(candidates.map(r => r.item.id));
    for (const tie of this.links().filter(l => l.type === "contradicts" && l.state === "open"))
      if (present.has(tie.src) && present.has(tie.dst)) {
        (byId.get(tie.src).conflict ??= []).push(tie.dst);
        (byId.get(tie.dst).conflict ??= []).push(tie.src);
      }
    return {
      candidates,
      suppressed: rows.filter(r => r.suppressed).map(r => ({ id: r.item.id, cue: r.cue, sim: r.sim, against: r.against })),
      below: rows.filter(r => !r.suppressed && !eligible(r)).length,
      crowded: wide.length - candidates.length,
    };
  },
  async candidates(scene, now, request, options) {
    return (await this.activate(scene, now, request, options)).candidates;
  },
};
