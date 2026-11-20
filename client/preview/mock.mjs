// In-memory stand-in for the asteme.* RPC actions, for the preview only.
//
// "From the core" is a snapshot the real core produced (see snapshot.mjs), with
// the account and the source messages of every memory. The actions below change
// it the way the plugin would, closely enough to try every control; they are
// not the core, and what they compute (a new accessibility, for instance) is
// left as it was.
import engine from './engine.snapshot.json';
import sample from '../snapshot.sample.json';

const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, message) => Object.assign(new Error(message), { code });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function empty() {
  const s = clone(engine.snapshot);
  s.memory = { state: { items: [], sources: [] }, delivery: null };
  s.learning = { ...s.learning, habits: [], history: [], candidates: [], sleep: { last: null, queued: [], episodes: [] } };
  s.review = { unsure: [], stale: [], disputes: [] };
  s.diagnosis = { at: s.diagnosis.at, outcomes: { deliveries: 0, assessed: 0, recorded: {}, waiting: [] },
    sleep: { last: null, queued: {}, failed: 0, episodes: 0, standingOut: 0, signals: {}, idleBecause: ["no turn has been reflected on yet"] } };
  s.prompt = s.prompt.split("\n").filter(line => !line.startsWith("Established habits") && !line.startsWith("- For a reader")).join("\n");
  s.usage = { ...s.usage, calls: 0, tokens: 0 };
  return s;
}
const off = () => ({ ...clone(engine.snapshot), settings: { enabled: false, learningProvider: "", learningModel: "" } });
const projects = () => ({ ...clone(engine.snapshot), projects: [{ id: "p", label: "default-workspace" }, { id: "notes", label: "research-notes" }] });

export const scenarios = {
  engine: { label: 'From the core: three weeks of use', build: () => clone(engine.snapshot) },
  empty: { label: 'Nothing remembered yet', build: empty },
  off: { label: 'Memory turned off', build: off },
  projects: { label: 'Two projects', build: projects },
  sample: { label: 'A 0.7 backend (snapshot.sample.json)', build: () => clone(sample) },
  stale: { label: 'Restart required', build: () => ({ ...clone(sample), memory: {} }) },
  down: { label: 'Load failure', build: null },
};

