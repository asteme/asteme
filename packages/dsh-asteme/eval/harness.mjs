// Plays the eval scenarios against whatever model ports it is given. Used by
// eval/run.mjs from the command line and by the plugin's "Check this model",
// so the same scenarios answer the same question in both places: does this
// model, with these prompts, do what the design says.
//
//   infer(purpose, prompt, maxTokens) -> parsed JSON     the memory model
//   chat(messages, maxTokens) -> text                    the assistant's reply
//   embed(texts, kind) -> vectors
//
// Each scenario runs in its own in-memory store. Nothing real is touched.
import { Log } from "../src/log.mjs";
import { Asteme } from "../src/core.mjs";
import { personaPrompt, experiencePrompt } from "../plugin/prompt.mjs";

export async function runScenario(scenario, { infer, embed, chat, reading = "one" }) {
  let clock = Date.parse("2026-11-02T09:00:00Z");
  const scope = { userId: "eval", agentId: "assistant", projectId: "eval" };
  const log = new Log(":memory:", () => clock), core = new Asteme({ log, identity: scope, embed });
  const seqs = new Map(), steps = {};
  const record = (session, role, content, kind = `${role}/message`, metadata) => {
    const seq = seqs.get(session) ?? 0; seqs.set(session, seq + 1);
    log.ingest(scope, session, [{ seq, role, kind, content, occurredAt: clock, ...(metadata ? { metadata } : {}) }]);
    return log.events(scope, session).at(-1);
  };
  try {
    let previous = null;
    for (const step of scenario.steps) {
      clock += step.session === previous ? 180000 : 86400000;
      previous = step.session;
      if (step.settle) for (let n = 0; n < 4 && core.outcomeCandidates().length; n++) await core.outcomes({ infer });
      if (step.sleep) await core.sleep({ infer, budget: 8 });
      const request = record(step.session, "user", step.user);
      const history = log.events(scope, step.session).filter(e => ["user", "assistant"].includes(e.role));
      // Read the way the plugin reads: one call for the scene and the decisions.
      const trace = await core.prepare({ request, recent: history.slice(-8), infer, reading });
      // What a tool returned during this turn, when the step has any: text the
      // assistant read, which the user did not write.
      const read = step.tool ? record(step.session, "tool", step.tool, "tool/result", { tool: { phase: "result", name: "read", execution: "completed" } }) : null;
      // The reply, written the way the plugin has it written: persona first, the note as context.
      const reply = await chat([
        { role: "system", content: `${personaPrompt(core.core())}\n\n${experiencePrompt}` },
        ...history.slice(0, -1).map(e => ({ role: e.role, content: e.content })),
        { role: "user", content: [step.user, read && `<tool-result>\n${step.tool}\n</tool-result>`, trace.text && `<system-reminder>\n${trace.text}\n</system-reminder>`].filter(Boolean).join("\n\n") }], 900);
      clock += 20000;
      record(step.session, "assistant", reply);
      record(step.session, "unknown", "", "turn/end");
      for (const turn of log.pending(scope, "experienced")) await core.reflect(turn, infer);
      if (step.as) steps[step.as] = { request, trace, reply, ...(read ? { read } : {}) };
    }
    const results = scenario.checks.map(([name, check]) => {
      try { return { name, pass: !!check({ core, log, steps }) }; } catch (e) { return { name, pass: false, error: e.message }; }
    });
    return { results, errors: Object.values(steps).map(s => s.trace.error).filter(Boolean) };
  } finally { log.close(); }
}

export async function runAll(scenarios, ports, { onScenario = () => {}, stopped = () => false } = {}) {
  const out = { passed: 0, total: 0, scenarios: [] };
  for (const scenario of scenarios) {
    if (stopped()) break;
    const row = { name: scenario.name, principles: scenario.principles, results: [], errors: [] };
    try { Object.assign(row, await runScenario(scenario, ports)); }
    catch (e) { row.error = e.message; row.results = scenario.checks.map(([name]) => ({ name, pass: false })); }
    out.total += row.results.length; out.passed += row.results.filter(r => r.pass).length;
    out.scenarios.push(row); onScenario(row);
  }
  return out;
}
