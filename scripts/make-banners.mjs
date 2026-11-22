// Makes the banner at the top of each README (docs/banner*.jpg): the name and what Asteme is in that language, laid on one picture. The words are here and
// nowhere else; they say what the README's first sentence says, so when that sentence changes, change them here and run this again.
// Usage: node scripts/make-banners.mjs   (needs a browser, found the way the films find theirs: FILM_MODULES for playwright, FILM_CHROME for Chrome)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(process.env.FILM_MODULES ? join(process.env.FILM_MODULES, "/") : import.meta.url);
const { chromium } = require("playwright");
const docs = fileURLToPath(new URL("../docs/", import.meta.url));
export const BANNERS = {
  en: ["Someone you talk to, and the same one each time.", "It remembers by situation, and learns from how each use turned out."],
  ja: ["話しかける相手。いつも同じ一人。", "場面で思い出し、使った結果から学びます。"],
  zh: ["一个你与之交谈的“谁”，每次都是同一个。", "按情形回想，从每次使用的结果中学习。"],
  de: ["Jemand, mit dem du sprichst, und jedes Mal derselbe.", "Erinnert sich nach Situation und lernt daraus, wie jede Nutzung ausging."],
  es: ["Alguien con quien hablas, y el mismo cada vez.", "Recuerda por la situación y aprende de cómo salió cada uso."],
  fr: ["Quelqu'un à qui vous parlez, et le même à chaque fois.", "Se souvient par la situation et apprend de ce que chaque usage a donné."],
  pt: ["Alguém com quem você conversa, e sempre a mesma pessoa.", "Lembra pela situação e aprende com o resultado de cada uso."],
  ru: ["Собеседник, и всегда один и тот же.", "Вспоминает по ситуации и учится на том, чем кончилось каждое применение."],
};
// The picture is docs/banner-base.jpg (the chart, the mark and the paper, with nothing written on it) and is not drawn here: only the words are laid on it.
const base = `data:image/jpeg;base64,${readFileSync(join(docs, "banner-base.jpg")).toString("base64")}`;
const page = (lang, [first, second]) => `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
  html, body { margin: 0; } body { width: 1280px; height: 640px; position: relative; overflow: hidden; background: #111c33 url(${base}) center / cover; color: #ece6d8;
    font-family: Inter, "Noto Sans CJK ${lang === "zh" ? "SC" : "JP"}", "Noto Sans", system-ui, sans-serif; }
  .words { position: absolute; left: 640px; top: 0; width: 540px; height: 640px; display: flex; flex-direction: column; justify-content: center; }
  h1 { margin: 0 0 24px; font: 700 68px/1 Inter, sans-serif; letter-spacing: 0.1em; } p { margin: 0; font-size: ${lang === "ja" || lang === "zh" ? 24 : 25}px; line-height: 1.55; font-weight: 400; color: #ddd6c6; text-wrap: balance; }
  p + p { margin-top: 6px; color: #b3ad9f; }
</style>
<div class="words"><h1>ASTEME</h1><p>${first}</p><p>${second}</p></div></html>`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ ...(process.env.FILM_CHROME ? { executablePath: process.env.FILM_CHROME } : {}), args: ["--force-color-profile=srgb"] });
  const tab = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  for (const [lang, words] of Object.entries(BANNERS)) {
    await tab.setContent(page(lang, words));
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: join(docs, lang === "en" ? "banner.jpg" : `banner.${lang}.jpg`), type: "jpeg", quality: 90 });
  }
  await browser.close();
  console.log(`Drew ${Object.keys(BANNERS).length} banners into docs/`);
}
