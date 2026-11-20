// A worker that speaks the Agent Client Protocol and does nothing real. It
// answers a prompt by echoing it, asks permission when the prompt says
// "needs permission", and fails when it says "crash".
let buffer = "", n = 0;
const send = (m) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
const waiting = new Map();
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let at; (at = buffer.indexOf("\n")) >= 0;) {
    const m = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
    if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
    else if (m.method === "session/new") send({ id: m.id, result: { sessionId: `s${++n}` } });
    else if (m.method === "session/close") send({ id: m.id, result: {} });
    else if (m.method === "session/prompt") {
      const text = m.params.prompt[0].text, sessionId = m.params.sessionId;
      const finish = (said, stopReason = "end_turn") => { send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: said } } } }); send({ id: m.id, result: { stopReason } }); };
      if (/crash/.test(text)) process.exit(3);
      if (/needs permission/.test(text)) {
        const id = 9000 + n++;
        waiting.set(id, (result) => finish(result.outcome?.optionId === "yes" ? "Done after permission." : "Not done: permission was refused."));
        send({ id, method: "session/request_permission", params: { sessionId, toolCall: { title: "delete build/", rawInput: { path: "build/" } }, options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
      } else {
        send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "tool_call", toolCallId: "c1", title: "write", status: "in_progress" } } });
        send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed" } } });
        finish(`Did: ${text}`);
      }
    } else if (m.id !== undefined && !m.method) { waiting.get(m.id)?.(m.result); waiting.delete(m.id); }
  }
});
