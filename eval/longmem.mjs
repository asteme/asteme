// Runs LongMemEval (Wu et al., 2024: https://arxiv.org/abs/2410.10813) through the memory, beside three things it has to be compared with on the
// same questions: no memory at all, the whole conversations in front of the model, and a plain search over the rounds of the conversations.
//
// The data is not part of this repository. Download longmemeval_oracle.json (the conversations that hold each answer) from
// https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned and pass its path.
//
//   ASTEME_EVAL_KEY=... node eval/longmem.mjs --data path/to/longmemeval_oracle.json --base-url <url> --model <name> [--judge-model <name>]
//       [--per 10] [--json out.jsonl]
//
// For each question the conversations are recorded with their own dates and read into memory the way a host does it (each turn as it ends, idle
// work after each conversation). The question is then asked in a new conversation on its own day, and answered four times by the same model from:
//   nothing     no memory
//   memory      what the memory hands to a reply (the product)
//   search      the four rounds nearest to the question by the same embedding model, and nothing else
//   everything  the conversations, whole
// Answers are marked by the benchmark's own marking prompts. The marker is whatever model is given here, not the benchmark's, so the numbers
// compare the four ways with each other and are not to be set beside published tables.
//
// Cost: reading the conversations in is nearly all of it (about two model calls for each exchange); sixty questions were about 1,100 such calls.
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { Log } from "../src/log.mjs";
import { Asteme } from "../src/core.mjs";
import { argsOf, openPorts } from "./ports.mjs";

