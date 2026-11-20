// The worker Asteme has inside DSH: a DSH session of its own, started through
// DSH itself. It has the same shape as a worker reached over the Agent Client
// Protocol (brain/acp.mjs), but nothing is spawned and no key is needed: the
// session runs on the models and tools this DSH already has, appears in DSH's
// own list under its id, and asks for permission in DSH's own way.
import { randomUUID } from "node:crypto";
import { textOf } from "./events.mjs";

const cut = (s, n) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)}…` : t; };

export function dshWorker(host, { pollMs = 1500, limitMs = 1800000 } = {}) {
  const ctx = host.ctx, signal = host.abort.signal;
  const readAll = async (sessionId) => {
    const handle = await ctx.sessionPersistence.open(sessionId, "read", { signal });
    try { const out = []; for (let next = 0; ;) { const { events } = await handle.read(next, 128, { signal }); if (!events.length) break; out.push(...events); next = events.at(-1).seq + 1; } return out; }
    finally { await handle.close(); }
  };
  const somewhere = () => { for (const a of ctx.agents.list()) { const cwd = a.session?.header?.cwd ?? a.session?.meta?.cwd; if (typeof cwd === "string" && cwd) return cwd; } return process.cwd(); };
  const toolsOf = (agent) => { try { return [...new Set((ctx.get("tools")?.definitions?.(agent) ?? []).map(d => d?.name).filter(n => typeof n === "string" && n && !n.startsWith("asteme_")))]; } catch { return []; } };
  const toolsSeen = () => {
    let agents = []; try { agents = ctx.agents.list() ?? []; } catch { /* none */ }
    for (const agent of agents) { const names = toolsOf(agent); if (names.length > 3) { if (names.join() !== (host.log.state("brain:worker-tools", []) ?? []).join()) host.log.save("brain:worker-tools", names.slice(0, 120)); return names; } }
    return host.log.state("brain:worker-tools", []) ?? [];
  };
  return {
    name: "dsh",
    // What it can do is read from DSH, so a tool or plugin added to DSH is
    // known to Asteme with nothing changed here. DSH gives most tools to a
    // session, not to everyone: the list is what a live session of this DSH
    // sees, or what the last one saw. With neither, nothing is said: a short
    // list would read as "it cannot do the rest".
    get about() {
      // What repeats is Asteme's own to keep, as a time of its own that comes round again. The worker's scheduler is for when the user asks for it by name, so it is not put forward here among what the worker is for.
      const names = toolsSeen(), listed = names.filter(n => !/^schedule_/.test(n));
      return `A DSH session on this computer: reads and writes files, runs commands, uses the tools and skills this DSH has. Its work can be opened in DSH under its session.${listed.length ? ` Among its tools when last looked: ${listed.slice(0, 80).join(", ")}. There may be more.` : ""}`;
    },
    async start({ where, text, onUpdate = () => {}, onQuestion = null }) {
      // Through DSH's own session service, so the session is composed like any
      // the user starts: the default preset, the model in use, DSH's tools.
      const sessions = (() => { try { return ctx.get("sessionController"); } catch { return null; } })();
      if (!sessions?.create || !sessions?.prompt) throw new Error("This DSH does not offer sessions to plugins");
      const made = await sessions.create({ cwd: where || somewhere() });
      const sessionId = made?.sessionId ?? made?.session?.id ?? made?.header?.id ?? made?.id;
      if (typeof sessionId !== "string") throw new Error("DSH did not say which session it started");
      // What Asteme writes to its worker is not something the user said: the
      // session is kept out of memory, and its result comes back as something read.
      host.log.save("excluded-sessions", [...new Set([...(host.log.state("excluded-sessions", []) ?? []), sessionId])]);
      // It is also marked as one of Asteme's hands: such a session is given the
      // task and nothing else. Asteme has already chosen what the work needs
      // from memory and written it into the task; a second reading here would
      // cost time before every step and could pass what Asteme chose to hold back.
      host.log.save("brain:hands", [...new Set([...(host.log.state("brain:hands", []) ?? []), sessionId])].slice(-400));
      // What this session asks its user (a choice, or leave to act) is put in
      // front of the one who is talking to Asteme, in that conversation: the
      // session is Asteme's hand, and nobody is watching it in DSH. DSH offers
      // such a question to whoever will answer; this answers first for this
      // session and leaves every other session's questions to DSH.
      const mineToAnswer = function (request, next) {
        if (!onQuestion || request?.agent?.session?.id !== sessionId || request?.wait !== undefined) return next();
        onUpdate({ kind: "waiting", text: cut(request.questions?.[0]?.question ?? "", 60) });
        return onQuestion({ questions: request.questions, signal: request.signal }).then((answer) => { onUpdate({ kind: "resumed", text: sessionId }); return answer; });
      };
      let unhook = () => {}; try { unhook = ctx.on("user-questions/request", mineToAnswer, true) ?? unhook; } catch { /* a DSH without that seam asks in its own window */ }
      let seen = 0, stopped = false;
      const send = (message) => {
        const from = seen;
        const asked = sessions.prompt({ requestId: randomUUID(), sessionId, mode: "queue", content: [{ type: "text", text: message }] }, signal);
        const done = (async () => {
          await asked;
          const started = Date.now(), told = new Set();
          for (;;) {
            await new Promise(r => setTimeout(r, pollMs));
            if (signal.aborted) throw new Error("DSH is stopping");
            const events = (await readAll(sessionId)).filter(e => e.seq >= from);
            for (const e of events) if (e.type === "tool/call" && !told.has(e.seq)) { told.add(e.seq); onUpdate({ kind: "doing", text: cut(e.data?.message?.name ?? e.data?.name ?? "a tool", 80) }); }
            // DSH asks its user before some actions. That question is DSH's, and it
            // is answered in DSH, in this session; the conversation is told it is waiting.
            const asked = events.filter(e => e.type === "approval/asked").length, decided = events.filter(e => e.type === "approval/decided").length;
            if (!onQuestion && asked > decided && !told.has(`ask${asked}`)) { told.add(`ask${asked}`); const call = events.findLast(e => e.type === "tool/call"); onUpdate({ kind: "waiting", text: cut(call?.data?.message?.name ?? call?.data?.name ?? "", 60) }); }
            else if (asked === decided && asked && !told.has(`go${asked}`)) { told.add(`go${asked}`); onUpdate({ kind: "resumed", text: sessionId }); }
            const end = events.findLast(e => e.type === "turn/end");
            if (end && events.some(e => e.type === "user/message")) {
              seen = end.seq + 1;
              const said = events.filter(e => e.type === "assistant/message").map(e => textOf(e.data?.message)).filter(Boolean);
              const reason = end.data?.reason?.kind ?? end.data?.reason ?? "completed";
              return { stopReason: stopped ? "cancelled" : reason === "completed" ? "end_turn" : String(reason), said: said.join("\n").trim(), did: events.filter(e => e.type === "tool/call").map(e => ({ title: cut(e.data?.message?.name ?? e.data?.name ?? "tool", 80), status: "completed" })) };
            }
            // Past the limit the session is stopped, not left running unseen.
            if (Date.now() - started > limitMs) { task.cancel(); throw Object.assign(new Error(`The DSH session did not finish in ${Math.round(limitMs / 60000)} minutes and was stopped`), { stopped: true }); }
          }
        })();
        done.catch(() => {});
        return done;
      };
      signal.addEventListener?.("abort", () => { try { unhook(); } catch { /* already gone */ } }, { once: true });
      const task = { sessionId, close() { try { unhook(); } catch { /* already gone */ } }, done: send(text), tell(message) { task.done = send(message); return task.done; }, cancel() { stopped = true; void Promise.resolve(sessions.resolveAgent?.(sessionId)).then(r => (r?.agent ?? r)?.cancel?.({ kind: "user" })).catch(() => {}); }, async close() {} };
      return task;
    },
    close() {},
  };
}
