// Measures the claim the project stands on: something taught in one situation comes back in another that shares the situation and not the words.
//
// Twelve things are taught, each in a conversation of its own, with twelve unrelated things taught between them. Later come twelve requests that
// never use the taught words, and eight that ask for nothing remembered (a sum, a capital, a greeting). The same in English, Japanese and Chinese,
// each language its own store, taught and asked in that language (situations.texts.json; the Japanese and Chinese were translated by a model and
// read over by a person).
//
// "Found again" is counted when the reply was given what was taught: as a memory passed to it, as the round of the record where it was said, or
// because it stands in front of the model as a standing ask. For the eight that ask for nothing, anything passed is counted against.
//
//   ASTEME_EVAL_KEY=... node eval/situations.mjs --base-url <url> --model <name> [--langs en,ja,zh] [--json out.json]
//
// Measured 2026-11-26 with DeepSeek V4.1 Flash and the local embedding model; see eval/README.md for the numbers and what they are compared with.
import { readFileSync, writeFileSync } from "node:fs";
import { Log } from "../src/log.mjs";
import { Asteme } from "../src/core.mjs";
import { argsOf, openPorts } from "./ports.mjs";

const TEXTS = JSON.parse(readFileSync(new URL("./situations.texts.json", import.meta.url), "utf8"));
const ACK = { en: "Understood. I will keep to that.", ja: "わかりました。そのとおりにします。", zh: "明白了，我会照做。" };

export async function measureSituations({ infer, embed }, lang, { texts = TEXTS[lang], onRow = () => {} } = {}) {
  let clock = Date.parse("2026-09-01T09:00:00Z");
  const identity = { userId: "eval", agentId: "assistant" }, scope = { ...identity, projectId: "eval" };
  const log = new Log(":memory:", () => clock), core = new Asteme({ log, identity, embed });
  let calls = 0; const counted = async (...a) => { calls++; return infer(...a); };
  try {
    const exchange = (session, text) => log.ingest(scope, session, [{ seq: 0, role: "user", kind: "user/message", content: text, occurredAt: clock },
      { seq: 1, role: "assistant", kind: "assistant/message", content: ACK[lang] ?? ACK.en, occurredAt: clock + 20000 }, { seq: 2, role: "unknown", kind: "turn/end", content: "", occurredAt: clock + 21000 }]);
    const errors = [];
    for (let n = 0; n < texts.taught.length; n++) {
      clock += 86400000; exchange(`taught-${n}`, texts.taught[n].taught);
      clock += 3600000; exchange(`beside-${n}`, texts.beside[n]);
      for (const turn of log.pending(identity, "experienced")) { try { await core.reflect(turn, counted); } catch (e) { errors.push(`reflect: ${e.message}`); } }
    }
    // The record made searchable, all of it, as idle work would have done by the time weeks have passed.
    for (let n = 0; n < 100 && await core.indexRecord(); n++);
    clock += 86400000 * 30;
    const taughtCalls = calls, items = core.items(), inFront = new Set(core.standingAsks().map(a => a.id)), rows = [];
    const ask = async (session, text) => {
      clock += 3600000 * 5;
      log.ingest(scope, session, [{ seq: 0, role: "user", kind: "user/message", content: text, occurredAt: clock }]);
      const request = log.events(scope, session).at(-1), before = calls;
      const trace = await core.prepare({ request, recent: [request], infer: counted, reading: "one" });
      return { trace, calls: calls - before };
    };
    for (let n = 0; n < texts.taught.length; n++) {
      const taught = log.events(scope, `taught-${n}`)[0].id, own = new Set(items.filter(i => (i.evidence ?? []).some(e => e.id === taught)).map(i => i.id));
      const { trace, calls: asked } = await ask(`later-${n}`, texts.taught[n].later);
      const front = [...own].some(id => inFront.has(id)), memory = !!trace.delivered?.some(i => own.has(i.id)), round = !!trace.passages?.some(p => p.round === taught);
      rows.push({ kind: "taught", n, found: front || memory || round, by: front ? "standing" : memory ? "memory" : round ? "record" : null, calls: asked, error: trace.error ?? null });
      onRow(rows.at(-1));
    }
    for (let n = 0; n < texts.nothing.length; n++) {
      const { trace, calls: asked } = await ask(`nothing-${n}`, texts.nothing[n]);
      rows.push({ kind: "nothing", n, passed: (trace.delivered?.length ?? 0) + (trace.passages?.length ?? 0), calls: asked, error: trace.error ?? null,
        // What was passed for nothing, so that it can be read afterwards.
        what: [...(trace.delivered ?? []).map(i => i.text.slice(0, 120)), ...(trace.passages ?? []).map(p => `(a round) ${p.said.slice(0, 120)}`)] });
      onRow(rows.at(-1));
    }
    const taught = rows.filter(r => r.kind === "taught"), nothing = rows.filter(r => r.kind === "nothing");
    return { lang, found: taught.filter(r => r.found).length, of: taught.length, by: Object.fromEntries(["standing", "memory", "record"].map(k => [k, taught.filter(r => r.by === k).length])),
      passedForNothing: nothing.filter(r => r.passed > 0).length, ofNothing: nothing.length, callsPerRequest: Number((rows.reduce((a, r) => a + r.calls, 0) / rows.length).toFixed(2)),
      memories: items.length, standing: inFront.size, teachingCalls: taughtCalls, errors: [...errors, ...rows.map(r => r.error).filter(Boolean)], rows };
  } finally { log.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = argsOf(), ports = await openPorts(args), out = {};
  for (const lang of String(args.langs ?? "en,ja,zh").split(",")) {
    const r = out[lang] = await measureSituations(ports, lang);
    console.log(`${lang}: taught and found again ${r.found}/${r.of} (standing ${r.by.standing}, memory ${r.by.memory}, record ${r.by.record}) | asked for nothing, something passed ${r.passedForNothing}/${r.ofNothing} | model calls before a reply ${r.callsPerRequest}${r.errors.length ? ` | errors ${r.errors.length}` : ""}`);
  }
  console.log(`${ports.model}: ${ports.used.calls} calls, ${Math.round(ports.used.in / 1000)}k tokens in, ${Math.round(ports.used.out / 1000)}k out`);
  if (typeof args.json === "string") writeFileSync(args.json, JSON.stringify(out, null, 1));
}
