# The brain

Asteme began as memory inside one agent tool. This is the same core turned the other way round: Asteme is the one the user talks to, and agent tools are what it uses.

Status: 0.10.0-alpha.1. Stages 1 to 3 below run and were used with a real model and a real worker. Stage 4 needs no code of its own. The DSH plugin stays; it is where the memory is used every day.

## The shape

```
            the user
               |            one conversation, kept in Asteme's own store
            Asteme          remembers, decides, sets its own times
               |            one door: text out, text back
   DSH   Claude Code   Codex   ...   any agent that speaks the Agent Client Protocol
```

Four parts, four files:

| Part | File | What it is |
|---|---|---|
| The mind | `brain/mind.mjs` | One conversation; one model call per moment of attention; the leash; quiet moments |
| Awake and asleep | `brain/wake.mjs` | What brings a moment of attention, with no heartbeat |
| The door to workers | `brain/acp.mjs` | A client for the Agent Client Protocol over a worker's standard input and output |
| The door to the user | `brain/server.mjs`, `brain/page.mjs`, `brain/page/` (a shell, its styles, and the script in parts that share one scope, put together when served) | A page served to this computer only |

`brain/model.mjs` is the model port (any OpenAI-compatible endpoint), `brain/cli.mjs` starts it, `brain/preview.mjs` shows the page with a made-up mind.

### Two ways in, one person

| | The conversation with Asteme | A DSH session with the Asteme plugin |
|---|---|---|
| Who answers | Asteme | DSH's agent, with Asteme's memory, name and way of speaking |
| Tools | none of its own; work goes to a worker (a DSH session), which has every tool DSH has | DSH's tools, used directly |
| A long conversation | one thread that never ends; nothing is summarised away (below) | DSH's own sessions and DSH's own compaction |
| Speaks first | yes: a result, a time it set | no |
| Needs DSH | no; inside DSH it borrows DSH's models, hearing and hands | yes |

Both read and write the same store, so it is one person either way. Nothing of DSH's is built a second time: tools, web search, skills, compaction of a working session and permission prompts stay DSH's and are reached through the worker.

### Why the conversation is not a DSH session

A DSH session is an agent at work: tool calls and their output fill its context, and when the context is full it is compacted, which is where things get lost. The conversation with Asteme is kept free of that on purpose. Tool output never enters it; only what a worker reports does. So its context does not grow with the work, and there is nothing to compact.

What is in front of the model at any one moment:

1. the last records of the thread (`recent`), each shown briefly, the one being answered whole;
2. what memory brings for this scene, decided in the same call;
3. `earlier`: one line for each exchange before those, already read into memory, with its time;
4. the state of work that is out, and anything searched for on purpose.

Each of the four is a fixed number of bounded pieces, so the length of the conversation adds nothing to a call. What can be large is what arrives at once (a long message, files with it), and that is fitted to the model that speaks: 64,000 characters for a call, or seven tenths of the model's window when that is known and less. What does not fit is cut and marked as cut.

Every word of the thread stays in the store. This is the difference from compaction: compaction replaces the past with a summary; here the past is kept, and what is carried is an index to it.

## Decisions

**Recall is part of thinking.** Inside a host, memory had to be read before the host's model replied: one call, sometimes two, with the user waiting. Here the call that reads the scene and decides which memories apply is the call that writes the reply and names what to do (`speakBody` in `src/prompts.mjs`, `speak` in `prepare`). Everything the core checked before is still checked: the decisions, the anchors, private records used only in the open, the trace. Nothing waits for memory, because memory is no longer a separate step.

**No hands.** The brain has five acts: delegate to a worker, tell a worker something more, cancel, set itself a time, search its own memory. It cannot read a file, run a command or open a page. Work is asked for in words and read back in words, which is how a person uses a capable colleague, and it means no tool has to be built or maintained here.

**One door.** Workers are reached through the Agent Client Protocol: `initialize`, `session/new`, `session/prompt`, updates, permission requests, cancel. DSH ships a server for it (`dsh acp`); Claude Code, Codex, Gemini CLI and others have one. A worker is a line in the settings (a command, its arguments, a sentence about what it is good at), not a plugin. Operating a worker through its screen was considered and is not the door: it is slow, it breaks when the screen changes, and many services forbid it. A tool that has only a screen is reached by asking a worker that has a browser.

