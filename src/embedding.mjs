import { join } from "node:path";
import { homedir } from "node:os";
import { spawn as nodeSpawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const embeddingModel = "Xenova/multilingual-e5-small";
// Derived numeric index only; all durable understanding stays ordinary text.
export function localEmbeddings(cacheDir = join(homedir(), ".cache", "asteme", "models")) {
  let loading;
  const embed = async (texts, kind = "passage") => {
    loading ??= import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", embeddingModel, { dtype: "q8", device: "cpu", cache_dir: cacheDir }));
    let extractor;
    try { extractor = await loading; } catch (e) { loading = undefined; throw e; }
    const output = await extractor(texts.map(t => `${kind}: ${t}`), { pooling: "mean", normalize: true });
    return output.tolist();
  };
  embed.model = `${embeddingModel}:q8:mean:v1`;
  return embed;
}

/**
 * The same embeddings, computed in a process of its own (embed-worker.mjs).
 * For use inside a host: the model's native libraries are then never loaded
 * into the host's process, where they collide with the host's own copies.
 *
 * The process is started at the first use, by the program that is running
 * this one (inside Electron that program is told to behave as Node, which is
 * how DSH starts its own model processes). It must say it is ready, as this
 * worker does, or it is stopped: whatever else that program might have done
 * instead is not left running. After `idleMs` without use it is let go, which
 * frees its memory and its hold on the library files; the next use starts it
 * again. A call that fails is the caller's to handle: recall goes without it.
 */
export function apartEmbeddings(cacheDir = join(homedir(), ".cache", "asteme", "models"), { spawn = nodeSpawn, worker = fileURLToPath(new URL("./embed-worker.mjs", import.meta.url)), idleMs = 600000, startMs = 30000, callMs = 600000 } = {}) {
  let child = null, ready = null, next = 1, idle = null, closed = false;
  // For the report: how often it was started, how long that took, and what went wrong last.
  const stats = { starts: 0, failures: 0, lastStartMs: null, lastError: null, calls: 0 };
  const waiting = new Map();
  const drop = (why) => { const proc = child; child = null; ready = null; clearTimeout(idle); for (const [, w] of waiting) { clearTimeout(w.timer); w.reject(new Error(why)); } waiting.clear(); try { proc?.stdin?.end(); } catch { /* already gone */ } try { proc?.kill(); } catch { /* already gone */ } };
  const start = () => {
    if (ready) return ready;
    const began = Date.now(); stats.starts++;
    const proc = child = spawn(process.execPath, [worker, cacheDir], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buffer = "", told = "";
    ready = new Promise((resolve, reject) => {
      const late = setTimeout(() => { reject(new Error("The embedding process did not start")); if (child === proc) drop("The embedding process did not start"); }, startMs);
      late.unref?.();
      proc.stderr?.on("data", (d) => { told = (told + d).slice(-400); });
      proc.stdout.on("data", (d) => {
        buffer += d;
        for (let at; (at = buffer.indexOf("\n")) >= 0;) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
          let msg; try { msg = JSON.parse(line); } catch { continue; }
          if (msg?.ready === true) { clearTimeout(late); stats.lastStartMs = Date.now() - began; resolve(); continue; }
          const w = waiting.get(msg?.id); if (!w) continue;
          waiting.delete(msg.id); clearTimeout(w.timer);
          if (Array.isArray(msg.vectors)) w.resolve(msg.vectors); else w.reject(new Error(msg.error || "The embedding process gave no answer"));
        }
      });
      const gone = (how) => { clearTimeout(late); if (how) { stats.failures++; stats.lastError = String(how).slice(0, 120); } const why = `The embedding process stopped${how ? ` (${how})` : ""}${told.trim() ? `: ${told.trim().split("\n").at(-1).slice(0, 200)}` : ""}`; reject(new Error(why)); if (child === proc) drop(why); };
      proc.on("error", (e) => gone(e.message)); proc.on("exit", (code, signal) => gone(signal ?? (code === 0 ? "" : `code ${code}`)));
      proc.stdin.on("error", () => {});
    });
    ready.catch(() => {});
    return ready;
  };
  const embed = async (texts, kind = "passage") => {
    if (closed) throw new Error("The embedding process was closed");
    clearTimeout(idle);
    stats.calls++;
    await start();
    const proc = child; if (!proc) throw new Error("The embedding process stopped");
    try {
      return await new Promise((resolve, reject) => {
        const id = next++, timer = setTimeout(() => { waiting.delete(id); reject(new Error("The embedding process did not answer in time")); }, callMs);
        timer.unref?.();
        waiting.set(id, { resolve, reject, timer });
        proc.stdin.write(`${JSON.stringify({ id, texts, kind })}\n`);
      });
    } finally {
      if (!waiting.size && child) { idle = setTimeout(() => drop("The embedding process was let go while idle"), idleMs); idle.unref?.(); }
    }
  };
  embed.model = `${embeddingModel}:q8:mean:v1`;
  embed.close = () => { closed = true; drop("The embedding process was closed"); };
  embed.apart = true;
  embed.stats = () => ({ ...stats, running: !!child });
  return embed;
}
