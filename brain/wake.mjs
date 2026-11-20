// Awake and asleep, without a heartbeat.
//
// A heartbeat wakes a mind on a fixed beat to ask whether anything happened.
// Most beats find nothing, each one costs a model call, and whatever happens
// between two beats waits for the next. Here nothing is polled:
//
//   stimulus   something arrived (the user spoke, a worker finished or asks)
//   intention  a time the mind set itself ("look at this at 15:00"), kept as
//              one alarm armed for the nearest of them
//
// Awake: every stimulus is attended at once, in order. In a quiet moment
// (nothing arriving for a short while) what just happened is read into
// memory, one paced round at a time. With nothing left and nobody around for
// longer, it falls asleep. Asleep: outcomes and consolidation run in paced
// rounds until there is none left, and then nothing runs at all until the
// next alarm or stimulus. The process holds exactly one timer, and no model
// is called to find out that nothing happened.
//
// The mind is only ever "on" while its process runs. What came due while it
// was off is found on start and attended first, with the gap said plainly.
export const EVERY = ["day", "weekday", "week", "month"];
/** The next time after `now` of something that comes round `every` so often, counted in the clock of this computer. */
export function nextTime(at, every, now) {
  const d = new Date(at);
  for (let i = 0; i < 4000 && (d.getTime() <= now || (every === "weekday" && [0, 6].includes(d.getDay()))); i++) {
    if (every === "week") d.setDate(d.getDate() + 7);
    else if (every === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}
export class Wakefulness {
  constructor({
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    load = () => null,
    save = () => {},
    drowsyAfterMs = 300000,
    restEveryMs = 30000,
    settleMs = 20000,
  } = {}) {
    Object.assign(this, { now, setTimer, clearTimer, save, drowsyAfterMs, restEveryMs, settleMs });
    const kept = load() ?? {};
    this.alarms = Array.isArray(kept.alarms) ? kept.alarms : [];
    this.lastSeen = kept.lastSeen ?? null;
    this.state = "awake";
    this.queue = [];
    this.busy = false;
    this.timer = null;
    this.lastStimulus = this.now();
    this.resting = true;
    this.attend = async () => {};
    this.rest = async () => false;
    this.changed = () => {};
  }
  /** Handlers: attend(event) for one stimulus; rest(depth) does one round ("light" awake, "deep" asleep) and says whether more remains; holds() says whether work is out. */
  on({ attend, rest, changed, holds }) {
    Object.assign(this, { attend, rest, changed: changed ?? this.changed, holds: holds ?? (() => false) });
    return this;
  }
  /** Called once at start. What came due while the process was off is attended first. */
  start() {
    const now = this.now(),
      gap = this.lastSeen ? now - this.lastSeen : 0;
    this.away = gap > this.drowsyAfterMs ? { from: this.lastSeen, to: now } : null;
    this.keep();
    this.arm();
    this.drain();
    return this;
  }
  stimulus(event) {
    this.queue.push({ ...event, at: this.now() });
    this.lastStimulus = this.now();
    if (this.state !== "awake") this.become("awake");
    this.resting = true;
    void this.drain();
  }
  /** An intention: attend to `why` at `at`. `ref` lets whoever set it take it back. */
  // `every` makes it come round again: each day, each weekday, each week or each month, at the same hour.
  intend(at, why, ref = null, every = null) {
    const alarm = { id: `${at}:${this.alarms.length}:${Math.round(this.now() % 1e6)}`, at, why, ref, ...(EVERY.includes(every) ? { every } : {}) };
    this.alarms.push(alarm);
    this.keep();
    this.arm();
    return alarm.id;
  }
  forget(ref) {
    const before = this.alarms.length;
    this.alarms = this.alarms.filter((a) => a.ref !== ref && a.id !== ref);
    if (this.alarms.length !== before) {
      this.keep();
      this.arm();
    }
  }
  next() {
    return this.alarms.reduce((first, a) => (!first || a.at < first.at ? a : first), null);
  }
  become(state) {
    if (this.state === state) return;
    this.state = state;
    this.changed(state);
  }
  keep() {
    this.lastSeen = this.now();
    this.save({ alarms: this.alarms, lastSeen: this.lastSeen });
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (;;) {
        const now = this.now(),
          due = this.alarms.filter((a) => a.at <= now);
        // One that comes round again is set for its next time after now: times missed while not running are not made up one by one.
        if (due.length) {
          this.alarms = [
            ...this.alarms.filter((a) => a.at > now),
            ...due.filter((a) => a.every).map((a) => ({ ...a, at: nextTime(a.at, a.every, now) })),
          ];
          this.keep();
          for (const a of due)
            this.queue.push({ kind: "alarm", why: a.why, ref: a.ref, due: a.at, at: now, ...(now - a.at > 60000 ? { late: now - a.at } : {}) });
          if (this.state !== "awake") this.become("awake");
          this.lastStimulus = now;
        }
        const event = this.queue.shift();
        if (!event) break;
        const away = this.away;
        this.away = null;
        try {
          await this.attend({ ...event, ...(away ? { away } : {}) });
        } catch (e) {
          this.failed?.(e, event);
        }
        this.lastStimulus = this.now();
        this.keep();
      }
    } finally {
      this.busy = false;
      this.arm();
    }
  }
  /** One timer, for the nearest thing that will not announce itself. */
  arm() {
    if (this.timer) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    const now = this.now(),
      times = [];
    const alarm = this.next();
    if (alarm) times.push(alarm.at);
    if (this.state === "awake" && !this.holds?.()) times.push(this.lastStimulus + this.drowsyAfterMs);
    if (this.resting && !this.busy && !this.restingNow)
      times.push(Math.max(this.state === "awake" ? this.lastStimulus + this.settleMs : 0, (this.restedAt ?? 0) + this.restEveryMs, now));
    if (!times.length) return;
    const at = Math.min(...times);
    this.timer = this.setTimer(
      () => {
        this.timer = null;
        void this.tick();
      },
      // A timer cannot be set further off than some twenty-four days: one asked for later than that fires at once, and this would then ask again, without end.
      // It is set for as far as it can be, and looks again when that comes.
      Math.min(2 ** 31 - 1, Math.max(0, at - now)),
    );
    this.timer?.unref?.();
  }
  async tick() {
    const now = this.now();
    if (this.alarms.some((a) => a.at <= now)) return this.drain();
    if (this.state === "awake" && !this.busy && !this.holds?.() && now - this.lastStimulus >= this.drowsyAfterMs) {
      this.become("asleep");
      this.resting = true;
    }
    const depth = this.state === "asleep" ? "deep" : now - this.lastStimulus >= this.settleMs ? "light" : null;
    // A round of rest never holds attention up: it runs beside it, and a
    // stimulus that arrives meanwhile is attended at once.
    if (depth && this.resting && !this.restingNow && !this.busy && !this.queue.length && now >= (this.restedAt ?? 0) + this.restEveryMs) {
      this.restingNow = true;
      void (async () => {
        try {
          this.resting = (await this.rest(depth)) === true;
        } catch (e) {
          this.resting = false;
          this.failed?.(e, { kind: "rest" });
        } finally {
          this.restingNow = false;
          this.restedAt = this.now();
          this.keep();
          this.arm();
        }
      })();
    }
    this.arm();
  }
  stop() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.keep();
  }
}