**What a worker returns is read, not said.** It is stored as tool output, so every rule about `grounds` applies unchanged: it cannot replace what the user said, cannot become a habit, is never used quietly. The prompt says a worker's output can inform the next step of the user's task and can never start another.

**The leash.** Code counts how many times work has gone out since the user last spoke (`leash`, 8 by default). At the limit, the brain can only report and ask. A model that keeps finding one more thing to do stops there whatever it was told by what it read.

**Permission is the user's.** A worker's permission request goes to the page as it is. The model is not asked and is not told to decide; no answer is a refusal. The answer is recorded as a mark (`approval/decided`).

**A turn is a matter.** A turn ends when the brain has replied and nothing is out with a worker. Reflection then reads the whole matter: what was asked, what was handed over, what came back, what was said.

## Awake and asleep

A heartbeat wakes a model on a fixed beat to ask whether anything happened. Most beats find nothing, each costs a call, and whatever happens between two beats waits for the next. It is polling, and it is a habit of the tools, not a limit.

Here nothing is polled (`brain/wake.mjs`):

- A **stimulus** arrives by itself: the user spoke, a worker finished or failed. It is attended at once.
- An **intention** is a time the mind set: "ask whether the memo was sent, tomorrow at nine". Intentions are kept in the store and the process holds one timer, armed for the nearest of them. A concern with a date is the same thing in memory.
- **Awake**: stimuli are attended in order. In a quiet moment (twenty seconds with nothing arriving) what just happened is read into memory, one paced round at a time, beside attention and never in front of it.
- **Asleep**: after five minutes with nobody there and nothing out. Outcomes are read and memory is consolidated in paced rounds; when none is left, nothing runs. No timer exists except for the next intention. Measured in a test: five hours asleep with nothing due is zero timers and zero calls.
- **Off** is not asleep. The mind exists only while its process runs. On start it finds what came due meanwhile, attends that first, and is told how long it was away.

What cannot be removed: a change in the world that nobody announces (a mail arriving at a service with no push) has to be looked for by something. That something should be a sensor, in code, which wakes the mind only when there is a difference. It should not be the mind looking on a beat. No such sensor is built yet.

## The page

The page is a sky, and nothing on it is decoration. Each star is one memory in the store, placed by its id, as bright as it comes to mind. A lesson is joined to the cases it was drawn from. When a reply used memories, those stars light and a line is drawn to them from where the words appear. Work that is out is a point going round until it comes back. Asleep, the sky dims and turns slowly about its pole. A new memory comes in as a shooting star and lands in its place (`comets`; three at most at a time, none with motion turned down or with `look.comet` off, when it simply appears). A private memory is a star without words until it is clicked.

There are no pages to go to. What is on the page opens what lies behind it, beside the conversation and never instead of it: a star opens that memory (its words, what it rests on, and what can be done with it); the count opens all of them with a search; its name opens who it is; the word for its state opens what it has been doing. What it would like settled is asked in the conversation itself, one question at a time.

How it looks is the person's too: a picture behind the sky, a colour, a text size (`look`), kept in the store with everything else. Inside DSH the page takes the background and text colour DSH is using, read by the panel and passed in, so whichever skin DSH wears, the conversation wears it.

The conversation has no list of sessions: the present is in focus, what was said before recedes until you scroll back to it. Everything the sky shows is also there in words (the state, the count, "used what it remembers", the intentions) for a reader who cannot see it or has motion turned off.

### Among the stars

The sky behind the conversation is a window onto the whole of memory, and it can be entered: take hold of the empty sky and pull. There is no button for it on the page itself, because the sky is already there to be taken hold of; the memory list has a plain way in for those who do not pull, and Escape or "Back to the conversation" leads out.

What is drawn there is every memory in use, and each choice says something that is stored:

- **Where**: by when it was learned. The newest are at the centre and the oldest at the rim, at an even density, so the sky grows with what is learned instead of getting crowded, and looking further out is looking further back.
- **Together**: a lesson holds the cases it was drawn from around it, joined by lines.
- **How bright, and how near**: how easily it comes to mind (the same number recall uses). The sky is seen at a tilt and in perspective; a memory that comes easily stands above the plane, toward the eye, and one that is fading lies below it.
- **What shape**: a ring is a matter still open, a cross is a lesson.

This was designed for this data and not taken from a graph view. A force-directed graph places things by their links and means nothing where there are few links, which is most memories; here the place itself carries when, and the links carry what was learned from what.

