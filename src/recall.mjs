// Recall: the present calls up what is stored. A memory answers to its own
// words and to scenes: the one it was learned in, the ones it was expected to
// matter in, the ones sleep imagined for it, and every scene where it was
// later needed and missed. It also keeps the scenes the user said it does not
// belong in, and stays quiet when the present looks more like those.
//
// Beside the memories, the record itself is searched (record.mjs): the rounds
// of earlier conversations nearest to the present, in the words they were
// said in.
//
// Embeddings are the sensor, not the judge. They put what is stored in order
// of nearness; the nearest few go to admission, and admission decides what is
// used. Nothing is held back by an absolute measure of nearness: such a floor
// was measured (2026-11) to keep out most true matches, and all of them when
// the message and the stored scene were in different languages, while the
// order itself was right in every language tried.
import { digest } from "./log.mjs";
import { terms } from "./mind.mjs";
import { matterWord, bareWord } from "./policy.mjs";
import { sameEntity, commonNames, norm, NOBODY } from "./memory.mjs";
import { accessibility, useStats, bounds, standing } from "./outcome.mjs";

// Every number that shapes recall, in one place. `eval/` measures what they do; a number here is changed with a measurement beside it.
/**
 * The candidates one reading is given. The nearest, then those a name or
 * a due time brought (due first), up to a number; and of all those, in that
 * order, as many as fit in the room the prompt has for them. Eight are kept
 * whatever their size.
 */
export function fitCandidates(list, { top = TUNING.near, beside = TUNING.beside, chars = TUNING.candidateChars } = {}) {
  const size = c => Math.min(600, c.item.text?.length ?? 0) + Math.min(300, c.item.concrete?.length ?? 0) + Math.min(300, c.item.general?.length ?? 0)
    + Math.min(200, c.item.tested?.length ?? 0) + Math.min(200, c.item.hypothesis?.length ?? 0) + Math.min(160, c.cue?.length ?? 0) + 320;
  const best = list.slice(0, top), rest = list.slice(top).sort((a, b) => (b.due ? 1 : 0) - (a.due ? 1 : 0)).slice(0, beside);
  const kept = new Set(); let used = 0;
  for (const c of [...best, ...rest]) { const n = size(c); if (kept.size >= 8 && used + n > chars) break; kept.add(c.item.id); used += n; }
  return list.filter(c => kept.has(c.item.id));
}

export const TUNING = {
  // How many memories one reading is given: the nearest by any of their keys.
  // Measured on 36 questions over 265 memories: a memory of the right
  // conversation was among the nearest four for 35 of them, so eight leaves room.
  near: 8,
  beside: 8,           // at most this many more, called by a name in the scene or by their time having come
  rounds: 4,           // rounds of the record given beside them
  candidateChars: 28000, // and no more of all of it than fits in this much of the prompt
  // A key's weight. A scene imagined for a memory and not met yet counts a little less than one it has met.
  cueWeight: { words: 1, encoded: 1, anticipated: 1, missed: 1, imagined: 0.85 },
  negativeMargin: 0,   // how much nearer a scene it was said not to belong in must be before it silences a memory
  // A record about a private matter keeps the test that every memory was put to before 0.13: it comes before admission only when the present
  // is nearer to it than to a scene that says nothing, by this share of the way to being the same scene (or when the message uses a word of
  // its own and is nearer at all, or on its day). That test holds back true matches too, which is why nothing else is put to it any more;
  // for a private matter, holding back is the side to err on, and it was not this version's to change.
  privateCloseness: 0.05,
  nullScenes: ["A greeting with no task", "Small talk that asks for nothing", "A short acknowledgement or thanks", "A request to continue whatever was being done"],
  // Age never makes a memory harder to recall. It makes a changeable fact less
  // safe to assert, so past these ages it is checked before it is relied on.
  staleDays: { state: 30, slow: 365, stable: Infinity },
  // The earlier rule: the quoted words must also appear in the memory. Off as
  // a gate, because it turns recall by scene back into recall by wording.
  requireSharedTerms: false,
};

