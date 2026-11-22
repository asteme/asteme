# The score, written to the film's clock (one beat a second, four to a bar), for a real piano: the Salamander Grand Piano V3 samples by Alexander Holm
# (CC BY 3.0), played here note by note. Under it, a soft pad made from sine waves, and a room.
# The shape: one note at night that nobody answers; it is answered when the memory comes back; a held breath while days pass; one note for "welcome back";
# and at the end, one note for every thing ever said about the one that matters, coming home on the last of them.
import subprocess, wave, os, tempfile
import numpy as np
SR = 48000; T = 74.3; n = int(SR * T); t = np.arange(n) / SR; rng = np.random.default_rng(11)
OUT = os.environ.get("FILM_OUT") or os.path.join(tempfile.gettempdir(), "asteme-film")
ROOT = os.path.join(os.environ.get("FILM_PIANO") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_modules", "@audio-samples"), "piano-mp3-velocity%d", "audio", "%sv%d.mp3")
NAMES = {0: "C", 3: "D#", 6: "F#", 9: "A"}; cache = {}
def sample(midi, vel):
    near = min((m for m in range(21, 109) if (m % 12) in NAMES), key=lambda m: (abs(m - midi), m))
    key = (near, vel)
    if key not in cache:
        name = NAMES[near % 12] + str(near // 12 - 1); path = ROOT % (vel, name, vel)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        cache[key] = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).T.astype(np.float64)
    s = cache[key]; ratio = 2 ** ((midi - near) / 12)
    if ratio != 1:
        idx = np.arange(0, s.shape[1] - 1, ratio); i0 = idx.astype(int); fr = idx - i0
        s = s[:, i0] * (1 - fr) + s[:, i0 + 1] * fr
    return s
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
dry = np.zeros((2, n))
def N(midi, at, gain=1.0, vel=5, long=7.0, pan=0.5):
    s = sample(midi, vel); L = min(s.shape[1], int(long * SR)); a = int(at * SR)
    if a >= n: return
    L = min(L, n - a); e = np.ones(L); r = min(L, int(1.2 * SR)); e[-r:] = np.linspace(1, 0, r) ** 2
    dry[0, a:a + L] += s[0, :L] * e * gain * np.cos(pan * np.pi / 2) * 1.4; dry[1, a:a + L] += s[1, :L] * e * gain * np.sin(pan * np.pi / 2) * 1.4
def pad(notes, start, length, gain, attack=3.0, release=4.0):
    a = int(start * SR); e = np.zeros(n); A = int(attack * SR); H = int(max(0, length - attack) * SR); R = int(release * SR)
    seg = np.concatenate([np.sin(np.linspace(0, np.pi / 2, A)) ** 2, np.ones(H), np.cos(np.linspace(0, np.pi / 2, R)) ** 2])[: max(0, n - a)]; e[a:a + len(seg)] = seg
    out = np.zeros((2, n))
    for i, m in enumerate(notes):
        for det, pn in ((-0.06, 0.25), (0.05, 0.75)):
            f = hz(m + det); ph = rng.uniform(0, 6.28); w = (np.sin(2 * np.pi * f * t + ph) + 0.2 * np.sin(4 * np.pi * f * t + ph * 1.3)) * (1 + 0.1 * np.sin(2 * np.pi * (0.09 + 0.02 * i) * t + ph))
            out[0] += w * e * gain * (1 - pn); out[1] += w * e * gain * pn
    return out
pads = np.zeros((2, n))
# --- Night (0-16): B minor. One note, waiting. -------------------------------------------------------
pads += pad([47, 54, 59], 1.0, 14.0, 0.016)
N(35, 1.0, .55, 3, 9); N(42, 1.0, .5, 3, 9)
N(66, 2.0, .8, 3); N(69, 6.0, .7, 3); N(66, 10.0, .75, 3)                     # F#  A  F#: asked three times, not answered
N(62, 14.0, .8, 3)                                                             # the first thing it says: D, plain
# --- What was said long ago comes back (16-24): G opens under it, and the note is answered. ------------
pads += pad([43, 50, 55, 59, 62], 15.4, 8.6, 0.020)
N(43, 16.0, .8, 5, 9); N(50, 16.0, .6, 5, 9); N(71, 16.0, .9, 5); N(74, 16.5, .8, 5); N(78, 17.0, .85, 5); N(74, 18.0, .6, 3); N(69, 19.0, .6, 3)
N(38, 22.0, .7, 5, 8); N(45, 22.0, .55, 5, 8); N(69, 22.0, .8, 5); N(78, 22.0, .7, 5); N(74, 23.0, .55, 3)       # "because you told me"
# --- Days pass (24-28): a held breath. ----------------------------------------------------------------------
pads += pad([38, 50], 23.6, 5.0, 0.017, 2.2, 3.0); N(26, 24.0, .5, 3, 8); N(81, 26.0, .4, 3)
# --- It speaks first (28-40): D major, close. -----------------------------------------------------------------
pads += pad([50, 57, 62, 66], 27.6, 10.0, 0.017)
N(74, 29.0, .9, 5)                                                             # "welcome back": one note
N(76, 31.0, .75, 5); N(78, 31.5, .75, 5); N(38, 33.0, .5, 3, 8); N(45, 33.0, .45, 3, 8); N(69, 35.0, .5, 3)
pads += pad([45, 52, 57, 61, 64], 36.6, 3.6, 0.018, 1.6, 2.2)
N(33, 38.0, .65, 5, 7); N(40, 38.0, .5, 5, 7); N(73, 38.0, .8, 5); N(76, 38.5, .7, 5); N(90, 38.8, .45, 3)       # and a star is born
# --- "What else do you remember?" (40-46): G, then leaning forward on A. -----------------------------------------
pads += pad([43, 55, 59, 62], 39.8, 4.0, 0.017, 1.8, 2.4); N(43, 40.0, .55, 3, 7); N(71, 41.0, .55, 3); N(74, 42.0, .55, 3)
pads += pad([45, 52, 57, 64], 43.6, 2.6, 0.019, 1.4, 1.6); N(45, 44.0, .7, 5, 6); N(52, 44.0, .55, 5, 6); N(76, 44.0, .8, 5); N(73, 45.0, .5, 3)
# --- Into the sky (46-52): the same notes, opened out. -----------------------------------------------------------
pads += pad([38, 50, 57, 62, 66, 69], 45.7, 7.0, 0.020, 2.2, 3.5)
N(38, 46.0, .9, 8, 10); N(45, 46.0, .7, 8, 10); N(50, 46.0, .6, 5, 10)
for i, m in enumerate([62, 69, 74, 76, 78, 81, 78, 76]): N(m, 46.0 + i * 0.5, .7 - 0.03 * i, 5, 6, .3 + .4 * ((i * 5) % 7) / 6)
N(78, 50.0, .5, 3); N(74, 51.0, .5, 3)
# --- The one word (52): everything said about it comes. Then a note for each, a beat apart. --------------------------
pads += pad([43, 50, 55, 59, 62, 67], 52.0, 6.2, 0.022, 1.6, 2.6); N(31, 52.3, .7, 5, 9); N(43, 52.3, .55, 5, 9)
line = [71, 74, 76, 78, 81, 78, 76, 74]                                        # B D E F# | A F# E D : out and back, and the ninth is home
for i, m in enumerate(line): N(m, 54.0 + i, .78 + .02 * i, 5, 7, .42 + .16 * (i % 2))
N(43, 54.0, .6, 5, 8); N(40, 56.0, .6, 5, 8); N(52, 56.0, .4, 3, 8); N(45, 58.0, .65, 5, 8); N(52, 58.0, .45, 5, 8); N(45, 60.0, .6, 5, 6); N(61, 60.0, .45, 3, 6)
pads += pad([45, 52, 57, 61, 64], 57.6, 4.6, 0.021, 1.6, 2.0)
# The last of them (62): home.
pads += pad([38, 50, 57, 62, 66, 69, 74], 61.7, 11.0, 0.023, 1.4, 4.0)
N(26, 62.0, .8, 8, 10); N(38, 62.0, .9, 8, 10); N(45, 62.0, .7, 8, 10); N(62, 62.0, .8, 8); N(66, 62.0, .8, 8); N(69, 62.0, .8, 8); N(74, 62.0, .95, 8)
N(81, 63.5, .45, 3); N(78, 64.25, .4, 3)
# Let go (65): they go back to where they stand, all of them.
for i, m in enumerate([50, 57, 62, 66, 69, 74, 78, 81, 86]): N(m, 65.0 + i * 0.11, .5 + .03 * i, 5, 5, .2 + .07 * i)
# Further and further back (66-70): the whole of it.
N(31, 66.0, .85, 8, 9); N(43, 66.0, .7, 8, 9); N(59, 66.0, .6, 5); N(62, 66.0, .6, 5); N(67, 66.0, .7, 5); N(74, 66.0, .6, 5)
N(33, 67.3, .85, 8, 9); N(45, 67.3, .7, 8, 9); N(61, 67.3, .6, 5); N(64, 67.3, .6, 5); N(69, 67.3, .7, 5); N(76, 67.3, .6, 5)
N(26, 68.6, .9, 8, 10); N(38, 68.6, .85, 8, 10); N(57, 68.6, .6, 5); N(62, 68.6, .65, 5); N(66, 68.6, .7, 5); N(78, 68.6, .7, 5)
# The name (70): and the first note of all, once more, answered now.
N(74, 70.0, .7, 5); N(66, 71.5, .7, 3); N(62, 72.25, .5, 3)
# --- The room -------------------------------------------------------------------------------------------------------------
L = int(SR * 3.6); ir = rng.standard_normal((2, L)) * np.exp(-np.arange(L) / (SR * 1.0)); ir[:, : int(SR * 0.02)] = 0
k = np.exp(-np.arange(500) / 80.0); k /= k.sum(); ir = np.stack([np.convolve(ir[c], k, mode="same") for c in range(2)]); ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
M = 1 << int(np.ceil(np.log2(n + L)))
both = dry + pads * 1.3
wet = np.stack([np.fft.irfft(np.fft.rfft(both[c], M) * np.fft.rfft(ir[c], M), M)[:n] for c in range(2)])
out = dry * 1.0 + pads * 1.3 + wet * 0.34
fade = np.ones(n); a = int(1.0 * SR); r = int(2.4 * SR); fade[:a] = np.linspace(0, 1, a) ** 2; fade[-r:] = np.linspace(1, 0, r) ** 2; out *= fade
peak = np.abs(out).max(); out = out / peak * 0.72; out = np.tanh(out * 1.05) / np.tanh(1.05) * 0.72
os.makedirs(OUT, exist_ok=True)
with wave.open(os.path.join(OUT, "score.wav"), "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out.T * 32767).astype("<i2").tobytes())
rms = lambda a, b: round(20 * np.log10(np.sqrt((out[:, int(a * SR): int(b * SR)] ** 2).mean()) + 1e-9), 1)
print("samples loaded", len(cache), "| loudness dB: night", rms(0, 16), "memory", rms(16, 24), "days", rms(24, 28), "return", rms(28, 40), "asking", rms(40, 46), "sky", rms(46, 52), "lines", rms(54, 62), "home", rms(62, 66), "back", rms(66, 70), "name", rms(70, 74), "| peak", round(20 * np.log10(np.abs(out).max()), 1))
piano = np.sqrt((dry ** 2).mean()); padl = np.sqrt(((pads * 1.3) ** 2).mean()); print("piano to pad, dB:", round(20 * np.log10(piano / padl), 1))
