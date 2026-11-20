import test from "node:test";
import assert from "node:assert/strict";
import { readModelJson } from "../../src/model-json.mjs";

// The reflection call is the one that keeps dying on formatting, so these cases
// mirror what the log actually recorded: a closing remark after the object, a
// fence, and an inner quote left unescaped inside a Japanese/Chinese string.
test("an object followed by a closing remark is still read", () => {
  const text = '{"changes":[],"feedback":[]}\n\nThis reflection found nothing worth keeping.';
  assert.deepEqual(readModelJson(text), { changes: [], feedback: [] });
});

test("fenced answers are read whether or not prose surrounds them", () => {
  assert.deepEqual(readModelJson('Here you go:\n```json\n{"changes":[{"op":"put"}]}\n```\nDone.'), { changes: [{ op: "put" }] });
  assert.deepEqual(readModelJson("```\n{\"a\":[1,2]}\n```"), { a: [1, 2] });
});

test("an inner quote left unescaped inside a string is read as content", () => {
  const text = '{"changes":[{"op":"put","text":"the user prefers "shared tasks" for the team"}]}';
  assert.deepEqual(readModelJson(text), { changes: [{ op: "put", text: 'the user prefers "shared tasks" for the team' }] });
});

test("braces and brackets inside strings do not end the answer early", () => {
  assert.deepEqual(readModelJson('{"text":"use {x} and [y] here"}'), { text: "use {x} and [y] here" });
});

test("only the first answer is taken when two objects follow each other", () => {
  assert.deepEqual(readModelJson('{"changes":[]}{"changes":[{"op":"put"}]}'), { changes: [] });
});

test("an answer that is not JSON keeps its own text for evidence", () => {
  assert.throws(() => readModelJson("I could not decide."), e => e.message.startsWith("Unreadable memory JSON") && e.raw === "I could not decide.");
  assert.throws(() => readModelJson(""), /Empty memory response/);
});

