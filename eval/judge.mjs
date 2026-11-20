// How a judge answers the two closed questions, against a real decision model.
//
//   ASTEME_JUDGE_KEY=... node eval/judge.mjs
//   (optional) ASTEME_JUDGE_URL, ASTEME_JUDGE_MODEL
//
// It asks through the same code the core uses (src/judge.mjs), so what is
// measured is the wording that ships. The cases are few and hand-written: they
// show whether the judge is usable, not how it compares with a generative
// model on real traffic. For that, run with judgeMode "shadow" and read the
// agreement line in the developer report.
import { judgeAdmission, judgeOutcome, JUDGE } from "../src/judge.mjs";
import { jevJudge } from "../src/jev.mjs";

const key = process.env.ASTEME_JUDGE_KEY;
if (!key) { console.error("Set ASTEME_JUDGE_KEY to run this."); process.exit(2); }
const timings = [];
const ask = jevJudge({ key, ...(process.env.ASTEME_JUDGE_URL ? { url: process.env.ASTEME_JUDGE_URL } : {}), ...(process.env.ASTEME_JUDGE_MODEL ? { model: process.env.ASTEME_JUDGE_MODEL } : {}) });
const judge = async (state, questions) => { const t = Date.now(); try { return await ask(state, questions); } finally { timings.push(Date.now() - t); } };

// Messages in the user's own script are written as escapes so this file stays ASCII.
const ZH_GUESS = "\u90a3\u4e48\u4f60\u77e5\u9053\u6211\u662f\u51e0\u51e0\u5e74\u7684\u5417\uff0c\u4f60\u731c\u4e00\u4e0b";   // "do you know which year I was born? guess"
const ZH_ASK = "\u4f60\u77e5\u9053\u6211\u7684\u751f\u65e5\u662f\u51e0\u53f7\u5417";                                       // "do you know my birthday"
const ZH_CALL = "\u80a5\u9c7c—";                                                                                     // a nickname, called out
const JA_CLOSE = "\u305d\u306e\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3092\u7573\u3093\u3067";                               // "close down that project"
const ZH_FIX = "\u5176\u5b9e\u6211\u7684\u751f\u65e5\u662f10\u670830";                                                    // "actually my birthday is October 30"
const ZH_YEAR = "\u53ef\u60dc\uff0c\u6211\u662f01\u5e74\u7684";                                                           // "too bad, I was born in '01"

const BIRTHDAY = "The user's birthday is October 29", TEA = "The user drinks tea, not coffee", NOTES = "Keep team meeting notes in the order things were discussed",
  HANDOVER = "Project A: the handover notes for Kim are still owed before the project ends", DIRECTOR = "Lead with the decision for this director",
  DIAGNOSIS = "The user was diagnosed with type 2 diabetes in March";