**Turning it.** Where the sky is turned to is kept as one rotation (a quaternion in `cam.q`), not as two angles. With two angles, tipping the sky past its edge exchanges left and right under the hand, and near the edge one of the angles stops meaning anything: the lock everything that turns in space with two angles runs into. With one rotation there is no such place. Taking hold to turn is taking hold of a ball (`ball()`): the turn is the one that carries the point where the pull began onto the point under the hand now, applied to how the sky stood when the pull began, so the same path of the hand always ends in the same sky and coming back to the start puts it back. Past the ball's edge the pull rolls the sky about the line of sight. Let go while turning, it turns on a little about the same line. The point looked at is a point in space (`cam.x, y, z`) and no longer a point of the plane, so moving slides the sky across the screen exactly as the hand moves, however it is turned. "Level the sky" (the `0` key, or the button that appears once the sky is askew) puts it back the right way up, facing as it faces.

**Looking for something.** What a search finds leaves its place and comes together where it can be read: one star after another down a shallow curve, joined by a line, each with its words beside it. It is a constellation that lasts as long as the search, and nothing is laid over the sky: no panel, no list. The one being read is at the middle, nearest and largest, and may run to two lines; the ones before and after fall away from it, smaller and fainter (`wheelAt`, `rowLight`). It keeps a thread to where it lives in the sky, plain at that place and thinning toward the words. Around the found the rest of the sky steps back by itself (`clearOf`), so the words are read against nothing. A few stand there at once (`wheel.span` each side); the rest keep a faint ring where they are, fainter the more of them there are. The wheel of the mouse over them, or the arrows and Page keys in the search box, go from one to the next (`gather.at`), and the ones that leave go home while the next come in, each star by its own measure (`gw`, `go`). Enter opens the one being read; a row's words can be pressed as well as its star. The coming and going has its own motion: each star waits its turn (the one to be read first; on the way home the furthest first), goes by a shallow arc with a short tail behind it, and where it lands a ring opens and is gone; the words come once their star is there, and when the search is let go of the words go first. Over the found stars and their words the wheel steps (`wheel.box`); anywhere else, and with Ctrl, it brings the sky nearer or further as always. `/api/find` answers with up to 200, what the search ranks first and then whatever has the words in it, newest first.

**What it costs.** Which stars show behind the conversation is worked out when the stars change and not at every frame; what is under the pointer is looked for among the places stars were last drawn at. With eight thousand stars a move of the pointer cost a millisecond and now costs a twentieth of that.

### Read, thinking, writing

A message goes through three things that can be seen, in the order they happen between people. It is marked read when Asteme takes it up. While it recalls and decides, the conversation shows nothing; the word at the top says it is thinking. The three dots stand only while it writes: from the first word of its answer (`writing` on) until the words are there. A host that streams sets `infer.reports = true` and calls `hooks.wrote()` (the fifth argument of `infer`) at the first text of the answer; with a host that does not, writing is taken to begin when the call that speaks goes out. The dots never come before the read mark, and an answer never stands above the mark for what it answers.

### Less movement

Where the device asks for less movement, the page follows it: things fade and nothing flies. The beginning keeps its length and order. The person can choose, on that device, to have it move all the same (the scene offers it, and the settings under "Movement"); the choice is kept beside the page (`asteme-motion`), not in the store.

## One person, a mood, and more than one person

A person is one store: memory, the conversation, the charter, the pictures. That does not change with the day. What changes with the day is the way of speaking, and that is kept apart from the charter as a manner: the user's words for how to be spoken to for now, with an end. It reaches every reply while it lasts and nothing else: the prompt says the voice changes and the truth, the promises and the care do not.

Someone who wants a second person (one for work and one for home, or simply another one to bring up) gets a second store, `--person <name>`. Two people share nothing. A person is taken out whole with `export` and brought in with `import`; the file is the complete copy the plugin already makes, so a person can move between the plugin and the brain as well.

## Inside DSH

The same mind can be opened from the DSH plugin ("Talk to Asteme itself" in Settings). There it shares the plugin's store, so what was learned in DSH sessions is known in the conversation and the other way round; it thinks with the model DSH already uses; and reading turns into memory and consolidation are left to the plugin, which does them already. The page is the same page, served to this computer only.

DSH's own conversations stay as they are. They are the agent at work in one session, and they answer when spoken to. The conversation with Asteme is the one that goes on across all of it and can speak first. Both are kept: neither replaces the other, and a user who wants only memory inside DSH never has to open the page.

