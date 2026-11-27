# Contributing

Read `README.md` for what the system does and `docs/BRAIN.md` for how the brain is put together. What a behavior is, is settled by its test: a claim with no test is not yet a claim.

## Run it

```
node --version     # 22.13 or newer (node:sqlite without a flag)
npm test           # the whole suite; no API key, no dependencies, no host
npm run demo       # two weeks with one user, narrated, then why() and explain()
npm run eval -- --selftest    # the eval harness with canned replies (wiring only)
node eval/soak.mjs            # a simulated month: when background work runs and how many model calls it makes
ASTEME_JUDGE_KEY=... node eval/judge.mjs   # the two closed questions against a real decision model
```

Tests, demo and self-test script the model calls. To measure the prompts against a real model:

```
ASTEME_EVAL_KEY=... npm run eval -- --base-url <OpenAI-compatible endpoint> --model <name> \
    --embed-url <OpenAI-compatible embeddings endpoint> --embed-model <name>
```

Without `--embed-url` the local model in `src/embedding.mjs` is used, which needs `@huggingface/transformers` installed.

The panel is previewed without a host: `client/preview/preview.html` (see `client/FOUNDATION.md`).

## Layout

```
src/core.mjs        the Asteme class; each module below adds its methods to it
src/memory.mjs      write path: validation, exact evidence, revisions, links, sleep queue
src/recall.mjs      activation: what a memory answers to, the nearest few, the scenes it stays out of; TUNING
src/record.mjs      the record itself, searchable: the rounds of earlier conversations nearest to the present
src/attend.mjs      one turn: read the scene, recall, admit, record the trace
src/reflect.mjs     after the turn: what the records support; episodes and salience
src/outcome.mjs     what happened next, and the little it may change; what the sky shows as brightness
src/sleep.mjs       replay, reconcile, revise, integrate, imagine; planning and budget
src/habits.mjs      always-present rules and their gates (unchanged behavior from 0.7)
src/explain.mjs     why(id), explain(request)
src/charter.mjs     purpose and values; the defaults
src/user.mjs        what the user says directly: verdicts, confirm, close, settle a disagreement
src/judge.mjs       the judge port: closed questions answered with probabilities; src/jev.mjs is one adapter
src/archive.mjs     a complete copy out and back in, the diary, the developer report
src/journal.mjs     one row per model call: purpose, duration, how it ended
src/prompts.mjs     every model prompt
src/log.mjs         durable record store (node:sqlite): events, state, cursors, erasure
src/mind.mjs, policy.mjs, model-json.mjs, embedding.mjs   unchanged helpers
plugin/             DeepSeek Harness adapter (host events, model calls, delivery, settings RPC)
client/             settings panel (React); client/FOUNDATION.md describes it
test/               principles.test.mjs, adapter.test.mjs, legacy/ (the 0.7 suite, unchanged)
sandbox/            story.mjs (two scripted weeks) and demo.mjs
eval/               scenarios for a real model, the runner, soak.mjs and judge.mjs; measurements with their numbers (README.md there)
standalone/         the core without a host: brain.mjs (library), mcp.mjs (MCP server), ports.mjs (HTTP model ports)
```

## Rules for changes

1. English in code, tests, comments, fixtures and prompts. Text in other languages lives in two places only: `client/locales/` (the panel) and `src/diary.locales.mjs` (the diary). The translated READMEs are the other exception. A test that needs a message in another script writes it as escapes.
2. The code does not decide semantics. It checks structure: exact quotes, cited ids, revisions, repetition counts, which records an operation may cite. Keep new checks structural.
3. Never delete history to fix a display problem. New behavior must keep provenance.
4. Anything shown to the user must be traceable to a stored record.
5. What use teaches about recall is derived from outcomes, not stored beside the memory.
6. Editing the settings panel requires the DSH client runtime; `client/preview/preview.html` runs without it.
7. `brain/` is formatted with Prettier (`.prettierrc`, width 150): `npx prettier --write "brain/*.mjs" "brain/page/*.js"`. The conversation page is written as parts in `brain/page/` that share one scope; their order is the list in `brain/page.mjs`.
8. The page's letters come from one list (`--face` in `brain/page/style.css`); nothing names faces of its own, not even what is drawn on a canvas (`lettered()`). After touching it, `node scripts/faces.mjs` says which faces a browser on your machine really used for Chinese and for Japanese.

## Reporting a problem

The most useful report is the developer report: Settings, Keep it safe, A report for the developer. It contains your conversations and everything remembered, so send it only to someone you trust with those, and never attach it to a public issue. For a public issue, paste `report.md` alone after reading it: it holds counts, timings and error messages, not conversations.

## Sensitive-category data

English patterns live in `src/policy.mjs`. Other languages are data, not code: `src/policy.local.json` may define `{"credentials":["regex source"],"security":[...],"generic":["word"]}`. The file is optional and absent by default. Anchor specificity is script-neutral, but filler words for languages without spaces between words still belong in `generic`.


## Licensing of contributions

Contributions are accepted under the license the project is published with, Apache-2.0. Sign off your commits (git commit -s) to certify the Developer Certificate of Origin.


## Where a thing is changed, once

A change should have one place. Where it has more, the list is here and a test says when one was missed.

| What | Where | What keeps it in step |
| --- | --- | --- |
| Words on any screen | `client/copy.mjs` (English) and `client/locales/*.mjs` | `client/copy.test.mjs`: every English entry exists in every language. `test/brain.test.mjs`: every word the conversation page asks for is one it is given. |
| Memory settings | `SettingsView` in `client/settings.jsx` | Drawn in two places from one model: the panel's settings and DSH's own settings (`AstemeSettingsSection`). Nothing to keep in step. |
| The conversation's settings (look, names, voice) | `brain/page/5-sheets.js`, `brain/page/8-start.js` | Only there. The panel links to them; it does not repeat them. |
| What the conversation page can ask the brain | a method on the mind (`brain/mind.mjs`), a route (`brain/server.mjs`), and the same name in the made-up mind (`brain/preview.mjs`) | The preview fails loudly on a route its mind lacks. |
| What the panel can ask the plugin | the action in `plugin/settings.mjs` and its name in the list at the foot of that file | An action missing from the list answers 404. |
| The mark | `client/icon.mjs` | The panel, the page and the public files are made from it. |
| The version | `package.json`, `src/package.json`, `package-lock.json`, `standalone/mcp.mjs`, `brain/acp.mjs` | `sed` over the five; the page refuses a version that differs from the code running under it. |
