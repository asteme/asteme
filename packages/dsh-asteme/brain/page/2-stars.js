// --- Among the stars -------------------------------------------------------------
// The sky behind the conversation is a window onto something larger. Take hold
// of it and the conversation falls away, the flat sky tips over into depth and
// you are carried in: every memory is there, and they are all around you.
// Not a galaxy looked at from outside, which is a picture of somebody else's
// sky: you stand near the middle of your own, and there are stars in every
// direction, also behind you. The newest are nearest and the oldest furthest,
// so looking further out is looking further back, whichever way you look, as
// it is in the real sky. A lesson holds the cases it was drawn from close
// around it. What comes to mind easily is bright; what is fading is faint.
// Pulled far enough back, the whole of it is seen at once, as a ball of stars.
// Nothing here is drawn that is not a stored memory.
let spaceOn = false,
  space = 0,
  spaceFrom = 0,
  spaceT0 = 0,
  all = new Map(),
  rim = 1,
  found = null,
  gather = null,
  grabbed = null,
  openId = null;
// The eye: the point of the sky it looks at, how near (k: pixels for one unit there), and which way it is turned.
// The turn is kept whole, as one rotation (a quaternion), and never as two angles. Two angles work until the sky is
// tipped past its edge: then left and right change places under the hand and one of them stops meaning anything
// (the lock every program that turns things in space runs into). One rotation has no such place: any pull turns
// the sky about the line across the pull, wherever it has been turned to before.
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qunit = (q) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const qabout = (x, y, z, a) => {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
// From one turn to another by the short way round.
const qmix = (a, b, w) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d = Math.min(1, Math.abs(d));
  let k0 = 1 - w,
    k1 = w;
  if (d < 0.9995) {
    const th = Math.acos(d),
      sn = Math.sin(th);
    k0 = Math.sin((1 - w) * th) / sn;
    k1 = Math.sin(w * th) / sn;
  }
  k1 *= s;
  return qunit([a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1, a[3] * k0 + b[3] * k1]);
};
// The turn that carries one direction onto another.
const qbetween = (a, b) =>
  qunit([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]]);
const qmat = (q) => {
  const x = q[0],
    y = q[1],
    z = q[2],
    w = q[3];
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
};
const FLAT = [0, 0, 0, 1];
let cam = { x: 0, y: 0, z: 0, k: 1, q: FLAT },
  aim = null,
  flight = null,
  anchor = null,
  glide = null,
  spin = null,
  lean = { x: 0, y: 0 },
  leanTo = { x: 0, y: 0 },
  touched = 0;
// No nearer than this: closer in, a screen holds a handful of stars and nothing to steer by.
const NEAREST = 2.8;
const EASE = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  OUT = (x) => 1 - Math.pow(1 - x, 4),
  // How far apart neighbours stand, and how far from the middle the nearest ring begins: each memory has the same room about it, however many there are.
  SPACING = 96,
  CLEAR = 60,
  GLIDE = 1500,
  // The eye is wide: standing among stars, a narrow eye sees a handful ahead and none of the ones going past.
  FOCAL = 600,
  UPRIGHT = FLAT;
const sky = () => (space > 0 && all.size ? all : stars),
  quiet = () => (space > 0 ? calm : still);
// Where each memory stands in that sky.
const chart = (map) => {
  // The first star (the memory of being woken and named) is the middle of this sky: everything since has gathered around it.
  const pole = [...map.values()].find((m) => m.first);
  if (pole) {
    pole.wx = 0;
    pole.wy = 0;
    pole.wz = 0;
    pole.ph = 0;
  }
  // Around it in every direction, the newest nearest. The direction is the memory's own (from its id) and is even over the whole ball;
  // how far out is its place in time, by the cube root, so that the stars are as thick far out as near.
  const list = [...map.values()].filter((m) => m !== pole).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  list.forEach((m, n) => {
    const r = CLEAR + SPACING * Math.cbrt(n + 0.5),
      up = 2 * hash(m.id, 7) - 1,
      flat = Math.sqrt(1 - up * up),
      a = hash(m.id, 3) * 6.2832;
    m.wx = Math.cos(a) * flat * r;
    m.wy = Math.sin(a) * flat * r;
    m.wz = up * r;
    m.ph = hash(m.id, 5) * 6.2832;
  });
  // A case stands by its lesson: the first lesson that was drawn from it.
  const held = new Set();
  for (const m of list)
    if (m.kind === "lesson")
      for (const id of m.from ?? []) {
        const c = map.get(id);
        if (!c || c.kind === "lesson" || held.has(id)) continue;
        held.add(id);
        const a = hash(id, 4) * 6.2832,
          up = 2 * hash(id, 8) - 1,
          flat = Math.sqrt(1 - up * up),
          d = 30 + 34 * hash(id, 6);
        c.wx = m.wx + Math.cos(a) * flat * d;
        c.wy = m.wy + Math.sin(a) * flat * d;
        c.wz = m.wz + up * d;
      }
  rim = CLEAR + SPACING * Math.cbrt(list.length + 1) + 60;
};
const loadAll = async () => {
  try {
    const list = await get("/api/sky");
    const next = new Map();
    for (const m of list) next.set(m.id, { ...m, ...(m.first ? { strength: 1 } : {}), u: hash(m.id, 1), v: hash(m.id, 2) });
    chart(next);
    regather(next);
    all = next;
    // The whole sky is larger than the part of it behind the conversation: where the eye is set down is taken from the whole, unless a hand has already moved it.
    if (spaceOn && touched === spaceT0) {
      if (flight) flight.to.k = setDown();
      else cam.k = setDown();
    }
    if (gather) lay();
    if (!found) $("spacecount").textContent = say("brainSpaceCount", { n: next.size });
    kick();
  } catch (e) {
    problem(e.message);
  }
};
const lowest = () => Math.min(1, (Math.min(innerWidth, innerHeight) * 0.46) / rim);
// How near the eye is set down on coming in. A sky of a few hundred memories is stood inside: a little under half way from the middle to the edge.
// A young sky is too thin to stand in (a few points and a great deal of dark), so it is met from just outside, all of it ahead, and one walks in.
// It grows around whoever keeps it: with every memory the place one is set down is further in.
const setDown = () => {
  const n = (all.size || stars.size) - 1,
    out = Math.min(1.45, Math.max(0.45, 1.45 - n / 420));
  return Math.min(NEAREST, Math.max(lowest(), FOCAL / (out * rim)));
};
const hold = (c) => {
  const far = rim + 200,
    x = c.x ?? cam.x,
    y = c.y ?? cam.y,
    z = c.z ?? cam.z,
    n = Math.hypot(x, y, z),
    s = n > far ? far / n : 1;
  return { x: x * s, y: y * s, z: z * s, k: Math.min(NEAREST, Math.max(lowest(), c.k ?? cam.k)), q: c.q ?? cam.q };
};
const between = (a, b, w) => ({
  x: a.x + (b.x - a.x) * w,
  y: a.y + (b.y - a.y) * w,
  z: a.z + (b.z - a.z) * w,
  k: a.k * Math.pow(b.k / a.k, w),
  q: qmix(a.q, b.q, w),
});
// Which way the sky's own top is facing, as a turn about its pole: what "level" keeps when everything else is put back.
const heading = (q) => {
  const m = qmat(q);
  return Math.atan2(m[3], m[0]);
};
// Through the eye: a point of the sky to a point of the screen, with how far away it is (1 at the point looked at).
let view = { m: qmat(FLAT), d: FOCAL };
// Across the screen is x, down it is y, and toward you is z. The view leans a little with the pointer, on top of where the sky is turned.
const sight = () => {
  view = { m: qmat(lean.x || lean.y ? qmul(qmul(qabout(1, 0, 0, lean.y), qabout(0, 1, 0, -lean.x)), cam.q) : cam.q), d: FOCAL / cam.k };
};
const through = (wx, wy, wz) => {
  const m = view.m,
    rx = wx - cam.x,
    ry = wy - cam.y,
    rz = wz - cam.z,
    depth = view.d - (m[6] * rx + m[7] * ry + m[8] * rz);
  if (depth < 30) return null;
  const f = FOCAL / depth;
  return {
    x: innerWidth / 2 + (m[0] * rx + m[1] * ry + m[2] * rz) * f,
    y: innerHeight / 2 + (m[3] * rx + m[4] * ry + m[5] * rz) * f,
    far: depth / view.d,
  };
};
// The other way: the point of the sky under a point of the screen, as far off as the point looked at. Exact whichever way the sky is turned.
const under = (px, py) => {
  const m = view.m,
    vx = (px - innerWidth / 2) / cam.k,
    vy = (py - innerHeight / 2) / cam.k;
  return { x: cam.x + m[0] * vx + m[3] * vy, y: cam.y + m[1] * vx + m[4] * vy, z: cam.z + m[2] * vx + m[5] * vy };
};
// Taking hold of the sky to turn it is taking hold of a ball: the point under the hand goes where the hand goes, and coming back to where the pull began puts the sky back as it was. Out past the ball's edge the pull rolls it about the line of sight.
const ball = (px, py) => {
  const R = Math.min(innerWidth, innerHeight) * 0.46,
    x = (px - innerWidth / 2) / R,
    y = (py - innerHeight / 2) / R,
    d2 = x * x + y * y,
    z = d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2),
    n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};
