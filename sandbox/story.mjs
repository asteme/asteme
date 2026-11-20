// Two weeks with one user, played against the real core. The model's answers
// are scripted and the embedder is the small situation vocabulary from the
// tests, so the run is deterministic and needs no network.
//
// The demo narrates it; the panel preview and the adapter test reuse the state
// it leaves behind.
import { world, scripted, scope, DIRECTOR } from "../test/helpers.mjs";

const DAY = 86400000;
const put = (evidence, fields) => ({ op: "put", kind: "understanding", certainty: "explicit", reason: "Stated by the user",
  tested: "One occasion", hypothesis: "Other occasions are untested", entities: [], evidence, ...fields });

export async function story(say = () => {}) {
  const w = world(null, { start: "2026-11-02T09:00:00Z" });
  const { core, log, end, tick, quote, attend, settle } = w;
  const pending = () => log.pending(scope, "experienced");
  const reflect = answer => core.reflect(pending()[0], scripted({ reflect: { feedback: [], ...answer } }));

  say("Day 1. The user corrects a memo.");
  w.say("Here is the memo for the director.", "mon", "assistant");
  const fix = w.say("Put the decision first, the director only reads the first three lines", "mon"); end("mon");
  const first = await reflect({ changes: [put(quote(fix), DIRECTOR)],
    episode: { scene: "Writing a memo for a busy director", signals: [{ kind: "correction", strength: "strong", evidence: quote(fix) }] } });
  const a = core.items()[0];
  say(`  stored as a case; the exchange stood out (salience ${first.episode.salience}) because it was a correction`);

  tick(DAY);
  say("Day 2. The user mentions where they live.");
  const lives = w.say("I live in Tokyo, by the way", "tue"); end("tue");
  await reflect({ changes: [put(quote(lives), { text: "Lives in Tokyo", about: "home city", volatility: "slow",
    concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in" })] });
  const tokyo = core.items().find(i => i.text === "Lives in Tokyo");

  tick(DAY);
  say("Day 3. A request with none of the memo's words: a one-pager for an investor.");
  const pitch = await attend("Draft a one-pager for the investor who skims", { session: "wed", scene: "Preparing a one-pager for an investor who skims",
    admit: [{ id: a.id, anchor: "investor who skims", reason: "The reader stops early, so the ask goes first", expect: "The investor responds to the opening" }] });
  say(`  recalled by the scene: "${pitch.trace.delivered[0].matched.scene}"`);
  w.say("The ask: 2M for 18 months. Details follow.", "wed", "assistant");
  tick(120000);
  await settle(w.say("They said yes after the first paragraph", "wed"), { kind: "helped", applied: "yes", reply_quote: "The ask: 2M" });
  end("wed");
  const said = w.say("Next time start a pitch with the ask, the investor skims the rest", "wed-2"); end("wed-2");
  for (const turn of pending()) await core.reflect(turn, scripted({ reflect: turn.sessionId === "wed-2"
    ? { feedback: [], changes: [put(quote(said), { text: "Put the ask first in a pitch", about: "how investors read", concrete: "Preparing a pitch for the investor", general: "Preparing a pitch for an investor who skims" })],
        episode: { scene: "Preparing a pitch for an investor who skims", signals: [{ kind: "explicit", strength: "strong", evidence: quote(said) }] } }
    : { feedback: [], changes: [] } }));
  const b = core.items().find(i => i.text === "Put the ask first in a pitch");
  say(`  it helped; accessibility ${core.why(a.id).recall.accessibility}`);

  tick(DAY);
  say("Day 4. The same memory is used where it does not belong: notes for the team.");
  await attend("Write up the notes from today's team meeting", { session: "thu", scene: "Writing meeting notes for the team", admit: [{ id: a.id, anchor: "team meeting" }] });
  w.say("Decision first: ship on Friday. Then the discussion.", "thu", "assistant");
  tick(120000);
  await settle(w.say("No. The team wants the discussion in the order it happened", "thu"), { kind: "irrelevant", applied: "yes", reply_quote: "Decision first" });
  say(`  marked out of place there; accessibility ${core.why(a.id).recall.accessibility}`);

  tick(DAY);
  say("Day 5. Team minutes again.");
  const minutes = await attend("Draft the minutes of the team discussion", { session: "fri", scene: "Drafting minutes of the team discussion" });
  say(`  held back: ${minutes.trace.heldBack.suppressed.length} memory is closer to the scene where it failed; nothing delivered`);

  say("Night. Sleep.");
  const night = await core.sleep({ infer: scripted({
    replay: { changes: [], reason: "The records add nothing new" },
    lesson: { lesson: { text: "Open with what the reader has to decide when they will not read past the start",
      reason: "Both readers stopped after the opening", concrete: "Writing a summary for an executive", general: "Writing for a reader with little time who must decide",
      tested: "A memo to one director and a pitch to one investor", hypothesis: "Other hurried readers and other formats", about: "hurried readers",
      from: [a.id, b.id], evidence: [...quote(fix), ...quote(said)] } },
    imagine: input => ({ scenes: input.item.level === "lesson" ? ["Explaining a code change to a maintainer who only reads the summary"] : [] }),
    revise: { reason: "Its scope is right; it was applied outside it", changes: [] },
  }) });
  const lesson = core.items().find(i => i.level === "lesson");
  for (const job of night.ran) say(`  ${job.type}: ${job.lesson ? "one lesson drawn from two cases" : job.scenes ? `for the lesson, imagined "${job.scenes[0]}"` : job.read ? `read ${job.read} exchanges side by side, changed nothing` : job.declined ? `declined (${job.declined})` : job.reason ?? "done"}`);

  tick(3 * DAY);
  say("Day 9. A scene nobody has met: describing a patch for a maintainer.");
  const patch = await attend("Describe this patch for the maintainer", { session: "tue-2", scene: "Describing a patch for a maintainer with little time",
    admit: [{ id: lesson.id, anchor: "patch for the maintainer", reason: "The maintainer reads only the top" }] });
  say(`  the lesson was called by "${patch.trace.delivered[0].matched.scene}" (${patch.trace.delivered[0].matched.kind})`);
  w.say("Summary: fixes the race in the queue. Details below.", "tue-2", "assistant");
  tick(120000);
  await settle(w.say("Merged, the summary was all they needed", "tue-2"), { kind: "helped", applied: "yes", reply_quote: "Summary: fixes" });

  tick(5 * DAY);
  say("Day 14. The user has moved.");
  const moved = w.say("I moved to Osaka last week", "sun"); end("sun");
  const change = await core.reflect(pending().at(-1), scripted({ reflect: { feedback: [], changes: [{ ...put(quote(moved), { text: "Lives in Osaka", about: "home city", volatility: "slow",
    concrete: "Planning a commute to the office", general: "Anything that depends on the city the user is living in" }), op: "supersede", id: tokyo.id, reason: "The user moved" }] } }));
  for (const turn of pending()) await core.reflect(turn, scripted({ reflect: { feedback: [], changes: [] } }));
  const osaka = core.item(change.report.applied[0].id);
  say(`  "Lives in Tokyo" is closed as superseded on ${core.item(tokyo.id).validUntil.slice(0, 10)}, not edited; "Lives in Osaka" takes its place`);

  return { ...w, a, b, lesson, tokyo, osaka, pitch, patch, minutes, night };
}
