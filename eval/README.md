# Measurements

What the memory is measured on, how to run each measurement, and what it gave. A number in `src/recall.mjs` or a rule in a prompt that shapes what comes to mind is changed with a measurement here beside it.

Everything below was measured on 2026-11-26 and 27 with DeepSeek V4.1 Flash (thinking at its default) as the model that reads, chooses and replies, the local embedding model the product ships (`multilingual-e5-small`, 8-bit), and no judge. Another model will give other numbers; the comparisons between columns are what to read. The same measurement run twice does not give the same number twice: a model answers a question differently on another day, and a count out of fifty moves by one to three.

## How to run

Any OpenAI-compatible endpoint works. A measurement makes hundreds of calls, so no more than a few are out at once (`--at-once`, 6 unless said), and a call the service refuses for being too fast waits and is asked again.

```
ASTEME_EVAL_KEY=... node eval/situations.mjs --base-url https://api.example.com/v1 --model some-model
ASTEME_EVAL_KEY=... node eval/asks.mjs       --base-url https://api.example.com/v1 --model some-model
ASTEME_EVAL_KEY=... node eval/longmem.mjs    --base-url https://api.example.com/v1 --model some-model --data longmemeval_oracle.json
node eval/run.mjs --selftest        # the scenarios, with canned replies: proves the wiring only
```

`run.mjs`, `soak.mjs` and `judge.mjs` are described in `CONTRIBUTING.md`.

## 1. Taught in one situation, asked for in another (`situations.mjs`)

Twelve things are taught, each in a conversation of its own, with twelve unrelated things between them. Later come twelve requests that share a situation with what was taught and none of its words (taught: "put the decision in the first line, she only reads the first three lines of anything"; asked: "write a one-page pitch for the investor, he will give it about a minute"), and eight that ask for nothing remembered. Each language has its own store, taught and asked in that language.

Taught and found again (of the things that had become a memory):

| | 0.12.2 | 0.12.2 with the floor on nearness taken out, nothing else changed | 0.13 |
|---|---|---|---|
| English | 5 of 11 | 11 of 11 | 12 of 12 (8 kept as standing asks, 4 recalled) |
| Japanese | 4 of 12 | 11 of 12 | 12 of 12 (10 standing asks, 2 recalled) |
| Chinese | 2 of 11 | 10 of 11 | 12 of 12 (11 standing asks, 1 recalled) |
| Asked for nothing, something passed | 0 of 8, each language | 0 of 8, each language | 0 of 8 in English and in Japanese, 1 of 8 in Chinese |

- In 0.12.2 the memory was among those called for 8 or 9 of them in each language and then not passed: the floor had labelled the match "weak", and the step that decides was told to hold a weak match back unless it could name a reason.
- The message alone, before a model has read the scene, called the taught memory for 1 of 10 in English. With the scene's words in English (as every memory's have been since 0.11) a Japanese or Chinese message alone called 1 of 5; with the scene written in the message's language, 5 of 5. The order of nearness was right in all three languages: the right memory was among the eight nearest for 9 of 10.
- In 0.13 most of the twelve are no longer left to recall at all: eight to eleven of them are things the user asked for "whenever", and they are kept as standing asks (how many, the model that reads the turn decides; it differed from run to run). The same stores as 0.12.2 learned them, read by 0.13's recall (so that only recall differs): 10 of 12 in English.
- The one thing passed for nothing, in Chinese, was for "explain how a rainbow forms": the round in which the user had said how they want things explained to them (from the case in front of them first, then the cause). It is counted against, though whether it was out of place can be argued.
- One model call before each reply, in every language.

## 2. What happens to something you asked to be held to (`asks.mjs`)