Inside DSH there is always one worker, `dsh`: a DSH session started through DSH's own session service (`plugin/worker.mjs`), composed like any session the user starts. Nothing is spawned and no key is needed. The session is excluded from memory: its opening prompt is Asteme's, not the user's. Its result is read from the session's own record when the turn ends. DSH's questions to its user (permission for an action) stay DSH's and are answered in that session; the conversation is told it is waiting. More workers can be added in the plugin setting `brainWorkers`, in the same shape as in `brain.json`.

A session started this way is a pair of hands, not Asteme. It keeps DSH's own identity and is given the task and nothing else: no persona, no way of speaking, no reading of memory before its steps, and the memory tools are closed to it. Memory goes through one head. Asteme has already decided what bears on the work and writes that into the task; a second reading in the worker would cost time before every step and could pass along what Asteme chose to hold back. The same holds for any worker reached over the Agent Client Protocol, which never had access to memory in the first place.

What the conversation can do beyond words is lent by the host where the host already has it, so nothing is built twice:

- **The model that speaks** is the one DSH's own chat last used. Another of DSH's models can be chosen on the page under "About". The model set aside for memory work is not the voice.
- **Hearing** is DSH's voice input, when that plugin is on. The page records, DSH's recognizer on this computer turns the recording into words, and the words are put in the box for the user to send. The recording is not kept.
- **Files** are Asteme's own: a file handed over is kept beside the store. Asteme reads the beginning of a text file. Anything else it has not seen and says so; when the request needs the file opened, it gives the path to a worker. A picture is not yet passed to the model itself.

The page uses DSH's composer only as a model for these functions, not as a component. DSH's composer belongs to one DSH session and sends straight to that session's agent; a message to Asteme goes to Asteme first, and the same page must also work with no DSH around it.

Inside a host the embedding model runs in a process of its own (`src/embed-worker.mjs`). The library that runs it brings native code (an inference runtime, and an image library it loads and Asteme never uses) that collides with the host's own copies when loaded into the host's process. DSH runs its own speech model the same way.

### The door, for whoever checks it from outside

All on 127.0.0.1, all behind the token (cookie, or `?token=` inside a frame). JSON unless said otherwise.