// Where a memory is drawn: where it hangs behind the conversation, where it stands in the sky, or on its way between the two.
// Each star keeps the one place it was last drawn at: with thousands of them, a new one for each at every frame is most of the work.
// What the search has brought together is on its way between its own place in the sky and its place among the found: each star by its own measure (gw), so that going from one to the next moves only the ones that come and go. Where it came from is kept (hx, hy): the one being read is still tied to its place.
const spot = (s, e = EASE(space)) => {
  const p = home(s, e),
    w = s.gw;
  if (!w) return p;
  const slot = wheelAt(s.go);
  if (p) {
    s.hx = p.x;
    s.hy = p.y;
  } else s.hx = undefined;
  const q = p ?? (s.p ??= { x: slot.x, y: slot.y, far: 0.8 });
  if (!p) {
    q.x = slot.x;
    q.y = slot.y;
    q.far = 0.8;
    return w > 0.5 ? q : null;
  }
  // It goes by a shallow arc, each to its own side, as things thrown do; a ruled line from place to place is how a diagram moves.
  const dx = slot.x - q.x,
    dy = slot.y - q.y,
    bend = Math.sin(Math.PI * w) * 0.13 * (s.u > 0.5 ? 1 : -1);
  q.x += dx * w - dy * bend;
  q.y += dy * w + dx * bend;
  q.far += (0.8 - q.far) * w;
  return q;
};
const home = (s, e) => {
  const p = (s.p ??= { x: 0, y: 0, far: 1 });
  if (e >= 1 && s.wx !== undefined) {
    const m = view.m,
      rx = s.wx - cam.x,
      ry = s.wy - cam.y,
      rz = s.wz - cam.z,
      depth = view.d - (m[6] * rx + m[7] * ry + m[8] * rz);
    if (depth < 30) return null;
    const f = FOCAL / depth;
    p.x = innerWidth / 2 + (m[0] * rx + m[1] * ry + m[2] * rz) * f;
    p.y = innerHeight / 2 + (m[3] * rx + m[4] * ry + m[5] * rz) * f;
    p.far = depth / view.d;
    return p;
  }
  const h = place(s);
  if (!e || s.wx === undefined) {
    p.x = h.x;
    p.y = h.y;
    p.far = 1;
    return p;
  }
  const w = through(s.wx, s.wy, s.wz * e);
  if (!w) return null;
  p.x = h.x + (w.x - h.x) * e;
  p.y = h.y + (w.y - h.y) * e;
  p.far = 1 + (w.far - 1) * e;
  return p;
};
const report = () => {
  if (typeof shown === "function") shown("page");
};
const enterSpace = () => {
  if (spaceOn) return;
  spaceOn = true;
  spaceFrom = space;
  spaceT0 = performance.now();
  found = null;
  $("find").value = "";
  touched = spaceT0;
  chart(stars);
  // Where you are set down: inside, a little under half way from the middle to the edge, looking at the middle. From there the newest are close about you and the rest go on behind them in every direction, and behind you.
  const k = setDown();
  // Carried in: from outside and turning, to inside.
  cam = { x: 0, y: 0, z: 0, k: Math.max(lowest(), k * 0.35), q: qabout(0, 0, 1, -0.7) };
  aim = null;
  anchor = null;
  glide = null;
  spin = null;
  flight = { from: { ...cam }, to: { x: 0, y: 0, z: 0, k, q: UPRIGHT }, t0: spaceT0, ms: calm ? 1 : 1900 };
  document.body.classList.add("space");
  $("spaceback").textContent = say("brainSpaceBack");
  $("spacecount").textContent = say("brainSpaceCount", { n: stars.size });
  tip.classList.remove("on");
  closeSheet();
  document.activeElement?.blur?.();
  $("spacehint").textContent = say(look.pull === "turn" ? "brainSpaceHintTurn" : "brainSpaceHint");
  $("spacehint").classList.add("on");
  clearTimeout(enterSpace.hint);
  enterSpace.hint = setTimeout(() => $("spacehint").classList.remove("on"), 9000);
  void loadAll();
  kick();
  report();
};
const leaveSpace = () => {
  if (!spaceOn) return;
  spaceOn = false;
  spaceFrom = space;
  spaceT0 = performance.now();
  grabbed = null;
  found = null;
  gather = null;
  aim = null;
  anchor = null;
  glide = null;
  spin = null;
  gatherTo(null);
  document.body.classList.remove("turned");
  // However far it was turned, the way out is the short way round to flat.
  // (One rotation to another goes the short way by itself.)
  flight = { from: { ...cam }, to: { x: 0, y: 0, z: 0, k: cam.k * 0.6, q: qabout(0, 0, 1, heading(cam.q) + 0.4) }, t0: spaceT0, ms: calm ? 1 : 1000 };
  document.body.classList.remove("space", "panning");
  tip.classList.remove("on");
  kick();
  report();
  setTimeout(() => {
    if (!spaceOn) {
      box.focus();
      down();
      tellSeen();
    }
  }, 500);
};
// When the sky moves under a pointer that does not, what it was pointing at is no longer there.
const unpoint = () => {
  if (hover) {
    hover = null;
    tip.classList.remove("on");
    document.body.style.cursor = "";
  }
};
// Nearer or further, keeping what is under the pointer under it.
const zoomAt = (px, py, k) => {
  unpoint();
  touched = performance.now();
  flight = null;
  glide = null;
  spin = null;
  const to = Math.min(NEAREST, Math.max(lowest(), k));
  anchor = { px, py, world: anchor && anchor.px === px && anchor.py === py ? anchor.world : under(px, py), k: to };
  aim = null;
  kick();
};
const flyTo = (id) => {
  const s = all.get(id) ?? stars.get(id);
  unpoint();
  touched = performance.now();
  if (s && s.wx !== undefined) {
    anchor = null;
    glide = null;
    spin = null;
    flight = {
      from: { ...cam },
      to: hold({ ...cam, x: s.wx, y: s.wy, z: s.wz, k: Math.max(cam.k, 1.7) }),
      t0: performance.now(),
      ms: calm ? 1 : 900,
    };
    kick();
  }
};
// Back to where you were set down: at the middle, facing the way you faced when you came in.
const upright = () => {
  unpoint();
  touched = performance.now();
  anchor = null;
  glide = null;
  spin = null;
  aim = null;
  flight = {
    from: { ...cam },
    to: hold({ ...cam, x: 0, y: 0, z: 0, q: UPRIGHT }),
    t0: performance.now(),
    ms: calm ? 1 : 800,
  };
  kick();
};
const askew = () => {
  // Away from the middle, or turned well away from how you came in: only then is there anything to go back to.
  return Math.hypot(cam.x, cam.y, cam.z) > 60 || view.m[8] < 0.8;
};
// A soft light for the brighter stars, made once for each colour the page is in.
const SHADES = 10,
  SMALL = Array.from({ length: SHADES }, () => []);
