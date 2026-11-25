# The score for one film: one piano, one theme, played the way that film's story asks, and written to that film's clock.
# Usage: python3 scripts/film/score.py <en|zh|ja>           writes $FILM_OUT/<lang>/score.wav
#        python3 scripts/film/score.py <en|zh|ja> --notes   prints the score as text, and any note that grates against the chord under it
#
# The theme is Asteme's mark read as music: its five stars, from the lowest line to the highest (re la sol do'), and then the line that runs down
# from the middle star (sol to do). It is heard when the memory comes back and lasts as long as the person looks at it; it begins again when the days
# start to pass and stops before its last note; when Asteme speaks first at the time it promised, the theme goes on from that very note and comes
# home as the new memory falls; the lines found among the stars climb to its tonic; and under the name its first line is heard once more, ending
# on its highest star. Between those moments the music only keeps the room.
import itertools, json, os, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sound import SR, Piano, hall, tilt, Take  # noqa: E402

LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
OUT = os.path.join(os.environ.get("FILM_OUT") or os.path.join(tempfile.gettempdir(), "asteme-film"), LANG)
WORDS = os.environ.get("FILM_WORDS") or os.path.join(HERE, "words.mjs")
T = json.loads(subprocess.run(["node", "-e", f'import({json.dumps(WORDS)}).then(m=>console.log(JSON.stringify(m.direct("{LANG}"))))'], capture_output=True, text=True, check=True).stdout)
POSTER = 1.6  # the still the README shows, and the dip into the night, before the film's own first frame (encode.mjs: 1.0 s and 0.6 s)
END = POSTER + T["stop"]

