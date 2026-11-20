// --- The sky ------------------------------------------------------------------
const canvas = $("sky"),
  g = canvas.getContext("2d");
let stars = new Map(),
  tasksOut = new Map(),
  flares = [],
  births = new Map(),
  turn = 0,
  last = 0,
  looping = false,
  hover = null;
// Two numbers from an id that do not move together (a plain string hash of
// "idx" and "idy" does, and puts every star on one line).
const hash = (text, seed = 0) => {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const ink = () => getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
const size = () => {
  const r = devicePixelRatio || 1;
  canvas.width = innerWidth * r;
  canvas.height = innerHeight * r;
  g.setTransform(r, 0, 0, r, 0, 0);
  draw();
};
const pole = () => ({ x: innerWidth * 0.72, y: innerHeight * 0.16 });
const now0 = () => ({ x: innerWidth / 2, y: innerHeight - 92 });
// Where a star stands: fixed by its id, turned about the pole while asleep.
const place = (s) => {
  if (s.first) return pole();
  const x = (0.05 + 0.9 * s.u) * innerWidth,
    y = (0.11 + 0.7 * s.v) * innerHeight,
    p = pole(),
    c = Math.cos(turn),
    n = Math.sin(turn);
  return { x: p.x + (x - p.x) * c - (y - p.y) * n, y: p.y + (x - p.x) * n + (y - p.y) * c };
};
const setSky = (list) => {
  const next = new Map();
  // Something newly learned comes into the sky as a falling star does: from beyond the edge, down to its own place among the others. A few at a time; more than that
  // (a night's tidying) simply appear. Not with motion turned down, and not if the person would rather it did not.
  let falling = 0;
  const now = performance.now(),
    fall = loaded && look.comet !== false && !quiet();
  for (const m of list) {
    next.set(m.id, { ...m, ...(m.first ? { strength: 1 } : {}), u: hash(m.id, 1), v: hash(m.id, 2) });
    if (loaded && !stars.has(m.id)) {
      births.set(m.id, now);
      // While the scene of its waking is on, a star that comes is held unseen until the scene shows it. The state is read more than once in that scene (whatever changed
      // tells the page to read it), and the first star was lit by one reading, then put out and sent on its way by the scene: it came twice.
      if (document.body.classList.contains("birthing")) comets.set(m.id, { t0: Infinity, from: 0, first: !!m.first });
      else if (fall && falling < 3) {
        comets.set(m.id, { t0: now + 320 * falling, from: hash(m.id, 11), first: !!m.first || (!stars.size && !falling) });
        falling++;
      }
    }
  }
  stars = next;
  if (spaceOn) void loadAll();
  else chart(stars);
  kick();
};
