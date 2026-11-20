// Stands in for src/embed-worker.mjs: same lines in and out, no model.
import { createInterface } from "node:readline";
const mode = process.argv[3] ?? "";
if (mode !== "silent") process.stdout.write(`${JSON.stringify({ ready: true, model: "fake", pid: process.pid })}\n`);
createInterface({ input: process.stdin }).on("line", (line) => {
  const ask = JSON.parse(line);
  if (ask.texts.includes("die")) process.exit(3);
  if (ask.texts.includes("fail")) return process.stdout.write(`${JSON.stringify({ id: ask.id, error: "no model here" })}\n`);
  process.stdout.write(`${JSON.stringify({ id: ask.id, vectors: ask.texts.map(t => [t.length, ask.kind === "query" ? 1 : 0, process.pid]) })}\n`);
}).on("close", () => process.exit(0));