export function createBackend(scenarioKey, { latency = 300, onFailed } = {}) {
  const build = scenarios[scenarioKey].build;
  let snap = build ? build() : null;
  let failNext = false;
  const items = () => snap.memory.state.items;
  const find = id => items().find(item => item.id === id);
  const live = item => !item.paused && ["active", "doubtful"].includes(item.status);
  const review = () => {
    if (!snap.review) return;
    const ok = id => { const item = find(id); return item && live(item); };
    snap.review = { unsure: items().filter(i => live(i) && i.status === "doubtful").map(i => i.id), stale: snap.review.stale.filter(id => ok(id) && find(id).status === "active"),
      disputes: snap.review.disputes.filter(d => ok(d.a) && ok(d.b)) };
  };
  const bump = (item, patch) => Object.assign(item, patch, { revision: item.revision + 1 });
  return {
    failNextAction(value) { failNext = value; },
    async request(action, payload = {}) {
      await sleep(latency);
      if (!snap) throw fail('unavailable', 'The DSH connection is not available.');
      if (failNext && action !== 'snapshot') { failNext = false; onFailed?.(); throw fail('conflict', 'This changed since it was loaded. Refresh and try again.'); }
      if (action === 'why') {
        const item = find(payload.item);
        if (!item) throw fail('missing', 'Unknown memory');
        const known = engine.why[item.id];
        // A 0.7 backend has no account to give; the panel shows what the snapshot holds.
        if (!known) throw fail('missing', 'This backend cannot explain a memory yet.');
        return { ...clone(known), item };
      }
      if (action === 'reclaim') { if (snap.keeping?.usage) snap.keeping.usage.store = 9.6e6; return { rows: 412, bytes: 9.4e6, freed: 9.6e6, store: 9.6e6 }; }
      if (action === 'selfcheck') {
        snap.selfcheck = { running: null, last: { at: Date.now(), ms: 412000, model: 'dsh/example-model', passed: 27, total: 32,
          scenarios: [['A correction carries to a different task', 4, 4], ['Out of place once, not everywhere', 3, 4], ['A sensitive memory asked about directly', 4, 4], ['An instruction with no subject calls nothing', 2, 3]].map(([name, passed, total]) => ({ name, passed, total, failed: [] })) } };
        return clone(snap);
      }
      if (action === 'wall') { snap.wall = payload.on === true; return clone(snap); }
      if (action === 'people') return [{ id: 'a', current: true, name: snap.profile?.name || 'Asteme', userName: snap.profile?.userName || '', memories: 6 }, { id: 'b', current: false, name: 'Mira', userName: '', memories: 41 }];
      if (action === 'judgeTest') return { ok: true, ms: 94, model: snap.judge?.model ?? 'jev-1.13.0' };
      if (action === 'export') {
        const files = { archive: ['archive.json'], diary: ['2026-11.md', '2026-12.md', 'memories.md'], report: ['report.md', 'report.json', 'evidence.json'] }[payload.kind];
        return { path: `${snap.keeping?.directory ?? '~'}/exports/asteme-${payload.kind}-2026-12-26T09-10-00`, files: files.map(name => ({ name, bytes: 20000 })), bytes: files.length * 20000 };
      }
      if (action === 'projectOff') { snap = { ...snap, projectOff: payload.on }; return clone(snap); }
      if (action === 'private') { snap = { ...snap, memory: { ...snap.memory, delivery: snap.memory.delivery && { ...snap.memory.delivery, sessionPrivate: payload.on } } }; return clone(snap); }
      if (action === 'reveal') return { opened: payload.path };
      if (action === 'pick') return { path: payload.kind === 'folder' ? '~/Documents/asteme' : '~/Documents/asteme/archive.json' };
      if (action === 'reset') { snap = { ...empty(), projects: snap.projects, projectId: snap.projectId, keeping: snap.keeping && { ...snap.keeping, backups: [], saved: [] }, settings: snap.settings }; return clone(snap); }
      if (action === 'import') return { total: payload.backup ? 0 : 12, added: {}, backup: 'memory-before-import.sqlite' };
      if (action === 'backup') {
        if (snap.keeping) snap.keeping.backups = [{ name: `memory-${Date.now()}-manual.sqlite`, at: Date.now(), bytes: 415000 }, ...snap.keeping.backups];
        return clone(snap);
      }
      if (action === 'sources') {
        const item = find(payload.item);
        return { events: clone(engine.sources[item?.id] ?? (item?.evidence ?? []).map(e => ({ id: e.id, role: 'user', content: e.quote }))) };
      }
      if (action === 'snapshot') {
        if (payload.projectId && payload.projectId !== snap.projectId) snap = { ...(payload.projectId === 'notes' ? empty() : build()), projects: snap.projects, projectId: payload.projectId };
      } else if (action === 'memory') {
        const item = find(payload.item);
        if (!item) throw fail('missing', 'Memory changed. Refresh and try again.');
        const now = new Date(snap.diagnosis?.at ?? Date.now()).toISOString();
        if (payload.operation === 'pause') bump(item, { paused: true });
        else if (payload.operation === 'resume') bump(item, { paused: false });
        else if (payload.operation === 'confine') bump(item, { confined: true });
        else if (payload.operation === 'release') bump(item, { confined: false });
        else if (payload.operation === 'confirm') { bump(item, { status: 'active', lastCheckedAt: Date.parse(now) }); delete item.against; }
        else if (payload.operation === 'retire') bump(item, { status: 'retired', closeReason: 'The user said it no longer holds', validUntil: now });
        else if (payload.operation === 'reopen') { bump(item, { status: 'active' }); delete item.closeReason; delete item.validUntil; }
        else {
          // delete removes this one; forget removes everything resting on the same messages.
          const gone = new Set(item.evidence.map(e => e.id));
          snap.memory.state.items = items().filter(other => other !== item && (payload.operation === 'delete' || !other.evidence.some(e => gone.has(e.id))));
          const left = new Set(items().map(i => i.id)), d = snap.memory.delivery;
          if (d) { d.delivered = d.delivered.filter(i => left.has(i.id)); d.decisions = d.decisions.filter(x => left.has(x.id)); }
        }
        review();
      } else if (action === 'feedback') {
        const d = snap.memory.delivery;
        d.outcomes = (d.outcomes ?? []).filter(o => o.item !== payload.item);
        if (!payload.undo) d.outcomes.push({ item: payload.item, kind: payload.kind, by: 'user', reason: '' });
        const item = find(payload.item);
        if (!payload.undo && payload.kind === 'wrong' && item && item.status === 'active') bump(item, { status: 'doubtful', against: [{ id: 'panel', quote: '', reason: 'The user said this is wrong' }] });
        review();
      } else if (action === 'dispute') {
        if (payload.keep !== 'both') { const dropped = find(payload.keep === payload.a ? payload.b : payload.a); bump(dropped, { status: 'superseded', supersededBy: payload.keep, closeReason: 'The user chose the other of two memories that disagreed' }); }
        snap.review.disputes = snap.review.disputes.filter(d => !(d.a === payload.a && d.b === payload.b));
        review();
      } else if (action === 'profile') {
        snap.profile = { ...snap.profile, ...payload.patch };
        const mine = !!(snap.profile.purpose || snap.profile.values?.length);
        if (snap.charter) snap.charter = mine
          ? { purpose: snap.profile.purpose || engine.snapshot.charter.purpose, values: snap.profile.values?.length ? snap.profile.values : engine.snapshot.charter.values, isDefault: false }
          : clone(engine.snapshot.charter);
      } else if (action === 'habit') {
        if (payload.restore) {
          const habit = snap.learning.history.find(h => h.key === payload.key);
          snap.learning.history = snap.learning.history.filter(h => h !== habit);
          if (habit) snap.learning.habits.push({ ...habit, status: 'active', active: true });
        } else {
          const habit = snap.learning.habits.find(h => h.key === payload.key);
          snap.learning.habits = snap.learning.habits.filter(h => h !== habit);
          if (habit) snap.learning.history.push({ ...habit, status: 'demoted', active: false, demoteReason: 'Removed by the user' });
        }
      } else if (action === 'settings') {
        // As the backend does: the key is kept apart and only its presence is reported.
        const { judgeKey, ...rest } = payload.patch;
        snap.settings = { ...snap.settings, ...rest };
        if (judgeKey !== undefined) snap.judgeKeySet = judgeKey !== '';
        snap.judge = snap.judgeKeySet ? { model: snap.settings.judgeModel || 'jev-1.13.0', mode: snap.settings.judgeMode } : null;
      }
      return clone(snap);
    },
  };
}
