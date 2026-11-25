// Turns the frames film.mjs kept into the film: the still the README shows before anyone presses play, a dip into the page's own dark, then the frames,
// one for every thirtieth of a second of the film's clock; and, when the score has been written (score.py), the sound under it.
// Usage: node scripts/film/encode.mjs <lang>  ->  $FILM_OUT/<lang>/asteme-<lang>.mp4
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const lang = process.argv[2],
  dir = join(process.env.FILM_OUT ?? join(tmpdir(), "asteme-film"), lang),
  { fps, seconds, bg } = JSON.parse(readFileSync(dir + "/frames.json", "utf8"));
const POSTER = 1.0,
  DIP = 0.6,
  ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const colour = "0x" + bg.replace("#", "");
// Dark, quiet pictures with fine text: a low CRF and adaptive quantisation keep the letters and the faint stars clean, and the whole film stays well
// under the 10 MB GitHub accepts for a video.
ff(
  "-loop", "1", "-framerate", String(fps), "-t", String(POSTER + DIP), "-i", `${dir}/poster.jpg`,
  "-framerate", String(fps), "-i", `${dir}/f/%05d.jpg`,
  "-filter_complex",
  `[0:v]fade=t=out:st=${POSTER}:d=${DIP}:color=${colour},format=yuv420p,setsar=1[a];[1:v]trim=duration=${seconds},format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]`,
  "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-x264-params", "aq-mode=3", "-movflags", "+faststart", `${dir}/silent.mp4`,
);
const film = `${dir}/asteme-${lang}.mp4`;
if (existsSync(`${dir}/score.wav`)) {
  // Loudness measured first, then set in one linear step (no pumping): about -16 LUFS, peaks under -1.5 dB true peak.
  const target = "I=-16:TP=-1.5:LRA=11";
  const said = spawnSync("ffmpeg", ["-hide_banner", "-i", `${dir}/score.wav`, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr,
    measured = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(said)?.[0] ?? "{}");
  const m = measured.input_i
    ? `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : "";
  ff("-i", `${dir}/silent.mp4`, "-i", `${dir}/score.wav`, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", `loudnorm=${target}${m},aresample=48000`, "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", film);
  console.log(lang, "film", film, (statSync(film).size / 1e6).toFixed(2), "MB");
} else console.log(lang, "silent film only (no score.wav yet)", `${dir}/silent.mp4`);