let halo = null;
const haloOf = (color) => {
  if (halo?.color === color) return halo.img;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"),
    r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, color);
  r.addColorStop(1, "transparent");
  x.globalAlpha = 1;
  x.fillStyle = r;
  x.fillRect(0, 0, 64, 64);
  halo = { color, img: c };
  return c;
};
// Which stars show behind the conversation: the ones that come to mind most easily. Worked out when the stars change, not at every frame.
const comets = new Map();
let firstStar = null,
  skyHush = 0,
  skyHushTo = 0;
let frontKept = null;
const frontOf = (cap, wanted) => {
  if (frontKept?.of !== stars || frontKept.cap !== cap)
    frontKept = {
      of: stars,
      cap,
      top: new Set(
        [...stars]
          .sort((a, b) => b[1].strength - a[1].strength)
          .slice(0, cap)
          .map(([id]) => id),
      ),
    };
  const top = frontKept.top;
  return { has: (id) => top.has(id) || wanted.has(id) };
};
// Where each star was last drawn: what the pointer is over is looked for among these, not worked out again for every star at every move of the hand.
let drawnAt = null,
  gatherBusy = false;
// As much of a line of words as fits a width.
const fitWords = (text, room) => {
  text = text.replace(/\s+/g, " ");
  if (g.measureText(text).width <= room) return text;
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(text.slice(0, mid) + "…").width <= room) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
};
const draw = (t = performance.now()) => {
  gatherBusy = gatherStep(t);
  g.clearRect(0, 0, innerWidth, innerHeight);
  const color = ink();
  g.strokeStyle = g.fillStyle = color;
  g.lineCap = "round";
  // The way in and the way out are one movement, there and back.
  const goal = spaceOn ? 1 : 0,
    dt = Math.min(64, t - (draw.at ?? t));
  draw.at = t;
  if (space !== goal) {
    const k = calm ? 1 : Math.min(1, (t - spaceT0) / (goal ? GLIDE : 900));
    space = spaceFrom + (goal - spaceFrom) * k;
    if (k >= 1) {
      space = goal;
      if (!goal) {
        all = new Map();
        cam = { x: 0, y: 0, z: 0, k: 1, q: FLAT };
        flight = null;
        lean = { x: 0, y: 0 };
      }
    }
  }
  if (flight) {
    const q = Math.min(1, (t - flight.t0) / flight.ms);
    cam = between(flight.from, flight.to, OUT(q));
    if (q >= 1) {
      cam = flight.to;
      flight = null;
    }
  } else if (space) {
    if (aim) {
      const q = calm ? 1 : 0.16;
      cam = {
        x: cam.x + (aim.x - cam.x) * q,
        y: cam.y + (aim.y - cam.y) * q,
        z: cam.z + (aim.z - cam.z) * q,
        k: cam.k + (aim.k - cam.k) * q,
        q: qmix(cam.q, aim.q, q),
      };
      const same = Math.abs(cam.q[0] * aim.q[0] + cam.q[1] * aim.q[1] + cam.q[2] * aim.q[2] + cam.q[3] * aim.q[3]);
      if (Math.abs(aim.k - cam.k) < 0.002 && Math.abs(aim.x - cam.x) + Math.abs(aim.y - cam.y) + Math.abs(aim.z - cam.z) < 0.4 && same > 0.999999) {
        cam = aim;
        aim = null;
      }
    }
    if (anchor) {
      const q = calm ? 1 : 0.2;
      cam.k += (anchor.k - cam.k) * q;
      sight();
      const now = under(anchor.px, anchor.py);
      cam = hold({ ...cam, x: cam.x + anchor.world.x - now.x, y: cam.y + anchor.world.y - now.y, z: cam.z + anchor.world.z - now.z });
      if (Math.abs(anchor.k - cam.k) < 0.002) {
        cam.k = anchor.k;
        anchor = null;
      }
    }
    // Let go while moving, it keeps going a little.
    if (glide) {
      cam = hold({ ...cam, x: cam.x + glide.x * dt, y: cam.y + glide.y * dt, z: cam.z + glide.z * dt });
      const f = Math.pow(0.994, dt);
      glide.x *= f;
      glide.y *= f;
      glide.z *= f;
      if (Math.hypot(glide.x, glide.y, glide.z) * cam.k < 0.004) glide = null;
    }
    // Turned and let go, it keeps turning a little, about the same line.
    if (spin) {
      const rate = Math.hypot(spin.x, spin.y, spin.z);
      if (rate < 0.00004) spin = null;
      else {
        cam = { ...cam, q: qunit(qmul(qabout(spin.x / rate, spin.y / rate, spin.z / rate, rate * dt), cam.q)) };
        const f = Math.pow(0.9955, dt);
        spin.x *= f;
        spin.y *= f;
        spin.z *= f;
      }
    }
    // Left alone, the sky turns slowly, as skies do.
    if (
      spaceOn &&
      !calm &&
      !grabbed &&
      !aim &&
      !anchor &&
      !spin &&
      !gather &&
      t - touched > 2600 &&
      !document.body.classList.contains("sheet-on") &&
      document.activeElement !== $("find")
    )
      cam = { ...cam, q: qunit(qmul(cam.q, qabout(0, 0, 1, dt * 0.000016))) };
  }
  // The view leans a little toward the pointer: near things move more than far ones, which is what depth is.
  lean.x += (leanTo.x * space - lean.x) * 0.06;
  lean.y += (leanTo.y * space - lean.y) * 0.06;
  sight();
  if (spaceOn && !flight && (draw.n = (draw.n ?? 0) + 1) % 12 === 0) document.body.classList.toggle("turned", askew());
  if (level === "off" && !space) return;
  const e = EASE(space),
    source = sky(),
    hush = quiet();
  // Behind the conversation: the ones that come to mind most easily, up to a
  // number the eye can take in, and always the ones in use right now, just
  // born or under the pointer. Among the stars: every one of them.
  const cap = level === "quiet" ? 80 : 220,
    dim = (level === "off" ? 0 : level === "quiet" ? 0.6 : 1) * (1 - e) + e,
    wanted = new Set(flares.flatMap((f) => f.ids).concat([...births.keys()], hover ? [hover] : []));
  const front = frontOf(cap, wanted);
  const at = new Map(),
    middle = Math.min(innerWidth - 40, 640) / 2,
    W = innerWidth,
    H = innerHeight;
  for (const [id, s] of source) {
    if (!e && !front.has(id)) continue;
    const p = spot(s, e);
    if (p && p.x > -40 && p.x < W + 40 && p.y > -40 && p.y < H + 40) at.set(id, p);
  }
  // A lesson is joined to the cases it was drawn from.
  const lessons = new Set([...at.keys()].filter((id) => source.get(id).kind === "lesson").slice(0, e > 0.5 ? 90 : 14));
  g.lineWidth = 0.6 + 0.3 * e;
  for (const id of at.keys()) {
    const s = source.get(id);
    if (lessons.has(id) || id === hover)
      for (const from of s.from ?? []) {
        const a = at.get(id),
          o = source.get(from),
          b = at.get(from) ?? (e && o ? spot(o, e) : null);
        if (a && b && !s.gw && !o?.gw) {
          g.globalAlpha =
            (1 - skyHush) *
            (found ? 0.4 : 1) *
            (wheel.veil ? Math.min(clearOf(a.x, a.y), clearOf(b.x, b.y)) : 1) *
            (0.16 + 0.14 * e) *
            Math.min(1, 1.5 - 0.5 * a.far) *
            (at.has(from) && front.has(id) ? 1 : e * e);
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
  }
  // What is being used for the reply in front of you, and the memory that is open.
  const lit = new Map();
  flares = flares.filter((f) => f.held || t - f.t0 < 9000);
  for (const f of flares) {
    const age = t - f.t0,
      grow = hush ? 1 : Math.min(1, age / 900),
      fade = f.held || age < 5500 ? 1 : 1 - (age - 5500) / 3500,
      o = now0();
    const points = f.ids.map((id) => at.get(id)).filter(Boolean);
    // The line runs from where the words are; among the stars there is no such place, and the star is marked by itself.
    g.lineWidth = 0.9;
    g.globalAlpha = 0.5 * fade * (1 - e);
    if (e < 1)
      points.forEach((p, n) => {
        const from = n ? points[n - 1] : o;
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(from.x + (p.x - from.x) * grow, from.y + (p.y - from.y) * grow);
        g.stroke();
      });
    for (const id of f.ids) lit.set(id, Math.max(lit.get(id) ?? 0, fade));
  }
  // The many small plain ones are drawn together, a few shades at a time: one by one they were nine tenths of a frame with eight thousand in view.
  for (const b of SMALL) b.length = 0;
  // What the search found is a constellation of its own for as long as it is looked at: the found are joined in the order they were found in,
  // and the one being read keeps a thread to where it lives in the sky. Around them the sky steps back by itself; nothing is laid over it.
  wheel.veil += ((gather ? 1 : 0) - wheel.veil) * (calm ? 1 : gather ? 0.12 : 0.05);
  if (wheel.veil < 0.004) wheel.veil = 0;
  // While the first star arrives, the others wait in the dark; afterwards they come back slowly, as what was learned since.
  if (skyHush !== skyHushTo) {
    skyHush += (skyHushTo - skyHush) * (calm ? 1 : skyHushTo ? 0.25 : 0.018);
    if (Math.abs(skyHushTo - skyHush) < 0.004) skyHush = skyHushTo;
  }
  // When the search is let go of, the words go first and at once; the stars follow, and the sky's own labels come back last.
  wheel.said = gather ? 1 : calm ? 0 : (wheel.said ?? 0) * 0.74;
  if (gathering.size) {
    const row = [...gathering].filter((s) => s.gw > 0.02 && at.has(s.id)).sort((a, b) => a.go - b.go);
    g.lineWidth = 1;
    for (let n = 1; n < row.length; n++) {
      const a = at.get(row[n - 1].id),
        b = at.get(row[n].id);
      if (Math.abs(row[n].go - row[n - 1].go) > 1.6) continue;
      const there = Math.max(0, (Math.min(row[n - 1].gw, row[n].gw) - 0.7) / 0.3) * (wheel.said ?? 0);
      if (there < 0.01) continue;
      g.globalAlpha = 0.22 * Math.min(rowLight(row[n - 1].go), rowLight(row[n].go));
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(a.x + (b.x - a.x) * there, a.y + (b.y - a.y) * there);
      g.stroke();
    }
    for (const s of row) {
      const near = Math.max(0, 1 - Math.abs(s.go));
      if (!near || s.hx === undefined) continue;
      const b = at.get(s.id),
        d = Math.hypot(s.hx - b.x, s.hy - b.y);
      if (d < 40) continue;
      // The thread is plain at the star's own place and thins out toward the words, so that it points without lying across them.
      const fade = g.createLinearGradient(s.hx, s.hy, b.x, b.y);
      fade.addColorStop(0, color);
      fade.addColorStop(0.62, "transparent");
      g.strokeStyle = fade;
      g.globalAlpha = 0.34 * near * s.gw;
      g.setLineDash([2, 5]);
      g.beginPath();
      g.moveTo(s.hx, s.hy);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = color;
      g.globalAlpha = 0.5 * near * s.gw;
      g.beginPath();
      g.arc(s.hx, s.hy, 5, 0, 7);
      g.stroke();
    }
  }
  const zoom = 1 + (Math.min(1.7, Math.max(0.34, Math.pow(cam.k, 0.55))) - 1) * e,
    glowing = haloOf(color),
    soft = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark" ? 0.2 : 0.1;
  for (const [id, p] of at) {
    const s = source.get(id),
      comet = comets.get(id);
    if (comet) {
      const k = (t - comet.t0) / (comet.first ? 3000 : 1150);
      if (k < 0) continue;
      if (k >= 1) {
        comets.delete(id);
        births.set(id, t - (comet.first ? 2600 : 700));
        if (comet.first) firstStar = { id, t0: t };
      } else if (comet.first) {
        // The first star does not fall from outside: it leaves the place where it was woken, the middle of the screen, where a point of light gathers first, and goes up by a long arc to the pole of the sky.
        const ox = comet.ox ?? W / 2,
          oy = comet.oy ?? H * 0.4,
          gather_ = Math.min(1, k / 0.22),
          go = k < 0.22 ? 0 : EASE((k - 0.22) / 0.78),
          x = ox + (p.x - ox) * go - Math.sin(Math.PI * go) * W * 0.05,
          y = oy + (p.y - oy) * go - Math.sin(Math.PI * go) * H * 0.1;
        const R = (10 + 26 * gather_) * (1 - go * 0.45);
        g.globalAlpha = 0.5 * gather_ * (1 - go * 0.5);
        g.drawImage(glowing, x - R * 2.2, y - R * 2.2, R * 4.4, R * 4.4);
        if (comet.px !== undefined && go > 0) {
          const vx = x - comet.px,
            vy = y - comet.py;
          g.globalAlpha = 0.55;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - vx * 3, y - vy * 3);
          g.stroke();
          g.globalAlpha = 0.22;
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(x - vx * 3, y - vy * 3);
          g.lineTo(x - vx * 8, y - vy * 8);
          g.stroke();
        }
        comet.px = x;
        comet.py = y;
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(x, y, 1.2 + 2 * gather_, 0, 7);
        g.fill();
        continue;
      } else {
        const w = 1 - Math.pow(1 - k, 2.4),
          fx = W * (0.5 + 0.55 * comet.from),
          fy = -30,
          x = fx + (p.x - fx) * w,
          y = fy + (p.y - fy) * w - Math.sin(Math.PI * w) * 46;
        if (comet.px !== undefined) {
          const vx = x - comet.px,
            vy = y - comet.py;
          g.globalAlpha = 0.5 * (1 - k * 0.5);
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - vx * 2.2, y - vy * 2.2);
          g.stroke();
          g.globalAlpha = 0.22 * (1 - k * 0.5);
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(x - vx * 2.2, y - vy * 2.2);
          g.lineTo(x - vx * 5, y - vy * 5);
          g.stroke();
        }
        comet.px = x;
        comet.py = y;
        g.globalAlpha = 0.95;
        g.beginPath();
        g.arc(x, y, 2.2, 0, 7);
        g.fill();
        continue;
      }
    }
    const born = births.get(id),
      young = born ? Math.min(1, (t - born) / 2600) : 1,
      glow = lit.get(id) ?? 0,
      on = hover === id ? 1 : 0;
    // Found by the search: these stand out and the rest step back.
    // Found by the search: these stand out and the rest step back. Of the found, the ones being read stand out most; the others keep a fainter ring where they are. Where the found stand, the rest of the sky makes room.
    const match = found
        ? found.has(id)
          ? gather && s.gw < 1
            ? s.gw + (1 - s.gw) * Math.max(0.14, Math.min(0.42, 6 / gather.ids.length))
            : 1
          : 0
        : null,
      seen =
        (front.has(id) ? 1 : e) *
        (skyHush && !s.first ? 1 - skyHush : 1) *
        (s.gw ? 1 - s.gw + s.gw * rowLight(s.go) : wheel.veil ? clearOf(p.x, p.y) : 1);
    // Near things are larger and clear, far ones small and faint.
    // Far ones do not go out: from inside, most of the sky is far, and a sky is its far stars.
    const near = Math.min(2.4, Math.max(0.5, 1 / Math.sqrt(p.far))),
      haze = Math.min(1, Math.max(0.34, 1.3 - 0.3 * p.far));
    const twinkle = e && !hush ? 1 - 0.24 * e * (0.5 + 0.5 * Math.sin(t * 0.0017 + s.ph)) : 1;
    const r =
        (1.1 + 2.1 * s.strength) *
        (1 + 0.7 * glow + 0.4 * on + 0.5 * (match ?? 0)) *
        zoom *
        near *
        (s.gw ? 1 + s.gw * (0.5 * Math.max(0, 1 - Math.abs(s.go)) - 0.06 * Math.min(4, Math.abs(s.go))) : 1),
      behind = Math.abs(p.x - W / 2) < middle ? 0.55 + 0.45 * e : 1;
    const alpha = Math.min(
      1,
      ((0.3 + 0.7 * s.strength) * young * dim * behind * twinkle * haze * (match === 0 ? 0.2 : 1) + glow + on + 0.35 * (match ?? 0)) * seen,
    );
    if (alpha < 0.02) continue;
    // On its way to the others or home again, it draws a short tail behind it: the length of the last few moments of its flight.
    if (s.gp !== undefined) {
      if (s.gw > 0.03 && s.gw < 0.97 && s.tx !== undefined) {
        const vx = p.x - s.tx,
          vy = p.y - s.ty,
          sp = Math.hypot(vx, vy);
        if (sp > 1.2 && sp < 400) {
          const a = Math.min(0.34, sp / 50) * alpha;
          g.globalAlpha = a;
          g.lineWidth = Math.max(1, r * 0.55);
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - vx * 1.2, p.y - vy * 1.2);
          g.stroke();
          g.globalAlpha = a * 0.5;
          g.lineWidth = Math.max(0.6, r * 0.25);
          g.beginPath();
          g.moveTo(p.x - vx * 1.2, p.y - vy * 1.2);
          g.lineTo(p.x - vx * 2.6, p.y - vy * 2.6);
          g.stroke();
        }
      }
      s.tx = p.x;
      s.ty = p.y;
    }
    if (r < 1.25 && (s.kind === "noted" || r < 0.8) && !glow && !on && !match && !born && !s.first) {
      SMALL[Math.min(SHADES - 1, (alpha * SHADES) | 0)].push(p.x - r, p.y - r, r * 2);
      continue;
    }
    if (e > 0.05 && r > 1.9 && s.kind !== "matter") {
      const R = r * 5;
      g.globalAlpha = alpha * soft * e;
      g.drawImage(glowing, p.x - R, p.y - R, R * 2, R * 2);
    }
    g.globalAlpha = alpha;
    if (s.kind === "matter") {
      g.lineWidth = 1;
      g.beginPath();
      g.arc(p.x, p.y, r + 1.2, 0, 7);
      g.stroke();
    } else if (r < 1.25) g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    else {
      g.beginPath();
      g.arc(p.x, p.y, r, 0, 7);
      g.fill();
    }
    // The pole star: four long rays and four short.
    if (s.first) {
      const opening = firstStar?.id === id ? OUT(Math.min(1, (t - firstStar.t0) / 900)) * (1 + 0.35 * Math.max(0, 1 - (t - firstStar.t0) / 1800)) : 1,
        reach = (0.55 + 0.45 * e) * opening;
      g.lineWidth = 1;
      g.globalAlpha = alpha * (0.5 + 0.3 * e);
      const k = r * 4.6 * reach,
        d = r * 1.9 * reach;
      g.beginPath();
      g.moveTo(p.x - k, p.y);
      g.lineTo(p.x + k, p.y);
      g.moveTo(p.x, p.y - k);
      g.lineTo(p.x, p.y + k);
      g.moveTo(p.x - d, p.y - d);
      g.lineTo(p.x + d, p.y + d);
      g.moveTo(p.x - d, p.y + d);
      g.lineTo(p.x + d, p.y - d);
      g.stroke();
    }
    if (s.kind === "lesson" || glow) {
      g.lineWidth = 0.8;
      g.globalAlpha = alpha * (s.kind === "lesson" ? 0.55 : glow * 0.7);
      const k = r * 3.2;
      g.beginPath();
      g.moveTo(p.x - k, p.y);
      g.lineTo(p.x + k, p.y);
      g.moveTo(p.x, p.y - k);
      g.lineTo(p.x, p.y + k);
      g.stroke();
    }
    if ((glow && e > 0.5) || match) {
      g.lineWidth = 1;
      g.globalAlpha = 0.7 * Math.max(glow, match ?? 0) * e * (match ? seen : 1);
      g.beginPath();
      g.arc(p.x, p.y, r + 7, 0, 7);
      g.stroke();
    }
    if (born && young < 1) {
      g.lineWidth = 1;
      g.globalAlpha = (1 - young) * 0.7;
      g.beginPath();
      g.arc(p.x, p.y, r + young * 30, 0, 7);
      g.stroke();
    } else if (born) births.delete(id);
  }
  for (let b = 0; b < SHADES; b++) {
    const list = SMALL[b];
    if (!list.length) continue;
    g.globalAlpha = (b + 0.6) / SHADES;
    g.beginPath();
    for (let i = 0; i < list.length; i += 3) g.rect(list[i], list[i + 1], list[i + 2], list[i + 2]);
    g.fill();
  }
  for (const [id, c] of comets) if (t - c.t0 > 5000 || !source.has(id)) comets.delete(id);
  if (firstStar) {
    const p = at.get(firstStar.id),
      k = (t - firstStar.t0) / 6400,
      star = source.get(firstStar.id);
    if (!p || !star || k >= 1) firstStar = null;
    else {
      const open = OUT(Math.min(1, k * 5)),
        stay = Math.min(1, k * 6) * Math.min(1, (1 - k) * 3.2);
      // The light of its arriving, and two rings going out from it.
      const R = 26 + 70 * open;
      g.globalAlpha = 0.6 * (1 - Math.min(1, k * 2.4));
      g.drawImage(haloOf(color), p.x - R, p.y - R, R * 2, R * 2);
      g.lineWidth = 1;
      if (!firstStar.calm)
        for (const late of [0, 0.09]) {
          const q = Math.min(1, Math.max(0, (k - late) * 3.2));
          if (q > 0 && q < 1) {
            g.globalAlpha = (1 - q) * (1 - q) * 0.6;
            g.beginPath();
            g.arc(p.x, p.y, 8 + OUT(q) * 110, 0, 7);
            g.stroke();
          }
        }
      // What it is, said under it: that it is the first, and the memory itself.
      const words = star.private ? "" : (star.text ?? ""),
        wide = Math.max(60, Math.min(p.x, innerWidth - p.x) * 2 - 28);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = color;
      g.font = "600 12.5px system-ui, sans-serif";
      g.globalAlpha = 0.9 * stay;
      g.fillText(say("brainFirstStar"), p.x, p.y + 36 + 6 * (1 - open));
      if (words) {
        g.font = "14px system-ui, sans-serif";
        g.globalAlpha = 0.7 * Math.min(1, Math.max(0, k * 6 - 0.6)) * Math.min(1, (1 - k) * 3.2);
        g.fillText(fitWords(words, wide), p.x, p.y + 60 + 6 * (1 - open));
      }
      g.textAlign = "left";
    }
  }
  for (const [id, l] of landed) {
    const k = (t - l.t0) / (l.home ? 620 : 420),
      p = at.get(id);
    if (k >= 1 || !p) {
      landed.delete(id);
      continue;
    }
    g.lineWidth = 1;
    g.globalAlpha = (1 - k) * (1 - k) * (l.home ? 0.7 : 0.45);
    g.beginPath();
    g.arc(p.x, p.y, 4 + OUT(k) * (l.home ? 15 : 10), 0, 7);
    g.stroke();
  }
  // Close in, a lesson says what it is.
  if (e > 0.9 && cam.k >= 0.9 && !found) {
    g.font = "12px system-ui, sans-serif";
    g.textBaseline = "middle";
    const put = [];
    // The nearer ones first; one that would lie over another already written is left unsaid.
    for (const id of [...lessons].sort((a, b) => at.get(a).far - at.get(b).far)) {
      const s = source.get(id),
        p = at.get(id);
      if (!p || p.far > 1.5 || s.private || !s.text || put.length >= 14) continue;
      if (s.label === undefined) {
        s.label = s.text.length > 34 ? s.text.slice(0, 33) + "…" : s.text;
        s.lw = g.measureText(s.label).width;
      }
      const x = p.x + 12,
        y = p.y;
      if (put.some((o) => x < o.x + o.w + 8 && o.x < x + s.lw + 8 && Math.abs(o.y - y) < 15)) continue;
      put.push({ x, y, w: s.lw });
      g.globalAlpha = 0.66 * Math.min(1, 1.6 - 0.6 * p.far) * (1 - wheel.veil) * (1 - wheel.veil);
      g.fillText(s.label, x, y);
    }
  }
  drawnAt = at;
  // What the search found, each with its words beside it. The one being read is nearest and largest and may run to two lines; the ones before and after it fall away, smaller and fainter, as things do that are further off.
  if (gathering.size) {
    g.textBaseline = "middle";
    g.fillStyle = color;
    const ground = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#151517";
    let tall = 0;
    g.shadowColor = ground;
    g.shadowBlur = 10;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const s of gathering) {
      const p = at.get(s.id);
      if (!p || s.gw < 0.02) continue;
      const a = Math.abs(s.go),
        near = Math.max(0, 1 - a),
        size = (13 + 2.5 * near) * (1 - 0.05 * Math.min(4, a)),
        on = s.id === hover;
      const room = Math.max(
          140,
          Math.min(560, innerWidth - p.x - 44 - (document.body.classList.contains("sheet-on") ? Math.min(innerWidth * 0.4, 520) : 0)),
        ),
        lines = wordsOf(s, (room * 13) / size, a < 0.5);
      g.font = `${size.toFixed(2)}px system-ui, sans-serif`;
      const said = Math.max(0, (s.gw - 0.86) / 0.14) * wheel.said;
      g.globalAlpha = Math.min(1, (on ? 1.5 : 1) * rowLight(s.go)) * said * said;
      s.lw = (lines.w * size) / 13;
      if (s.gw > 0.5) {
        box.x0 = Math.min(box.x0, p.x - 30);
        box.x1 = Math.max(box.x1, p.x + 40 + s.lw);
        box.y0 = Math.min(box.y0, p.y - 20);
        box.y1 = Math.max(box.y1, p.y + 20);
      }
      const x = p.x + 18 + 7 * near - 12 * (1 - said);
      if (lines.length > 1) {
        tall = Math.max(tall, near);
        g.fillText(lines[0], x, p.y - size * 0.68);
        g.fillText(lines[1], x, p.y + size * 0.68);
      } else g.fillText(lines[0], x, p.y);
    }
    g.shadowBlur = 0;
    g.shadowColor = "transparent";
    wheel.tallTo = tall;
    wheel.box = gather && box.x1 > box.x0 ? box : null;
    // Which of them this is, said small beside it.
    if (gather && gather.ids.length > 1 && !document.body.classList.contains("sheet-on")) {
      const s = all.get(gather.ids[gather.at]),
        p = s && at.get(s.id);
      if (p && s.gw > 0.86) {
        g.font = "11px system-ui, sans-serif";
        g.textAlign = "right";
        g.globalAlpha = 0.5 * ((s.gw - 0.86) / 0.14) * Math.max(0, 1 - Math.abs(s.go));
        g.fillText(`${gather.at + 1} / ${gather.ids.length}`, p.x - 30, p.y);
        g.textAlign = "left";
      }
    }
    g.globalAlpha = 1;
  }
  // Work that is out: a point going round until it comes back.
  for (const w of tasksOut.values()) {
    const age = (t - w.t0) / 1000,
      back = w.back ? Math.min(1, (t - w.back) / 1400) : 0,
      o = now0(),
      leave = hush ? 1 : Math.min(1, age / 1.6);
    const a = w.phase + (hush ? 0 : age * 0.22),
      ox = innerWidth / 2 + Math.cos(a) * innerWidth * 0.36,
      oy = innerHeight * 0.44 + Math.sin(a) * innerHeight * 0.24;
    const x = o.x + (ox - o.x) * leave * (1 - back),
      y = o.y + (oy - o.y) * leave * (1 - back);
    // It belongs to the conversation: among the stars it is not drawn.
    const seen = (1 - e) * (1 - skyHush);
    g.globalAlpha = 0.95 * (1 - back * 0.6) * seen;
    g.beginPath();
    g.arc(x, y, 2.4, 0, 7);
    g.fill();
    g.globalAlpha = 0.28 * seen;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, 6.5, 0, 7);
    g.stroke();
    if (!back) {
      g.globalAlpha = 0.7 * seen;
      g.font = "11px system-ui, sans-serif";
      g.textBaseline = "alphabetic";
      g.fillText(w.to, x + 11, y + 4);
    }
    if (back >= 1) tasksOut.delete(w.id);
  }
  // That it is thinking is said at the top, in a word. A ring used to go out from where the words will appear, again and again; it drew the eye for nothing, and is gone.
  g.globalAlpha = 1;
};
const moving = () =>
  space !== (spaceOn ? 1 : 0) ||
  !!aim ||
  !!flight ||
  !!anchor ||
  !!glide ||
  !!spin ||
  gatherBusy ||
  (spaceOn && !calm) ||
  (!still && (state === "asleep" || tasksOut.size > 0 || flares.some((f) => !f.held) || births.size > 0)) ||
  comets.size > 0 ||
  !!firstStar ||
  skyHush !== skyHushTo;