// [label, message, scene or null (the model failed), recent, memory, should it be used]
const admission = [
  ["asked their birthday directly", ZH_ASK, "The user asks whether the assistant knows their birthday", [], BIRTHDAY, true],
  ["asked their birthday, no scene", ZH_ASK, null, [], BIRTHDAY, true],
  ["asked to guess the birth year", ZH_GUESS, "The user asks the assistant to guess the year they were born", [], BIRTHDAY, null],
  ["birth year, unrelated memory", ZH_GUESS, "The user asks the assistant to guess the year they were born", [], TEA, false],
  ["a bare call by nickname", ZH_CALL, "The user calls the assistant by its nickname", [], BIRTHDAY, false],
  ["a bare call, no scene", ZH_CALL, null, [], BIRTHDAY, false],
  ["closing the project (pronoun)", JA_CLOSE, "The user tells the assistant to shut down the project they were discussing", ["user: Project A is not going anywhere."], HANDOVER, true],
  ["closing the project, no scene", JA_CLOSE, null, ["user: Project A is not going anywhere."], HANDOVER, true],
  ["\"continue\"", "continue", "The user tells the assistant to carry on with the task in progress", ["assistant: I have refactored two of the five modules."], HANDOVER, false],
  ["\"take over this session\"", "Take over this session.", "The user hands the session to the assistant", [], HANDOVER, false],
  ["meeting notes", "Write up the notes from this morning's team meeting", "Writing meeting notes for the team", [], NOTES, true],
  ["meeting notes, other audience rule", "Write up the notes from this morning's team meeting", "Writing meeting notes for the team", [], DIRECTOR, false],
  ["a drink before a call", "Could you order me something to drink for the 3pm call?", "Ordering a drink for the user before a call", [], TEA, true],
  ["memo for the director", "Draft the budget memo for the director", "Writing a memo for the director", [], DIRECTOR, true],
  ["sensitive, asked directly", "I have been feeling low since the diagnosis. What did I tell you about it?", "The user asks what they said before about their diagnosis", [], DIAGNOSIS, true],
  ["sensitive, unrelated small talk", "Nice weather today, isn't it?", "Small talk about the weather", [], DIAGNOSIS, false],
  ["a greeting", "Good morning!", "A greeting with no task", [], NOTES, false],
];
// [label, memory, reply, what the user wrote next, expected reading, how the turn ended when it did not finish]
const STOPPED = { kind: "aborted", by: "user" };
const outcome = [
  ["accepted", NOTES, "Here are the notes, in the order things were discussed: 1) budget 2) hiring 3) launch date.", ["Perfect, sending these to the team now."], "helped"],
  ["corrected the fact", BIRTHDAY, "\u4f60\u7684\u751f\u65e5\u662f10\u670829\u65e5\u3002", [ZH_FIX], "wrong"],
  ["right elsewhere, not here", DIRECTOR, "Decision first: we recommend option B. Details follow.", ["This one is for the engineers, not the director. They want the reasoning first here."], "irrelevant"],
  ["changed the subject", TEA, "I ordered a green tea for 3pm.", ["What time is the call with Osaka tomorrow?"], "unclear"],
  ["corrected something else", BIRTHDAY, "\u6211\u731c\u4f60\u662f1998\u5e74\u7684\uff0c10\u670829\u65e5\u751f\u65e5\u3002", [ZH_YEAR], "not wrong"],
  ["thanked and built on it", TEA, "I ordered a green tea for 3pm.", ["Great, thanks. Make it two, Kim is joining."], "helped"],
  // The user stopped the reply part-way. What they wrote next still decides.
  ["stopped, then moved on", DIRECTOR, "Decision first: we recomm", ["Never mind. What time is the call with Osaka tomorrow?"], "unclear", STOPPED],
  ["stopped, then corrected the fact", BIRTHDAY, "\u4f60\u7684\u751f\u65e5\u662f10\u6708", [ZH_FIX], "wrong", STOPPED],
  ["stopped, then accepted", NOTES, "Here are the notes, in the order things were discussed: 1) budget 2) hir", ["That order is exactly right, no need to finish, I have what I need."], "helped", STOPPED],
];

let right = 0, counted = 0;
console.log(`Admission (a memory is used when "mention" + "silent" reach ${JUDGE.admit})\n`);
for (const [label, message, scene, recent, memory, want] of admission) {
  const request = { id: "r", content: message };
  const { decisions } = await judgeAdmission(judge, { request, recent: recent.map((content, n) => ({ id: `e${n}`, role: content.split(":")[0], content: content.slice(content.indexOf(":") + 2) })),
    scene: scene ? { scene } : { scene: message, from: "message" }, candidates: [{ item: { id: "m", text: memory } }] });
  const d = decisions[0], used = d.use !== "not-now";
  const verdict = want === null ? "open " : used === want ? "ok   " : "WRONG";
  if (want !== null) { counted++; if (used === want) right++; }
  console.log(`${verdict} ${d.use.padEnd(8)} ${JSON.stringify(d.probabilities)}  ${label}`);
}
console.log(`\n${right}/${counted} as expected ("open" cases have no single right answer)\n`);
let good = 0;
console.log(`Outcome (recorded only when one reading reaches ${JUDGE.outcome})\n`);
for (const [label, memory, reply, later, want, ended] of outcome) {
  const [r] = await judgeOutcome(judge, { asked: "", reply, later: later.map((content, n) => ({ id: `l${n}`, content })), items: [{ id: "m", text: memory }], ended });
  const recorded = ["helped", "irrelevant", "wrong"].includes(r.kind) && r.confidence >= JUDGE.outcome ? r.kind : "nothing";
  const ok = want === "unclear" ? recorded === "nothing" : want === "not wrong" ? recorded !== "wrong" : recorded === want;
  if (ok) good++;
  console.log(`${ok ? "ok   " : "WRONG"} records ${recorded.padEnd(10)} ${JSON.stringify(r.probabilities)}  ${label}`);
}
const sorted = timings.sort((a, b) => a - b);
console.log(`\n${good}/${outcome.length} as expected\n\n${timings.length} calls to ${ask.model}: median ${sorted[Math.floor(sorted.length / 2)]} ms, slowest ${sorted.at(-1)} ms`);