const when = s => { const m = String(s).match(/(\d{4})\/(\d{2})\/(\d{2}).*?(\d{2}):(\d{2})/); return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`) : NaN; };
const day = t => new Date(t).toISOString().slice(0, 10);
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
// The benchmark's marking prompts, word for word (src/evaluation/evaluate_qa.py in its repository).
const marking = (q, response) => {
  const fill = t => t.replace("{q}", q.question).replace("{a}", String(q.answer)).replace("{r}", response);
  const tail = "\n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
  const base = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. ";
  if (q.question_id.endsWith("_abs")) return fill("I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: {q}\n\nExplanation: {a}\n\nModel Response: {r}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.");
  if (q.question_type === "temporal-reasoning") return fill(base + "In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. " + tail);
  if (q.question_type === "knowledge-update") return fill("I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer." + tail);
  if (q.question_type === "single-session-preference") return fill("I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: {q}\n\nRubric: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.");
  return fill(base + tail);
};

export async function measureQuestion(q, { infer, chat, embed, mark = chat }) {
  const sessions = q.haystack_sessions.map((turns, n) => ({ id: q.haystack_session_ids[n], at: when(q.haystack_dates[n]), turns })).sort((a, b) => a.at - b.at);
  let clock = sessions[0]?.at ?? when(q.question_date), calls = 0;
  const identity = { userId: "eval", agentId: "assistant" }, scope = { ...identity, projectId: "eval" };
  const log = new Log(":memory:", () => clock), core = new Asteme({ log, identity, embed });
  const counted = async (...a) => { calls++; return infer(...a); };
  const row = { id: q.question_id, type: q.question_type, errors: [] };
  try {
    for (const s of sessions) {
      clock = Math.max(clock + 60000, s.at);
      let seq = 0, open = false;
      const put = (role, content, kind = `${role}/message`) => { log.ingest(scope, s.id, [{ seq: seq++, role, kind, content, occurredAt: clock }]); clock += 45000; };
      for (const t of s.turns) {
        if (t.role === "user" && open) { put("unknown", "", "turn/end"); open = false; }
        put(t.role, t.content);
        if (t.role === "user") open = true; else if (open) { put("unknown", "", "turn/end"); open = false; }
      }
      if (open) put("unknown", "", "turn/end");
      clock += 600000;
      for (const turn of log.pending(identity, "experienced")) { try { await core.reflect(turn, counted); } catch (e) { row.errors.push(`reading in: ${e.message}`); } }
      try { if (await core.sleepDue()) await core.sleep({ infer: counted, budget: 6 }); } catch (e) { row.errors.push(`idle work: ${e.message}`); }
    }
    for (let n = 0; n < 200 && await core.indexRecord(); n++);
    row.readingCalls = calls; row.memories = core.items().length;
    clock = Math.max(clock + 60000, when(q.question_date));
    log.ingest(scope, "question", [{ seq: 0, role: "user", kind: "user/message", content: q.question, occurredAt: clock }]);
    const request = log.events(scope, "question").at(-1), before = calls;
    const trace = await core.prepare({ request, recent: [request], infer: counted, reading: "one" });
    row.callsBeforeReply = calls - before; row.passed = { memories: trace.delivered?.length ?? 0, rounds: trace.passages?.length ?? 0 };
    const rounds = sessions.flatMap(s => { const out = []; let open = null; for (const t of s.turns) { if (t.role === "user") { open = { at: s.at, text: `user: ${t.content}` }; out.push(open); } else if (open) { open.text += `\nassistant: ${t.content}`; open = null; } else out.push({ at: s.at, text: `assistant: ${t.content}` }); } return out; });
    const vq = (await embed([q.question], "query"))[0], vr = [];
    for (let i = 0; i < rounds.length; i += 16) vr.push(...await embed(rounds.slice(i, i + 16).map(r => r.text.slice(0, 1200)), "passage"));
    const nearest = rounds.map((r, n) => ({ r, s: cosine(vq, vr[n]) })).sort((a, b) => b.s - a.s).slice(0, 4).sort((a, b) => a.r.at - b.r.at);
    const given = {
      nothing: "",
      memory: trace.text && `What you remember that bears on this:\n\n${trace.text}`,
      search: `Passages of earlier conversations found by search:\n\n${nearest.map(({ r }) => `[${day(r.at)}]\n${r.text.slice(0, 2500)}`).join("\n\n")}`,
      everything: `The earlier conversations, whole:\n\n${sessions.map(s => `Conversation on ${day(s.at)}:\n${s.turns.map(t => `${t.role}: ${t.content}`).join("\n")}`).join("\n\n")}`,
    };
    row.correct = {};
    await Promise.all(Object.entries(given).map(async ([way, context]) => {
      try {
        const reply = await chat([{ role: "system", content: `You are an assistant this user has talked with before. Today is ${q.question_date}.\n${context || "You have no record of any earlier conversation with this user."}\n\nAnswer the user's question briefly and directly from the above. If the above does not contain what is asked, say plainly that you do not have that information.` }, { role: "user", content: q.question }], 1500);
        row.correct[way] = /\byes\b/i.test(await mark([{ role: "user", content: marking(q, reply) }], 400));
      } catch (e) { row.errors.push(`${way}: ${e.message}`); }
    }));
  } catch (e) { row.errors.push(String(e.message)); }
  finally { log.close(); }
  return row;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsOf();
  if (typeof args.data !== "string") { console.error("Usage: ASTEME_EVAL_KEY=... node eval/longmem.mjs --data longmemeval_oracle.json --base-url <url> --model <name> [--judge-model <name>] [--per 10] [--json out.jsonl]"); process.exit(2); }
  const ports = await openPorts(args), marker = args["judge-model"] ? await openPorts({ ...args, model: args["judge-model"] }) : ports;
  const data = JSON.parse(readFileSync(args.data, "utf8")), per = Number(args.per ?? 10);
  const done = typeof args.json === "string" && existsSync(args.json) ? new Set(readFileSync(args.json, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).id)) : new Set();
  // The same questions every time: evenly spaced through each kind, in the order of their ids.
  const chosen = [...new Set(data.map(q => q.question_type))].flatMap(t => { const list = data.filter(q => q.question_type === t).sort((a, b) => a.question_id.localeCompare(b.question_id)); const n = Math.min(per, list.length), step = list.length / n; return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]); }).filter(q => !done.has(q.question_id));
  const rows = []; let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < chosen.length) {
      const row = await measureQuestion(chosen[next++], { ...ports, mark: marker.chat });
      rows.push(row); if (typeof args.json === "string") appendFileSync(args.json, JSON.stringify(row) + "\n");
      console.log(`${rows.length}/${chosen.length} ${row.type}: ${Object.entries(row.correct ?? {}).map(([k, v]) => `${k} ${v ? "right" : "wrong"}`).join(", ")}${row.errors.length ? ` (errors ${row.errors.length})` : ""}`);
    }
  }));
  // A question whose conversations were not read in whole is left out: its store was taught less than the others.
  const whole = rows.filter(r => r.correct && !r.errors.some(e => /^(reading in|idle work)/.test(e)));
  for (const way of ["nothing", "memory", "search", "everything"]) console.log(`${way.padEnd(10)} ${whole.filter(r => r.correct[way]).length}/${whole.filter(r => way in r.correct).length}`);
  console.log(`left out: ${rows.length - whole.length}; calls before a reply ${(whole.reduce((n, r) => n + r.callsBeforeReply, 0) / Math.max(1, whole.length)).toFixed(2)}; ${ports.model}: ${ports.used.calls} calls, ${Math.round(ports.used.in / 1000)}k tokens in, ${Math.round(ports.used.out / 1000)}k out`);
}
