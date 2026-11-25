// The three languages stay in step: every English entry has a Japanese and a
// Chinese one, with the same placeholders, and nothing extra.
import test from "node:test";
import assert from "node:assert/strict";
import { en, ja, zh, de, es, fr, pt, ru } from "./copy.mjs";

const holes = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
for (const [name, locale] of Object.entries({ ja, zh, de, es, fr, pt, ru }))
  test(`${name} has every entry English has, with the same placeholders`, () => {
    assert.deepEqual(Object.keys(en).filter(k => !(k in locale)), [], "missing entries");
    assert.deepEqual(Object.keys(locale).filter(k => !(k in en)), [], "entries English does not have");
    assert.deepEqual(Object.keys(en).filter(k => holes(en[k]) !== holes(locale[k])), [], "placeholders differ");
    assert.deepEqual(Object.keys(en).filter(k => String(en[k]).trim() && !String(locale[k]).trim()), [], "empty entries");
  });

test("choosing a language in Settings shows that language, for every language offered", async () => {
  const { translate, en } = await import("./copy.mjs");
  for (const code of ["ja", "zh", "de", "es", "fr", "pt", "ru"]) {
    const t = translate(code);
    assert.notEqual(t("settings"), en.settings, `${code} is shown in its own words`);
    assert.equal(translate(`${code}-XX`)("settings"), t("settings"), "a regional form uses the same words");
  }
  assert.equal(translate("xx")("settings"), en.settings);
});

test("a conversation already open inside DSH is opened again in the language chosen, and a change of theme does not open it again", async () => {
  // The conversation is a page of its own in a frame, given its words when it is made: a language chosen afterwards reaches it only by making it
  // again. Its address is made from the panel's language and made anew when that changes; the mark stays over it while it loads.
  const { readFile } = await import("node:fs/promises");
  const talk = await readFile(new URL("./talk.jsx", import.meta.url), "utf8");
  assert.match(talk, /const lang = t\("_lang"\) \|\| "";/);
  const address = /const src = React\.useMemo\(\(\) => door \? `([^`]+)` : "", \[([^\]]+)\]\);/.exec(talk);
  assert.ok(address, "the frame's address is made in one place");
  assert.match(address[1], /&lang=\$\{encodeURIComponent\(lang\)\}/);
  assert.deepEqual(address[2].split(",").map(d => d.trim()), ["door", "lang"], "made again for a new door or a new language, and for nothing else");
  assert.match(talk, /setLoaded\(false\); \}, \[door, lang\]\);/);
});