const frame = (t) => {
  if (state === "asleep" && !still) turn += Math.min(0.1, (t - last) / 1000) * 0.0035;
  last = t;
  draw(t);
  if (moving()) requestAnimationFrame(frame);
  else looping = false;
};
const kick = () => {
  if (moving()) {
    if (!looping) {
      looping = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  } else draw();
};
addEventListener("resize", size);
const tip = $("tip");
const nearest = (x, y) => {
  if (((level === "off" || look.tips === false) && !spaceOn) || !drawnAt) return null;
  // Among the found, the words are as good as the star.
  for (const s of gathering) {
    const p = drawnAt.get(s.id);
    if (p && s.gw > 0.5 && Math.abs(y - p.y) <= 15 && x >= p.x - 16 && x <= p.x + 34 + (s.lw ?? 0)) return s.id;
  }
  let best = null,
    d = 16 * 16;
  for (const [id, p] of drawnAt) {
    const q = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (q < d) {
      d = q;
      best = id;
    }
  }
  return best;
};
const showTip = (id, x, y, text) => {
  const s = sky().get(id) ?? stars.get(id);
  if (!s) return;
  tip.replaceChildren(el("b", "muted", say("kind_" + s.kind)), document.createTextNode(text ?? (s.private ? say("brainPrivateShow") : s.text)));
  tip.style.left = Math.min(x + 14, innerWidth - 370) + "px";
  tip.style.top = Math.min(y + 14, innerHeight - 120) + "px";
  tip.classList.add("on");
};
const BUSY = "button, textarea, input, select, a, .ask, #sheet, #spacebar, #birth";
addEventListener("mousemove", (e) => {
  if (spaceOn) leanTo = { x: (e.clientX / innerWidth - 0.5) * 0.11, y: (e.clientY / innerHeight - 0.5) * 0.07 };
  if (grabbed?.moved) return;
  const id = e.target.closest(BUSY) ? null : nearest(e.clientX, e.clientY);
  if (id !== hover) {
    hover = id;
    kick();
    if (id && !(sky().get(id)?.gw > 0.5)) showTip(id, e.clientX, e.clientY);
    else tip.classList.remove("on");
  }
  document.body.style.cursor = id ? "pointer" : "";
});
addEventListener("click", (e) => {
  if (grabbed?.moved) {
    grabbed = null;
    return;
  }
  grabbed = null;
  if (hover && !e.target.closest(BUSY)) {
    tip.classList.remove("on");
    gatherShow(hover);
    void openMemory(hover);
  }
});
// Taking hold of the sky. In the conversation, a pull on the empty sky (not on
// anything said, not on a control) loosens it; so does spreading two fingers,
// or pressing twice on empty sky. Among the stars the same hold moves the sky
// and lets it go on a little when released; held with Shift, or with the
// other button, it turns and tips the sky instead. The wheel or two fingers
// bring it nearer or further, and Escape lets go.
const SOLID = BUSY + ", .entry, .line, header, form, .empty, .problem";
const touches = new Map();
let spread = 0;
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") {
    touches.set(e.pointerId, e);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      spread = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      grabbed = null;
    }
  }
  if ((e.button !== 0 && !(spaceOn && e.button === 2)) || e.target.closest(spaceOn ? BUSY + ", header" : SOLID)) return;
  if (!spaceOn && e.pointerType === "touch") return; // one finger on the conversation scrolls it
  flight = spaceOn ? null : flight;
  aim = null;
  anchor = null;
  glide = null;
  spin = null;
  touched = performance.now();
  grabbed = {
    x: e.clientX,
    y: e.clientY,
    px: e.clientX,
    py: e.clientY,
    at: touched,
    vx: 0,
    vy: 0,
    vz: 0,
    sx: 0,
    sy: 0,
    sz: 0,
    turn: spaceOn && (look.pull === "turn") !== (e.shiftKey || e.button === 2),
    moved: false,
  };
});
addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" && touches.has(e.pointerId)) {
    touches.set(e.pointerId, e);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()],
        d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!spaceOn && d > spread * 1.15) enterSpace();
      else if (spaceOn && spread) zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, ((anchor?.k ?? cam.k) * d) / spread);
      spread = d;
      return;
    }
  }
  if (!grabbed) return;
  if (!grabbed.moved && Math.hypot(e.clientX - grabbed.x, e.clientY - grabbed.y) < 9) return;
  if (!grabbed.moved) {
    grabbed.moved = true;
    if (!spaceOn) {
      enterSpace();
      grabbed.entering = true;
    }
    document.body.classList.add("panning");
    hover = null;
    tip.classList.remove("on");
    getSelection()?.removeAllRanges();
  }
  const now = performance.now(),
    dx = e.clientX - grabbed.px,
    dy = e.clientY - grabbed.py,
    ms = Math.max(1, now - grabbed.at);
  grabbed.px = e.clientX;
  grabbed.py = e.clientY;
  grabbed.at = now;
  touched = now;
  // The pull that let it loose carries you in; it does not also drag the sky about.
  if (grabbed.entering || flight) return;
  // Turning: the sky is a ball in the hand. What is under the hand goes with it, whichever way the sky has been turned before, and back at the place the pull began the sky is as it was.
  if (grabbed.turn) {
    const b = ball(e.clientX, e.clientY);
    if (!grabbed.b0) {
      grabbed.b0 = grabbed.bp = b;
      grabbed.q0 = cam.q;
      return;
    }
    const step = qbetween(grabbed.bp, b),
      n = Math.hypot(step[0], step[1], step[2]),
      w = n > 1e-9 ? (2 * Math.asin(Math.min(1, n))) / ms / n : 0;
    grabbed.sx = 0.7 * grabbed.sx + 0.3 * step[0] * w;
    grabbed.sy = 0.7 * grabbed.sy + 0.3 * step[1] * w;
    grabbed.sz = 0.7 * grabbed.sz + 0.3 * step[2] * w;
    grabbed.bp = b;
    cam = { ...cam, q: qunit(qmul(qbetween(grabbed.b0, b), grabbed.q0)) };
    return kick();
  }
  // Moving: the sky slides under the hand, across the screen as the screen lies, however the sky is turned.
  const m = view.m,
    vx = -dx / cam.k,
    vy = -dy / cam.k,
    wx = m[0] * vx + m[3] * vy,
    wy = m[1] * vx + m[4] * vy,
    wz = m[2] * vx + m[5] * vy;
  cam = hold({ ...cam, x: cam.x + wx, y: cam.y + wy, z: cam.z + wz });
  grabbed.vx = 0.7 * grabbed.vx + (0.3 * wx) / ms;
  grabbed.vy = 0.7 * grabbed.vy + (0.3 * wy) / ms;
  grabbed.vz = 0.7 * grabbed.vz + (0.3 * wz) / ms;
  kick();
});
// After a pull, the press that ends it is not a press on a star: the hold is kept until that click has passed, and no longer.
const letGo = (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) spread = 0;
  document.body.classList.remove("panning");
  const was = grabbed;
  if (was?.moved) {
    if (spaceOn && !was.entering && !calm && performance.now() - was.at < 80) {
      if (was.turn) {
        if (Math.hypot(was.sx, was.sy, was.sz) > 0.0003) spin = { x: was.sx, y: was.sy, z: was.sz };
      } else if (Math.hypot(was.vx, was.vy, was.vz) * cam.k > 0.05) glide = { x: was.vx, y: was.vy, z: was.vz };
      kick();
    }
    setTimeout(() => {
      if (grabbed === was) grabbed = null;
    }, 0);
  } else grabbed = null;
};
addEventListener("pointerup", letGo);
addEventListener("pointercancel", letGo);
addEventListener("contextmenu", (e) => {
  if (spaceOn && !e.target.closest(BUSY + ", header")) e.preventDefault();
});
addEventListener(
  "wheel",
  (e) => {
    if (e.target.closest("#sheet")) return;
    if (!spaceOn) {
      if (e.ctrlKey && e.deltaY < 0 && !e.target.closest(BUSY)) {
        e.preventDefault();
        enterSpace();
      }
      return;
    }
    if (e.target.closest("#spacebar")) return;
    e.preventDefault();
    if (flight) return;
    // Over what the search found, the wheel goes from one to the next.
    // Only over them: over their stars and their words (wheel.box, as last drawn). Anywhere else, and always with Ctrl, the wheel brings the sky nearer or further as it does without a search.
    const box = wheel.box;
    if (
      gather &&
      gather.ids.length > 1 &&
      box &&
      !e.ctrlKey &&
      e.clientX >= box.x0 &&
      e.clientX <= box.x1 &&
      e.clientY >= box.y0 &&
      e.clientY <= box.y1
    ) {
      wheeled += e.deltaY;
      const by = Math.trunc(wheeled / 50);
      if (by) {
        wheeled -= by * 50;
        gatherPick(Math.sign(by));
      }
      return;
    }
    zoomAt(e.clientX, e.clientY, (anchor?.k ?? cam.k) * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
  },
  { passive: false },
);
addEventListener("dblclick", (e) => {
  if (e.target.closest(spaceOn ? BUSY + ", header" : SOLID)) return;
  if (!spaceOn) enterSpace();
  else zoomAt(e.clientX, e.clientY, cam.k * 1.8);
});
addEventListener("keydown", (e) => {
  if (!spaceOn || e.target.closest?.("#sheet")) return;
  const typing = e.target === $("find");
  if (e.key === "Escape") {
    e.preventDefault();
    if (document.body.classList.contains("sheet-on")) closeSheet();
    else if (typing && $("find").value) {
      $("find").value = "";
      seek();
    } else leaveSpace();
    return;
  }
  if (typing) return;
  touched = performance.now();
  flight = null;
  anchor = null;
  glide = null;
  spin = null;
  const step = 90 / cam.k,
    moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] },
    from = aim ?? cam;
  if (moves[e.key] && e.shiftKey) {
    e.preventDefault();
    const [x1, y1] = moves[e.key];
    aim = hold({ ...from, q: qunit(qmul(qmul(qabout(1, 0, 0, Math.sign(y1) * 0.18), qabout(0, 1, 0, -Math.sign(x1) * 0.27)), from.q)) });
    kick();
  } else if (moves[e.key]) {
    e.preventDefault();
    const [x1, y1] = moves[e.key],
      m = view.m;
    aim = hold({ ...from, x: from.x + m[0] * x1 + m[3] * y1, y: from.y + m[1] * x1 + m[4] * y1, z: from.z + m[2] * x1 + m[5] * y1 });
    kick();
  } else if (e.key === "+" || e.key === "=") {
    aim = hold({ ...from, k: from.k * 1.35 });
    kick();
  } else if (e.key === "-") {
    aim = hold({ ...from, k: from.k / 1.35 });
    kick();
  } else if (e.key === "/") {
    e.preventDefault();
    $("find").focus();
  } else if (e.key === "0" || e.key === "Home") {
    e.preventDefault();
    upright();
  }
});
// Asking the sky: what matches stands out and the rest step back.
// What a search finds leaves its place and comes together where it can be read: one star after another down a shallow curve, joined by a line, each with its words beside it.
// The one being read is at the middle, nearest and largest; the ones before and after fall away from it. A few stand there at once; the rest keep a faint ring where they
// are in the sky. The wheel of the mouse over them, or the arrow keys in the search box, go from one to the next, and the ones that leave go home as the next come in.
// There is no panel and no list: it stays a sky, with a constellation in it that lasts as long as the search.
const STEP = 34,
  gathering = new Set(),
  wheel = { left: 0, cy: 0, span: 4, shift: 0, shiftTo: 0, tall: 0, tallTo: 0, veil: 0 };
