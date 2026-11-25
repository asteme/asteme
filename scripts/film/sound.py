# The piano the films' music is played on, and the room it is played in. Real recordings, played note by note: the Salamander Grand Piano V3
# (Alexander Holm, CC BY 3.0), all sixteen loudnesses of every recorded key, and the sound of each key being let go.
# Nothing here is a dependency of Asteme. Where the recordings are is said by FILM_SAMPLES (see README.md beside this file).
import os, re, subprocess, functools
import numpy as np

SR = 48000
HOME = os.environ.get("FILM_SAMPLES") or os.path.dirname(os.path.abspath(__file__))
PIANO = os.path.join(HOME, "node_modules", "@audio-samples")
NAMES = "C C# D D# E F F# G G# A A# B".split()


@functools.lru_cache(maxsize=None)
def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).T.astype(np.float64)


def midi_of(name):
    m = re.match(r"([A-G]#?)(-?\d)", name)
    return NAMES.index(m.group(1)) + 12 * (int(m.group(2)) + 1)


def shift(x, ratio, taps=8):
    """Plays a recording faster or slower (higher or lower): band-limited interpolation (a Lanczos kernel), so a note moved a semitone
    keeps its brightness and gains no grit. Above the recording's own pitch the kernel is widened, which filters what would fold back."""
    if abs(ratio - 1) < 1e-6:
        return x
    n = x.shape[1]
    pos = np.arange(0, n - taps - 1, ratio)
    scale = max(1.0, ratio)
    out = np.empty((x.shape[0], len(pos)))
    k = np.arange(-taps + 1, taps + 1)
    for a in range(0, len(pos), 65536):
        p = pos[a : a + 65536]
        i = np.floor(p).astype(int)
        f = p - i
        d = (f[:, None] - k[None, :]) / scale
        w = np.sinc(d) * np.sinc(d / taps) / scale
        w[np.abs(d) >= taps] = 0
        idx = np.clip(i[:, None] + k[None, :], 0, n - 1)
        for c in range(x.shape[0]):
            out[c, a : a + 65536] = (x[c, idx] * w).sum(axis=1)
    return out


class Piano:
    """Every third key was recorded, at sixteen loudnesses. A note is played from the nearest recorded key at the loudness asked for, moved to
    its pitch; how loud it is and how it sounds (a soft hammer or a hard one) both come from the velocity."""

    def __init__(self):
        self.keys = {}  # loudness layer -> [(midi, path)]
        for v in range(1, 17):
            d = os.path.join(PIANO, f"piano-velocity{v}", "audio")
            if not os.path.isdir(d):
                raise SystemExit(f"The piano's recordings are not at {d}. See scripts/film/README.md for how to fetch them.")
            for f in os.listdir(d):
                m = re.match(r"([A-G]#?)(\d)v\d+\.ogg", f)
                if m:
                    self.keys.setdefault(v, []).append((midi_of(m.group(1) + m.group(2)), os.path.join(d, f)))

    def note(self, midi, vel, dur, off_at=None):
        """One note, as a stereo array. vel is 0..1; dur is how long the key is held (s); off_at is when the sound is let go (the pedal), dur if
        it is not given."""
        layer = self.keys[min(16, 1 + int(vel * 16))]
        key, path = min(layer, key=lambda k: abs(k[0] - midi))
        x = shift(decode(path), 2 ** ((midi - key) / 12))
        # The softer layers are quieter recordings already; a little more shaping keeps the loudest from jumping out.
        gain = 0.55 + 0.45 * vel
        end = off_at if off_at is not None else dur
        L = min(x.shape[1], int((end + 0.6) * SR))
        y = x[:, :L].copy()
        a = int(end * SR)
        if a < L:
            d = int(0.22 * SR) if midi < 89 else int(0.9 * SR)  # the highest keys have no damper
            env = np.ones(L)
            k = min(L - a, d)
            env[a : a + k] = np.cos(np.linspace(0, np.pi / 2, k)) ** 2
            env[a + k :] = 0
            y *= env
            rel = os.path.join(PIANO, "piano-release", "audio", f"rel{max(1, min(88, midi - 20))}.ogg")
            if os.path.exists(rel):
                r = decode(rel)[:, : L - a] * (0.05 + 0.08 * vel)
                y[:, a : a + r.shape[1]] += r
        return y * gain


def hall(seconds=3.2, rt=(2.9, 2.4, 1.9, 1.3, 0.8), seed=7):
    """A room: a stereo impulse whose low sounds die away more slowly than the high ones, with a few early reflections."""
    rng = np.random.default_rng(seed)
    L = int(seconds * SR)
    t = np.arange(L) / SR
    noise = rng.standard_normal((2, L))
    spec = np.fft.rfft(noise, axis=1)
    fr = np.fft.rfftfreq(L, 1 / SR)
    edges = [0, 250, 800, 2500, 6000, SR / 2]
    out = np.zeros((2, L))
    for k in range(5):
        band = np.where((fr >= edges[k]) & (fr < edges[k + 1]), 1.0, 0.0)
        part = np.fft.irfft(spec * band, L, axis=1)
        out += part * np.exp(-6.91 * t / rt[k])
    pre = int(0.018 * SR)
    out = np.concatenate([np.zeros((2, pre)), out[:, : L - pre]], axis=1)
    for d, g, side in ((0.011, 0.5, 0), (0.017, 0.45, 1), (0.023, 0.35, 0), (0.031, 0.3, 1), (0.041, 0.22, 0), (0.047, 0.2, 1)):
        out[side, int(d * SR)] += g * np.sqrt((out**2).sum() / L) * 40
    out *= np.minimum(1, t / 0.012)
    return out / np.sqrt((out**2).sum(axis=1, keepdims=True))


def convolve(x, ir):
    n = x.shape[1] + ir.shape[1]
    M = 1 << int(np.ceil(np.log2(n)))
    return np.stack([np.fft.irfft(np.fft.rfft(x[c], M) * np.fft.rfft(ir[c], M), M)[: x.shape[1]] for c in range(2)])


def tilt(x, points):
    """Shapes the whole sound by frequency: points are (Hz, dB), joined on a log scale. Zero phase."""
    n = x.shape[1]
    M = 1 << int(np.ceil(np.log2(n)))
    fr = np.fft.rfftfreq(M, 1 / SR)
    hz, db = zip(*points)
    g = 10 ** (np.interp(np.log10(np.maximum(fr, 1)), np.log10(hz), db) / 20)
    return np.stack([np.fft.irfft(np.fft.rfft(x[c], M) * g, M)[:n] for c in range(2)])


class Take:
    """The recording being made: notes are laid into it where they fall, and the room is added at the end."""

    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.dry = np.zeros((2, self.n))

    def add(self, at, y, pan=0.5):
        a = int(round(at * SR))
        if a >= self.n or y.shape[1] == 0:
            return
        L = min(y.shape[1], self.n - a)
        # A stereo recording leaned to one side, at the same power: low notes a little to the left, high ones to the right, as the player hears them.
        lg, rg = np.cos(pan * np.pi / 2) * 1.4142, np.sin(pan * np.pi / 2) * 1.4142
        self.dry[0, a : a + L] += y[0, :L] * lg
        self.dry[1, a : a + L] += y[1, :L] * rg

    def render(self, room, send=0.3, wet=0.36):
        return self.dry + convolve(self.dry * send, room) * wet