| Request | Body | Answer |
|---|---|---|
| `GET /api/state` | | the snapshot: `state`, `thinking`, `messages` (each may carry `files`), `tasks`, `asks`, `sky`, `can: {files, hear, model}`, and `shown` once the page has drawn |
| `POST /api/say` | `{text, files?: [id], replyTo?: id}` | `{ok: true}`; the reply comes over `/api/events` |
| `POST /api/react` | `{id, emoji}` (one of Asteme's messages; an empty `emoji` takes the sign away) | `{reacted: id, emoji}` |
| `GET /api/unseen` | | `{n, at}`: what Asteme has said that has not been in front of anyone |
| `GET /api/fonts` | | `{names}`: the families in the font files of the machine it runs on |
| `POST /api/file` | the file's bytes as they are; `content-type` is its type, `x-file-name` its name (URL-encoded) | `{id, name, type, size}`, directly |
| `GET /api/file?id=` | | the bytes; a picture inline, anything else as a download |
| `GET /api/models` | | `{now: {provider, model, name, follows}, list: [{provider, providerName, model, name}]}` |
| `POST /api/model` | `{provider, model}`, or `{}` for "the same as DSH's chat" | as `GET /api/models` |
| `POST /api/hear` | a 16-bit PCM WAV (the page sends 16 kHz mono); it is rewrapped under the plainest header before the recognizer gets it | `{text, seconds}` |
| `GET /api/speak?id=&voice=` | the id of one of its replies; `voice` is one the host lends | raw 16-bit mono samples as they are made, `x-audio-rate` saying how many a second; 400 with `{error}` when it cannot be read |
| `POST /api/unwake` | `{id}` of a time it set (from `intentions` in `/api/state` or `/api/activity`) | `{intentions}` |
| `POST /api/shown` | sent by the page: `{theme, bg, ink, from, asked?}` | `{ok: true}`; read back as `shown` in the state, kept only while this runs |

### The settings, and the panel beside them

What is set for the conversation (how it looks, what Asteme is called and how it shows feeling, its voice and how hard it thinks) is one sheet in three parts in the page. Inside DSH the panel asks for it with `postMessage({asteme: "settings"})` and the page asks for the panel with `{asteme: "manage"}`; the page tells the panel `{asteme: "changed"}` when memory changed here, and the panel's changes reach the page as a `learned` event. The look is kept by `POST /api/look`: `ground` (`auto`, `white`, `black` or a colour), `its`, `accent`, the letters' colours `ink`, `itsInk`, `mineInk`, `themes` (saved looks), `font`, `px`, `showName`, `tips`, `pull`, `aloud`, `voice`, and the picture behind the sky.

### What a worker asks

A DSH session that is one of Asteme's hands may ask its user something: a choice, or leave to act. DSH offers such a question to whoever will answer (`user-questions/request`); `plugin/worker.mjs` answers first for its own session and leaves every other session's to DSH. The question becomes an entry in `asks` in `/api/state` with `kind: "question"` and its `questions` (`id`, `question`, `detail`, `options` with `label` and `description`, `multi`, `approval`). `POST /api/answer {id, answers: [{id, choose: [labels], say?}]}` answers it; the older `{id, allow}` still answers a request for permission from an ACP worker. A question that does not ask leave is also put to Asteme (`present.kind: "a worker asks"`, `INPUT.questions`), which may answer with `{act: "answer", ask, answers}`; one that asks leave is refused there, in code.

### Times that come round again

`{act: "wake", at, why, every}` with `every` one of `day`, `weekday`, `week`, `month`. When it comes it is set for its next time after now (`nextTime` in `brain/wake.mjs`, counted in this computer's clock); times missed while not running are not made up. `intentions` and `promised` carry `every`.

### Stopping, and how hard it thinks

`POST /api/stop` ends what is being thought about for the user: the host's call is aborted, nothing is said or done, a record says why, and a `stopped` event follows. `thinkingSince` in `/api/state` says since when. `GET /api/models` gives `now.efforts` and `now.effort` where the model offers a choice; `POST /api/model {effort}` sets it (kept apart from which model).

### Read, seen, taken back

A message of the user's is read when Asteme takes it up: a `read` event, and `read` (the time) on that message in `/api/state`. The page tells what Asteme said and it had in view with `POST /api/seen {ids}`; those messages carry `seen`. For its own thinking, `INPUT.unanswered` lists what it said since the user last wrote: `{said, seen, words}`, `seen` null when it was never in front of them. `{feel: {seen: false}}` turns all of it off. `POST /api/retract {id}` takes one of the user's messages back: `log.erase` removes its words and every memory that rests on them, a `retraction` record keeps its place and hour, and the message comes back from `/api/state` as `{id, role: "user", text: "", at, retracted: true}`. What Asteme said in answer goes with it: every word of its own and every task's result between that message and the next thing the user said is erased too, and a task still out for it is called back; the `retracted` event names them in `also`. An answer to something that is no longer there would be the one thing left that tells what was taken back.

The page shows "Read" under a message 1.6 seconds after it was taken up, not on the instant: a mark that is there before the hand has left the key reads as a machine's. `POST /api/seen` answers `{seen, at}`, and the page puts the same word and that hour under the last thing Asteme said that was in front of the user.

### Signs both ways, and answering one message

The user puts a sign on something Asteme said with `POST /api/react {id, emoji}`; it is kept as a `reaction` record (`by: "user"`) and comes back on that message as `reaction`. In `INPUT.unanswered` such a message carries `reaction`, and the prompt calls it an answer of a kind: it was seen, and this is what the user made of it. Asteme's own signs on the user's messages are as before (`react` among its acts).

`replyTo` on `/api/say` is the id of the message being answered, either side's. Only the id is kept, in the message's metadata; what is shown above the answer (`replyTo: {id, role, words}` in `/api/state`) and what Asteme is told (`INPUT.present.replying: {to, at, words}`) are looked up when asked for, so the words of a message taken back are quoted nowhere.

### The very beginning

A store with nothing in it has nobody in it yet: `fresh` in `/api/state` is true while nothing has been said, nothing is remembered and it was never woken (`brain:born`). That is so for a new store and for one wiped clean, and never again once it has been woken, so nothing of this is left in daily use. The page then shows one scene before the conversation (`birth()`): on an empty sky, with the mark that will be its face faint above, it asks for what the settings would otherwise have to be found for: a name, what to call the person, and how to speak to them. Each can be left empty, and the whole scene can be passed over.

Then it is woken. The mark is drawn and its stars light one by one, it breathes once, and its name is said. `POST /api/self {born: true, name, userName, manner, firstMemory}` tells it so. With a name given, being woken is the first thing it remembers: a memory like any other (`core.apply`, a `put`), resting on a record of what the person gave it (a session of its own, `beginning-<when>`), in words that say who woke it and what it was called. The page supplies those words, in the person's language; the brain checks only that they rest on something. That memory is the first star. The dark becomes the empty sky again, the mark goes to its place at the top, and the star falls into the sky slowly, lands with a wide ring and is said to be the first (`comet.first`). Then the conversation appears, and it speaks first (`present.kind` "you were just woken for the first time").

The first star stays what it is: `first` on it in `/api/sky`. It is the pole of the sky: behind the conversation it stands at the point the sky turns about, and among the stars at the middle, a little above the plane, with the rest laid out around it; it is drawn with rays and at full brightness. In the scene each thing given lights one star of the mark (`light(n)`), and the first star does not fall from outside but leaves the middle of the screen, where it was woken, for the pole; while it arrives the rest of the sky waits in the dark (`skyHush`).

A reset of the store (`asteme.reset` in the plugin) calls `mind.wiped()`: what the running brain still held in its head goes with the store (work that was out, questions waiting, times set, the files it was handed), a `wiped` event is sent, and the page reloads, to the beginning. It does not go stale: it says what happened that day, whatever it is called later. With no name given there is no such memory and no star until something is remembered; nothing in the scene stands for a memory that is not there.

The scene can be seen again from the settings ("See the beginning again"): it plays with the names as they are and saves them if they are changed there. On one that was woken before, the star it was given then falls once more to the place where it is, and no second memory is made. On a store that was in use before there was such a scene (never woken, `born` false in `/api/state`), seeing it is the waking: the memory of it is made then, and a conversation already under way is not greeted as if it were the first moment. While the scene is on, nothing under it answers a press. `?first=1` shows it on any store, and `FIRST=1` starts the preview as a store at its beginning.

### A newer version under a running one

A program goes on running the code it started with. When the files are replaced under it (the plugin updated without the harness being restarted), the page on the disk is newer than the code serving it: it asks for words that code does not have and for things it does not do. So `brain/server.mjs` keeps the page as it was when the code was loaded and serves that copy once the version on the disk is no longer its own, and `/api/state` carries `stale: true`; the page then says that a restart is needed. While the versions agree the file is read at each request, as before.

Inside DSH a full restart is not needed for this: turning the plugin off and on closes Asteme and starts it again with the code on the disk. The browser has to load the panel again to get its new bundle.

The page's language is the one chosen in the settings; failing that, the one whoever shows the page says it is in (`lang` in the address: the panel passes the harness's own language); failing that, the browser's.

### What was said while nobody was looking

`GET /api/unseen` answers `{n, at}`: how many things Asteme has said since the user's own last words that have not been in front of anyone. `POST /api/seen` moves that line (`brain:shown`) whether or not seeing is told to Asteme (`feel.seen`); the marks on single messages are kept only when it is. The page counts what arrives while it is hidden in its title, "(2) Mina". Inside DSH the panel asks through the `unseen` action every fifteen seconds while DSH is showing and lights one star of Asteme's icon in the side bar (nothing is laid over the icon); the conversation tells the panel when it has been seen (`{asteme: "seen"}`), so the mark goes at once. Asking is not counted as the user being there. What already carries a seen mark is never counted, and the page tells that it is being looked at each time it comes into view, with new words or without: a store from before the count was kept would otherwise have shown the mark for good.

Opening Asteme from the side bar leads to the conversation, or, if this screen was told so in the panel's settings (`asteme.arrive` in the browser's own storage), to what is waiting in memory. With something unseen it leads to the conversation either way.