let wheeled = 0;
// Where on the curve a place is: so many steps before or after the one being read (not a whole number while it is on its way).
const wheelAt = (o) => {
  const a = Math.abs(o),
    sg = o < 0 ? -1 : 1;
  return { x: wheel.left + 5 * o * o, y: wheel.cy + wheel.shift * STEP + sg * (a * STEP - 1.3 * a * a + wheel.tall * 11 * Math.min(1, a)) };
};
// How much of its light a place on the curve keeps, and how much of the sky's light is left around the curve.
const rowLight = (o) => Math.max(0, 1 - 0.2 * Math.abs(o));
const clearOf = (x, y) => {
  const dx = (x - wheel.left - 240) / 400,
    dy = (y - wheel.cy - wheel.shift * STEP) / ((wheel.span + 1) * STEP + 50),
    d = dx * dx + dy * dy,
    clear = d < 0.5 ? 0.04 : d > 1.2 ? 1 : 0.04 + (0.96 * (d - 0.5)) / 0.7;
  return 1 - wheel.veil * (1 - clear);
};
// A memory's words for a width: one line, or two for the one being read. Kept for each width they were cut to.
const wordsOf = (s, room, two) => {
  const key = (two ? "2:" : "1:") + Math.round(room / 16);
  s.cuts ??= new Map();
  let lines = s.cuts.get(key);
  if (lines) return lines;
  g.font = "13px system-ui, sans-serif";
  const text = (s.private ? say("private") : (s.text ?? "")).replace(/\s+/g, " ");
  if (!two || g.measureText(text).width <= room) lines = [fitWords(text, room)];
  else {
    let lo = 1,
      hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (g.measureText(text.slice(0, mid)).width <= room) lo = mid;
      else hi = mid - 1;
    }
    const space = text.lastIndexOf(" ", lo),
      cut = space > lo * 0.6 ? space + 1 : lo;
    lines = [text.slice(0, cut).trimEnd(), fitWords(text.slice(cut), room)];
  }
  lines.w = Math.max(...lines.map((l) => g.measureText(l).width));
  s.cuts.set(key, lines);
  return lines;
};
const lay = () => {
  if (!gather) return;
  const n = gather.ids.length;
  wheel.span = Math.max(2, Math.min(4, Math.floor((innerHeight - 300) / 2 / STEP)));
  wheel.left = Math.max(72, innerWidth / 2 - 240);
  wheel.cy = innerHeight / 2 - 14;
  gather.at = Math.max(0, Math.min(n - 1, gather.at));
  const first = Math.max(0, gather.at - wheel.span),
    last = Math.min(n - 1, gather.at + wheel.span),
    slots = new Map();
  // The ones standing there are kept in the middle of the screen as a group: at the first of many, the one being read is at the top of them.
  wheel.shiftTo = -(first - gather.at + (last - gather.at)) / 2;
  if (!gathering.size) wheel.shift = wheel.shiftTo;
  for (let n = first; n <= last; n++) {
    const id = gather.ids[n],
      s = all.get(id);
    if (!s) continue;
    slots.set(id, { i: n - gather.at });
    if (!gathering.has(s)) {
      s.go = n - gather.at;
      s.gw = 0;
      s.gp = 0;
      s.tx = undefined;
      s.gd = performance.now() + 60 * Math.abs(n - gather.at);
      gathering.add(s);
    }
  }
  gather.slots = slots;
  kick();
};
const gatherTo = (ids) => {
  if (!ids?.length) {
    if (gather) {
      const now = performance.now(),
        far = Math.max(0, ...[...gathering].map((s) => Math.abs(s.go)));
      for (const s of gathering) s.gd = now + 45 * (far - Math.abs(s.go));
    }
    gather = null;
    return kick();
  }
  const fresh = !gather;
  gather = { ids, at: 0, slots: new Map() };
  lay();
  if (fresh && ids.length > 1) {
    $("spacehint").textContent = say("brainSpaceWalk");
    $("spacehint").classList.add("on");
    clearTimeout(enterSpace.hint);
    enterSpace.hint = setTimeout(() => $("spacehint").classList.remove("on"), 7000);
  }
};
// To the next, or the one before: the one Enter opens.
const gatherPick = (by) => {
  if (!gather) return;
  gather.at += by;
  lay();
};
const gatherShow = (id) => {
  const n = gather?.ids.indexOf(id) ?? -1;
  if (n >= 0) {
    gather.at = n;
    lay();
  }
};
// Each star that is coming or going moves a part of the way at every frame; one that has gone home is let go of.
const landed = new Map();
const gatherStep = (t) => {
  const dt = Math.min(64, t - (gatherStep.at ?? t)),
    k = calm ? 1 : 1 - Math.exp(-Math.max(8, dt) / 105);
  gatherStep.at = t;
  let busy = (wheel.veil > 0 && wheel.veil < 1) || landed.size > 0;
  if (!gathering.size) return busy;
  for (const key of ["shift", "tall"]) {
    const to = wheel[key + "To"];
    if (Math.abs(to - wheel[key]) > 0.004) {
      wheel[key] += (to - wheel[key]) * k;
      busy = true;
    } else wheel[key] = to;
  }
  for (const s of gathering) {
    const slot = gather?.slots.get(s.id),
      to = slot ? 1 : 0;
    if (slot) {
      if (Math.abs(slot.i - s.go) > 0.004) {
        s.go += (slot.i - s.go) * k;
        busy = true;
      } else s.go = slot.i;
    }
    // The flight itself takes its time and eases at both ends; each waits its turn (gd) before it starts.
    if (s.gp === to) continue;
    busy = true;
    if (!calm && t < (s.gd ?? 0)) continue;
    s.gp = calm ? to : to ? Math.min(1, s.gp + dt / 640) : Math.max(0, s.gp - dt / 560);
    s.gw = EASE(s.gp);
    if (s.gp === to) {
      if (!calm) landed.set(s.id, { t0: t, home: !to });
      if (!to) {
        gathering.delete(s);
        s.cuts = undefined;
        s.gp = undefined;
        s.gw = 0;
        s.tx = undefined;
      }
    }
  }
  return busy;
};
// When the sky is read again the stars are new ones: the gathered keep their places.
const regather = (next) => {
  const was = [...gathering];
  gathering.clear();
  for (const s of was) {
    const n = next.get(s.id);
    if (n) {
      n.gw = s.gw;
      n.go = s.go;
      n.gp = s.gp;
      n.gd = s.gd;
      gathering.add(n);
    }
  }
  if (gather) {
    gather.ids = gather.ids.filter((id) => next.has(id));
    if (!gather.ids.length) gather = null;
  }
};
let seeking;
const seek = () => {
  clearTimeout(seeking);
  seeking = setTimeout(async () => {
    const q = $("find").value.trim();
    if (!q) {
      gatherTo(null);
      found = null;
      $("spacecount").textContent = say("brainSpaceCount", { n: sky().size });
      return kick();
    }
    try {
      const hits = await get("/api/find?q=" + encodeURIComponent(q));
      found = new Set(hits.map((h) => h.id));
      found.first = hits[0]?.id ?? null;
      gatherTo(hits.map((h) => h.id).filter((id) => all.has(id)));
      $("spacecount").textContent = say("brainSpaceFound", { n: hits.length });
      kick();
    } catch (e) {
      problem(e.message);
    }
  }, 220);
};
