// Turns the frames film.mjs kept into one silent film, in the order of their own times. Usage: node scripts/film/encode.mjs <ja|en|zh>
import { readFileSync, writeFileSync } from "node:fs"; import { execFileSync } from "node:child_process"; import { tmpdir } from "node:os"; import { join } from "node:path";
const lang = process.argv[2], dir = join(process.env.FILM_OUT ?? join(tmpdir(), "asteme-film"), lang), { frames, t0, seconds } = JSON.parse(readFileSync(dir + "/frames.json", "utf8"));
// In the order of their own times, from the first moment of the film to its last.
const fs = frames.filter((f) => f.t >= t0 - 0.05 && f.t <= t0 + seconds).sort((a, b) => a.t - b.t), lines = [];
fs.forEach((f, i) => { const until = i + 1 < fs.length ? fs[i + 1].t : t0 + seconds; lines.push(`file '${f.name}'`, `duration ${Math.max(0.001, until - f.t).toFixed(4)}`); }); lines.push(`file '${fs.at(-1).name}'`);
writeFileSync(dir + "/list.txt", lines.join("\n"));
const tmp = `${dir}/silent.tmp.mp4`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", dir + "/list.txt", "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-t", String(seconds), "-c:v", "libx264", "-crf", "22", "-preset", "slow", "-movflags", "+faststart", tmp]);
execFileSync("mv", [tmp, `${dir}/silent.mp4`]); console.log(lang, "frames used", fs.length);
