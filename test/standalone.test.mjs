// The core without a host: a brain any agent can call, and the same thing as an MCP server.
import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { openBrain } from "../standalone/brain.mjs";
import { handle, serve, TOOLS } from "../standalone/mcp.mjs";
import { situationEmbedder, scripted } from "./helpers.mjs";

const SAID = "For this director, lead with the decision";
function brainWith(t, extra = {}) {
  let clock = Date.parse("2026-11-10T09:00:00Z");
  const infer = scripted({
    scene: input => ({ scene: /director/.test(input.RAW.at(-1).text) ? "Writing a memo for the director" : "A greeting with no task", need: "", entities: [] }),
    read: input => ({ scene: /director/.test(input.RAW.at(-1).text) ? "Writing a memo for the director" : "A greeting with no task", need: "", entities: [],
      decisions: input.candidates.map(c => ({ id: c.id, use: "silent", reason: "The memo is for the director", anchor: "memo for the director" })) }),
    select: input => ({ decisions: input.candidates.map(c => ({ id: c.id, use: "silent", reason: "The memo is for the director", anchor: "memo for the director" })) }),
    reflect: input => ({ feedback: [], changes: input.RAW.filter(r => r.role === "user" && r.text === SAID).map(r => ({ op: "put", kind: "understanding", certainty: "explicit",
      text: "Lead with the decision for this director", reason: "Stated by the user", concrete: "Writing a memo for the director", general: "Writing a document for a busy decision maker",
      tested: "One occasion", hypothesis: "Other documents are untested", about: "how this director reads", entities: [], evidence: [{ id: r.id, quote: r.text }] })) }),
    outcome: { feedback: [] },
  });
  const brain = openBrain({ infer, embed: situationEmbedder(), now: () => (clock += 60000), ...extra });
  t.after(() => brain.close());
  return brain;
}

test("an agent with no host can teach it, rest, and be reminded in a later conversation", async t => {
  const brain = brainWith(t);
  const first = await brain.recall({ session: "a", message: SAID });
  assert.deepEqual([first.note, first.items], ["", []]);
  brain.observe({ session: "a", reply: "Understood." });
  const rest = await brain.rest();
  assert.deepEqual([rest.reflected, rest.errors], [1, []]);
  const later = await brain.recall({ session: "b", message: "Draft the budget memo for the director" });
  assert.match(later.note, /Lead with the decision for this director/);
  assert.equal(later.items.length, 1);
  assert.equal(brain.feedback({ request: later.request, item: later.items[0].id, kind: "helped" }).by, "user");
  assert.equal((await brain.search("director")).understanding.length, 1);
  assert.equal(brain.diagnose().health.calls > 0, true, "its own calls are in the journal");
});

test("with a judge and no generative model it can still be reminded of what it already knows", async t => {
  const teacher = brainWith(t);
  await teacher.recall({ session: "a", message: SAID }); teacher.observe({ session: "a", reply: "Understood." }); await teacher.rest();
  const judge = async (_state, questions) => Object.fromEntries(Object.keys(questions).map(k => [k, { probabilities: { mention: 0.05, silent: 0.9, leave: 0.05 } }]));
  const reader = openBrain({ embed: situationEmbedder(), judge });
  t.after(() => reader.close());
  reader.importArchive(JSON.parse(JSON.stringify(teacher.exportArchive())));
  const told = await reader.recall({ session: "c", message: "Writing a memo for the director about hiring" });
  assert.deepEqual([told.items.length, told.error], [1, null]);
  assert.deepEqual((await reader.rest()).errors, []);
});

test("the MCP server lists its tools and answers calls line by line", async t => {
  const brain = brainWith(t);
  const init = await handle(brain, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.deepEqual([init.result.protocolVersion, init.result.serverInfo.name], ["2025-06-18", "asteme"]);
  assert.equal(await handle(brain, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await handle(brain, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(list.result.tools.map(x => x.name), TOOLS.map(x => x.name));
  assert.ok(list.result.tools.every(x => x.inputSchema.type === "object" && !("run" in x)));
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on("data", chunk => lines.push(...String(chunk).split("\n").filter(Boolean)));
  const server = serve(brain, input, output);
  t.after(() => server.close());
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "asteme_recall", arguments: { message: "hello" } } }) + "\n");
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "asteme_why", arguments: { id: "nope" } } }) + "\n");
  input.write("not json\n");
  await new Promise(resolve => setTimeout(resolve, 200));
  const replies = lines.map(l => JSON.parse(l));
  assert.match(replies.find(r => r.id === 3).result.content[0].text, /^Nothing from memory applies\. \(request /);
  assert.deepEqual([replies.find(r => r.id === 4).result.isError, replies.find(r => r.id === null).error.code], [true, -32700]);
});

test("every package asks for the Node that has node:sqlite without a flag (22.13), and the README says the same", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
  const floors = [JSON.parse(await read("package.json")).engines.node, JSON.parse(await read("src/package.json")).engines.node, /node: "([^"]+)"/.exec(await read("scripts/make-dsh-bundle.mjs"))[1]];
  assert.deepEqual([...new Set(floors)], [">=22.13.0"]);
  for (const lang of ["", ".ja", ".zh", ".es", ".fr", ".de", ".ru", ".pt"]) {
    const readme = await read(`README${lang}.md`);
    assert.doesNotMatch(readme, /Node 22\.5\b|%2022\.5-/, `README${lang}.md`);
    assert.match(readme, /Node 22\.13\b/, `README${lang}.md`);
  }
});
