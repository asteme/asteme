// A worker is an agent tool that takes text and answers in text. This is the
// one door to all of them: the Agent Client Protocol, JSON-RPC over the
// worker's standard input and output. DSH, Claude Code, Codex, Gemini CLI and
// others speak it; nothing here knows which one is on the other end.
//
//   const worker = openWorker({ name, command, args, env, cwd });
//   const task = await worker.start({ where, text, onUpdate, onPermission });
//   const { stopReason, said, did } = await task.done;
//   await task.tell("one more thing");   task.cancel();   worker.close();
import { spawn as realSpawn } from "node:child_process";

const cut = (s, n) => {
  const t = String(s ?? "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export function openWorker({ name, command, args = [], env = {}, cwd = process.cwd(), spawn = realSpawn, startTimeoutMs = 60000 }) {
  let child = null,
    buffer = "",
    seq = 0,
    ready = null,
    closed = false;
  const waiting = new Map(),
    sessions = new Map(),
    errors = [];
  const send = (message) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };
  const call = (method, params, timeoutMs) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = timeoutMs
        ? setTimeout(() => {
            waiting.delete(id);
            reject(new Error(`${name} did not answer ${method}`));
          }, timeoutMs)
        : null;
      waiting.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      send({ id, method, params });
    });
  const fail = (error) => {
    for (const w of waiting.values()) w.reject(error);
    waiting.clear();
    for (const s of sessions.values()) s.fail(error);
    sessions.clear();
    child = null;
    ready = null;
  };
  const receive = (message) => {
    if (message.id !== undefined && (message.result !== undefined || message.error) && !message.method) {
      const w = waiting.get(message.id);
      waiting.delete(message.id);
      if (w)
        message.error
          ? w.reject(Object.assign(new Error(message.error.message ?? "The worker refused"), { code: message.error.code }))
          : w.resolve(message.result);
      return;
    }
    const session = sessions.get(message.params?.sessionId);
    if (message.method === "session/update") session?.update(message.params.update);
    else if (message.method === "session/request_permission") {
      // The brain grants nothing by itself. The question goes to whoever
      // started the task; no answer is a refusal.
      const options = message.params.options ?? [];
      const answer = (allow) => {
        const pick =
          options.find((o) => (allow ? /^allow_once$/.test(o.kind) : /^reject_once$/.test(o.kind))) ??
          options.find((o) => (allow ? /^allow/.test(o.kind) : /^reject/.test(o.kind)));
        send({ id: message.id, result: { outcome: pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" } } });
      };
      if (!session) answer(false);
      else
        session.permission({
          title: cut(message.params.toolCall?.title ?? "an action", 200),
          detail: cut(JSON.stringify(message.params.toolCall?.rawInput ?? {}), 600),
          answer,
        });
    } else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: "Not supported by this client" } });
  };
  const connect = () =>
    (ready ??= (async () => {
      // On Windows a .cmd or .bat (which is what npm installs for a command)
      // cannot be started directly; it needs the shell.
      const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
        ...(shell ? { shell: true } : {}),
        windowsHide: true,
      });
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        for (let at; (at = buffer.indexOf("\n")) >= 0;) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 1);
          if (!line.trim()) continue;
          try {
            receive(JSON.parse(line));
          } catch {
            errors.push(cut(line, 200));
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        errors.push(cut(chunk, 300));
        if (errors.length > 20) errors.shift();
      });
      child.on("error", (e) => fail(new Error(`${name} could not be started: ${e.message}`)));
      child.on("exit", (code) => {
        if (!closed) fail(new Error(`${name} stopped (exit ${code})${errors.length ? `: ${errors.at(-1)}` : ""}`));
      });
      const hello = await call(
        "initialize",
        { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "asteme", version: "0.12.2-rc.7" } },
        startTimeoutMs,
      );
      return hello;
    })().catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    name,
    /** Hands one piece of work to the worker in a session of its own. */
    async start({ where = cwd, text, onUpdate = () => {}, onPermission }) {
      await connect();
      const { sessionId } = await call("session/new", { cwd: where, mcpServers: [] }, startTimeoutMs);
      let said = [],
        did = [],
        settle;
      const record = {
        update(u) {
          if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") {
            said.push(u.content.text);
            onUpdate({ kind: "said", text: u.content.text });
          } else if (u.sessionUpdate === "tool_call") {
            did.push({ id: u.toolCallId, title: u.title, status: u.status });
            onUpdate({ kind: "doing", text: cut(u.title, 120) });
          } else if (u.sessionUpdate === "tool_call_update") {
            const d = did.find((x) => x.id === u.toolCallId);
            if (d) d.status = u.status ?? d.status;
          }
        },
        permission(ask) {
          onPermission ? onPermission(ask) : ask.answer(false);
        },
        fail(error) {
          settle?.reject(error);
        },
      };
      sessions.set(sessionId, record);
      const prompt = (message) => {
        said = [];
        did = [];
        const done = new Promise((resolve, reject) => {
          settle = { reject };
          call("session/prompt", { sessionId, prompt: [{ type: "text", text: message }] }).then(
            (r) =>
              resolve({
                stopReason: r?.stopReason ?? "unknown",
                said: said.join("\n").trim(),
                did: did.map((d) => ({ title: d.title, status: d.status })),
              }),
            reject,
          );
        });
        done.catch(() => {});
        return done;
      };
      const task = {
        sessionId,
        done: prompt(text),
        tell(message) {
          task.done = prompt(message);
          return task.done;
        },
        cancel() {
          if (child) send({ method: "session/cancel", params: { sessionId } });
        },
        async close() {
          sessions.delete(sessionId);
          if (child) await call("session/close", { sessionId }, 15000).catch(() => {});
        },
      };
      return task;
    },
    close() {
      closed = true;
      child?.kill();
      child = null;
      ready = null;
    },
    get running() {
      return !!child;
    },
  };
}
