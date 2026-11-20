#!/usr/bin/env node
// On the day the page goes public: put each film where its still is.
//
// A README on GitHub plays a film in the page only when the film was uploaded
// through GitHub's own editor, which gives it an address under
// https://github.com/user-attachments/assets/. Upload the three films that
// way (drag each .mp4 into any comment box or README editor and copy the
// address it becomes), then:
//
//   node scripts/public-films.mjs --en <address> --ja <address> --zh <address> [--dir public]
//
// Each README's still at the top is replaced by its film's address on a line
// of its own, which is how GitHub shows a player. Nothing else is changed, and
// a README whose address was not given is left as it is.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2), given = (name) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
const dir = resolve(given("dir") ?? "public"), FILES = { en: "README.md", ja: "README.ja.md", zh: "README.zh.md" };
const STILL = (lang) => new RegExp(`<p align="center"><a href="media/asteme-${lang}\\.mp4"><img [^\\n]*</a></p>`);
// Every address is looked at before any file is touched: one wrong address changes nothing.
for (const lang of Object.keys(FILES)) { const address = given(lang); if (address && !/^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/.test(address)) { console.error(`--${lang}: that is not an address GitHub gives an uploaded film (https://github.com/user-attachments/assets/...)`); process.exit(2); } }
let done = 0;
for (const [lang, file] of Object.entries(FILES)) {
  const address = given(lang); if (!address) continue;
  const path = join(dir, file), text = await readFile(path, "utf8");
  if (text.includes(address)) { console.log(`${file}: already has it`); continue; }
  if (!STILL(lang).test(text)) { console.error(`${file}: the still at the top was not found; nothing was changed in it`); process.exit(1); }
  await writeFile(path, text.replace(STILL(lang), address)); console.log(`${file}: the film is in place`); done++;
}
if (!done) console.log("Nothing to do. Give --en, --ja and --zh with the addresses of the uploaded films.");
