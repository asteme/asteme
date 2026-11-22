import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../site/content.mjs";
import { buildPage, SITE_LANGUAGES } from "../scripts/make-site.mjs";

test("the site says the same things in each language it is written in: the same families, the same number of lines, the same words for its own controls", () => {
  const shape = (c) => [c.families.map((f) => f.length), Object.keys(c.ui).sort(), c.ui.seek.length];
  for (const lang of SITE_LANGUAGES) {
    assert.deepEqual(shape(CONTENT[lang]), shape(CONTENT.en), lang);
    for (const line of [CONTENT[lang].first, ...CONTENT[lang].families.flat()]) assert.ok(typeof line === "string" && line.trim().length >= 2, `${lang}: an empty line`);
    // A word offered to try must find something, or the first thing a visitor does finds nothing.
    for (const word of CONTENT[lang].ui.seek) assert.ok([CONTENT[lang].first, ...CONTENT[lang].families.flat()].some((t) => t.toLowerCase().includes(word.toLowerCase())), `${lang}: nothing is said about "${word}"`);
  }
});

test("the site is the conversation page itself, with its places filled and nothing left to ask a server for", () => {
  for (const lang of SITE_LANGUAGES) {
    const page = buildPage(lang);
    assert.equal(/__[A-Z]+__/.test(page.replace(/__proto__/g, "")), false, `${lang}: a place in the page was left unfilled`);
    assert.ok(page.includes("window.SITE=") && page.includes('id="plain"') && page.includes(`<html lang="${lang}"`), lang);
    // Every sentence is also there as plain text, for a reader without scripts.
    assert.ok(page.includes(CONTENT[lang].families[0][0].replace(/&/g, "&amp;")), `${lang}: the plain page is missing its first line`);
    assert.equal(/https?:\/\/(?!github\.com\/asteme\/asteme)[^"'\s)]*\.(js|css|woff2?)\b/.test(page), false, `${lang}: the page loads something from elsewhere`);
  }
});