Four asks, each made in so many words (check recipes for peanuts; wait seven days before a purchase over 300 dollars; a doctor's caffeine limit; ask a co-founder before promising a customer a date). Then a request the ask applies to, a reaction to being reminded (annoyed, accepting, or simply going on), and a later request of the same kind.

| | 0.12.2 | 0.13 |
|---|---|---|
| The ask reached the first reply it applied to | 17 of 28 (the allergy: 3 of 9) | 23 of 23 |
| It reached the next one, after the user was annoyed at being reminded | 0 of 5 | 7 of 7 |
| after the user accepted the reminder | 4 of 6 | 8 of 8 |
| after the user simply went on | 4 of 6 | 8 of 8 |
| What was recorded about the ask after the annoyed reply | "wrong" 3 times, "out of place" twice | nothing, 7 times of 7 |

- In 0.12.2 the first column counts the memory being passed to the reply; where the same words had been filed as an always-present agreement instead (5 cases), the later reply named the rule in 4, the annoyed case among them.
- In 0.13 both columns are read from the replies themselves: a second call says whether the reply did what was asked for. All 23 asks were kept as standing asks. (Twenty-four cases were run; one was cut short by an empty answer from the model and is left out.)
- A reading of an irritated answer can no longer put a standing ask in doubt either. In an earlier run of this version, before that was closed, the reading of the whole exchange had put the ask in doubt in 2 of 8 such cases.

## 3. LongMemEval (`longmem.mjs`)

[LongMemEval](https://arxiv.org/abs/2410.10813) asks about things said in earlier conversations: a fact the user gave, one the assistant gave, something that changed, the order or distance of events in time, a count across conversations, a preference to follow. The data is not in this repository (see the head of `longmem.mjs`). Ten questions of each of its six kinds, on the conversations that hold the answer; a question whose conversations were not read in whole (a refused call in the middle) is left out.

Right answers, the same model answering from:

| | |
|---|---|
| nothing | 3 of 53 |
| what 0.12.2 passed to the reply | 30 of 53 |
| everything 0.12.2 had learned, all at once | 31 of 53 |
| what 0.12.2 passed, and one search by words on purpose | 42 of 52 |
| a plain search: the four nearest rounds of the conversations | 43 of 53 |
| what 0.12.2 passed, and those four rounds | 48 of 53 |
| the conversations, whole | 49 of 53 |

And with only the way memory is reached changed (the stores as 0.12.2 learned them, read by each version):

| | 0.12.2 | 0.13 |
|---|---|---|
| A store for each question | 30 of 53 | 44 of 53 |
| Everything in one store (about 350 memories and 480 rounds) | 26 of 50 | 43 of 53 |
| Model calls before a reply, a store for each question | 1.89 (a wait of 18 seconds at the median) | 1.00 |
| Model calls before a reply, everything in one store | 1.96 | 1.00 |

By kind, a store for each question (0.12.2, then 0.13): what the user said 9 and 10 of 10; what the assistant said 1 and 9 of 10; something that changed 9 and 8 of 10; time 4 and 7 of 7; across conversations 1 and 4 of 6; a preference 6 and 6 of 10.

What this says:

- What was learned from a conversation held about three fifths of what the questions needed, whatever was done with it afterwards (31 of 53 with all of it in front of the model). What the assistant had said was not learned at all, by design. The rest was in the record, and a plain search of the record found it.
- So the record is searched too (0.13), and what was learned is passed with it. That is most of the way to having the whole conversations in front of the model, at one call and a note of about 1,400 characters.
- Having everything in one store, as a real store has, cost 0.12.2 four answers and 0.13 one.
- While this version was being finished the first row was run three times more on code that differed in small ways, and gave 44 of 51, then 47 and 46 of 53. The second row had given 41 of 50 and 45 of 53, with 1.8 and 1.5 calls before a reply: asked for the names in a scene, the model also gave the topic, the names on the memories it had been shown, and "user", and each of those called a memory it had not seen and a second call to ask about it. A second call is now made only for a name the conversation before the message holds.

## 4. The scenarios (`run.mjs`)

Ten short stories, each with checks on what memory did (`CONTRIBUTING.md` says what they are for). With this model, 0.13 passes 35 of 36 checks. The one it does not pass is "two corrections on different days become one lesson while asleep", three runs of three; 0.12.2 does not pass it with this model either. The model folds the second correction into the memory of the first, as it reads the turn or when it reads the two again, so that two cases are never left for a lesson to be drawn from. What is kept says what the lesson would have said, as one case that cites both days. Whether a case that wide should have been a lesson is open, and is not this version's change.

## What reading the conversations in costs

For the 53 questions (about 290,000 tokens of conversation), reading them into memory and the idle work after each conversation took 1,048 model calls, 5.1 million tokens in and 3.7 million out: about thirty times the conversations themselves, 2.2 calls for each exchange. Nothing in 0.13 changes this; it is the next thing to measure down.

## What is not measured yet

- Recall among very many conversations (LongMemEval's larger sets, of 50 and 500 conversations to a question). The search of the record alone was measured there, with no model: among about 250 rounds, a round that holds the answer was among the ten nearest for 99 questions of 100 (72 questions).
- Japanese and Chinese beyond the situations above: there is no public set of long conversations in either.
- Records about private matters. The rule for them is the one 0.12.2 had (they keep the floor), and it was not measured here: how often it holds back something the user did raise, and how often the step that decides passes one the user did not raise.
- What learning from a memory that was needed and did not come does over months, and whether a boundary the user states holds as stated.
- Replies themselves: whether a memory passed to a reply was used well.
- A host of the size and age of a real one: how long the record of a store brought from an earlier version takes to index, and what the index adds to the size of the file.
