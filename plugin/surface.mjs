import { createHash } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

const owned = new Set(['asteme:recall', 'asteme:experience', 'asteme:working', 'asteme:continuity', 'asteme:notes']);
const toolNames = new Set(['asteme_task', 'asteme_read', 'asteme_search', 'asteme_why', 'asteme_amend', 'asteme_private', 'asteme_outcome', 'asteme_capture', 'asteme_propose', 'asteme_status']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signature = sections => JSON.stringify(sections.filter(s => owned.has(s.name)).map(s => [s.name, s.text]));

/** Logged, provider-neutral surface replacements. Never mutates an LLM request,
 * user message, foreign tool result, or an existing durable event. */
export class WorkingSurface {
  constructor(ctx) { this.ctx = ctx; this.states = new WeakMap(); }
  state(session) {
    let state = this.states.get(session);
    if (!state) { state = { hydrated: false, entries: new Map(), calls: new Map(), latestUser: null }; this.states.set(session, state); }
    return state;
  }
  observe(session, event) {
    const state = this.state(session);
    if (event.type === 'user/message' && event.data.source?.kind === 'user') state.latestUser = event.data.id;
    if (event.type === 'tool/call' && toolNames.has(event.data.name)) state.calls.set(event.data.callId, state.latestUser);
    if (event.type === 'user/message' && event.data.source?.kind === 'runtime-context'
      && event.data.source?.form === 'snapshot' && Array.isArray(event.data.source.sections)
      && event.data.source.sections.some(s => owned.has(s.name))) state.entries.set(event.seq, { event, kind: 'context' });
    if (event.type === 'tool/result' && state.calls.has(event.data.message?.toolCallId)
      && event.surfaceOp === 'append') {
      state.entries.set(event.seq, { event, kind: 'tool', messageId: state.calls.get(event.data.message.toolCallId) });
      state.calls.delete(event.data.message.toolCallId);
    }
  }
  async hydrate(session, signal) {
    const state = this.state(session);
    if (state.hydrated) return;
    // Persistence reads, not deprecated synchronous event-log access. Merge the
    // observed live suffix after replay because the durable writer can lag it.
    const live = [...state.entries.entries()];
    const liveCalls = new Map(state.calls); const latestUser = state.latestUser;
    const handle = await this.ctx.sessionPersistence.open(session.id, 'read', { signal });
    try {
      for (let cursor = 0; cursor < session.seq;) {
        const { events } = await handle.read(cursor, 256, { signal });
        if (!events.length) break;
        for (const event of events) this.observe(session, event);
        cursor = events.at(-1).seq + 1;
      }
    } finally { await handle.close(); }
    for (const [id, value] of liveCalls) state.calls.set(id, value);
    if (latestUser) state.latestUser = latestUser;
    for (const [seq, entry] of live) state.entries.set(seq, entry);
    state.hydrated = true;
  }
  async retire(session, currentMessageId, currentSections, signal) {
    await this.hydrate(session, signal);
    const state = this.state(session);
    const nodes = new Set(session.surface.nodes);
    const contexts = [...state.entries.values()].filter(x => x.kind === 'context' && nodes.has(x.event.seq));
    const latest = contexts.reduce((max, entry) => Math.max(max, entry.event.seq), -1);
    let replacements = 0;
    for (const [seq, entry] of state.entries) {
      if (!nodes.has(seq)) { state.entries.delete(seq); continue; }
      const { event } = entry;
      if (entry.kind === 'context') {
        if (seq === latest && signature(event.data.source.sections) === signature(currentSections)) continue;
        const sections = event.data.source.sections.filter(s => !owned.has(s.name));
        // Keep every other plugin/host section byte-for-byte. Only the wrapper is
        // rebuilt; removing a whole merged runtime-context would lose permissions.
        const body = sections.map(s => s.text).join('\n\n').replace(/<\/system-reminder\s*>/gi, tag => `<\\${tag.slice(1)}`);
        const message = createUserMessage({
          content: [{ type: 'text', text: sections.length
            ? `<system-reminder>\nRetained session context; obsolete ASTEME sections were retired.\n\n${body}\n</system-reminder>`
            : '[Prior ASTEME working context retired; original remains in the session audit.]' }],
          source: { kind: 'asteme-context-retirement', form: 'snapshot', sections,
            originalSeq: seq, originalHash: hash(event.data) },
        });
        session.append('user/message', message, { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] });
      } else {
        if (!currentMessageId || entry.messageId === currentMessageId) continue;
        const data = { ...event.data, message: { ...event.data.message, content: [{ type: 'text',
          text: JSON.stringify({ asteme: 'prior-task-result-retired', originalSeq: seq, originalHash: hash(event.data.message.content),
            notice: 'Read memory again if the current task needs it. The original result remains in the session audit.' }) }] } };
        // DSH enforces preservation of the call ID, source and execution status.
        session.append('tool/result', data, { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] });
      }
      state.entries.delete(seq); replacements++;
    }
    return { replacements, mode: 'logged-surface-replacement', legacyCompactionSummaries: 'not-rewritten' };
  }
}
