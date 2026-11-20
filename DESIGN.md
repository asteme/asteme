# Asteme 0.8 — design

This describes 0.8.0-alpha.7. What changed after each run on a real host is listed under "After the first real run" and "After the second real run".

## The claim

A memory system is worth having only if what happened in scenes 1 to N changes what is done in scene N+1, and the system can say why. Storing and retrieving does not do that by itself. A loop does:

```
            the present scene
                   |
   recall  <-------+        scenes call memories; no word search
      |
   admit           a few are passed, with what is expected to follow
      |
   reply           (the host's model)
      |
   reflect         the records are read; the turn becomes an episode
      |
   outcome  -----> what happened next changes where a memory is recalled,
      |            how easily, and whether its content is read again
   sleep    -----> replay, reconcile, revise, integrate, imagine, habits
      |
      +----------> the next scene meets a different memory
```

The record of what was said is never changed by this loop. Everything the loop learns is derived from the record and can be traced back to it.

## What was kept from 0.7, and why

The ledger: append-only records with stable ids, exact-quote evidence, a revision for every change, erasure that removes everything derived, and a core that only explicit words can change. That foundation was sound and its 30 tests still run unchanged (`test/legacy`). The first four tables are the same, so an existing database opens as it is.

What was rebuilt is everything that makes memory move.

## Stores

| Store | Table | Changes when |
| --- | --- | --- |
| Records | `events`, `received` | Never. Erasure blanks content. |
| Memories (cases, lessons, concerns) | `experience`, `experience_history` | A model proposes, code validates, every revision is kept |
| Recall traces | `attention` | One per reading of a scene |
| Outcomes | `experience_feedback` | A later record shows how one use went |
| Dynamics (salience, imagined scenes) | `dynamics` | Use and sleep; no revision of the claim |
| Links (derived, supersedes, contradicts, coactive) | `link` | Writes, reconciliation, shared success |
| Episodes | `episode` | Reflection; salience can rise later |
| Sleep queue | `job` | Code plans, sleep runs |
| Charter and profile | `state` | The user, or the user's own words |

How easily a memory comes to mind and which scenes it answers to are not stored at all. They are computed from the outcome table each time, so they cannot drift from the evidence and erasure needs no extra step.

## The nine behaviors

Each has a mechanism in code and a test in `test/principles.test.mjs` with the same number.

**1. The scene recalls.** `recall.mjs`. The present scene is described by the model in a role-and-constraint language and embedded. A memory is not matched by its text. It is matched by the scenes it answers to: where it was learned, where it was expected to matter, where it helped or was missed, and scenes sleep imagined. A memory must fit the present scene clearly better than it fits a set of empty scenes ("a greeting", "small talk"). The measure is *closeness*: the share of the distance between "no better than an empty scene" (0) and "the same scene" (1). It does not depend on the embedding model's scale, where a raw margin of 0.001 can be noise in one model and signal in another. Below `TUNING.minCloseness` the scene alone calls nothing; a marginal fit is still considered when the message also shares content words with the memory. A name in the scene matches a memory's name across phrase and word forms ("project A" and "A"). One step of association brings along what is linked to a strongly recalled memory.

Admission is given reasons, not scores: what called each candidate, how closely (strong, moderate, weak), and what else points to it. It must answer for every strong match, with a use or an explicit "not now". If it returns nothing at all while a strong match is on the table, it is asked once more about those candidates only. Admission remains the only path to delivery.

The 0.7 gate that required the quoted words of the present input to also occur in the memory is off (`TUNING.requireSharedTerms`). It turned recall by scene back into recall by wording, and it rejected every anchor written only in kana or Hangul. The grounding half of that gate is kept: an admission must quote the present input exactly, and the quote must carry content.

**2. Use rewrites.** `outcome.mjs`. An outcome is one of helped, missed, irrelevant, wrong, unused, judgment, grounded in a later record. `irrelevant` and `wrong` are different repairs: irrelevant teaches where not to recall (the scene becomes one the memory stays out of); wrong marks the content doubtful, files the record against it and queues a rewrite. A success in a scene that was only hypothesized queues a widening of the established scope. Credit needs use: the judge must quote the reply to show a memory was applied, and a memory the reply ignored earns nothing.

