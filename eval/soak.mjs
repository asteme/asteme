// A simulated month, to see when background work runs and what it costs.
//
//   node eval/soak.mjs [--days 30] [--turns 10] [--corrections 0.15] [--followups 0.5] [--seed 7]
//
// The real core and the host's schedule (reflect at turn end, outcomes a minute
// after a reply once the user has written again, sleep when idle, at most every
// ten minutes, six model calls a cycle). The model is scripted and the embedder
// is the test vocabulary, so the NUMBERS OF CALLS are what this measures, not
// the quality of what is learned. Rates are assumptions; change them to match
// real use. For real figures on a host, read `core.diagnose()`.
import { world, scope } from "../test/helpers.mjs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, n, all) => a.startsWith("--") ? [[a.slice(2), Number(all[n + 1])]] : []));
const DAYS = args.days || 30, TURNS = args.turns || 10, CORRECT = args.corrections ?? 0.15, FOLLOW = args.followups ?? 0.5;
let seed = args.seed || 7;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = list => list[Math.floor(random() * list.length)];

// Kinds of work the user brings, each with a scene, something to quote, and a lesson a correction could teach.
const WORK = [
  { ask: n => `Write memo ${n} for the director`, anchor: n => `memo ${n} for the director`, scene: "Writing a memo for a busy director", fix: n => `Memo ${n}: put the decision first, the director skims`, teach: { text: "Lead with the decision for the director", about: "director", concrete: "Writing a memo for the director", general: "Writing a document for a busy decision maker" } },
  { ask: n => `Prepare pitch ${n} for the investor`, anchor: n => `pitch ${n} for the investor`, scene: "Preparing a pitch for an investor who skims", fix: n => `Pitch ${n}: start with the ask, the investor skims`, teach: { text: "Put the ask first in a pitch", about: "investor", concrete: "Preparing a pitch for the investor", general: "Preparing a pitch for an investor who skims" } },
  { ask: n => `Write up team meeting notes ${n}`, anchor: n => `team meeting notes ${n}`, scene: "Writing meeting notes for the team", fix: n => `Notes ${n}: keep the team discussion in order`, teach: { text: "Keep team notes in the order of the discussion", about: "team notes", concrete: "Writing meeting notes for the team", general: "Drafting minutes of a team discussion" } },
  { ask: n => `Review patch ${n} for the database migration`, anchor: n => `patch ${n}`, scene: "Reviewing a patch for a database migration", fix: n => `Patch ${n}: show the diff before the explanation`, teach: { text: "Show the diff before explaining a patch", about: "patches", concrete: "Reviewing a patch", general: "Explaining a code change" } },
  { ask: n => `Plan dinner ${n} around the peanut allergy`, anchor: n => `dinner ${n}`, scene: "Cooking dinner around an allergy", fix: n => `Dinner ${n}: no peanut oil either`, teach: { text: "Avoid peanut oil as well as peanuts", about: "allergy", concrete: "Cooking dinner", general: "Planning a meal around an allergy" } },
];

