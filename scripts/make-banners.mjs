// Draws the banner at the top of each README (docs/banner*.jpg): the mark, the name, and what Asteme is in that language. The words are here and nowhere
// else; they say what the README's first sentence says, so when that sentence changes, change them here and run this again.
// Usage: node scripts/make-banners.mjs   (needs a browser, found the way the films find theirs: FILM_MODULES for playwright, FILM_CHROME for Chrome)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ICON_CIRCLES } from "../client/icon.mjs";

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
// The mark's five stars where the icon has them, joined as the icon joins them; the middle one is the warm one.
const at = ([x, y]) => [150 + (x - 3) * 15.6 + 6, 190 + (y - 4) * 16.6 + 4];
const [a, mid, b, c, d] = ICON_CIRCLES.map(at);
const star = ([x, y], r, fill) => {
  const pts = Array.from({ length: 16 }, (_, i) => { const t = (i * Math.PI) / 8, len = i % 2 ? r * 0.32 : i % 4 ? r * 0.62 : r; return `${(x + Math.sin(t) * len).toFixed(1)},${(y - Math.cos(t) * len).toFixed(1)}`; });
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};
// A few faint points around, none of them under the words or the mark.
const dots = Array.from({ length: 40 }, (_, i) => { const h = (n) => { const v = Math.sin((i + 1) * n) * 43758.5453; return v - Math.floor(v); }; const x = 30 + h(12.9898) * 1220, y = 30 + h(78.233) * 580; if ((x > 610 && x < 1200 && y > 170 && y < 470) || (x > 110 && x < 440 && y > 150 && y < 480)) return ""; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + h(3.7) * 1.2).toFixed(1)}" fill="#e9e2d2" opacity="${(0.35 + h(9.1) * 0.5).toFixed(2)}"/>`; }).join("");
const page = (lang, [first, second]) => `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
  html, body { margin: 0; } body { width: 1280px; height: 640px; position: relative; overflow: hidden; background: #131c33; color: #ece6d8;
    font-family: Inter, "Noto Sans CJK ${lang === "zh" ? "SC" : "JP"}", "Noto Sans", system-ui, sans-serif; }
  svg { position: absolute; inset: 0; } .words { position: absolute; left: 640px; top: 0; width: 560px; height: 640px; display: flex; flex-direction: column; justify-content: center; }
  h1 { margin: 0 0 22px; font: 700 68px/1 Inter, sans-serif; letter-spacing: 0.1em; } p { margin: 0; font-size: ${lang === "ja" || lang === "zh" ? 24 : 25}px; line-height: 1.55; font-weight: 400; color: #ddd6c6; text-wrap: balance; }
  p + p { margin-top: 6px; color: #b9b3a4; }
</style>
<svg viewBox="0 0 1280 640" xmlns="http://www.w3.org/2000/svg">
  <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.055 0"/></filter>
  <rect width="1280" height="640" filter="url(#paper)"/>
  <g stroke="#e9e2d2" stroke-opacity="0.07">${[168, 356, 545, 733, 921, 1110].map((x) => `<line x1="${x}" y1="14" x2="${x}" y2="626"/>`).join("")}${[122, 308, 494].map((y) => `<line x1="14" y1="${y}" x2="1266" y2="${y}"/>`).join("")}</g>
  <rect x="14" y="14" width="1252" height="612" fill="none" stroke="#e9e2d2" stroke-opacity="0.3" stroke-dasharray="1 3"/>
  ${dots}
  <g stroke="#e9e2d2" stroke-opacity="0.75" stroke-width="1.3">${[[a, mid], [mid, b], [mid, c], [a, d]].map(([p, q]) => `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`).join("")}</g>
  ${star(a, 19, "#ece6d8")}${star(b, 16, "#ece6d8")}${star(c, 19, "#ece6d8")}${star(d, 15, "#ece6d8")}${star(mid, 14, "#c9974f")}
</svg>
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
