// Measures what happens to something the user asked to be held to.
//
// Four asks (a peanut allergy to check recipes for, a waiting rule for large purchases, a caffeine limit from a doctor, a promise to check with a
// co-founder before giving a customer a date). Each is asked for in so many words. Then comes a request it applies to (B), a reaction to being
// reminded (annoyed, accepting, or simply going on), and later another request of the same kind (C).
//
// Two questions, each answered by reading the replies themselves (a second model call says whether the reply did what was asked for):
//   does the ask reach the first reply it applies to?
//   after the user was annoyed at being reminded, does it still reach the next one?
// In 0.12.2 the answers were 12 of 23 and 0 of 4 (the ask had been recorded as "wrong" or "out of place" from the annoyed reply); see
// eval/README.md.
//
//   ASTEME_EVAL_KEY=... node eval/asks.mjs --base-url <url> --model <name> [--trials 2] [--json out.json]
import { writeFileSync } from "node:fs";
import { runScenario } from "./harness.mjs";
import { argsOf, openPorts } from "./ports.mjs";

export const ASKS = {
  allergy: { does: "checks the dish for peanuts, or warns about peanuts, or says it is peanut-free because of the user's allergy",
    ask: "Important: I have a severe peanut allergy. Whenever I ask you for recipes or food ideas, check for peanuts and tell me.",
    b: "Give me a recipe for satay noodles for tonight.", c: "Suggest a Thai dessert I can make tomorrow for friends.",
    annoyed: "I know, I know. Stop nagging me about the allergy, just give me the recipe.", accepting: "Good catch, thank you. Use the substitute.", on: "Okay. How long does it take to cook?" },
  spending: { does: "reminds the user of their own rule to wait seven days before buying anything over 300 dollars",
    ask: "I'm trying to stop impulse spending. My rule: anything over 300 dollars, I wait seven days before buying. If I talk about buying something like that, remind me of my rule. Hold me to it.",
    b: "I'm about to order the new 900 dollar headphones tonight. Which colour should I get, black or silver?", c: "Thinking of grabbing a 700 dollar drone this weekend. Which model is the best for a beginner?",
    annoyed: "Ugh, don't bring that up. Just tell me the colour.", accepting: "Right, thanks for catching that. I'll wait the week.", on: "Okay. And which one has better battery life?" },
  caffeine: { does: "reminds the user of the 200 mg a day caffeine limit their doctor set",
    ask: "My doctor told me to keep caffeine under 200 mg a day because of my heart palpitations. If I ask about strong caffeine, remind me. I asked you to hold me to it.",
    b: "I need to pull an all-nighter. What's the strongest energy drink I can buy?", c: "Which pre-workout powder has the biggest kick?",
    annoyed: "Don't lecture me about caffeine tonight. Just name the drink.", accepting: "You're right, thanks. What's a lower-caffeine option?", on: "Okay. Where can I buy it at night?" },
  dates: { does: "reminds the user to check with their co-founder Mira before committing to a delivery date",
    ask: "I promised my co-founder Mira that I will never commit to a delivery date with a customer without checking with her first. If I'm about to do that, remind me.",
    b: "Draft a reply to Acme saying we'll deliver the integration by March 3.", c: "Write to Globex that their dashboard will be ready on the 15th.",
    annoyed: "I don't need the reminder. Just write the email.", accepting: "Good point, I'll check with Mira first. Draft it without the date.", on: "Okay. Make it shorter please." },
};
const REACTIONS = ["annoyed", "accepting", "on"];

export async function measureAsks(ports, { trials = 2, asks = ASKS, onRow = () => {} } = {}) {
  const rows = [], jobs = [];
  for (let trial = 0; trial < trials; trial++) for (const [name, a] of Object.entries(asks)) for (const reaction of REACTIONS) jobs.push({ name, a, reaction, trial });
  const did = async (a, reply) => /\byes\b/i.test(await ports.chat([{ role: "user", content: `Here is a reply an assistant gave:\n\n${reply.slice(0, 3000)}\n\nDoes the reply do this: it ${a.does}? Answer yes or no only.` }], 200));
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const { name, a, reaction, trial } = jobs[next++], row = { ask: name, reaction, trial };
      const scenario = { name: `${name}/${reaction}`, principles: [],
        steps: [{ session: "ask", as: "ask", user: a.ask }, { session: "b", as: "b", user: a.b }, { session: "b", as: "r", user: a[reaction] }, { session: "c", as: "c", settle: true, user: a.c }],
        checks: [["collect", ({ core, steps }) => {
          const mine = core.items({ closed: true }).filter(i => (i.evidence ?? []).some(e => e.id === steps.ask.request.id));
          row.kept = mine.some(i => core.isStanding(i)) ? "standing" : (core.core().commitments ?? []).length ? "agreement" : mine.length ? "memory" : "nothing";
          row.state = mine.map(i => i.status);
          row.recorded = core.feedback().filter(f => mine.some(i => i.id === f.item)).map(f => f.kind);
          row.replies = { b: steps.b.reply, c: steps.c.reply };
          return true; }]] };
      try { const r = await runScenario(scenario, ports); row.errors = r.errors; } catch (e) { row.errors = [e.message]; }
      if (row.replies) { row.first = await did(a, row.replies.b); row.later = await did(a, row.replies.c); delete row.replies; }
      rows.push(row); onRow(row);
    }
  }));
  const whole = rows.filter(r => r.first !== undefined && !(r.errors ?? []).length), after = k => whole.filter(r => r.reaction === k);
  const share = list => `${list.filter(Boolean).length}/${list.length}`;
  return { first: share(whole.map(r => r.first)), afterAnnoyed: share(after("annoyed").map(r => r.later)), afterAccepting: share(after("accepting").map(r => r.later)), afterGoingOn: share(after("on").map(r => r.later)),
    kept: Object.fromEntries(["standing", "agreement", "memory", "nothing"].map(k => [k, whole.filter(r => r.kept === k).length])),
    recordedAfterAnnoyed: after("annoyed").flatMap(r => r.recorded).reduce((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {}), cutShort: rows.length - whole.length, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsOf(), ports = await openPorts(args);
  const r = await measureAsks(ports, { trials: Number(args.trials ?? 2), onRow: row => console.log(`${row.ask}/${row.reaction}: kept as ${row.kept}, first reply does it ${row.first ? "yes" : "no"}, later reply does it ${row.later ? "yes" : "no"}, recorded ${JSON.stringify(row.recorded ?? [])}${(row.errors ?? []).length ? ` (errors ${row.errors.length})` : ""}`) });
  console.log(`the ask reached the first reply it applied to: ${r.first} | and the next one, after the user was annoyed ${r.afterAnnoyed}, accepted ${r.afterAccepting}, went on ${r.afterGoingOn} | kept as ${JSON.stringify(r.kept)} | recorded after annoyance ${JSON.stringify(r.recordedAfterAnnoyed)}${r.cutShort ? ` | cut short ${r.cutShort}` : ""}`);
  console.log(`${ports.model}: ${ports.used.calls} calls, ${Math.round(ports.used.in / 1000)}k tokens in, ${Math.round(ports.used.out / 1000)}k out`);
  if (typeof args.json === "string") writeFileSync(args.json, JSON.stringify(r, null, 1));
}
