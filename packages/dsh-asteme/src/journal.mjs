// The journal: what the system did and how it went, for whoever has to find
// out why it misbehaved. One row per model call (purpose, duration, outcome),
// plus whatever else is worth a line. It is a diagnostic record, not memory:
// nothing is recalled from it and nothing learns from it.
export const journal = {
  note(kind, data = {}) {
    try {
      const now = this.log.now();
      this.log.db.prepare("INSERT INTO journal(at,kind,data) VALUES (?,?,?)").run(now, String(kind), JSON.stringify(data));
      // The journal is for finding faults, not memory. Rows older than ninety
      // days are dropped, checked about once in two hundred writes.
      if (Math.random() < 0.005) this.log.db.prepare("DELETE FROM journal WHERE at<?").run(now - 90 * 86400000);
    } catch {}
  },
  journal({ since = 0, kind, limit = 500 } = {}) {
    const rows = kind
      ? this.log.db.prepare("SELECT at,kind,data FROM journal WHERE at>=? AND kind=? ORDER BY seq DESC LIMIT ?").all(since, kind, limit)
      : this.log.db.prepare("SELECT at,kind,data FROM journal WHERE at>=? ORDER BY seq DESC LIMIT ?").all(since, limit);
    return rows.map(r => ({ at: r.at, kind: r.kind, ...JSON.parse(r.data) }));
  },
  /**
   * Model calls by purpose over a window: how many, how many failed and how,
   * how long they took. An answer that was cut off and asked for again with
   * more room is counted as asked again, not as failed: the call went on.
   */
  health(now = this.log.now(), window = 86400000) {
    const calls = this.journal({ since: now - window, kind: "call", limit: 5000 });
    const by = {};
    for (const c of calls) {
      const p = by[c.purpose] ??= { calls: 0, failed: 0, timeouts: 0, cut: 0, again: 0, ms: [] };
      p.calls++;
      if (!c.ok && c.again) p.again++;
      else if (!c.ok) { p.failed++; if (c.timeout) p.timeouts++; if (c.incomplete) p.cut++; }
      else if (Number.isFinite(c.ms)) p.ms.push(c.ms);
    }
    const at = (list, q) => list.length ? list[Math.min(list.length - 1, Math.floor(q * list.length))] : null;
    const purposes = Object.fromEntries(Object.entries(by).map(([name, p]) => {
      const sorted = p.ms.sort((a, b) => a - b);
      return [name, { calls: p.calls, failed: p.failed, timeouts: p.timeouts, cut: p.cut, again: p.again, median: at(sorted, 0.5), slow: at(sorted, 0.95) }];
    }));
    const total = Object.values(purposes).reduce((n, p) => ({ calls: n.calls + p.calls, failed: n.failed + p.failed, timeouts: n.timeouts + p.timeouts, cut: n.cut + p.cut, again: n.again + p.again }), { calls: 0, failed: 0, timeouts: 0, cut: 0, again: 0 });
    return { since: now - window, ...total, purposes, lastError: calls.find(c => !c.ok && !c.again)?.error ?? null };
  },
};
