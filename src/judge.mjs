// The judge port. A judge does not write: it is given a state and a set of
// closed questions and returns a probability for each option. Decision models
// answer in a fraction of a second, so the two places where the loop only needs
// a verdict (may this memory be used now; how did its use turn out) can be
// asked there instead of waiting on a generative model.
//
//   judge(state, questions) -> answers
//   questions: { key: { type: "choice", instructions, criteria: { option: description } } }
//   answers:   { key: { choice, confidence, probabilities: { option: p } } }
//
// What a judge cannot give is a reason in words or a quote. A decision made
// here is therefore recorded as the judge's, with its probabilities, and the
// evidence for an outcome is attached by code: the user's own later message.
import { cut } from "./log.mjs";

export const JUDGE = {
  // How sure the judge must be that a candidate does not belong before its
  // word is taken in place of asking the model a second time.
  sure: 0.8,
  // How far toward using a memory the judge has to lean before a second call to the model is made for it.
  // Measured on a real host at 0.6: three plain messages in three (a thank-you, the weather) each waited for a second call that delivered nothing.
  lean: 0.8,
  admit: 0.5,    // a memory is used when "mention" and "silent" together reach this
  outcome: 0.7,  // an outcome is recorded when one reading reaches this
};
const round = n => Number(Number(n).toFixed(3));
const note = item => cut([item.text, item.kind === "concern" && item.closure?.when ? `(an open matter; it ends when: ${item.closure.when})` : ""].filter(Boolean).join(" "), 700);
const exchange = (events, skip) => events.filter(e => e.id !== skip && e.content).slice(-4).map(e => `${e.role}: ${cut(e.content, 400)}`);

// The wording was settled on real traffic: with the memory quoted inside the
// question, a message that corrects a stored fact was read as "about something
// else". Notes are given in the state and the question points at one of them.
const ADMIT = {
  mention: "Yes, openly: the message asks about, corrects or changes what this note records, or the reply has to state it",
  silent: "Yes, quietly: the note is a rule or preference that applies to this very task and the people it is for, and the reply should follow it without bringing it up",
  leave: "No: the note is about a different matter, or the reply would come out the same without it",
};
/** One request for all candidates. Returns decisions in the shape admission expects. */
export async function judgeAdmission(judge, { request, recent = [], scene, candidates }) {
  const state = { message: cut(request.content, 4000), ...(scene?.from === "message" || !scene?.scene ? {} : { situation: scene.scene }), recent: exchange(recent, request.id),
    notes: Object.fromEntries(candidates.map((c, n) => [`note_${n + 1}`, note(c.item)])) };
  const questions = Object.fromEntries(candidates.map((c, n) => [`c${n + 1}`, { type: "choice", criteria: ADMIT,
    instructions: `notes holds things the assistant remembers from earlier conversations with this user. ${c.item.sensitive?.length
      ? `note_${n + 1} is about a private matter. Does the message itself raise that matter, or does the note say the user wants it taken into account in this kind of situation, so that note_${n + 1} is needed to reply well?`
      : `Is note_${n + 1} needed to reply to the message well?`}` }]));
  const answers = await judge(state, questions);
  const decisions = [];
  candidates.forEach((c, n) => {
    const p = answers?.[`c${n + 1}`]?.probabilities;
    if (!p || typeof p !== "object") return;
    const mention = Number(p.mention) || 0, silent = Number(p.silent) || 0, yes = mention + silent;
    decisions.push({ id: c.item.id, use: yes >= JUDGE.admit ? (mention >= silent ? "mention" : "silent") : "not-now", by: "judge",
      confidence: round(Math.max(yes, 1 - yes)), probabilities: { mention: round(mention), silent: round(silent), leave: round(Number(p.leave) || 0) } });
  });
  return { decisions };
}

// A reading is a statement about the note that the user's words make. Being short about being told ("I know", "not now", "stop nagging") is none
// of them: a judge that read annoyance as "did not belong" taught a reminder the user had asked for to stop coming.
const OUTCOME = {
  helped: "The user said in words that what the note led to was right or useful, or built on it by name",
  irrelevant: "The user said the note does not apply to this kind of situation: a statement about the situation, not annoyance at being told",
  wrong: "The user said what the note states is false or no longer true",
  unclear: "None of the above: the user went on, was merely short or annoyed about being told, or said nothing that shows how it turned out",
};
/** How each delivered memory turned out, read from what the user wrote next. Only confident readings are returned. */
const ENDED = { aborted: "was stopped before it finished", error: "failed before it finished", "max-tokens": "was cut off by a length limit",
  interrupted: "was interrupted before it finished", blocked: "was blocked before it finished" };
export const endedNote = ended => !ended ? null
  : ended.kind === "aborted" && ended.by === "user" ? "The user stopped this reply before it finished."
  : ENDED[ended.kind] ? `This reply ${ENDED[ended.kind]}.` : null;
export async function judgeOutcome(judge, { asked, reply, later, items, ended = null, rated = null }) {
  const state = { message: cut(asked, 800), reply: cut(reply, 1200), later: later.map(e => cut(e.content, 600)) };
  const stopped = endedNote(ended);
  if (stopped) state.reply_note = stopped;
  if (rated) state.reply_rating = `The user rated this reply ${rated.rating}${rated.note ? `, with the note: ${cut(rated.note, 300)}` : ""}.`;
  const questions = Object.fromEntries(items.map((i, n) => [`o${n + 1}`, { type: "choice", criteria: OUTCOME,
    instructions: `For the reply, the assistant drew on this remembered note: ${JSON.stringify(note(i))}. Judging only by what the user wrote afterwards, how did that turn out?` }]));
  const answers = await judge(state, questions);
  const last = later.at(-1), read = [];
  items.forEach((i, n) => {
    const p = answers?.[`o${n + 1}`]?.probabilities;
    if (!p || typeof p !== "object") return;
    const [kind, top] = Object.entries(p).sort((a, b) => b[1] - a[1])[0];
    read.push({ item: i.id, kind, confidence: round(top), probabilities: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)])),
      // The ground for the reading is the user's own later message, attached
      // here by code. Nothing is quoted that the judge could have made up.
      evidence: [{ id: last.id, quote: cut(last.content, 160) }] });
  });
  return read;
}
