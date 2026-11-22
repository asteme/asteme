#!/usr/bin/env node
// ASTEME as an MCP server over stdio, so any agent that speaks MCP can use
// it as memory. Configuration comes from the environment:
//
//   ASTEME_DB            path of the store (default ./asteme.sqlite)
//   ASTEME_LLM_URL       OpenAI-compatible base URL for the generative model   (with _KEY, _MODEL)
//   ASTEME_EMBED_URL     OpenAI-compatible base URL for embeddings             (with _KEY, _MODEL)
//                          without it, the local multilingual model is used if @huggingface/transformers is installed
//   ASTEME_JUDGE_KEY     optional decision model                               (with _URL, _MODEL)
//
// The agent calls asteme_recall with each user message before answering,
// and asteme_observe with its reply afterwards.
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { openBrain } from "./brain.mjs";

const text = value => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });
const str = description => ({ type: "string", description });
export const TOOLS = [
  { name: "asteme_recall", description: "Call with each user message before answering. Records the message and returns what memory adds to the reply, as a note to follow.",
    inputSchema: { type: "object", properties: { message: str("The user's message, word for word"), session: str("Conversation id") }, required: ["message"] },
    run: (brain, a) => brain.recall(a).then(r => r.note ? `${r.note}\n\n(request ${r.request})` : `Nothing from memory applies. (request ${r.request})`) },
  { name: "asteme_observe", description: "Call after answering, with the reply as sent. This is what memory learns from.",
    inputSchema: { type: "object", properties: { reply: str("The reply as sent"), session: str("Conversation id") }, required: ["reply"] },
    run: (brain, a) => brain.observe(a) },
  { name: "asteme_search", description: "Search everything that is kept, including what is closed or hard to bring to mind.",
    inputSchema: { type: "object", properties: { query: str("Words to look for") }, required: ["query"] }, run: (brain, a) => brain.search(a.query) },
  { name: "asteme_why", description: "What one memory rests on: the user's own words, what speaks against it, and how each use turned out.",
    inputSchema: { type: "object", properties: { id: str("Memory id") }, required: ["id"] }, run: (brain, a) => brain.why(a.id) },
  { name: "asteme_feedback", description: "Record the user's own verdict on a memory used in a reply: helped, irrelevant, wrong, or missed.",
    inputSchema: { type: "object", properties: { request: str("The request id returned by asteme_recall"), item: str("Memory id"), kind: { type: "string", enum: ["helped", "irrelevant", "wrong", "missed"] } }, required: ["request", "item", "kind"] },
    run: (brain, a) => brain.feedback(a) },
  { name: "asteme_rest", description: "Idle work: read finished turns into memory, read how replies went, reorganize. Call when the conversation pauses.",
    inputSchema: { type: "object", properties: {} }, run: brain => brain.rest() },
];

/** Answers one JSON-RPC message. Returns the reply object, or null for a notification. */
export async function handle(brain, message) {
  const { id, method, params } = message ?? {};
  const reply = result => ({ jsonrpc: "2.0", id, result }), fail = (code, text) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
  if (id === undefined || id === null) return null;
  if (method === "initialize") return reply({ protocolVersion: params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "asteme", version: "0.12.1-rc.9" } });
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: TOOLS.map(({ run, ...tool }) => tool) });
  if (method === "tools/call") {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return fail(-32602, "Unknown tool");
    try { return reply(text(await tool.run(brain, params.arguments ?? {}))); }
    catch (e) { return reply({ ...text(e.message), isError: true }); }
  }
  return fail(-32601, "Method not found");
}

export function serve(brain, input = process.stdin, output = process.stdout) {
  const lines = createInterface({ input });
  lines.on("line", async line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); }
    const answer = await handle(brain, message);
    if (answer) output.write(JSON.stringify(answer) + "\n");
  });
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = process.env, { chatInfer, httpEmbed } = await import("./ports.mjs");
  const infer = env.ASTEME_LLM_URL ? chatInfer({ url: env.ASTEME_LLM_URL, key: env.ASTEME_LLM_KEY, model: env.ASTEME_LLM_MODEL }) : null;
  let embed = env.ASTEME_EMBED_URL ? httpEmbed({ url: env.ASTEME_EMBED_URL, key: env.ASTEME_EMBED_KEY, model: env.ASTEME_EMBED_MODEL }) : null;
  if (!embed) embed = (await import("../src/embedding.mjs")).localEmbeddings();
  const judge = env.ASTEME_JUDGE_KEY ? (await import("../src/jev.mjs")).jevJudge({ key: env.ASTEME_JUDGE_KEY,
    ...(env.ASTEME_JUDGE_URL ? { url: env.ASTEME_JUDGE_URL } : {}), ...(env.ASTEME_JUDGE_MODEL ? { model: env.ASTEME_JUDGE_MODEL } : {}) }) : null;
  const brain = openBrain({ path: env.ASTEME_DB ?? "asteme.sqlite", infer, embed, judge });
  serve(brain).on("close", () => brain.close());
}
