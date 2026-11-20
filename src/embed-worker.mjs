// The embedding model in a process of its own.
//
// Inside a host (DSH), the library that runs the model brings native code with
// it: an inference runtime and an image library it loads but Asteme never
// uses. Loaded into the host's process they collide with the host's own
// copies (on Windows the host's image library then fails to load at all), and
// they stay locked there while the plugin is being reinstalled. Here they are
// loaded into this process and nowhere else.
//
// One JSON object per line on stdin: {id, texts, kind}. One per line back:
// {id, vectors} or {id, error}. The first line out says it is ready. When
// stdin ends the parent is gone, and so is this.
import { createInterface } from "node:readline";
import { localEmbeddings } from "./embedding.mjs";

const embed = localEmbeddings(process.argv[2] || undefined);
const say = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
say({ ready: true, model: embed.model });
let turn = Promise.resolve();
createInterface({ input: process.stdin }).on("line", (line) => {
  let ask; try { ask = JSON.parse(line); } catch { return; }
  if (!ask || typeof ask.id !== "number" || !Array.isArray(ask.texts)) return;
  // One at a time: the model is one, and answers must not interleave.
  turn = turn.then(async () => {
    try { say({ id: ask.id, vectors: await embed(ask.texts.map(String), ask.kind === "query" ? "query" : "passage") }); }
    catch (e) { say({ id: ask.id, error: String(e?.message ?? e).slice(0, 400) }); }
  });
}).on("close", () => process.exit(0));
