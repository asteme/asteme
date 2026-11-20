# Sandbox

Run the loop without DeepSeek Harness:

```
node sandbox/demo.mjs
```

`story.mjs` plays two weeks with one user against the real core: a correction, a request that shares none of its words, a use that was out of place, a night of sleep, a scene nobody had met, and a fact that changed. `demo.mjs` narrates it and then asks the questions a person would ask of a memory: what is stored, why a lesson is believed, why a memory went quiet, what a reply had in view, and what happened to a superseded fact.

No API key, no network, no DSH.

| Port | Sandbox | Real host |
| --- | --- | --- |
| infer(purpose, prompt, maxTokens) | scripted answers per purpose | a model call per purpose |
| embed(texts, kind) | a small vocabulary of situations (`test/helpers.mjs`) | local multilingual embedding model |
| records | one ingested event per message | DSH session events |
| scheduling | direct calls | turn end, idle, background interval |

To try another behavior, edit the scripted answers in `story.mjs`. The core does not import anything from the host, so changes here cannot break the adapter. The same story feeds the panel preview (`node client/preview/snapshot.mjs`) and `test/adapter.test.mjs`.