The person can also say it directly (`user.mjs`): this was right, this did not belong here, this is wrong, this should have been used. That is recorded as theirs, with no quote invented for it, it teaches recall exactly as a later message would, and a model's later reading does not overrule it. They can confirm a memory that is in doubt or out of date, close one that no longer holds, and settle a disagreement between two.

**3. Sleep.** `sleep.mjs`. Code plans, bounded by a budget of model calls, and never asks the same question on the same evidence twice: `replay` reads a salient episode again beside earlier episodes that resemble it, which is the only place the record is read across exchanges; `reconcile` puts two memories that may disagree side by side with their evidence; `revise` rewrites one memory in the light of its outcomes; `integrate` draws one lesson from two cases learned in different exchanges and must cite both; `imagine` writes future scenes for what proved itself; habits are promoted and demoted by the 0.7 gates. Sleep cannot write to the charter.

**4. Forgetting is not deletion.** `accessibility()` in `outcome.mjs` is in (0, 1], starts at 0.5, rises with scenes where a memory helped and falls with scenes where it did not. It bends ranking and never removes. Scene-specific silence (the scenes it stays out of) does most of the work. Superseded and closed memories leave recall and stay searchable with their history. Age is not an input.

**5. Contradictions.** At write time the model can `supersede` (the world changed: the old memory is closed with the date it stopped holding and the new one points to it), `counter` (a record speaks against it) or flag `conflicts`. Asleep, pairs with the same subject or a shared named entity are reconciled: distinct, supersede, split, merge, retract or ask the user. `propagate()` queues everything drawn from a changed memory to be read again. While a disagreement is open, either side is delivered only as a question.

**6. Abstraction and transfer.** Three levels: case, lesson (drawn from two or more cases, citing each), habit (always present, earned by repetition). Transfer has two routes: the general scene every memory states, and the scenes sleep imagines for it. Imagined scenes are an index, not evidence, and are marked as such; a real success there is what widens the tested scope.

**7. The charter.** `charter.mjs`. Purpose and values, with the names, manner and agreements already in the profile. They change when the user edits them or states them in their own words for the whole relationship; the operation must cite a user record and is refused from reflection, from the assistant's words and from sleep. A habit may not restate a charter entry. Every recall trace records a digest of the charter it was made under. Defaults apply until the user writes their own, and say so.

**8. Traceability.** `explain.mjs`. `why(id)` returns what a memory rests on, what speaks against it, what it was drawn from and what was drawn from it, the scenes it answers to and stays out of, each outcome, and every state it passed through. `explain(request)` returns the scene that was read, what was considered, what was held back and why, what was admitted or dropped and why, and what happened afterwards.

**9. Salience.** `reflect.mjs`. A turn becomes an episode with signals: correction, surprise, failure, explicit, commitment. A model signal counts only with an exact quote; tool failures and applied corrections are counted by code. Salience orders replay, is inherited by what the episode taught, and makes a memory lose accessibility more slowly. An expectation recorded at admission and contradicted later is a surprise. A situation that already came up in another conversation is marked as recurring by code, once per situation, so that quiet exchanges are read side by side too.

## Positions taken against the brief

- **"Like a brain" is not the goal.** Brains confabulate, lose sources and overlearn from vivid events. Principles 5, 7 and 8 ask for the opposite. The design is brain-like dynamics on top of a ledger a brain does not have.
- **Age should matter, though not as decay.** A fact about a changeable state is less likely to be true as time passes. Each memory states how the world treats it (`stable`, `slow`, `state`); past a threshold it is still recalled but delivered as a question (`TUNING.staleDays`).
- **Salience buys attention, not generality.** A sharp correction is replayed first and forgotten last. It does not become a wider rule than a quiet event with the same evidence. One painful event stays a case.
- **An immovable core must not be empty.** In practice the profile starts blank, and a blank core anchors nothing. Defaults are shipped and labelled as defaults.
- **Embeddings stay.** They are the sensor for "this scene resembles that one". What changed is what is embedded (situations, not content), what is learned per memory (positive and negative scenes) and that similarity no longer decides anything alone.
- **The outcome signal is the scarce resource.** Principles 3, 4, 6 and 9 all feed on principle 2. Hence the expectation recorded at admission, the use check, and `unused`.

