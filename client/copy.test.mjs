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
