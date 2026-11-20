import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Host } from "./host.mjs";
import { registerSettings } from "./settings.mjs";
import { personaPrompt, experiencePrompt, withoutDefaultIdentity, withoutAsteme, mannerPrompt } from "./prompt.mjs";
import { plain } from "../src/archive.mjs";

export const name = "asteme";
// Only what Asteme cannot work without is required here. A service that may
// be absent (sessionController, to start a DSH session of its own to hand work
// to; speechToText, DSH's voice input) is asked for with ctx.get() at the
// moment it is used: naming it here would keep the whole plugin from starting
// on a DSH that does not have it.
export const inject = ["sessions", "agents", "sessionPersistence", "systemPrompt", "tools", "llm"];
// roundCalls: how many pieces of background work one round may ask the model for (1 to 5).
// roundEveryMs: the pause between rounds that did something.
// sleepIntervalMs, outcomeDelayMs, outcomeIntervalMs: when background work runs.
// The defaults suit real use; a test run can shorten them to see sleep and
// outcomes happen within minutes.
export const Config = z.object({
  dataDirectory: z.string(),
  userId: z.string(),
  agentId: z.string(),
  projectId: z.string(),
  enabled: z.boolean().default(true),
  learningProvider: z.string(),
  learningModel: z.string(),
  // timeoutMs bounds a background call; prepareTimeoutMs bounds a call made
  // while the reply waits (reading the scene and choosing what to pass).
  timeoutMs: z.number().min(1000).max(900000).default(240000),
  prepareTimeoutMs: z.number().min(1000).max(120000).default(30000),
  // An optional decision model for the two yes/no steps. Off without a key.
  // judgeMode: "shadow" lets the generative model decide and records the
  // judge's answer beside it (and uses the judge when the model fails);
  // "judge" lets the judge decide; "model" asks the judge only on failure.
  judgeKey: z.string(),
  judgeUrl: z.string(),
  judgeModel: z.string(),
  judgeMode: z.string().default("shadow"),
  // A daily copy of the store under backups/. 0 turns it off.
  backupEveryHours: z.number().min(0).default(24),
  backupKeep: z.number().min(1).default(14),
  roundCalls: z.number().min(1).max(5).default(1),
  roundEveryMs: z.number().min(10000).default(30000),
  sleepIntervalMs: z.number().min(1000).default(600000),
  outcomeDelayMs: z.number().min(0).default(60000),
  outcomeIntervalMs: z.number().min(1000).default(60000),
});
export async function apply(ctx, input) {
  const host = new Host(ctx, input);
  ctx.effect(() => () => host.close(), "asteme.lifecycle");
  ctx.on("tools/result", (exec, result) => host.toolResult(exec, result));
  ctx.on("session/event", (session, event) => host.onEvent(session, event));
  ctx.on("agent/created", ({ agent }) => host.created(agent));
  ctx.on("agent/status", ({ agent, status }) => host.status(agent, status));
  ctx.on("agent/disposed", ({ agent }) => {
    host.agents.delete(agent.id);
    host.views.delete(agent);
  });
  ctx.on("agent/pre-step", async (payload, next) => {
    const decision = await next();
    if (decision.kind === "enter")
      await host.prepare(
        payload.agent,
        decision.messages,
        payload.signal,
        payload.modelSelection,
      );
    return decision;
  });
  // A session Asteme started to hand work to is a pair of hands, not Asteme:
  // it keeps DSH's own identity and is given nothing of Asteme's (no name, no
  // way of speaking, no instructions about memory).
  const CLOSED = { closed: "This session does a task for Asteme and was given what the task needs. Memory is not opened from here; say what is missing in your answer." };
  const hand = (sessionId) => !!sessionId && (host.log.state("brain:hands", []) ?? []).includes(sessionId);
  ctx.on("system-prompt/assemble", async (_assembly, context, next) => {
    const assembly = await next();
    if (hand(context?.agent?.session?.id)) return { ...assembly, sections: withoutAsteme(assembly.sections) };
    return { ...assembly, sections: withoutDefaultIdentity(assembly.sections) };
  });
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: "asteme:adopted-persona",
        order: ctx.systemPrompt.getSectionOrder("HARNESS_IDENTITY"),
        interpolate: false,
        text: (context) => { const way = mannerPrompt(host.log), id = context?.agent?.session?.id; if (!hand(id)) host.spoke(id, !!way); return personaPrompt(host.core.core()) + way; },
      }),
    "asteme.profile",
  );
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: "asteme:use-notes",
        order: 130,
        interpolate: false,
        text: () => experiencePrompt,
      }),
    "asteme.instructions",
  );
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: "asteme:runtime-identity",
        order: 824,
        interpolate: false,
        text: ({ modelSelection }) => modelSelection?.model
          ? `Current runtime: DeepSeek Harness. Conversation model: ${modelSelection.model}.`
          : "",
      }),
    "asteme.runtime-identity",
  );
  // The per-turn note is delivered by WorkingSurface as a runtime-context
  // message, the same shape DSH uses for its own per-turn reminders. Keeping a
  // second copy in the system prompt would change the cached prefix on every
  // turn, so there is no systemPrompt.context section for notes.
  ctx.tools.register(
    defineTool({
      name: "asteme_search",
      description:
        "Search understandings, concerns and original records when the selected experience is insufficient.",
      parameters: { query: { type: "string", required: true } },
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [
          { type: "text", text: JSON.stringify(value) },
        ],
      },
      isConcurrencySafe: () => true,
      // Tool results must survive JSON unchanged, or the host refuses them.
      execute: async (args, exec) => hand(exec?.agent?.session?.id) ? CLOSED : plain(await host.search(exec.agent, args.query)),
    }),
  );
  ctx.tools.register(
    defineTool({
      name: "asteme_why",
      description:
        "Show what one remembered item rests on: the user's own words it was drawn from, what speaks against it, what it replaced, the scenes it answers to and how each use turned out. Use it when asked why you believe or did something.",
      parameters: { id: { type: "string", required: true } },
      output: {
        schema: { type: "object", additionalProperties: true },
        render: (_args, value) => [
          { type: "text", text: JSON.stringify(value) },
        ],
      },
      isConcurrencySafe: () => true,
      execute: async (args, exec) => {
        if (hand(exec?.agent?.session?.id)) return CLOSED;
        const why = host.core.why(args.id);
        if (!why) throw new Error("Unknown item");
        const { item, history, ...rest } = why;
        return plain({ id: item.id, text: item.text, status: item.status, level: item.level, tested: item.tested, hypothesis: item.hypothesis, ...rest, history: history.slice(-6) });
      },
    }),
  );
  ctx.tools.register(defineTool({
    name: "asteme_amend", description: "Correct or close one remembered item because the user asked for that in their current message. Find the item with asteme_search first. action \"correct\" replaces its text and keeps the old one in its history; action \"close\" stops it being used. This is the only way to change memory: never open or edit the memory database or its files.",
    parameters: { id: { type: "string", required: true }, action: { type: "string", required: true }, text: { type: "string" } },
    output: { schema: { type: "object", additionalProperties: true }, render: output => [{ type: "text", text: output.closed ? "Closed." : "Corrected." }] },
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      if (hand(exec?.agent?.session?.id)) return CLOSED;
      const event = host.views.get(exec.agent)?.event;
      if (!event) throw new Error("No current recorded request");
      return plain(host.core.userAmend(args.id, { action: args.action, text: args.text }, event));
    },
  }));
  ctx.tools.register(defineTool({
    name: "asteme_private", description: "Mark this conversation private when the user asks that it not be remembered (or take the mark off when they ask). While private, nothing said here is read into memory and nothing from memory is brought into it. What was already learned earlier in the conversation stays.",
    parameters: { on: { type: "boolean", required: true } },
    output: { schema: { type: "object", additionalProperties: true }, render: output => [{ type: "text", text: output.private ? "This conversation is private now." : "This conversation is remembered again." }] },
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      const session = host.sessions.get(exec.agent.session.id)?.sessionId ?? exec.agent.session.id;
      return { private: host.core.setQuiet(session, args.on === true) };
    },
  }));
  ctx.tools.register(defineTool({
    name: "asteme_note", description: "Record one short factual premise of a decision you are making, with any relied-on experience IDs. This does NOT save anything to memory: what the user tells you is remembered by itself after the reply, with no tool call. Do not call this to remember a preference or a fact. This is an observation trace, not memory editing or private reasoning.",
    parameters: { text: { type: "string", required: true }, items: { type: "array", items: { type: "string" } } },
    output: { schema: { type: "object", additionalProperties: true }, render: () => [{ type: "text", text: "Premise recorded." }] },
    isConcurrencySafe: () => true,
    execute: async (args, exec) => {
      const request = host.views.get(exec.agent)?.request;
      if (!request) throw new Error("No current recorded request");
      const trace = host.core.premise(request, args);
      return { recorded: true, id: trace.id };
    },
  }));
  registerSettings(ctx, host);
  await host.start();
}
export default { name, inject, Config, apply };
