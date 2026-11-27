// A DSH-free run of the whole loop: two weeks with one user, then the questions
// a person would ask of a memory. Everything the adapter would supply (model
// answers, embeddings, scheduling) is scripted in story.mjs.
//
//   node sandbox/demo.mjs
import { story } from "./story.mjs";

const print = line => console.log(line);
const { core, log, a, lesson, tokyo, osaka, patch } = await story(print);

print("\nWhat is in memory now");
for (const item of core.items({ closed: true })) {
  const recall = core.why(item.id).recall;
  print(`  [${item.level}${item.status === "active" ? "" : ", " + item.status}] ${item.text}  (how its uses have gone: ${recall.accessibility})`);
}

print("\nWhy does it believe the lesson?");
const why = core.why(lesson.id);
for (const s of why.supports) print(`  rests on the user's words: "${s.quote}"`);
print(`  drawn from: ${why.drawnFrom.map(p => `"${p.text}"`).join(" and ")}`);
print(`  answers to: ${why.recall.answersTo.map(c => `${c.scene} [${c.because}]`).join("; ")}`);

print("\nWhy did the first case go quiet for team notes?");
const quiet = core.why(a.id);
for (const c of quiet.recall.staysOutOf) print(`  it stays out of: ${c.scene} [${c.because}]`);
for (const o of quiet.outcomes) print(`  ${o.kind} in "${o.scene}": "${o.evidence[0]?.quote ?? ""}"`);

print("\nWhat did the patch reply have in view?");
const told = core.explain(patch.request.id), reading = told.readings[0];
print(`  scene read: ${reading.scene.scene}`);
for (const d of reading.delivered) print(`  delivered (${d.use}): "${d.text}" because ${d.because}; source: "${d.evidence[0].quote}"`);
for (const o of told.outcomes) print(`  afterwards: ${o.kind}, "${o.evidence[0].quote}"`);

print("\nWhat happened to the old address?");
const past = core.why(tokyo.id);
print(`  "${past.item.text}" is ${past.item.status}, replaced by "${past.replacedBy.text}"; it is still found by search: ${core.search("Tokyo").understanding.some(i => i.id === tokyo.id)}`);
print(`  history: ${past.history.filter(h => h.status).map(h => `${h.status} (${h.reason})`).join(" -> ")}`);
print(`  "${core.item(osaka.id).text}" replaced: "${core.why(osaka.id).replaced.text}"`);

print("\nThe charter in force (experience cannot change it)");
const charter = core.charter();
print(`  purpose: ${charter.purpose}`);
print(`  ${charter.charterIsDefault ? "these are the defaults; the user has not written their own" : "written by the user"}`);

log.close();
