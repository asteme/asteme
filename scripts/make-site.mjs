// Builds the site into site/dist: the conversation page itself, in each language the site is written in, over a stand-in for the mind that knows only what
// the site says (site/content.mjs). One page per language, the films, and nothing else. Usage: node scripts/make-site.mjs
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { composePageSync } from "../brain/page.mjs";
import { fillPage } from "../brain/server.mjs";
import { CONTENT } from "../site/content.mjs";
import { SHARE_URL } from "../site/config.mjs";
import { ICON_PATH, ICON_CIRCLES, ICON_STROKE } from "../client/icon.mjs";

const root = fileURLToPath(new URL("..", import.meta.url)), out = join(root, "site", "dist");
const read = (name) => readFileSync(join(root, "site", name), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mark = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATH}"/>${ICON_CIRCLES.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`).join("")}</svg>`;
export const SITE_LANGUAGES = Object.keys(CONTENT);
// A language's own name, for the links between them, and the languages a film was made in: one that has none is shown the English film.
const NAMES = { en: "English", ja: "日本語", zh: "中文", de: "Deutsch", es: "Español", fr: "Français", pt: "Português", ru: "Русский" };
const filmed = (lang) => existsSync(join(root, "public", "media", `asteme-${lang}.mp4`));
// Where the site is read, and the picture shown where a link to it is pasted: the README's banner in that language.
const SITE_URL = "https://asteme.github.io/asteme/";
const banner = (lang) => `banner${lang === "en" ? "" : "." + lang}.jpg`;
export const buildPage = (lang) => {
  const c = CONTENT[lang], up = lang === "en" ? "" : "../";
  const site = { lang, root: up, film: filmed(lang) ? lang : "en", mark, first: c.first, families: c.families, ui: c.ui, share: SHARE_URL.replace(/\/+$/, ""), languages: SITE_LANGUAGES.map((code) => [code, NAMES[code] ?? code, code === "en" ? "" : `${code}/`]) };
  // The same sentences as a plain page: for a reader without scripts, for one who would rather read, and for whatever reads pages that is not a person.
  const plain = `<section id="plain" lang="${lang}"><a class="shut" href="#">${esc(c.ui.close)}</a><article><h1>${esc(c.first)}</h1>${c.families.map(([head, ...rest]) => `<h2>${esc(head)}</h2>${rest.map((t) => `<p>${esc(t)}</p>`).join("")}`).join("")}<p><a href="https://github.com/asteme/asteme">github.com/asteme/asteme</a></p></article></section>`;
  const json = JSON.stringify(site).replace(/</g, "\\u003c");
  let page = fillPage(composePageSync(), { lang, theme: "dark" });
  const put = (where, what) => { if (!page.includes(where)) throw new Error(`The page has no ${where} to build the site on`); page = page.replace(where, () => what); };
  const here = SITE_URL + (lang === "en" ? "" : `${lang}/`);
  // A link to the site pasted into a chat or a post shows what the page is: its title, its first sentence and the banner.
  const card = [["og:type", "website"], ["og:site_name", "Asteme"], ["og:title", c.title], ["og:description", c.first], ["og:url", here], ["og:image", `${SITE_URL}media/${banner(lang)}`], ["og:image:width", "1280"], ["og:image:height", "640"]]
    .map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`)
    .join("");
  put("<title>", `<meta name="description" content="${esc(c.first)}">${card}<meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${here}"><link rel="icon" href="${up}icon.svg"><title>`);
  page = page.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(c.title)}</title>`);
  put("</head>", `<style>${read("site.css")}</style><script>window.SITE=${json};</script><script>${read("shim.js")}</script></head>`);
  put("</body>", `${plain}<noscript><style>#plain{display:block!important}</style></noscript><script>${read("over.js")}</script></body>`);
  return page;
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, "media"), { recursive: true });
  for (const lang of SITE_LANGUAGES) { const dir = lang === "en" ? out : join(out, lang); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "index.html"), buildPage(lang)); }
  for (const lang of SITE_LANGUAGES.filter(filmed)) for (const name of [`asteme-${lang}.mp4`, `film-${lang}.jpg`]) copyFileSync(join(root, "public", "media", name), join(out, "media", name));
  for (const lang of SITE_LANGUAGES) copyFileSync(join(root, "docs", banner(lang)), join(out, "media", banner(lang)));
  copyFileSync(join(root, "icon.svg"), join(out, "icon.svg")); writeFileSync(join(out, ".nojekyll"), "");
  console.log(`Built ${out}: ${SITE_LANGUAGES.join(", ")}`);
}