# --- How each film plays it ----------------------------------------------------------------------------------------------------------------------
# One pianist, three evenings.
#   English: D major. A hymn's plain chords, changing on the half bar over a bass that moves; the line sings in the middle of the keyboard.
#   Japanese: E-flat. The left hand flows in quavers (root, fifth, ninth, tenth), and the theme is played an octave higher, sparingly.
#   Chinese: F. The left hand is open: a fifth rolled upward and left to ring. The line keeps to the five notes; its long notes are leaned into
#   from the note below and carry the note a fourth under them, as a plucked instrument would play them.
STYLE = {
    "en": dict(key=2, hand="hymn", pent=False, high=4),
    "ja": dict(key=3, hand="flow", pent=False, high=5),
    "zh": dict(key=5, hand="open", pent=True, high=4),
}[LANG]
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def deg(d, octave=4):
    """Scale degree (1-based; 8 is the tonic above, 9 the second above...) to MIDI, in the film's key."""
    d0 = d - 1
    return 12 * (octave + 1) + STYLE["key"] + 12 * (d0 // 7) + MAJOR[d0 % 7]


def pc_of(d):
    return (STYLE["key"] + 12 * ((d - 1) // 7) + MAJOR[(d - 1) % 7]) % 12


# Chords: the degree in the bass, and the degrees sounding (the chord's own root first).
CH = {
    "I": (1, [1, 3, 5]), "Iadd9": (1, [1, 3, 5, 9]), "I6/9": (1, [1, 3, 5, 6, 9]),
    "ii7": (2, [2, 4, 6, 8]), "IV": (4, [4, 6, 8]), "IVadd9": (4, [4, 6, 8, 12]), "IVmaj7": (4, [4, 6, 8, 10]), "IV6/9": (4, [4, 6, 8, 9, 12]),
    "IV/vi": (6, [4, 6, 8]), "V": (5, [5, 7, 9]), "Vsus4": (5, [5, 8, 9]), "Vsus2": (5, [5, 6, 9]), "V7no3": (5, [5, 9, 11]),
    "vi": (6, [6, 8, 10]), "vi7": (6, [6, 8, 10, 12]),
}
if STYLE["pent"]:
    # The five notes: no leading tone pulling home and no fourth leaning down, so the dominant is left open.
    CH.update({"V": CH["Vsus2"], "Vsus4": CH["Vsus2"], "V7no3": CH["Vsus2"], "ii7": CH["vi7"]})
SCALE = {pc_of(d) for d in range(1, 8)}
FIVE = {pc_of(d) for d in (1, 2, 3, 5, 6)}


def bass_of(name, octave=2):
    return deg(CH[name][0], octave)


def down_five(m, steps):
    """The note `steps` places below m on the five-note scale."""
    return [k for k in range(m - 16, m) if k % 12 in FIVE][-steps]


# --- The film's clock in beats -----------------------------------------------------------------------------------------------------------------
# The moments the music meets, in seconds of the film, and how many beats each stretch gets at about seventy to the minute. The tempo between two of
# them is whatever makes the beats land: a little slower while the days pass, a little faster into the sky, as a pianist would take it.
A = {
    "start": 0.0, "rise": POSTER + T["rise"], "recall": POSTER + T["recall"], "close": POSTER + T["cap1off"], "promise": POSTER + T["promise"],
    "dim": POSTER + T["dim"], "first": POSTER + T["first1"], "star": POSTER + T["star"], "land": POSTER + T["land"],
    "l0": POSTER + T["lines"][0], "l1": POSTER + T["lines"][1], "l2": POSTER + T["lines"][2], "l3": POSTER + T["lines"][3], "l4": POSTER + T["lines"][4],
    "pull": POSTER + T["pull"], "pulled": POSTER + T["pulled"], "end": END,
}
ORDER = ["start", "rise", "recall", "close", "promise", "dim", "first", "star", "land", "l0", "l1", "l2", "l3", "l4", "pull", "pulled", "end"]
# The theme is twelve beats, and it has the whole time the memory is looked at: from the reply that brings it back to the words over it going away.
# The sky draws back in three, so that the theme's first line, begun as it starts to, reaches its highest note as it comes to rest.
FIXED = {("l0", "l1"): 1, ("l1", "l2"): 1, ("l2", "l3"): 1.5, ("l3", "l4"): 2, ("recall", "close"): 12, ("pull", "pulled"): 3}
B = {"start": 0.0}
for a, b in zip(ORDER, ORDER[1:]):
    B[b] = B[a] + (FIXED.get((a, b)) or max(1, round((A[b] - A[a]) * 70 / 60 * 2) / 2))
TEMPO = [(B[k], A[k]) for k in ORDER]
tb, ts = zip(*TEMPO)
S = B  # the moments, in beats


def secs(beat):
    return float(np.interp(beat, tb, ts, right=ts[-1] + (beat - tb[-1]) * 60 / 70))


# --- Writing it down -----------------------------------------------------------------------------------------------------------------------------
notes = []  # (beat, midi, length in beats, velocity 0..1, role): m the line, d the note carried under it, g a leaning note, b bass, c chord,
pedals = []  # a the flowing hand, s the falling star, t the clock.   Pedals: (down beat, up beat)


def N(beat, midi, length, vel, role="m"):
    if length > 0:
        notes.append((beat, int(midi), length, vel, role))


def sung(beat):
    """The note of the line sounding at this beat, if there is one. The line is written before the hands, so that they can keep out of its way."""
    for b, m, length, _, role in notes:
        if role == "m" and b - 1e-6 <= beat < b + length - 1e-6:
            return m
    return None


top_was_fifth = False


def voicing(name, lo, hi, n=3, prev=None, under=None):
    """The chord's upper notes (the bass is played apart), n of them in [lo, hi], near where the hand was. They stay under the line and never play
    the line's own note (two hammers on one string a moment apart is a stumble), and the bare fifth is not left on top twice running."""
    global top_was_fifth
    root, tones = CH[name]
    pcs = []
    for d in tones[1:] + tones[:1]:
        if pc_of(d) not in pcs:
            pcs.append(pc_of(d))
    if under is not None:
        pcs = [p for p in pcs if p != under % 12] or pcs
        hi = min(hi, under - 2)
        lo = min(lo, hi - 12)
    pcs = pcs[: max(n, 1)]
    fifth = (pc_of(root) + 7) % 12
    best = cost = None
    for combo in itertools.product(*[[k for k in range(lo, hi + 1) if k % 12 == p] for p in pcs]):
        v = sorted(combo)
        if len(set(v)) < len(v) or v[-1] - v[0] > 14:
            continue
        c = abs(np.mean(v) - (lo + hi) / 2) * 0.3 + (sum(min(abs(a - b) for b in prev) for a in v) if prev else 0)
        if v[-1] % 12 == fifth:
            c += 4 if top_was_fifth else 1.5
        if cost is None or c < cost:
            best, cost = v, c
    best = best or sorted(lo + (p - lo) % 12 for p in pcs)
    top_was_fifth = best[-1] % 12 == fifth
    return best


def chord_at(beat, length, name, vel, lo=52, hi=72, n=3, roll=0.0, low=2, prev=None):
    v = voicing(name, lo, hi, n, prev, sung(beat))
    N(beat, bass_of(name, low), length, vel * 0.95, "b")
    for i, m in enumerate(v):
        N(beat + roll * i, m, length - roll * i, vel * 0.82, "c")
    return v


def accompany(start, beats, name, vel, prev=None, until=None):
    """The left hand for one chord over a stretch, in the film's way of playing. `until` is where a flowing hand stops and lets the pedal hold."""
    hand, end = STYLE["hand"], start + beats
    root = bass_of(name, 2)
    if hand == "hymn":
        # The root low, the chord in the middle of the keyboard. A root in the lowest octave is given its octave too (a small speaker plays only
        # that one), and on a whole bar the bass steps up the octave at the half bar.
        v = chord_at(start, beats, name, vel * 0.92, lo=50, hi=67, n=3, roll=0.02, prev=prev)
        if root < 41:
            N(start + 0.01, root + 12, beats, vel * 0.6, "b")
        if beats >= 4:
            N(start + 2, root + 12, min(2, beats - 2), vel * 0.6, "b")
        return v
    held = {pc_of(d) for d in CH[name][1]}
    has = lambda k: (root + k) % 12 in held  # noqa: E731
    if hand == "flow":
        # Root, fifth, ninth, tenth and back, in quavers: the bass note leaned on, the thumb at the top the softest. A chord without a third opens
        # to its own colour instead (the fourth, the second or the seventh), and one turned over keeps to its own notes.
        fifth = root + next((k for k in (7, 8, 9) if has(k)), 7)
        tenth = next((root + 12 + k for k in (4, 3) if has(k)), None)
        whole = CH[name][0] == CH[name][1][0]
        if tenth:
            mid = root + 14 if whole and (root + 14) % 12 in SCALE else root + 12
            figure = [root, fifth, mid, tenth, mid, fifth]
        elif has(10):
            figure = [root, fifth, root + 10, root + 12, root + 10, fifth]
        else:
            figure = [root, fifth, root + 12, root + (17 if has(5) else 14), root + 12, fifth]
        if beats < 2:
            figure = [root, figure[3]]
        stop = end if until is None else min(end, until)
        k, b = 0, start
        while b < stop - 1e-6:
            m = figure[k % len(figure)]
            N(b, m, min(1.5, end - b), vel * (0.8 if m == root else 0.5 if m == max(figure) else 0.6), "a")
            k, b = k + 1, b + 0.5
        return None
    # Open: the root, its fifth and its octave, rolled upward on the beat and left to ring. On a long chord the string is touched again: the octave,
    # then the fifth above it, unless the line is on that note.
    for i, k in enumerate((0, 7, 12)):
        N(start + 0.06 * i, root + k, beats - 0.06 * i, vel * (0.9 - 0.13 * i), "b")
    if beats >= 4:
        N(start + 2, root + 12, min(2, beats - 2), vel * 0.6, "b")
        line = sung(start + 3)
        if line is None or (root + 19) % 12 != line % 12:
            N(start + 3, root + 19, min(1, beats - 3), vel * 0.5, "c")
    return None


def melody(start, line, vel, octave=4, lean=False):
    """line: (degree or None for a rest, beats) pairs from `start`. Returns the beat after the last note. In the five-note film a long note carries
    the note two places under it (a fourth; a third under mi), and with `lean` is leaned into from the note below, never two notes running."""
    b, leaned = start, False
    for d, length in line:
        if d is not None and length > 0:
            m = deg(d, octave)
            if STYLE["pent"] and length >= 1.5:
                if lean and not leaned:
                    N(b - 0.12, down_five(m, 1), 0.14, vel * 0.55, "g")
                leaned = lean and not leaned
                N(b + 0.02, down_five(m, 2), length, vel * 0.5, "d")
            else:
                leaned = False
            N(b, m, length, vel, "m")
        b += length
    return b


def pent(line):
    """For the Chinese film, the theme in its five notes: the seventh becomes the sixth and the fourth the third, and where that would say a note
    twice it is said once, for both lengths."""
    if not STYLE["pent"]:
        return line
    out = []
    for d, n in line:
        d = 6 if d == 7 else 3 if d == 4 else d
        if out and out[-1][0] == d:
            out[-1] = (d, out[-1][1] + n)
        else:
            out.append((d, n))
    return out


def harmony(start, plan, vel, until=None):
    """plan: (chord, beats) pairs. The pedal is changed with each chord, just after it sounds."""
    b, prev = start, None
    for name, beats in plan:
        if beats > 0:
            prev = accompany(b, beats, name, vel, prev, until)
            pedals.append((b + 0.08, b + beats - 0.04))
            b += beats
    return b


# --- The music -------------------------------------------------------------------------------------------------------------------------------------
# re la sol do' (held over the bar) ti la sol | mi re
THEME = [(2, 1), (6, 1.5), (5, 0.5), (8, 2.5), (7, 0.5), (6, 1), (5, 1), (3, 2), (2, 2)]
HIGH = STYLE["high"]
flowing = STYLE["hand"] == "flow"

# The still before the night: one chord, the sound of the room.
harmony(S["start"], [("IV6/9", S["rise"] - S["start"])], 0.28)
# Night: the hand only; it waits with the person. Two chords turn about, counted back from the reply so that the last bar is the darker one, and
# what comes next is heard to arrive. Home is not heard until the promise.
plan, left = [], S["recall"] - S["rise"]
while left > 0:
    plan.insert(0, (("vi7", "IVmaj7")[len(plan) % 2], min(4, left)))
    left -= min(4, left)
harmony(S["rise"], plan, 0.3)
# The memory comes back: the theme, while the person reads it, reaches for its star and sees their own sentence beside tonight's. The chords change
# on the half bar over a bass that walks; where the line hangs on its highest note over the dominant, it alone comes down.
melody(S["recall"], pent(THEME), 0.42, octave=HIGH, lean=True)
harmony(S["recall"], [("IVadd9", 2), ("IV/vi", 2), ("Vsus2", 4), ("IVmaj7", 2), ("Vsus4", 2)], 0.3)
# What the person says to it, and its three words back: a short answer to the theme, left open for the promise.
n = S["promise"] - S["close"]
if n >= 7:
    melody(S["close"], pent([(3, 1), (5, 1), (6, 2), (5, 2), (2, n - 6)]), 0.32, lean=True)
    harmony(S["close"], [("IVmaj7", 4), ("ii7", 2), ("Vsus4", n - 6)], 0.26)
else:
    melody(S["close"], pent([(3, 1), (5, 1), (6, n - 2)]), 0.32, lean=True)
    harmony(S["close"], [("IVmaj7", min(4, n - 1)), ("Vsus4", n - min(4, n - 1))], 0.26)
# The promise: home for the first time, and the theme's first two notes, quietly: what it will come back to.
n = S["dim"] - S["promise"]
melody(S["promise"], [(2, 1), (6, n - 1)], 0.32)
harmony(S["promise"], [("Iadd9", n)], 0.3)
# Days pass: the theme begins again and stops before its highest note. The chord is left to ring, and the note the line stopped on is touched
# once a beat, softer each time: a clock in another room.
n = S["first"] - S["dim"]
melody(S["dim"], pent([(2, 1), (6, 1.5), (5, 0.5)]), 0.3, lean=True)
harmony(S["dim"], [("IVadd9", n)], 0.24, until=S["dim"] + 3)
for k in range(int(n - 3.5)):
    N(S["dim"] + 4 + k, deg(5, 4), 1, max(0.14, 0.24 - 0.035 * k), "t")
# It speaks first: the theme goes on from the very note it stopped before, down to its end, and a low sol turns it toward home.
n = S["star"] - S["first"]
rest = n - 8
line = [(8, 1.5), (7, 0.5), (6, 1), (5, 1), (3, 2), (2, 2 + (rest if rest < 1 else 0))]
melody(S["first"], pent(line), 0.4, octave=HIGH, lean=True)
if rest >= 1:
    melody(S["first"] + 8, [(5, rest)], 0.34, octave=HIGH - 1)
harmony(S["first"], [("Vsus2", 4), ("IVmaj7", 2), ("Vsus4", 2 + (rest if rest < 1 else 0)), ("V", rest if rest >= 1 else 0)], 0.32)
# The new star: the line comes home as it falls (a few high notes), and then the hand runs up into the sky, its last note landing there.
n = S["land"] - S["star"]
melody(S["star"], [(8, 2)], 0.36, octave=HIGH - 1)
harmony(S["star"], [("I", min(3, n)), ("IVadd9", n - min(3, n))], 0.3, until=S["land"] - 2)
for i, d in enumerate([12, 10, 8, 9, 5]):
    N(S["star"] + 0.25 + 0.22 * i, deg(d, 5), 2.0, 0.2 - 0.02 * i, "s")
for i, d in enumerate([4, 6, 8, 9, 11, 12, 13, 15]):
    N(S["land"] - 1.4 + 0.2 * i, deg(d, 3), 2.5, 0.2 + 0.02 * i, "a")
harmony(S["land"], [("IV6/9", S["l0"] - S["land"])], 0.3)
# The lines: each memory found is a note, climbing to the tonic on the last of them, over a cadence that walks home.
LINES = (
    [("Vsus2", 2), ("vi7", 3), ("IVadd9", 5), ("Vsus4", 6), ("I6/9", 8)] if STYLE["pent"] else [("vi", 3), ("IVadd9", 5), ("ii7", 6), ("V7no3", 7), ("I6/9", 8)]
)
for i, (chord, d) in enumerate(LINES):
    at, nxt = S[f"l{i}"], S[f"l{i + 1}"] if i < 4 else S["pull"]
    melody(at, [(d, nxt - at)], 0.46 + 0.04 * i, lean=True)
    harmony(at, [(chord, nxt - at)], 0.34 + 0.04 * i)
# The whole of it. As the sky draws back the theme's first line is played once more, high: re and la over two wide chords, la held into home as the
# name appears, and its highest star reached as the sky comes to rest, with the tonic under it where a small speaker can play it.
u = (S["pulled"] - S["pull"]) / 3
melody(S["pull"], [(2, u), (6, 1.5 * u), (5, 0.5 * u)], 0.38, octave=5)
tail = S["end"] - S["pulled"] + 3
N(S["pulled"], deg(8, 5), tail, 0.46, "m")
N(S["pulled"] + 0.02, deg(8, 4), tail, 0.26, "d")
for i, (chord, room) in enumerate([("IVadd9", (55, 76, 4)), ("Vsus4", (55, 76, 4)), ("Iadd9", (52, 66, 3))]):
    b, length = S["pull"] + i * u, u + (0.2 if i < 2 else tail)
    chord_at(b, length, chord, 0.42 + 0.05 * i, lo=room[0], hi=room[1], n=room[2], roll=0.05, low=2)
    N(b + 0.03, bass_of(chord, 2) + 7, length, 0.36 + 0.04 * i, "b")
    pedals.append((b + 0.08, b + u - 0.04 if i < 2 else S["end"] + 4))


def written():
    """The score as text, with the film's moments beside the beats; and any note of the line that grates: a semitone (or its octaves) from a chord
    note sounding under it, or a minor ninth over the bass. A major seventh over the bass is the chord's own colour and is let be."""
    names = "C C# D D# E F F# G G# A A# B".split()
    nm = lambda m: names[m % 12] + str(m // 12 - 1)  # noqa: E731
    moments = {round(v, 3): k for k, v in B.items()}
    bad = []
    for o in sorted(set(round(n[0], 3) for n in notes)):
        here = [n for n in notes if round(n[0], 3) == o]
        under = [n for n in notes if n[0] <= o + 1e-6 and n[0] + n[2] > o + 0.05 and n[4] in "bc"]
        held = {s[1] % 12 for s in under}
        bad += [(o, nm(m[1]), nm(s[1])) for m in here if m[4] == "m" and m[1] % 12 not in held for s in under if (m[1] - s[1]) % 12 in ((1, 11) if s[4] == "c" else (1,))]
        print(f"{o:6.2f} {secs(o):6.2f}s {moments.get(o, ''):8s} " + " ".join(f"{n[4]}:{nm(n[1])}({n[2]:.1f},{n[3]:.2f})" for n in here))
    print("grating:", bad or "none")


if "--notes" in sys.argv:
    written()
    sys.exit(0)

# --- Playing it ------------------------------------------------------------------------------------------------------------------------------------
# A hand, not a machine: each note a few thousandths early or late and a little louder or softer, the same way every time the film is made.
rng = np.random.default_rng({"en": 3, "ja": 5, "zh": 7}[LANG])
piano = Piano()
take = Take(END + 3)


def pedal_up_after(beat_off):
    for d, u in pedals:
        if d <= beat_off <= u:
            return u
    return beat_off


for beat, midi, length, vel, role in sorted(notes):
    t = secs(beat) + rng.normal(0, 0.008 if role in "cb" else 0.006)
    off = secs(beat + length)
    up = secs(pedal_up_after(beat + length)) if role != "g" else off
    v = float(np.clip(vel + rng.normal(0, 0.025), 0.05, 0.95))
    y = piano.note(midi, v, max(0.05, off - t), off_at=max(0.08, up - t))
    take.add(max(0.0, t), y, pan=0.5 + np.clip((midi - 64) / 60, -0.25, 0.25))

out = take.render(hall(seconds=3.4, rt=(3.0, 2.5, 2.0, 1.4, 0.9)))
# A small speaker or a laptop's cannot play the lowest octave and only rattles on it: it is taken down, and the top is left soft.
out = tilt(out, [(20, -24), (40, -8), (80, -2.5), (160, -2.0), (320, -0.5), (2500, 0.0), (9000, -1.5), (16000, -4)])
n = int(END * SR)
fade = np.ones(n)
r = int(1.7 * SR)
fade[-r:] = np.linspace(1, 0, r) ** 2
out = out[:, :n] * fade
out = out / max(1e-9, np.abs(out).max()) * 0.6
os.makedirs(OUT, exist_ok=True)
with wave.open(os.path.join(OUT, "score.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out.T * 32767).astype("<i2").tobytes())
tempi = [60 * (b2 - b1) / (t2 - t1) for (b1, t1), (b2, t2) in zip(TEMPO, TEMPO[1:]) if t2 > t1]
print(LANG, "notes", len(notes), "seconds", round(END, 2), "beats", B["end"], "tempo", round(min(tempi), 1), "to", round(max(tempi), 1))