/** Whether a memory is past the age at which its kind of fact should be confirmed before use. */
export function isStale(item, feedback, now) {
  if (item.kind !== "understanding") return false;
  const confirmed = Math.max(item.lastCheckedAt ?? item.learnedAt ?? now, ...feedback.filter(f => f.kind === "helped").map(f => f.at));
  return (now - confirmed) / DAY > (TUNING.staleDays[item.volatility ?? "slow"] ?? Infinity);
}
// The words of a text that carry a matter: what is left once question words, pronouns, little verbs and grammar are set aside (policy.mjs).
// A word in katakana is taken whole, its long-vowel mark with it (ローン). Its pairs are not: ーン is in パターン too.
const katakanaWords = text => (String(text ?? "").match(/[\p{Script=Katakana}ー]{2,}/gu) ?? []).filter(word => /\p{Script=Katakana}/u.test(word) && !BOTH.has(word));
// The words a model writes for the two who are talking are in most memories, and are nobody's matter.
const BOTH = new Set(["ユーザー", "アシスタント"]);
const contentWords = text => new Set([...[...terms(text)].filter(matterWord).map(bareWord), ...katakanaWords(text)]);

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
  // What a memory answers to, and the scenes it stays out of.
  // Each key says which records it was drawn from (`from`): none for the memory's own words and situations, and for a scene learned from a later use, that use's records.
  // What is kept of a reading carries these ids, so that taking a record back finds exactly the entries that hold words drawn from it, and no others.
  cues(item, feedback = []) {
    const positive = [], negative = [], seen = new Map();
    const add = (list, sign, text, origin, from = []) => {
      if (!text) return;
      const had = seen.get(sign + text);
      if (had) { for (const id of from) if (!had.from.includes(id)) had.from.push(id); return; }
      const cue = { text, origin, from: [...from] };
      seen.set(sign + text, cue); list.push(cue);
    };
    const sources = f => [f.request, ...(f.evidence ?? []).map(e => e.id)].filter(Boolean);
    // Its own words are a key too, in the language they were written in: a message in that language finds them without a scene having to be read first.
    add(positive, "+", item.text, "words");
    add(positive, "+", item.concrete, "encoded");
    add(positive, "+", item.general, "anticipated");
    for (const text of item.imagined ?? []) add(positive, "+", text, "imagined");
    for (const f of feedback) {
      const scene = f.scene?.scene;
      // A scene where it was needed and did not come is one it answers to from then on.
      if (f.kind === "missed") add(positive, "+", scene, f.kind, sources(f));
      // A scene the user said it does not belong in. One where its content was wrong stops counting once the content is revised.
      else if (bounds(f) || (f.kind === "wrong" && f.revision === item.revision)) add(negative, "-", scene, f.kind, sources(f));
    }
    return { positive, negative };
  },
  /**
   * What the present calls up: the memories nearest to it, and the rounds of the record nearest to it.
   * `purpose` "delivery" is a reply about to be written; anything else (reflection, replay) is reading with nobody waiting, where what a
   * memory was said not to belong in and what is private do not hold it back.
   */
  async activate(scene, now = this.log.now(), request = null, { purpose = "delivery", chars = TUNING.candidateChars, view = null } = {}) {
    const empty = { candidates: [], suppressed: [], below: 0, rounds: [] };
    const erased = this.log.state("erasure-revision", 0);
    this.expire(now);
    const delivery = purpose === "delivery";
    // A memory kept to its project is not recalled in another one. What is always in front of the model (a standing ask) is not called up as well.
    const here = request?.scope?.projectId;
    const inFront = delivery ? new Set(this.standingAsks({ here }).map(a => a.id)) : new Set();
    // What is kept to a project is recalled only where the present is known to be in it.
    const items = this.items().filter(i => { const home = this.confinedTo(i); return (!home || home === here) && !inFront.has(i.id); });
    if (!this.embed) throw Error("No semantic embedding adapter");
    const queries = [...new Set([scene.scene, scene.need].filter(Boolean))];
    const queryMap = await this.vectors(queries.length ? queries : [""], "query");
    if (!queryMap || erased !== this.log.state("erasure-revision", 0)) return empty;
    const qv = [...queryMap.values()];
    // Whether the present calls a record about a private matter (see privateCloseness). Where the embedder cannot tell this scene from one that
    // says nothing it carries no signal, and only the message's own words can call one.
    const asked = contentWords(request?.content ?? "");
    const guarded = delivery && (items.some(i => i.sensitive?.length) || this.recordVectors().length > 0);
    const nullMap = guarded ? await this.vectors(TUNING.nullScenes, "query") : new Map();
    if (!nullMap || erased !== this.log.state("erasure-revision", 0)) return empty;
    const nv = [...nullMap.values()], informative = nv.length > 0 && qv.some(q => nv.some(n => cosine(q, n) < 0.999));
    const dot = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
    const called = (near, vector, words) => {
      if (!informative || !vector) return words;
      const floor = Math.max(...nv.map(n => dot(n, vector))), lift = near - floor, room = 1 - floor;
      return (room > 1e-6 ? Math.max(0, lift / room) : 0) >= TUNING.privateCloseness || (words && lift > 0);
    };
    // A round about a private matter is marked as one and comes under the same rule as a memory about one.
    const rounds = delivery ? this.recordNear(qv, { here, view, limit: TUNING.rounds,
      allow: (r, vector) => !r.sensitive || called(r.score, vector, (() => { const said = contentWords(r.said); return [...asked].some(t => said.has(t)); })()) }) : [];
    if (!items.length) return { ...empty, rounds };
    const outcomes = new Map(items.map(i => [i.id, []]));
    for (const f of this.feedback()) outcomes.get(f.item)?.push(f);
    const cueSets = new Map(items.map(i => [i.id, this.cues(i, outcomes.get(i.id))]));
    const cueMap = await this.vectors([...cueSets.values()].flatMap(c => [...c.positive, ...c.negative].map(x => x.text)), "passage");
    if (!cueMap || erased !== this.log.state("erasure-revision", 0)) return empty;
    const sim = text => Math.max(...qv.map(q => cosine(q, cueMap.get(text))));
    const who = this.core?.() ?? {}, common = new Set([...commonNames(this.items(), [who.name, who.userName]), ...NOBODY]);
    // "user" names nobody, whoever gave it as a name; nor does a name most memories carry.
    const named = (scene.entities ?? []).filter(n => typeof n === "string" && n.trim() && !common.has(norm(n)));

    const rows = items.map(item => {
      const { positive, negative } = cueSets.get(item.id), feedback = outcomes.get(item.id);
      const best = positive.map(c => { const s = sim(c.text); return { ...c, sim: s, weighted: s * (TUNING.cueWeight[c.origin] ?? 1) }; })
        .sort((a, b) => b.weighted - a.weighted)[0];
      const worst = negative.map(c => ({ ...c, sim: sim(c.text) })).sort((a, b) => b.sim - a.sim)[0];
      const stats = useStats(feedback, item.revision);
      const due = item.kind === "concern" && item.trigger?.at && Date.parse(item.trigger.at) <= now && (!item.trigger.until || now <= Date.parse(item.trigger.until));
      // Whether the present message uses some of the memory's own content words: asked only of a memory about a private matter (below). Its own
      // words are what it says, what it is about and whom it names.
      const shares = () => { const key = `${item.id}:${item.revision}`; let mine = this._words?.get(key); if (!mine) { if (!this._words || this._words.size > 60000) this._words = new Map(); this._words.set(key, mine = contentWords([item.text, item.about, ...(item.entities ?? [])].join(" "))); } return [...asked].some(t => mine.has(t)); };
      return {
        item, sim: best.sim, weighted: best.weighted, cue: best.text, origin: best.origin, cueFrom: best.from ?? [],
        // Nearer to a scene the user said it does not belong in than to anything it answers to.
        suppressed: delivery && !!worst && worst.sim > best.sim + TUNING.negativeMargin,
        ...(worst ? { against: { cue: worst.text, sim: worst.sim, from: worst.from ?? [] } } : {}),
        feedback: feedback.slice(0, 12), stats, accessibility: accessibility(item, stats),
        entity: (item.entities ?? []).some(e => !common.has(norm(e)) && named.some(n => sameEntity(e, n))), due: !!due,
        stale: isStale(item, feedback, now),
        ...(delivery && item.sensitive?.length ? (() => { const words = shares(); return { words, called: !!due || called(best.sim, cueMap.get(best.text), words) }; })() : {}),
      };
    });
    // Nearness is put on a scale of this reading's own: 0 is the average memory, 1 the nearest one. The numbers an embedding model gives mean nothing
    // by themselves (everything is "0.8 alike"); how far a memory stands out from the rest does. A memory in doubt ranks a little lower.
    const mean = rows.reduce((n, r) => n + r.weighted, 0) / rows.length, peak = Math.max(...rows.map(r => r.weighted));
    for (const r of rows) r.score = (peak - mean > 1e-9 ? Math.max(0, (r.weighted - mean) / (peak - mean)) : r.weighted === peak ? 1 : 0) * standing(r.item);
    // Everything below the average has the same 0 on that scale; among those, the nearer still comes first.
    const ranked = rows.filter(r => !r.suppressed).sort((a, b) => b.score - a.score || b.weighted - a.weighted);
    ranked.forEach((r, n) => { r.rank = n + 1; });
    // The nearest go to admission. Beside them: what a name in the scene calls, and what has come due; these have a number too, and what is left
    // out for room is counted (`crowded`), not passed over in silence.
    // A record about a private matter is put before admission only when the present itself calls it (privateCloseness, above) or on the date the
    // user set for it. A name alone or being the nearest of what there is never brings it, so that the assistant does not raise a private matter
    // first. Whether the message raises the matter is then admission's question, and its use is always in the open (see attend). Reflection sees
    // every record, or it could never correct or close these. What the user asked to be taken into account whenever a situation comes up is a
    // standing ask, and is in front of the model without being called.
    const open = r => !delivery || !r.item.sensitive?.length || r.called;
    // What may not be put forward does not take the place of something that may.
    const allowed = ranked.filter(open), nearest = allowed.slice(0, delivery ? TUNING.near : 24);
    const top = new Set(nearest.map(r => r.item.id));
    const wide = allowed.filter(r => top.has(r.item.id) || r.entity || r.due);
    const candidates = fitCandidates(wide, { top: nearest.length, chars });
    // An unsettled disagreement is recalled as a question, never as two facts.
    const byId = new Map(rows.map(r => [r.item.id, r]));
    const present = new Set(candidates.map(r => r.item.id));
    for (const tie of this.links().filter(l => l.type === "contradicts" && l.state === "open"))
      if (present.has(tie.src) && present.has(tie.dst)) {
        (byId.get(tie.src).conflict ??= []).push(tie.dst);
        (byId.get(tie.dst).conflict ??= []).push(tie.src);
      }
    return {
      candidates, rounds,
      suppressed: rows.filter(r => r.suppressed).map(r => ({ id: r.item.id, cue: r.cue, from: r.cueFrom, sim: r.sim, against: r.against })),
      below: ranked.length - wide.length,
      crowded: wide.length - candidates.length,
    };
  },
  async candidates(scene, now, request, options) {
    return (await this.activate(scene, now, request, options)).candidates;
  },
};