## After the first real run

0.8.0-alpha.1 was run on DSH with a real model on five synthetic cases. The adapter worked. What was found, and what changed:

| Found | Change |
| --- | --- |
| Admission returned nothing for a clear match | Reasons instead of scores; a decision required for strong matches; one second question on an empty answer; the prompt no longer says "when in doubt, pass nothing" |
| A sensitive memory asked about directly was dropped | A silent use of a sensitive memory is raised to a mention, and the prompt says so |
| "project A" did not match "A" | `sameEntity`: whole runs of words, split at script boundaries; a lone letter only when written as a name |
| A margin of 0.001 kept an unrelated candidate | The floor is closeness (scale-free, default 0.05); shared content words are a signal, not a gate |
| No sleep job and no outcome in a short run | Expected: nothing had stood out and no user had written again. `diagnose()` now says so in words; a recurrence signal lets quiet repeated situations be reread; host intervals are configurable for tests |

A simulated month (`node eval/soak.mjs`: 300 turns, scripted model, so call counts only) found three places where background work repeated itself, all fixed: a habit the model declined was asked about every cycle (this was in 0.7 too), every recurring exchange was replayed, and revisions were queued again by each new outcome. After the fixes the same month costs about 2.0 model calls before each reply (scene always, admission when something is recalled) and about 2.5 in the background per turn: reflection 1.0, outcome 1.0, sleep 0.5. Real figures depend on real use; read them from `diagnose()`.

## After the second real run

0.8.0-alpha.2 was used on DSH 0.2.2 with a real model (a small, fast one) in Chinese. Recall, the sensitive rule, name matching and `diagnose()` behaved as designed. What went wrong, and what changed:

| Found | Cause | Change |
| --- | --- | --- |
| `asteme_search` failed for Chinese and Japanese queries | A source record carried `tool: undefined`; the host refuses a value that does not survive JSON. English queries happened to match tool results, which have the field | The field is left out when absent, and every tool and RPC result passes through `plain()` |
| Four to seven readings for one message | A reading that passed nothing, or failed, was not kept, and a turn asks before every step | One reading per message; a failed one is tried once more, not sooner than 20 s later |
| 25 of 59 readings timed out, a one-word message included | The provider, not the input | The reply no longer waits 45 s every time: a waiting call gets 30 s, and after two timeouts in a row those calls are skipped for five minutes. Background calls get 90 s. Every call is in the journal with its duration |
| A correction was never learned and the old fact was delivered | Reflection was cut off at the output limit and failed the same way on each retry | A cut-off answer is asked for again with twice the room, up to twice in the background. `diagnose()` and the panel say when turns are unread and why |
| A candidate with no decision | Admission could omit weaker candidates, so silence was ambiguous | Every candidate gets an answer; the second question now also covers a candidate the message names |

### The judge

(The numbers below are from alpha.4. For the wording that ships now, see "After the third real run".)

A decision model takes a state and closed questions and returns a probability per option, in about a tenth of a second. Two steps of the loop are closed questions: may this memory be used now, and how did its use turn out. `src/judge.mjs` asks them; the port is `judge(state, questions) -> answers`.