const calls = {}, perDay = [];
const { core, log, say, end, tick } = world(null, { start: "2026-11-02T08:00:00Z" });
let now = () => log.now(), turnNo = 0, sleepAfter = 0, outcomeAfter = 0;
const context = {};
const infer = async (purpose, prompt) => {
  const kind = purpose.replace("asteme-", "");
  calls[kind] = (calls[kind] ?? 0) + 1;
  const input = JSON.parse(prompt.slice(prompt.lastIndexOf("INPUT:") + 6));
  if (kind === "scene") return { scene: context.work.scene, need: "", entities: [] };
  if (kind === "select") return { decisions: input.candidates.filter(c => c.calledBy.fit === "strong").slice(0, 2).map(c => ({ id: c.id, use: "silent", reason: "It bears on this", anchor: context.anchor, expect: "It is accepted" })) };
  if (kind === "reflect") {
    const said = input.RAW.find(r => r.role === "user" && r.text === context.fix);
    if (!said) return { changes: [], feedback: [], episode: { scene: context.work.scene, signals: [] } };
    const known = input.understanding.find(u => u.text === context.work.teach.text && !u.paused && u.status === "active");
    return { feedback: [], episode: { scene: context.work.scene, signals: [{ kind: "correction", strength: "mild", evidence: [{ id: said.id, quote: said.text }] }] },
      changes: [{ op: "put", ...(known ? { id: known.id } : {}), kind: "understanding", certainty: "explicit", reason: "Corrected by the user", tested: "As corrected", hypothesis: "Elsewhere", entities: [],
        evidence: [{ id: said.id, quote: said.text }], ...context.work.teach }] };
  }
  if (kind === "outcome") return { feedback: input.delivered.filter(() => random() < 0.6).map(d => ({ item: d.id, kind: random() < 0.75 ? "helped" : "irrelevant", reason: "The later message shows it", evidence: [{ id: input.later.at(-1).id, quote: input.later.at(-1).text }] })) };
  if (kind === "lesson") return random() < 0.5 ? { skip: { reason: "Different reasons" } } : { lesson: { text: `When the reader will not read on, lead with what matters (${input.cases.map(c => c.about).join(" and ")})`, reason: "Both readers stop early",
    concrete: "Writing a summary for an executive", general: "Writing for a reader with little time", tested: "Two cases", hypothesis: "Other readers", from: input.cases.map(c => c.id), evidence: input.cases.map(c => c.evidence[0]) } };
  if (kind === "imagine") return { scenes: [`Explaining a code change to a maintainer who only reads the summary, case ${calls.imagine}`] };
  if (kind === "reconcile") return { verdict: "distinct", reason: "Different matters", changes: [] };
  if (kind === "habit") return { habits: [], skip: input.candidates.map(c => ({ candidate: c.id, reason: "Not yet" })) };
  return { changes: [], reason: "Nothing to change" };
};
// The host's background pass: reflect what is pending, then outcomes, then sleep, each on its own interval.
const drain = async () => {
  for (const turn of log.pending(scope, "experienced")) await core.reflect(turn, infer);
  if (now() >= outcomeAfter) {
    const ready = core.outcomeCandidates(now()).length;
    if (ready) await core.outcomes({ infer, now: now(), limit: 2 });
    outcomeAfter = now() + (ready ? 60000 : 120000);
  }
  if (now() >= sleepAfter) {
    if (await core.sleepDue(now())) { const report = await core.sleep({ infer, now: now(), budget: 6 }); day.sleeps++; day.jobs += report.ran.length; sleepAfter = now() + (report.left ? 120000 : 600000); }
    else sleepAfter = now() + 600000;
  }
};
let day;
for (let d = 1; d <= DAYS; d++) {
  const before = { ...calls };
  day = { day: d, turns: 0, delivered: 0, sleeps: 0, jobs: 0 };
  for (let n = 0; n < TURNS; n++) {
    const work = pick(WORK), session = `d${d}-s${Math.floor(n / 3)}`, id = ++turnNo;
    Object.assign(context, { work, anchor: work.anchor(id), fix: null });
    const request = say(work.ask(id), session);
    const trace = await core.prepare({ request, recent: [request], infer });
    day.turns++; day.delivered += trace.delivered.length;
    tick(20000); say("Here it is.", session, "assistant");
    // Sometimes the user answers: a correction, or a plain follow-up that outcomes can read.
    if (random() < CORRECT) { tick(90000); context.fix = work.fix(id); say(context.fix, session); }
    else if (random() < FOLLOW) { tick(90000); say(`Thanks, number ${id} works`, session); }
    end(session);
    await drain();
    tick(15 * 60000);                     // a quarter of an hour to the next request
    await drain();
  }
  tick(14 * 3600000);                     // the night: idle, so the host keeps draining
  for (let pass = 0; pass < 12; pass++) { await drain(); tick(10 * 60000); }
  perDay.push({ ...day, ...Object.fromEntries(["scene", "select", "reflect", "outcome", "replay", "reconcile", "revise", "lesson", "imagine", "habit"].map(k => [k, (calls[k] ?? 0) - (before[k] ?? 0)])) });
}

const columns = ["day", "turns", "delivered", "scene", "select", "reflect", "outcome", "sleeps", "replay", "reconcile", "revise", "lesson", "imagine", "habit"];
const row = r => columns.map(c => String(r[c] ?? 0).padStart(Math.max(c.length, 4))).join("  ");
console.log(columns.map(c => c.padStart(Math.max(c.length, 4))).join("  "));
for (const r of perDay.filter((_, n) => n < 7 || (n + 1) % 5 === 0)) console.log(row(r));
const total = perDay.reduce((sum, r) => Object.fromEntries(columns.map(c => [c, (sum[c] ?? 0) + r[c]])), {});
console.log(row({ ...total, day: "sum" }));
const hot = total.scene + total.select, background = total.reflect + total.outcome + total.replay + total.reconcile + total.revise + total.lesson + total.imagine + total.habit;
const diagnosis = core.diagnose(), items = core.items();
console.log(`\n${DAYS} days, ${total.turns} turns (${TURNS}/day, ${Math.round(CORRECT * 100)}% corrected, ${Math.round(FOLLOW * 100)}% of the rest followed up)`);
console.log(`before the reply:  ${(hot / total.turns).toFixed(2)} model calls per turn (scene always; admission on ${Math.round(100 * total.select / total.turns)}% of turns)`);
console.log(`in the background: ${(background / total.turns).toFixed(2)} model calls per turn, of which sleep ${((background - total.reflect - total.outcome) / total.turns).toFixed(2)}`);
console.log(`sleep cycles: ${total.sleeps} (${(total.sleeps / DAYS).toFixed(1)}/day), ${(perDay.reduce((n, r) => n + r.jobs, 0) / Math.max(1, total.sleeps)).toFixed(1)} jobs per cycle, queue now ${JSON.stringify(diagnosis.sleep.queued)}`);
console.log(`episodes: ${diagnosis.sleep.episodes}, stood out: ${diagnosis.sleep.standingOut}; signals ${JSON.stringify(diagnosis.sleep.signals)}`);
console.log(`outcomes: ${JSON.stringify(diagnosis.outcomes.recorded)}; deliveries still waiting: ${diagnosis.outcomes.waiting.length}`);
console.log(`memory: ${items.filter(i => i.level === "case").length} cases, ${items.filter(i => i.level === "lesson").length} lessons, ${Object.keys(core.core().habits ?? {}).length} habits`);
log.close();