A promised time is kept only while Asteme is running. Where any is kept (`brain:wake`), the plugin starts Asteme four seconds after DSH itself and does not wait for its page to be opened; started twice at once, it is started once.

### The typefaces of this device

"Choose from this device" asks the browser first (`queryLocalFonts`). Where the browser will not say, which is the case inside some desktop shells, `GET /api/fonts` gives the family names read from the font files of the machine Asteme runs on (`brain/fonts.mjs`: only each file's table of names is read), a short list of names common everywhere is added, and the page keeps the ones its own screen draws differently from the three it would fall back to. So a name is offered only where it can be drawn, and a list read on one machine promises nothing to another. Each is listed written in itself.

### Feeling

`{act: "react", emoji}` puts one pictograph on the message being answered (stored as a `reaction` record, shown as `reaction` on that message). `{act: "express", name}` sends a face the user gave (`POST /api/self {addExpression: {name, image}}`, `{dropExpression}`); the reply carries `expression`. `{feel: {react, express}}` in the same place turns each off. `{renameExpression: {from, to}}` calls a face something else. Where the host lends `models.see` (inside DSH, when the model that speaks takes pictures: the picture goes through DSH's `attachments.admitPromptContent`), each face is shown to the model once and `shows` is kept beside its name; `INPUT.expressions` is then `[{name, shows}]`.

### Reading aloud

`can.speak` in `/api/state` is `null`, or `{maker: "deepseek", voices: ["stella", "tide"], same}` when a voice is lent; `same` says whether the model that thinks is DeepSeek's too. The page reads with a lent voice only (the device's own is not used), by `look.voice` (a lent voice's name, or unset: the first lent when `same`, otherwise the user is asked once before any words are sent). `look.aloud` is `"press"`, `"spoke"` (how it starts out) or `"always"`. A lent voice may also be any service of the "audio/speech" kind (`speechVoice` in `brain/voice.mjs`), named in the settings as `voice: { url, model, voices, rate, keyEnv }`; then `maker` is `"service"`, and `same` is true when the address is this computer. When none is lent, `can.speakWhy` says why (`"no-key"`). Inside DSH the lent voice is otherwise DeepSeek's `POST /v1/tools/tts`, sent with the account's token (`x-dsh-auth-token`) when the conversation thinks with the DeepSeek account, otherwise with `DEEPSEEK_API_KEY` from DSH's credentials (`plugin/voice.mjs`). The secret is asked for at each reading and kept nowhere.

### The microphone inside DSH

DSH on the desktop gives the microphone to its own window (`dsh-app://app`) and to no frame inside it. So inside DSH the page does not record: it asks the panel around it, and the panel (`client/talk.jsx`) records in DSH's window. Messages go by `postMessage`, each `{asteme: "mic", ...}`; the panel accepts them only from the door's origin, the page only from its parent.

| From | Message | Meaning |
|---|---|---|
| page | `do: "start"` | begin; the panel answers `state: "asked"` at once, then `"on"` (with `rate`) or `"refused"` |
| panel | `state: "level", level` | the measured level, about twelve times a second |
| page | `do: "stop"` | end and hand over; the panel answers `state: "done", rate, pcm` (mono Float32 samples, transferred) |
| page | `do: "cancel"` | end and throw away; the panel answers `state: "cancelled"` |

The page turns the samples into the 16 kHz WAV and posts it to `/api/hear` itself, as it does when it records for itself. A panel that does not answer within a second and a half is an older one, and the page tries to record for itself. The panel ends a recording on its own after 130 seconds or when it is taken down.

## Stages

1. **The conversation.** Done: one thread, memory inside the same call, the page.
2. **Hands.** Done for one kind of door (ACP), used with DSH. Next: resume a worker's session after a restart (DSH supports `session/resume`), more than one folder per worker, a worker's strengths learned from how its work turned out.
3. **Time.** Done: intentions, quiet moments, sleep, the gap after being off. Next: sensors.
4. **Tools with only a screen.** Through a worker with a browser. Nothing to build here.

Not done, and known: the panel (Review, Memory, Charter, Settings) is not mounted beside the conversation yet, so correcting a memory still happens in words or in the DSH panel; the conversation is one thread with no search; there is no way to attach a file; replies arrive whole, not as they are written; the store is shared with nothing (a DSH plugin store and a brain store are two memories until one is imported into the other).

## Running it

```
~/.asteme/brain.json
{ "model": { "url": "https://api.deepseek.com/v1", "name": "deepseek-chat", "keyEnv": "DEEPSEEK_API_KEY" },
  "workers": { "dsh": { "command": "dsh", "args": ["acp"], "about": "A coding agent on this computer", "cwd": "C:/work" } } }

npm install        # the embedding model's library
npm run brain      # prints the address to open
```

A key is never written in the file: `keyEnv` names the environment variable that holds it. The page answers only to this computer and only with the token in the printed address.