- `judgeMode: "shadow"` (the default when a key is set): the generative model decides, the judge's answer is recorded beside it, and the judge decides when the model fails. The developer report prints how often they agreed.
- `"judge"`: the judge decides and the model is not asked. `"model"`: the judge is asked only on failure.
- When reading the scene fails and there is a judge, the message itself is the cue for recall. Recall still compares by meaning; only the model's one-sentence restatement is missing.
- A judge writes nothing, so its decisions carry no reason and no quote. They are recorded as the judge's with its probabilities; an outcome's evidence is the user's own later message, attached by code. The rules that follow admission (a sensitive memory is used in the open, a stale or disputed one is asked about, at most four) apply to a judge's decisions as to a model's.
- Using it sends the message, a little of the recent exchange and the candidate memories to that service. It is off without a key, and the key is never written to the store or to an export.

Measured against the real model (`eval/judge.mjs`, Jev 1.13): 16 of 16 admission cases and 6 of 6 outcome cases as expected, median 96 ms per call; with the generative model failing, a full reading took 0.23 s end to end. The cases are hand-written and the wording was adjusted on some of them, so this shows the judge is usable, not how it compares with a generative model on real traffic. Shadow mode is how to find that out.

### Keeping the record

Nothing is removed because the store grew or because time passed; a test writes two thousand memories and counts them. What can be removed is what the user removes: delete, forget, and old backup copies.

- **Archive** (`exportArchive`, `importArchive`): every table as it is, conversations included. Importing adds what is missing and never removes or overwrites, except that a memory is replaced by a later revision of itself. What was forgotten anywhere stays forgotten. Importing twice adds nothing.
- **Backups**: SQLite writes a consistent copy once a day (`backupEveryHours`), the newest `backupKeep` automatic copies are kept, and a copy is made before every import. A backup file is imported the same way as an archive.
- **Diary** (`diary({ locale })`): one Markdown file per month and one with what it knows now, in English, Japanese or Chinese, built from stored records only.
- **Developer report** (`report()`): counts, failures and timings derived by code, with the complete archive beside it.

### Languages

The conversation can be in any language. What the program compares by meaning (scenes, the situations a memory applies to, expectations) is written in English, so the same situation is recognized whatever language it came up in. What a person reads (a memory's text, reasons, questions) is written in the user's language, and names and quotes are copied as written. The panel and the diary are translated; prompts, code and stored codes are English. Reasons the core writes itself are fixed English sentences that the panel translates by key.

## After the third real run

alpha.4 ran unchanged on the same host. The store and the developer report came back, which is what this section is read from.

- **The model is the bottleneck.** Reading a scene took 4 to 24 s, choosing took 13 to 15 s or ran out of its 30 s, and a reflection that succeeded took 78 to 86 s against a 90 s limit, so 20 of 24 failed. One scene call spent its whole output allowance before answering. Background calls now get 240 s, memory calls ask for the least thinking the model offers, and both limits can be changed from the panel.
- **Sleep never ran** although seven exchanges had stood out, because it waited for an empty reflection queue and five turns kept failing. It now waits only for turns not yet tried.
- **A request to fix a memory went nowhere.** The reading before the reply timed out, and the assistant tried to edit the database file, which the user refused, 40 tool calls in a row. There is now a tool for it (`asteme_amend`), grounded on the user's message, and the note to the assistant says never to touch the store itself.
- **The judge disagreed with the model** on that host's two shadow comparisons. Replayed over the 19 real readings in the store (38 judgments with and without the scene), the alpha.4 wording got 35 right and its misses were a message correcting a stored fact. The wording that ships now got 38 of 38 there, and 15 of 16 on the hand-written set: it applies a rule quietly to the wrong audience in one case. The wording was chosen on these same cases, so the next shadow run is the first independent measure.
- **Memories read like minutes.** The model wrote who asked what and what had not been answered yet into the memory's text. The instruction now says the text states what holds, in a sentence or two.
- **One message was still read three times** over seven minutes in a turn of 38 steps. The cause is not established; the report's "most for one message" line will show whether it recurs.

## What the reply waits for

Four rounds on a real host said the same thing each time: the design was sound where it was slow. Reading the scene and choosing what to pass were two model calls in a row, 20 to 45 seconds together on that host, before every reply. Time limits and retries only moved the pain around. The order of work was the problem.

- **One call.** The message itself calls memory up (recall compares by meaning and needs no model). One call then reads the scene and decides about those candidates. The scene it returns is used to call memory up again; anything it brings with some strength that the first answer said nothing about is asked about in a second call. Usually there is none.
- **No call.** When a judge decides, nothing generative runs before the reply: message, recall, judge, deliver. The scene, which later outcomes are filed under, is read in the background, and only for readings that delivered something.
- **What is given up.** In the one-call reading the candidates the model sees were found by the message, not by a restated scene, so a vague message ("get me the usual") finds less on the first pass; the second call exists for that. In the no-call reading, corrections stated in the message are not applied before the reply; reflection applies them after.

Both paths are tested with scripted models. The combined prompt has not been run against a real model.

Considered and left out: letting a judge decide which turns are worth reflecting on. It would remove most of the slowest calls, but a wrong "nothing to learn" loses something silently, and there is no measurement yet of how often that would be.

## Invariants

- No delivery without an exact quote of the present input that carries content.
- No memory, lesson or habit without exact quotes from stored records; no lesson that cites fewer than two cases.
- The charter is written only from user records, in the live exchange.
- A change to a memory queues what was drawn from it.
- Erasing a record removes every memory, outcome, trace, episode, link, job and vector built on it, and scrubs its quotes from what survives.
- Accessibility never reaches zero and never depends on age.
- Sleep is bounded by a budget and never re-asks a question whose inputs have not changed.

## What is verified, and what is not

Verified by tests (`npm test`, 135 tests with the brain's; `node --test client/copy.test.mjs`, 8): the code does the right thing with a given model answer. That covers the 30 legacy tests, one test per behavior above, erasure across every table and every byte of every file, each finding from real runs, what the user can say directly, the panel's RPC surface against a stand-in host, pacing, and what is stored of each host event.

Verified in a real host (0.9.6: DSH 0.2.2-rc.1 on Linux, web profile, one small model, a judge in shadow, English and Japanese): the plugin installs and loads; a reading before the reply; reflection; a memory with its ground; delivery in a later conversation; an outcome; the judge beside the model; private records marked by the model and used only as described; unfinished work stored as a concern; the panel in light and dark; the composer mark; erase from the panel leaving no erased text in any file; the developer report.

Not verified:

- **Windows.** "Open folder", the PowerShell file chooser and the installed plugin on Windows are confirmed only as far as the user's own reports go.
- **Other models.** One model was used. With it the model check gave 32 of 36; what failed is listed in `docs/IMPLEMENTATION.md` under 0.9.6. `eval/` ("Check this model" in Settings) is the measure for any other model.
- **The last three changes of 0.9.6 inside DSH.** The literal rule was run once through the scenario it answers (4 of 4) and the final build was loaded and used in DSH for two messages; the judge looking at unanswered weak matches is covered by a test only.
- **The numbers in `TUNING`.** Reasoned defaults. With the real embedding model a short allusive question did not clear the floor by itself and was called up by the scene instead.
- **Ratings and approvals in real use.** `feedback/*` and `approval/decided` are read as the host's source declares them; none has been received from a running host yet.
- **Project-off in the real panel**, and the standalone MCP server with a real client.
- **Translations** other than English and Japanese have not been read by native speakers.
- **Long use.** Promotion to a habit, lessons from several cases, and forgetting by outcomes need weeks of real conversations; they are tested with scripted ones.
- **Scale.** Recall compares the scene against every cue in memory (fine into the tens of thousands) and several paths load all memories per call.

## Known limits

- Contradictions are found by shared subject, shared entity, the model's flag at write time, or replay. Two disagreeing memories with none of those are not paired.
- A lesson is drawn from pairs of cases. A third case joins through revision, not through a new integration.
- `unused` is the one outcome without a quote from a later record; it is given the least weight.
- Whether the answering model used a delivered memory is known only from the outcome judge's quote of the reply or the model's own `asteme_note`.
- Nothing here changes model weights. The ledger, lessons and outcomes are the data a later fine-tuning step would need; that step is not built.

