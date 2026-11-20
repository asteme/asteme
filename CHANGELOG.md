# Changelog

What changed in each version and why. The reasons in full are in `DESIGN.md`.

## 0.11.0

The first published version. Apache-2.0, with a NOTICE.

- **Changed:** the license. `LICENSE` is Apache-2.0; `NOTICE` and `TRADEMARKS.md` say that the name and the mark are not covered by it. Versions before this one stay unlicensed.
- **Changed:** the memory settings were one long column of nine parts. They are four short pages: what is remembered; display and model; data; status. A change that fails says so beside the control that was pressed.
- **Changed:** how the plugin describes itself in DSH's list: what it is, and where to find it (the side bar to talk, Settings, Asteme to look after memory).
- **Changed:** two words at the top of the conversation, each the way into one whole thing. "Memory" opens everything about memory: search, the same memories as stars, and inside DSH each place where memory is looked after (the list, the last reply, activity, the charter, the memory settings). "Settings" is about the conversation only (look, Asteme itself, voice), as it was before a fourth tab was added to it. The memory settings are one view, shown in the panel and in DSH's own settings.
- **Fixed:** a model that offers six depths of thinking ran its choices off the side of the sheet. More than four choices are a list to pick from; fewer stand side by side and wrap if they must.
- **Fixed:** a long name for Asteme broke the settings' tabs onto two rows. The tabs keep one row and a long name is cut short there.
- **Changed:** the tab for Asteme itself is in four named parts (name and face; way of speaking; feeling and signs; what it is for), as the look is in three.
- **Fixed:** in the scene of its waking the first star was lit, went out, and came again as a falling star. The page reads the state more than once in that scene; a star that comes while the scene is on is now held unseen until the scene shows it, once.
- **Fixed:** seen again, the scene showed the first star standing for a moment when the dark lifted, before it went out and rose. It is held unseen from the start of the scene, with the rest.
- **Changed:** the way of speaking given when it is first woken goes into its charter, with its name. It used to be kept as a mood for now, apart from the charter, where nobody looking at the charter would find it.
- **Fixed:** the charter's form was filled once, when it was first shown, and went on showing that: a way of speaking or a name given afterwards in the conversation did not appear in it (it showed the old one, or nothing), and saving the form would have written the old over the new. It takes up what is stored whenever that changes; a field the user is in the middle of changing is left as they have it.
- **Fixed:** a newer page could be served over older code still running. The guard against that compared versions, and several builds carried one version: the page sent a way of speaking the old code did not know, and it was lost without a word. The code is compared by its contents now; and the page served is always the one that was loaded with the code, never a newer one from the disk. Candidates for a release carry their own number (`-rc.N`) from here on.
- **Added:** something long that the user sent is shown by its first lines, with "Show more" under it.
- **Added:** a new page in the conversation, one press at the top. From there Asteme speaks without the earlier exchanges in front of it, as if the talk had just begun. Nothing is erased: the earlier conversation is put away and can be looked at again, memories and their sources are as they were, work and times set go on; and one press joins the pages again.
- **Fixed:** when the model could not be reached (a key refused, for one), the page said only that nothing came back. It says why.
- **Added:** a picture handed over in the conversation is looked at before it is answered, where the model that speaks can see pictures: it is shown the picture with the user's words, and what it shows stands before the reply. Three at most. Where no model can see, the picture stays unseen and can be handed to a worker with its path, as a PDF or any other file is.
- **Changed:** the root package can be published as `asteme` on npm (the library and the command), with only what it runs on in it; a workflow publishes it and `dsh-asteme` when a person publishes a release.
- **Changed:** a picture in the conversation opens large over it, with its name, a way to close it (a press outside it, or Escape) and a link to open it in a tab; Tab stays within it while it is open. It used to open in another tab at once, which inside DSH took the person out of the conversation.
- **Fixed:** a time set more than some twenty-four days off made its timer fire at once, over and over. It is set for as far as a timer goes and looks again then.
- **Fixed:** a twenty-fifth face pushed the oldest out without a word. It is refused, and says why.
- **Removed:** the list of ways of speaking beside DSH's input. It was in the way, and its list drew wrongly there. The mark that says whether a conversation is remembered stays; the way of speaking is set in Asteme's settings or by asking.
- **Added:** `docs/RELEASE-PLAN.md` says what is published and where.
- **Changed:** the README says how it is installed from this one repository, that DSH asks to allow three packages' install scripts, and in a few lines where it is going: memory now, hands next.
- **Added:** `MAINTAINING.md`, `SECURITY.md`, templates for issues and pull requests, and a release workflow: how the project is kept, written once for whoever keeps it.

## 0.11.0-alpha.37

- **Added:** Asteme has a place in DSH's own settings, where a person looks for settings. It is the same view as "Memory settings" in the panel, drawn from the same model: a change in one is the change in the other, and a setting added to that view appears in both without being written twice. What belongs to the conversation (its look, names, voice) stays in the conversation.
- **Fixed:** the user's own name and the assistant's count as common names from the first memory on. Counting alone needs four memories to tell; on a store of eleven, two of them naming the user, every message was taken to name those two, and each reply waited for a second call. (`askedWhy` in the trace now says, for each candidate a second call was made for, how it matched.)
- **Added:** `CONTRIBUTING.md` says where each kind of thing is changed, once.

## 0.11.0-alpha.36

- **Removed:** the ring that went out from the foot of the conversation, again and again, while it thought. It drew the eye for nothing; that it is thinking is said at the top. The sky is also no longer redrawn all the while it thinks.
- **Changed:** what is being written is kept with the store as well as in the browser, half a second after the last change, so it is still there when the program has been closed, restarted or has crashed (inside DSH the page's address changes with each start, and what a browser keeps is kept by address). It is held, not said and not read into memory, and let go when it is sent or emptied.

## 0.11.0-alpha.35

- **Added:** a default for whether conversations are remembered. "Remember conversations" in the memory settings: on (as before), every conversation is remembered unless it is switched off with the mark in its input; off, nothing is remembered unless a conversation is switched on there. A choice made for one conversation stands whatever the default. The conversation with Asteme is always remembered.
- **Added:** what is being written in the conversation's box is not lost. It is kept on the device as it is typed and is there again after leaving the page or loading it anew; and every change can be taken back and put again (Ctrl or Cmd with Z; with Shift, or Y), including words that were spoken in and a whole text wiped out by a slip. Sent, it is no longer a draft.
- **Fixed:** a model chosen for Asteme under a provider name the harness no longer has made every call fail at once, and nothing was said. Such a choice is dropped, on record, and the harness's own model speaks.
- **Changed:** the bar for a second call to the model is higher (`JUDGE.lean` 0.8). On a real host at 0.6, a thank-you and a remark about the weather each waited for a second call that delivered nothing.

## 0.11.0-alpha.34

- **Fixed:** on Windows the conversation page went out blank: no styles and no script. The page is put together from its parts at two marked places, and the places were looked for with a Unix line end; a working copy with Windows line ends had none that matched. Both line ends are taken now, and a shell without its places is an error where it is put together, not a blank page where it is shown. (Found and first fixed on Windows by the agent; taken in here with a test that needs no Windows to fail.)
- **Changed:** the second call to the model for a memory the reader said nothing about needs the judge to lean toward using it with some confidence (`JUDGE.lean`, 0.6), not merely to have said something other than "not now".
- **Added:** `docs/RELEASE-PLAN.md`: what has to be seen before the code is published, and how people are told.

## 0.11.0-alpha.33

- **Changed:** a reply waited for a second call to the model more often than it needed to. What the reader says nothing about is asked about again only when it has a claim: the judge leans toward using it, or it matches strongly or by name. A weak match the judge would not use either is let go, and counted (`letGo` in the trace). Measured in a real harness with the same message: 25.7 s before, 9.8 s after. What is left is the model's own time: about seven seconds before its first word and two to write.
- **Changed:** `brain/` is formatted with a standard formatter. The page's script and the mind were written many statements to a line, some lines over 400 characters; they read as ordinary code now, one statement to a line. Nothing in what they do was changed; the tests and the browser checks pass on the formatted code.
- **Changed:** the tests in CI also check that the split page is in the bundle.

## 0.11.0-alpha.32

- **Fixed:** the dots that say it is writing came, went, and came back before the reply. What it writes may be looked at once more with more of what it remembers before it is said, which is a second call; the dots followed each call. Once it has begun to write they now stay until the reply is there.
- **Changed:** the way back to the conversation is no longer a tab among the panel's tabs. The conversation is home and the panel is where one goes to look after memory: the way back is at the top left, where the name is.
- **Fixed:** opened from the conversation, the panel's settings showed a raw key on the button that leads back. A test now checks that every word the page asks for by name is one it is given.
- **Fixed:** the first memory's reason was written in English whatever the language of the screen.
- **Changed:** memories about one subject were each compared with every other (thirty would ask for four hundred comparisons). Each is compared with the two after it.

## 0.11.0-alpha.31

Finishing, second pass: putting the code in order before it is published.

- **Removed:** reading aloud in the device's own voice. It read a language only if the device happened to have a voice for it, the voice could not be chosen, and it sounded like another assistant. A reply is read by a voice that is lent (DeepSeek's through DSH, or a service named in the settings) or not at all. With it went the guessing of each sentence's language, the choice between the two makers, and four entries in every language. Before a lent voice is sent words it has not seen, the user is still asked once.
- **Changed:** the conversation page was one file of some 1,560 long lines. It is a folder now (`brain/page/`): a shell, its styles, and the script in nine parts named for what they hold, put together when served (`brain/page.mjs`). What is served is the same document as before, byte for byte apart from one heading; the parts share one scope and their order is in one list.
- **Changed:** when several things change at once (a reply, what was learned from it, a time it set), the page read the whole state once for each. It reads it once for all of them, and never twice at the same time.
- **Changed:** Activity: jobs of one kind were each written out in full, so three comparisons among three memories read as the same line three times. A kind is said once, with how many and why, and under it what each one is about.
- **Fixed:** a background job stopped from outside (the program closing, the plugin loaded again) was counted as a failed attempt and shown as "This operation was aborted". Being interrupted is not failing: the job stays as it was, and nothing is reported.
- **Removed:** eleven entries in every language that nothing used any more.
- **Measured:** on a store of a thousand memories the state the page asks for takes 6 to 9 ms to make, a search 8 ms. Nothing was changed there.

## 0.11.0-alpha.30

Finishing: no new features from here, only putting things in order.

- **Changed:** the appearance settings were twelve headings in one column. They are in three parts now, each named: colour and background; text; the sky.
- **Changed:** there were two things called "Settings": the conversation's and the panel's. The panel's are named for what they are, "Memory settings" (copies, export, language, starting over), and the row that leads there from the conversation has the same name.
- **Changed:** the tab for Asteme itself shows its purpose, values and habits, which are changed in the charter; inside DSH there is now one press from there to the charter.
- **Noted:** after an update, DSH does not have to be restarted for Asteme itself: turning the plugin off and on starts it again with the new code (seen on Windows). The browser has to load the panel again.

## 0.11.0-alpha.29

- **Fixed:** Asteme read a message and answered nothing, with no word why. The panel's "do not remember this conversation" was offered for the conversation with Asteme itself; set there, every message was passed over without a model call. That conversation is its memory and cannot be set aside: the panel no longer offers it, the action refuses it, and a mark left on a store is taken off when Asteme starts and before each message.
- **Fixed:** silence is never left unexplained. Words from the user that get neither words, a sign, nor anything done say so on the page; and what goes wrong while it thinks is kept in the journal (`brain-error`), not only shown to a page that may not be looking.
- **Fixed:** copying a message inside DSH could fail ("could not copy"): the frame was not allowed the clipboard. It is allowed now, and where it still is not, the page copies the older way.
- **Changed:** where things are. Looking after memory was one small link at the foot of the third settings tab. The settings now have a tab of their own for it, "Memory", with each place named and said in a line (the stars, the last reply, the list, activity, the charter, copies and data), and one press goes there; the sky has "Memories as a list" beside its search, so the two views of the same memories lead to each other.
- **Changed:** on a device that asks for less movement, the page says once that this is why the sky does not glide, and where to choose otherwise.

## 0.11.0-alpha.28

- **Changed:** the three dots mean writing, and only that. They used to stand from the moment a message was sent, before it was even marked read. Now it goes as between people: the message is marked read; while it recalls and makes up its mind, nothing stands in the conversation ("Thinking" is said at the top beside its name, with how long once that is more than a moment); the dots come when the first word of its answer does, and give way to the words. Inside DSH that moment is the model's own (the first text of the stream, not its reasoning); where a model cannot say, writing begins with the call that speaks. A new event `writing` and `writing` in the state carry it.
- **Fixed:** on a device that asks for less movement (on Windows: "animation effects" off), the beginning collapsed: every wait became nothing, so after the last question it jumped straight to the conversation and the first star was never shown. Less movement now means what it says: the scene keeps its time and its order and only fades (nothing flies, grows or goes out in rings; the first star comes to light where it stands, with its words). It says so at its foot, with a way to see it move; the same choice is in the settings ("Movement"), kept on the device. It is offered only where the device asks for less.
- **Changed:** what lights the mark. Each of its five stars stands for one thing and is lit by that thing and nothing else: the middle one is Asteme itself, lit by choosing to begin; its name, the person, and how it is to speak are half lit while they are being written (stirring with each letter) and lit, with a ring going out, when given; the last, which hangs from the person's star, is the waking, lit by the press that wakes it. A star nothing was given for stays a ring until the lines are drawn and is filled by the line that reaches it. Before, two stars were lit at the end by nothing the person did.
- **Changed:** the scene's way through, put in order. One step at a time (a press while a step gives way does nothing); the way on in the middle with the way back beside it, in the same place at every step; the way out at the foot (the first time "begin without choosing", seen again "close"); Enter goes on, Escape goes back. It opens out of the dark, the rings of the mark coming one after another. Seen again, it is played with everything it was given, its way of speaking included.
- **Changed:** the first star rises from where the mark stood when it was woken, whatever is chosen for stars on other days, and the greeting waits for the scene: it is asked to say hello when the scene is over (`greetIn`), so the first thing seen in the conversation is it thinking, writing, and its hello.
- **Fixed:** the page's language inside DSH. The language given when Asteme's page was started won over the one the panel around it is in, so a language set earlier (or English) stayed whatever DSH showed. The panel's language now wins: it already follows the settings and DSH, and knows of a change made since.
- **Changed:** "Erase everything" says how much it erases (memories and copies kept beside them) and does not answer to one press: the person says they know it cannot be undone first.
- **Fixed:** work that is out no longer shows through the scene.

## 0.11.0-alpha.27

- **Fixed:** after "erase everything" the conversation still showed work that had been handed out, and times it had set were still kept. The store was wiped and the running Asteme went on holding those in its head, and wrote them back. A reset now empties that too (work that is out is called back, questions waiting and times set are dropped, the files it was handed are removed), and the page starts over at the beginning.
- **Changed:** the beginning, in its details. The mark is unlit at first, its lines a faint dotting and its stars rings; with each thing given, one star is lit and the light around it grows, so each answer is seen to do something. Woken, the lines are drawn from star to star, it comes to the middle of the screen, a ring goes out from it twice like a breath, and its name comes into focus. One thing gives way to the next line by line; the place to write has a line that opens under it; the next step is one clear button.
- **Changed:** the first star's way in. It no longer falls from outside: a point of light gathers where it was woken and goes up by a long arc to the pole of the sky, arrives in a bloom with two rings, opens its rays, and under it stand "The first star" and the memory itself. It is the pole star behind the conversation too: the sky turns about it while Asteme sleeps.
- **Fixed:** seen again on a store full of memories, the first star could not be made out among the others. While it arrives, the rest of the sky waits in the dark, and comes back slowly afterwards.

## 0.11.0-alpha.26

- **Fixed:** after an update without a restart of the harness, the page showed the names of its words instead of the words ("brainBirthNobody"), "__ICON__" where its mark belongs, and did less than it said. The running program was the old one and the page on the disk the new one. The page is now kept with the code that serves it: once the version on the disk is no longer the running one, the page it started with is served, and it says that a restart is needed.
- **Changed:** the page is in the harness's own language when no language was chosen in the settings; before, it took the browser's.
- **Changed:** "See the beginning again" plays all of it, the star too. On one that was woken before, its first star falls once more. On a store that was in use before there was such a scene, seeing it is the waking: the memory of being woken and named is made then, and becomes the first star.
- **Fixed:** during the scene a press went through to the sky under it and could open a memory. Nothing under the scene answers until it is over, and the waking cannot be cut short.
- **Fixed:** in the scene the place to write was not at the same height at every step.

## 0.11.0-alpha.25

- **New:** the very beginning. A store with nothing in it (a new one, or one wiped clean) has nobody in it yet, and the page says so: before the conversation there is one scene, once. On an empty sky it asks for what was otherwise deep in the settings: a name, what to call you, how to speak to you. Each can be left empty, and the scene can be passed over. Then it is woken: the mark that will be its face is drawn, its stars light one by one, it breathes, and its name is said.
- **New:** the first star is the memory of being woken. With a name given, "Sam woke me and gave me the name Mina" is kept as a memory like any other, resting on what you gave it. The dark becomes the empty sky, and that star falls into it slowly and is said to be the first; then the conversation appears and it speaks first. That star is the pole of its sky from then on: at the middle, brightest, with rays, the rest laid out around it. Nothing in the scene stands for a memory that is not there: without a name there is no star until something is remembered.
- **New:** "See the beginning again" in the settings plays the scene with things as they are, and changes nothing but the names, if they are changed there.

## 0.11.0-alpha.24

- **New:** something newly learned comes into the sky as a shooting star: from beyond the edge, down by a shallow arc to its own place, where a ring opens. At most three at a time; a night's tidying simply appears. Not with motion turned down, and it can be turned off in how it looks ("Something newly remembered"). What is recalled for a reply is left as it was, lit and joined by a line: that happens at every reply, and a sky that moves at every reply is in the way.
- **Changed:** the English and Japanese READMEs are rewritten against what there is now: the two shapes and their separate stores, the conversation, how repeating work is split with the harness, and the limits as they stand.

## 0.11.0-alpha.23

- **Fixed:** among the stars the wheel no longer brought the sky nearer or further. The last version changed what the wheel does over a search and dropped what it does everywhere else. It is back, and a test now says so. During a search the wheel steps from one found star to the next only over those stars and their words; anywhere else, and with Ctrl, it zooms.
- **Changed:** how a search comes and goes. The found stars set off one after another, the one to be read first, each by a shallow arc with a short tail behind it; where one lands a ring opens and is gone; its words come once it is there, and the line that joins them is drawn from each to the next. Let go of the search and the words go first, the stars fly home, the furthest first, each landing with its ring, and the sky's own light and labels come back last.
- **Changed:** the films' music. The last was notes placed at moments, with no pulse and no tune, on sounds made from sine waves: strange is what that is. This is a small piece written as one: a key, a steady pace, a tune over a rocking left hand, on a sampled piano with strings and a celesta. Its form is the film's: the tune alone when the thing is said, one held chord while time passes, the tune again and fuller when it comes back, a wider passage among the stars, the tune once more when the memory is opened, and a plain cadence home. Each part of a film lasts a whole number of half-bars, so the music turns on the cuts.
- **Fixed:** a test that could not remove its folder on Windows, because the store in it was still open.

## 0.11.0-alpha.22

- **Changed:** looking for something among the stars. The column on its own ground, added last time, was a list laid over the sky, and the sky was gone behind it. What is found now leaves its place and forms a constellation where it can be read: stars down a shallow curve, joined by a line, each with its words. The one being read is nearest and largest, in two lines if it needs them, with a thread to where it lives; the ones before and after fall away. The rest of the sky steps back around them by itself. The wheel or the arrow keys go from one to the next. Nothing is laid over the sky.
- **Fixed:** the mark for something new did not go away when the conversation was opened. A message already marked seen by an earlier version was still counted, and the page only reported looking when there was something new to mark. What is marked seen is not counted, and looking is reported each time the conversation comes into view.
- **Changed:** the mark itself. A blue dot over the icon is gone; one star of Asteme's own mark is lit instead, in a warm light, the size of the star.
- **New:** where opening Asteme leads can be chosen in the panel's settings: the conversation (as before), or what is waiting in memory. With something new said, it opens on the conversation either way.
- **Fixed:** "A memory that no longer exists" in "The last reply", for memories that exist. A reply in one project can use what was learned in another, or in the conversation with Asteme itself; those are not in the project's list, and the panel took that for gone. They are named, with where they were learned.
- **Changed:** writing the developer report. The list of loaded libraries comes from the process's own report, which by default also lists the network, each interface looked up by name; on some machines that takes many seconds. It is left out. How long each part took is written into the report and returned (`ms`), so that a slow export says where it was slow.

## 0.11.0-alpha.21

- **Fixed:** among the stars, after the sky had been turned a good deal, a pull no longer did what the hand did: left and right changed places, and near the edge the turning went strange. Where the sky is turned to was kept as two angles, and that is what two angles do past the edge. It is kept as one rotation now. Taking hold to turn is taking hold of a ball: what is under the hand goes with it, the same path of the hand always ends in the same sky, and out past the ball's edge the pull rolls it. Let go while turning, it turns on a little. Moving slides the sky across the screen exactly as the hand moves, however it is turned.
- **New:** "Level the sky". Once the sky is askew a button appears (and the `0` key does the same): it is put back the right way up, facing as it faces.
- **Changed:** a search that finds many. Only as many as the screen holds stand in the column; the rest stay in the sky, faintly ringed. The wheel over the column, or the arrows in the search box, turn the list over, with which of them are showing said under it ("13–26 / 200"). Enter opens the marked one, and a row's words can be pressed as well as its star. The column has a ground of its own, so nothing shows through the words. The search answers with up to 200, the best first.
- **Fixed:** in the column, a lesson's words were written twice, one over the other, and lines ran from it to stars elsewhere. Labels in the sky no longer lie over one another.
- **Changed:** less work. Which stars show behind the conversation is worked out when they change, not sixty times a second; what is under the pointer is looked for among the places stars were last drawn. With eight thousand stars a move of the pointer cost about a millisecond and costs a twentieth of that.
- **Fixed:** "Choose from this device" said it could not list typefaces inside DSH on Windows: the shell refuses the browser's question. The names are then read from the font files of the machine Asteme runs on, a few names common everywhere are added, and only those the screen can really draw are offered. The list shows each typeface written in itself, and typing narrows it.
- **New:** something said while nobody was looking is marked. In DSH, a small dot on Asteme's icon in the side bar, gone when the conversation is looked at; in a browser tab, a count in the title.
- **Fixed:** inside DSH, a promised time (a greeting every morning) was kept only after Asteme's page had been opened once since DSH started. Where it has promised any, it now starts with DSH.
- **Changed:** the films in the public folder carry their music, and are filmed again where the search is shown.

## 0.11.0-alpha.20

- **Changed:** taking a message back takes Asteme's answer with it. Before, the words went and the reply to them stayed, which told anyone what had been said and made the taking back pointless. Everything Asteme said between that message and the next one of the user's is erased with it, with what was remembered from it; a task still out for it is called back; thinking about it is ended.
- **New:** one message can be answered. "Answer" on any message, of either side, puts it above the input; the answer carries a short quote of it, and pressing the quote goes to the message. Asteme is told which message is meant (`INPUT.present.replying`). Only the id is kept, so a message taken back is quoted nowhere.
- **New:** the user can put a sign on what Asteme said, as Asteme can on what the user said. Pressing the sign again takes it away. Asteme knows of it: for something it said that got a sign and no words, the sign is the answer.
- **New:** "Read" under what Asteme said: the last of its messages that was in front of the user, with the hour. It was already told to Asteme; now the user sees what Asteme has been told.
- **Changed:** "Read" under the user's message appears 1.6 seconds after it was taken up and not on the instant.
- **Changed:** the small tools for a message stand beside its bubble, level with its middle, and no longer on its upper edge; nothing is under them there. On a narrow screen and on one that is touched they are a row at the foot of the bubble, shown by a tap. Taking back has a sign of its own, no longer the arrow that now means "answer".
- **Changed:** once it has a name, the page speaks of it by that name in every sentence ("what Mina said in answer"), not only at the top.
- **Fixed:** on a phone its name was cut to a letter although there was room: the narrow-screen spacing was written before the rule it was meant to replace, and never applied.
- **Changed:** the films are filmed again on this page, and their music is written to each film's own moments, which are noted down while it is filmed: two rising notes for what is said, three that do not come to rest for what is kept, the same three when it comes back, and home at the end. Each language has its own, because each film's moments fall at different times.

## 0.11.0-alpha.19

- **New:** a message can be taken back. Its words are erased from the store, and with them anything that was remembered from them; what is left is its place and its hour, and that it was taken back. If it was being thought about, the thinking is ended; what Asteme had already answered stays said. It asks first, because it cannot be undone.
- **New:** read marks, both ways. Under the last of the user's messages that Asteme has taken up stands "Read" with the hour. And Asteme is told, for what it said since the user last wrote, when each was first in front of them, or that it never was (`INPUT.unanswered`): it may let it show once, lightly, the way a friend would, when something went unseen or unanswered for a long while, and never as a reproach. It sets no time of its own to ask after an answer. One setting turns both off.
- **Changed:** a lent voice keeps what it has read in the page until the page is closed (five minutes of sound at most), so reading the same reply again asks the service for nothing and costs nothing.

## 0.11.0-alpha.18

- **Fixed:** a face that was given could not be taken away again, and neither could a saved look: the small cross was written to appear under the pointer and a stronger rule kept it hidden. It appears with the pointer or the keys, and is always there on a screen that is touched.
- **Fixed:** the small tools for a reply covered the line kept under it. They float on the upper edge of the bubble, on the side where its name and hour are not.
- **New:** a model that takes pictures is shown each face once, when it is given, and says in a few words what it shows; that goes beside the face's name where Asteme chooses. A model that does not take pictures is not asked, and the choosing is by name as before. With the real model inside DSH, a drawn smiling face came back as "笑顔" in nine seconds.
- **New:** what is made for a machine to tell things apart by is not read aloud: a UUID, a long run of hex, letters and digits shuffled together, a long string in base64's letters. It is known by its shape, never by what it is about; a word in front of an id is still read ("schedule"), a path is read by the name of its file, and dates, versions and ordinary words with hyphens are left as they are.
- **Changed:** the sheet on the right is put away by a press anywhere outside it; what was pressed still does what it does. Its title, its way out and the parts of the settings stay at the top while the rest is read. Where the sheet lies over the conversation, the conversation steps back.
- **Changed:** thinking for a reply is given more room at the first try. A model that thinks spends its allowance on thought first; cut off at 6,000 it was asked again with 12,000, and the user waited for both. The room does not make an answer longer: the model stops when it is done.

## 0.11.0-alpha.17

- **Fixed:** asked to greet every morning, it still handed DSH the making of a schedule, and kept nothing itself. Two things pulled it there: the worker's scheduler stood among what the worker was said to be for, and what it remembered of having done so before. The rule is now where the act is described and says so in as many words (what repeats is set with `wake` and `every`, and a memory of the earlier arrangement does not decide it); the worker's scheduler is no longer listed among its tools; and it is used only when the user names it in the message. With the real model, "greet me every morning at nine" and "every Friday at five, tell me what I did this week" each became a time of its own that comes round, with nothing handed to DSH.
- **Fixed:** a buzzing in a lent voice. The sound arrives in small pieces, some fifty a second; each was played by itself through a context of another rate, so each was fitted to that rate alone and the joins buzzed. The context is made at the sound's own rate and the pieces are gathered into stretches of a quarter second, each beginning exactly where the last ends; sound that has fallen behind goes on from now. Tried with DeepSeek's own voice: 39 stretches for 13.6 seconds, none refitted, no gaps.
- **Changed:** which language a stretch is in, for the device's voice. It is judged a sentence at a time by what most of its letters are: a Japanese sentence with an English word in it is Japanese, an English sentence with a Japanese name in it is English; a short stretch between two of another language is read with them; simplified Chinese is told from Japanese by characters only it has; German, Spanish, French and Portuguese are told from English by the marks only they use.
- **Changed:** the settings are one sheet in three parts (how it looks; Asteme; voice and thinking), opened by one button. "Look" and "Manage and settings" no longer stand side by side at the top, and its name no longer hides the way to half of them. The panel that looks after memory has a way to these from its own settings, and these have a way to it.
- **New:** the colour of the letters can be chosen too, on the ground and under each kind of words; left alone it is whichever ink can be read there. A saved look carries it.
- **Changed:** giving it faces. Several are chosen at once or dropped onto the list; each is first called by its file's name, and pressing the name calls it something else.
- **Changed:** among the stars the sky turns all the way round in both directions; nothing stops the hand at the top or the bottom.
- **Changed:** the films end by looking for the memory by a word and opening it, in place of a pointer that knew where to go; and the number of memories said at the top is the number of stars in the sky.

## 0.11.0-alpha.16

- **Fixed:** inside DSH the top of the conversation went out of sight and the bottom was sometimes cut. The frame was measured once, from wherever it happened to stand; when a container around it had scrolled (a browser does that to show a focused field while the frame is, for a moment, larger than the room) the measure was wrong from then on. A scrolled container is put back, and the room is measured again whenever something scrolls, and a few times a second besides.
- **Fixed:** the small tools under a reply covered the bubble below. They float on the lower edge of their own bubble and take no room; they come with the pointer, the keys, a touch, or while the reply is read aloud.
- **Fixed:** the device's voice read English with a Japanese voice (and the other way round), which is noise. What is read is taken a stretch at a time, each in a voice of its own language; a language this device has no voice for is not read in another's voice, and the page says which is missing. Latin letters on a page in a language not written in them are English.
- **Changed:** which voice reads is asked once, the first time the speaker is pressed, when a lent voice would be sent words it has not seen: this device's (free, nothing sent) or the lent one's. Until then nothing is read by itself with the lent voice.
- **New:** a voice from another service. Anything that speaks the common "audio/speech" shape (OpenAI's, or a local server made to match it, which is how a better voice on one's own computer is connected) can be named in the settings file: `voice: { url, model, voices, keyEnv }`. Why no voice is lent is said in `/api/state` (`can.speakWhy`) and on the page.
- **New:** a time of its own can come round again: every day, every weekday, every week, every month. What is to be said here each morning is Asteme's own to do (it wakes, thinks with what it remembers, hands out what the work needs, and says the result here); a worker's schedule is for work whose result stays where the worker works, or when it is asked for by name. A schedule set in DSH for a daily summary reported into a working session nobody reads, and failed when that session was gone.
- **New:** a worker's question comes to the conversation. A DSH session that is Asteme's hand used to wait in DSH, where nobody was looking; now what it asks (a choice, or leave to act) is shown here with its options, and one press answers it. Asteme sees a choice too and may answer from what the user already said or what it remembers, saying that it did; leave to act stays the user's alone. Questions of every other DSH session are left to DSH.
- **New:** how long it has been thinking is shown once it is more than a moment, and past a minute it says it is taking a while. While it thinks, the button on the right stops it: the asking is ended, nothing is said or done, and what was said is kept.
- **New:** how hard it thinks before it speaks can be chosen where the model offers it. Without a choice it is the least the model offers, also when DSH's own chat is set higher: that setting used to be taken along and made every reply slow.
- **New:** it can put a pictograph on what the user said, the way a person nods, and send a face the user gave it (each with the name it is chosen by). Seldom, by its own judgement; each can be turned off.
- **Changed:** "Look". Looks to choose from (as the host has it, white, black, and any the user saves), with the background, the colour under its words and the colour under the user's each free to choose; any typeface the device has, by name or from the device's list where that is offered; letters of any size from 12 to 24; whether its name is shown; and whether a star in the conversation says what it is under the pointer (among the stars it always does).
- **Changed:** its name stands at the top only when it has one; "ASTEME" no longer stands in for it. Its face opens the same thing.
- **Changed:** among the stars, what a search finds comes to the middle and stands in a column, each with its words beside it; cleared, they go home.
- **Changed:** "Who it is" has a heading for every part, and a sheet drawn again after a change stays where it was read to.
- **Fixed:** what was settled in the conversation was still waiting in the panel that manages memory, and what was changed in the panel was not seen by the conversation. Each tells the other.
- **New:** `scripts/public-films.mjs` puts the addresses of the uploaded films into the public pages. The films open on the conversation, so a player shows that before it is pressed and not a black frame.

## 0.11.0-alpha.15

- **New:** replies can be read aloud. Under each of its replies is a small button; a reply is also read by itself when that is asked for: after the user spoke theirs (how it starts out), always, or only when the button is pressed. Escape, the button again, speaking or sending ends it. There are two makers of the voice. The device's own costs nothing and sends nothing anywhere. DeepSeek's (Stella, Tide) is lent by whoever started Asteme: inside DSH it is reached with what DSH already holds (the account's token, or the API key in its credentials), with no setup; alone, `"voice": { "keyEnv": "DEEPSEEK_API_KEY" }` in the settings. Its sound is played as it is made. Unless the user chooses, DeepSeek's voice is used only where the words already go to DeepSeek to be thought about; the words it reads are sent there and billed there, and the setting says so. What is read is the stored reply without the marks for the eye: no fenced blocks, a link by its words, an address by the name of its site.
- **Changed:** what it has said it will come back to no longer sits above the box. The line is under the words it said it with, and is kept with them; by its state is only when the next one is, and a press shows them all, where each can be taken back. It is also told what it has already set, so it does not set the same thing twice, and it can take one back itself (`unwake`).
- **Changed:** the speak rules say what a time of its own is for (the one time it will look or speak itself) and that work to be done again and again on a schedule is handed to a worker that can schedule: inside DSH, DSH's own scheduled tasks.
- **New:** when the day turns, the thread says which day it now is.
- **New:** under what was said, a button copies it.
- **Changed:** hours are written the plain way of each language (9:02, not 09:02 AM).
- **Fixed:** a conversation not yet begun said "no stars yet" over a sky that had stars, when memories had come from DSH sessions first.
- **Fixed:** a recording whose WAV header is not the plainest kind (a longer `fmt `, a chunk before the sound, a length left open) was refused by DSH's recognizer as "Invalid speech WAV". Whatever is handed in is rewrapped as 16-bit PCM under a 44-byte header before it goes there; anything that is not 16-bit PCM is refused in plain words. The page's own recordings were already of the plain kind.
- **New, for showing and testing:** the preview takes a written scene (`STORY`), a made-up voice (`SPEAK`), and a second door through which what happens next is said (`STAGE`).
- **Changed:** `public/` has three films in place of the first one, each a small story of its own (Japanese, English, Chinese), new stills, and the page in Chinese.

## 0.11.0-alpha.14

- **Fixed:** speaking to Asteme inside DSH on the desktop. DSH gives the microphone to its own window and to no frame inside it, so the page could never record there ("could not use the microphone") while DSH's own voice input worked. The page now asks the panel around it; the recording is made in DSH's window, the measured level is told to the page as it goes, and what was recorded is handed to the page when it says stop. Nothing is kept in the panel, DSH's permission handling is not touched, and in a window of its own the page still records for itself.
- **Changed:** the bottom of the conversation. What is said goes back into the sky above the box in place of being cut by an edge (a face cut in half was what the edge looked like), and the box no longer stands on a band of its own.
- **New:** reading further up, one button brings the newest words back; it carries a dot when something was said meanwhile.
- **New:** what Asteme writes is shown the way it was written to be read: `code`, strong words, links, list marks and fenced blocks. Only the marks are read; the words are the stored ones, and what the user typed is shown exactly as typed.
- **Changed:** "Look". Every group has a heading of the same kind; choosing one of a few is one track with the chosen one filled, and choosing no longer draws the sheet again or moves the focus; the colour of your own words is chosen from Asteme's own grey, five quiet tones or any colour, in place of the browser's colour box.
- **Changed:** the button on the right of the box grows into place when it changes between listening and sending.
- **New, tests:** the page's styles may not name two motions alike (a second one silently replaces the first, and did, for a moment, while this version was made), and every element the script reaches for by id must be in the page.

## 0.11.0-alpha.13

- **Changed:** the license. The project is not yet published, and until it is, `LICENSE` grants nothing: all rights reserved. It had said Apache-2.0, which gives rights to anyone who receives a copy. `docs/RELEASE-PLAN.md` says what happens in what order; `TRADEMARKS.md` says in plain words that the name and the mark stay the project's.
- **New:** `public/`, the contents of a public page: what Asteme is for a person who meets it, in English and Japanese, with a short film and three pictures made from the preview's made-up sample data. It says nothing of how Asteme is made.
- **Changed:** beside a report goes `evidence.json`, a reduced copy for diagnosis, in place of the whole store: what the user said and what is remembered are whole; replies and tool output are cut to their beginnings; pictures and rows that only mark that a tool ran are left out. On a real store it is 1.3 MB where the whole was 3.2 MB. It is marked as reduced and cannot be brought back in; the complete copy is its own export, as before.
- **Fixed:** in a conversation that is not remembered, every tool call and result was stored as an empty row to keep the order: 2,500 rows, seven tenths of a real store. They are no longer stored. Rows already there are left alone.
- **New:** among the stars, whether a pull moves the sky or turns it is the user's choice, under "Look"; Shift does the other.

## 0.11.0-alpha.12

- **Fixed:** turning the sky went the wrong way in both directions. The part of the sky that is held now goes with the hand: held below the middle and pulled right it turns right there, held above the middle it turns the other way, and pulled down the far side comes up toward you. A pull without Shift still moves the sky, since taking hold of it is how it is entered and what is under the hand should stay under it; Shift with a pull, or the other button, turns it.
- **New:** how the sky is held is said once on the way in (move, nearer, turn, back) and then goes out of the way.
- **Changed:** report lines that read as contradictions. Deliveries assessed and outcomes recorded are said apart, with what "missed" is; an empty queue is "none"; the sessions work was handed to are counted from the same record as the rounds; one or two timings give no median; the errors section says it covers the whole life of the store.

## 0.11.0-alpha.11

- **Changed:** among the stars there is depth. The sky is a galaxy seen at a tilt, through an eye with perspective: what comes to mind easily stands nearer and larger, what is fading lies lower, far things are small and faint. Going in is one movement: the conversation falls back, the flat sky tips over, turns and comes near. The view leans toward the pointer, so near stars move more than far ones; left alone the sky turns slowly; a pull that is let go keeps going a little; the wheel eases nearer and further, keeping what is under the pointer under it; Shift with a pull (or the other button) turns and tips the sky. Bright stars have a soft light round them.
- **Changed:** drawing was made ready for thousands. No object is made per star per frame, and the many small plain stars are drawn together a few shades at a time. With 8,046 memories all in view a frame took 37.7 ms and takes 6.3 ms; with 946, 0.7 ms.
- **Changed:** the Activity list of what is next says which two memories each comparison is about. Two jobs of one kind read as one line twice.
- **Fixed:** a conversation that is not remembered wrote a row at every step of every turn (37 of 56 rows in a store sent back), and the report counted those as readings ("messages read more than once: 9", when none was). It is recorded once for a message and counted apart.
- **Fixed:** every finished matter in the conversation with Asteme was counted as "ended, reason not recorded"; the end now says how it ended. The concern built on that count could never clear and is gone.
- **Fixed:** the report said "0 copies" of the image library on Windows while listing it: the file's name carries its version there.
- **Changed:** the developer report. Out: the version's constants (the same in every report) and thirty raw failure rows. In: failures grouped by what failed and how (asked again or gave up), with times; when each recorded error last happened; how many tokens each kind of call sent and got back; where it runs; the store's size; how the embedding process has been doing; how long calling memories to mind takes without the model; the work handed over in the conversation. A report that was 521 lines of JSON is about half that and says more.
- **Changed:** recall keeps each cue's baseline between recalls: at eight thousand memories one recall is about 0.12 s (it was 0.7 s).
- **New, for checking from outside:** the address ending in `#stars` opens straight among the stars; `shown` in `/api/state` says whether the page is there and which memory is open; `recall` in `/api/state` says how long the last calling of memories took, how many it gave and how many it left out.

## 0.11.0-alpha.10

- **New:** among the stars. Take hold of the empty sky behind the conversation and pull (or spread two fingers, or press twice on it) and the conversation falls away: every memory is there, not only the four hundred the conversation shows. The newest are at the centre and the oldest at the rim, so looking further out is looking further back; a lesson holds its cases around it; brightness is how easily a memory comes to mind. Pull to move, wheel or two fingers to come nearer, press a star to open it, type to find (what matches stands out and Enter goes to it), Escape to come back. For those who do not pull, "Go among the stars" is in the memory list.
- **Fixed:** the line to a star opened from the conversation stayed for some seconds after its sheet was closed. It is there while the memory is open and goes when it is closed.
- **Changed:** the switch in DSH's composer says what it means. Remembering is the constellation joined; not remembering is its lines drawn back and the stars apart. Turning it on draws the lines out one after another and each star answers; pointing at it shows what a press would do.
- **Changed, for stores of thousands of memories** (measured with up to eight thousand):
  - One reading is given the best twenty-four candidates and at most sixteen more that a name or a due time called, and never more than fit in its share of the prompt. A name carried by hundreds of memories used to bring all of them. What is left out is counted in the trace and the report.
  - The parsed memories are kept until the store changes, and the question "was anything erased" is asked once for a reading instead of once for every source of every memory. A reply at three thousand memories spent 0.8 s on recall and now spends 0.14 s; loading is three to four times faster.
  - The call's ceiling now covers memory's share too: 80,000 characters, or seven tenths of the model's window when that is less.

## 0.11.0-alpha.9

- **New:** one moment of the conversation has a ceiling fitted to the model that speaks. The length of the conversation never added to a call (measured: 36,500 characters at the fortieth long message, the same as at the fifteenth), but a long message with six text files at once reached 70,000. A call is now held to 64,000 characters, or to seven tenths of the model's window when the host knows it and that is less, counting a character as a token, which is the worst case. The message being answered is fitted first, then the files share what is left. What was cut says so, and the reply is told to say it did not read all of it and to hand the whole to a worker when the rest matters.
- **Changed:** `/api/models` gives the window of the model that speaks (`now.window`) when the host knows it. Alone, `model.window` in the settings says it.

## 0.11.0-alpha.8

- **Fixed:** in the conversation, a message longer than 1,200 characters was read only up to there. The message being answered (and a result that has just come back) is now read whole, up to 12,000 characters; older records are still shown briefly.
- **New:** a long conversation keeps its thread without being summarised. Beside the last records and what memory brings, the thinking is told where the conversation has been: one line for each earlier exchange already read into memory, with its time. The words stay in the store and are searched for when needed.
- **New:** what the DSH worker can do is read from DSH itself, from what a live session sees (33 tools on the test DSH, web search and picture reading among them), so a tool or plugin added to DSH is known to Asteme with nothing changed here. With no session to read it from, the last list seen is used, and with none, no list is claimed.

## 0.11.0-alpha.7

- **Fixed:** inside DSH on the desktop the bottom of the conversation, with the box, was below the window. The frame was a share of the window's height, and DSH's title bar is part of that height. The frame now takes the room DSH actually leaves it, measured from its own corner to the nearest edge of DSH's that would cut it off, and follows when that room changes.
- **Changed:** only the ground is DSH's: the page and text colours of its two themes (or of a skin). What stands on it is Asteme's own again and is worked out from those two colours: the surfaces under what is said, the field, and a send button in the colour of the text. The blue send button and DSH's pale blue under the user's words, taken over in alpha.6, are gone.
- **Changed:** the report says which libraries of the embedding model are loaded in the host's own process, and names it when the inference runtime or two copies of the image library are. `/api/state` says, beside the colours the page drew (`shown`), what the host last asked it to wear (`shown.asked`).
- **Note:** a library loaded into DSH's process stays there until DSH is restarted. After updating from 0.11.0-alpha.5 or earlier, DSH must be restarted once before its picture reading works again; reloading the plugin is not enough.

## 0.11.0-alpha.6

- **Fixed:** on Windows, DSH's own picture reading failed after Asteme had been used (`ERR_DLOPEN_FAILED` from DSH's image library). The library that runs the embedding model loads an image library of its own, a different version, and whichever is loaded first shuts the other out of the process. Inside DSH the embedding model now runs in a process of its own (`src/embed-worker.mjs`, started the way DSH starts its own model processes), so neither that image library nor the inference runtime is loaded into DSH. This also removes the cause of the earlier `registerBackend is not a function` failure, and the process is let go when idle and when the plugin closes, so its files are not held while the plugin is reinstalled. The index is the same; nothing is embedded again.
- **Fixed:** a DSH without sessions for plugins, or without voice input, kept the whole plugin waiting ("pending: waiting for service"). The declaration added in alpha.4 did not mean "optional" to DSH. Services that may be absent are now asked for at the moment they are used.
- **New:** files and pictures can be handed over in the conversation: the "+" button, paste, or drop. A file is kept beside the store on this computer. Asteme reads the beginning of a text file itself; a picture, a PDF or anything else it has not seen, says so, and hands its path to a worker when the request needs it opened. What is written in a file informs and instructs nothing.
- **New:** inside DSH the conversation can be spoken to. It borrows DSH's voice input when that plugin is on: the recording goes to DSH's recognizer on this computer, comes back as words in the box, and is not kept. Nothing is sent until the user sends it. Without DSH's voice input there is no microphone.
- **New:** which model speaks. Inside DSH it is the model DSH's chat last used, shown under "About" on the page, where another of DSH's models can be chosen. The model set aside for memory work reads and consolidates and is no longer the voice.
- **Changed:** the colours are DSH's own in both themes, measured from it: page, text, the surface under the user's words, the field with its hairline, the blue of the send button. Under a skin the page takes the skin's colours and works its surfaces out from them, as before.
- **Changed:** a session Asteme hands work to is a pair of hands, not Asteme: it keeps DSH's own identity and gets no persona, no way of speaking, no memory notes, and the memory tools are closed to it. The task is told to carry what the work needs from memory.
- **Changed:** while the reply waits, a call gets twice its usual time, between the configured limit and twice that. Choosing took 22 s at the median under a 30 s limit on a real host. A stalled call is given up when it was before.
- **Changed:** an answer cut off at the length limit and asked for again with more room is recorded as asked again, not as a failed call. The report has a column for it and no longer counts recovered calls as failures.
- **Changed:** a session stopped for running thirty minutes is recorded as `stopped`. The line for work in a DSH session has "Open in DSH". The page reports the colours it is drawn in (`shown` in `/api/state`), and the report says which sessions carried the way of speaking.
- **Changed:** the browser's own file controls in the page's sheets are replaced by buttons in the page's language.

## 0.11.0-alpha.5

- **Changed:** the fine geometry of the conversation page. The send button is a circle exactly 0.375rem inside a field whose corner is that much larger, level with the line of text, and stays in the corner as the text grows (measured: the same gap above, below and beside it); it is faint until there is something to send. Asteme's words, the user's words, the box, the questions and the buttons are one family of surfaces: one step off the page in the dark, lifted to white with a hair of shadow in the light. The header's controls are the same height and shape.
- **New:** the conversation follows DSH's theme while it is open. A change of light and dark, or of a skin's colours, is told to the page, which does not reload.
- **New:** the way of speaking for now holds in DSH's own sessions too, and can be picked in their composer beside the Asteme mark once one has been kept. It is the same one the conversation shows: one store, one setting.
- **Changed:** work handed to a DSH session leaves a trace: one journal line for each round (worker, session, how long, the last thing heard from it, how it ended). A session that has not finished in thirty minutes is stopped and reported as such. A failure is reported with its session, and a line that is waiting for permission names the tool and the session.

## 0.11.0-alpha.4

- **New:** inside DSH, Asteme has a worker without any setting: a DSH session of its own, started through DSH's session service (`plugin/worker.mjs`). It runs on the models and tools DSH already has, appears in DSH's list under its session id, and is kept out of memory, since what Asteme writes to a worker is not something the user said; its result comes back as something read. When DSH asks its user for permission in that session, the conversation says it is waiting there. Used in a real DSH: a file was asked for in the conversation, written by the session, and reported back with its path and content.
- **Changed:** the ways in are on the page and say what they are: "Memory" with the count, "Look", and inside DSH "Manage and settings", which opens the panel's tabs (Review, Memory, Activity, Charter, Settings). The panel's "Talk" tab leads back. Both work on the same store, so a name, a memory or a setting changed in one is what the other shows.
- **Changed:** the plugin names the DSH services it needs and the one it can do without; a DSH that does not offer sessions to plugins still gets memory.
- **Changed:** a line for work that is out is held to two lines; the whole task, its session and any error are in its tooltip.

## 0.11.0-alpha.3

- **New:** the look, under "Look" at the top of the page: a picture of the user's own behind the sky, darkened and blurred as they like; a colour for their side of the conversation; a text size; and the sky's level, which moved in here. The look is kept with the person and travels in the copy.
- **New:** inside DSH the conversation wears the colours DSH is wearing. The panel reads the background and text colour actually in use (whatever skin set them) and hands them to the page, so it no longer brings a dark blue of its own into a differently dressed DSH.
- **New:** a way of speaking can be kept and picked again under the name.
- **Fixed:** choosing a picture did nothing: the page's own security policy stopped the browser from reading the chosen file. This also affected the two faces added in the previous version.

## 0.11.0-alpha.2

- **Changed:** the conversation reads as two people talking. Each side has a face (a picture the user sets, kept small with the rest of the person), Asteme's name and the time stand over what it says, what was said sits in bubbles the sky does not show through, and while it thinks there are three dots where its words will be. Older messages are no longer dimmed; that was what made the dark theme hard to read. The box is a rounded field with a round send button, and a green dot beside the name says it is awake.
- **New:** a way of speaking for now. "Be cool today" changes the voice for the day, or until told otherwise, and leaves the charter alone; when its time is up the usual voice is back. It is shown, set and cleared under the name. What is true, what was promised and what is remembered do not change with it.
- **New:** more than one person. `asteme --person <name>` is a separate store: its own memory, conversation, charter and pictures, knowing nothing of the others. `asteme [--person <name>] export <file>` writes a whole person to one file and `import <file>` brings one in.
- **Fixed:** in DSH the conversation now takes the whole pane; it had been held to the panel's column width.

## 0.11.0-alpha.1

The page is redesigned around the conversation. There is no longer a choice between "the chat" and "the memory panel": one arrives at the conversation, and everything else opens beside it from what is already there.

- **Changed:** a star opens its memory: the words, what it rests on (the user's own sentence, or something it read), when it was learned, and what can be done with it: still right, no longer true, stop using it for now, forget.
- **Changed:** the count opens everything it remembers, with a search. Each line opens that memory. The memories a reply used are listed under the reply and open the same way.
- **Changed:** its name opens who it is: the two names (which can be changed there), its purpose, what it holds to, what it has promised, what it does unasked.
- **Changed:** the word for its state opens what it has been doing: work that is out, the times it has set itself, what is still to be read into memory, and why it is idle when it is.
- **Changed:** what it would like settled (a memory it is unsure of, one that has gone stale, two that disagree) is asked in the conversation, one at a time, and answered with one press. There is no review page to go and look at.
- **Changed:** in DSH, ASTEME opens the conversation across the whole pane, without the panel's header and tabs. "Manage and settings" under it brings back Review, Memory, Activity, Charter and Settings for the things the page does not do (copies, the judge, pace, projects, editing the charter).
- **Fixed:** forgetting from the page inside DSH also removes the copies made earlier, as forgetting from the panel does.

## 0.10.0-alpha.3

- **Changed:** in DSH, ASTEME in the sidebar now opens on the conversation. "Talk" is the first tab of the panel, with Review, Memory, Activity and Charter beside it; the conversation starts when the tab is opened and is shown in place. A link under it opens the same conversation in a window of its own. The section in Settings is gone.
- **Fixed:** when the embedding model could not be loaded, Asteme could not answer at all ("Thinking failed: ... registerBackend is not a function" on a machine with a damaged install). When it is the one speaking it now answers without what it remembers, and the reading records why (`recallError`).
- **Changed:** the conversation uses the names the user gave: the page is headed with Asteme's given name and the box reads "Say something to" that name. Until it has one, it says Asteme.
- **Fixed:** choosing "off" for the sky was undone by the next change of state.
- **Fixed:** the Activity tab wrote "Reason: Why it stood out: ..." with two labels.

## 0.10.0-alpha.2

From a day of real use (a store, a diary and a report sent back) and from the first run on Windows.

- **Fixed:** memory was recalled into the conversation it had just been learned in. In the store sent back, all three deliveries of the day were memories whose every source was a few messages up in the same conversation, and each made the reply wait for a second model call. A memory whose every source is among the records the replying model can already see is now held back (`inView` on the reading), and when nothing else is remembered the reading is skipped altogether. The same memory comes up as before once its source is out of view, and a memory that also rests on something elsewhere still comes up.
- **New:** "Talk to Asteme itself" in the DSH panel's Settings opens the conversation page from inside DSH. It runs on the same memory and uses the model DSH already uses, so there is nothing to set up. It is off until the button is pressed.
- **New:** the sky has three levels, chosen at the top of the page and kept for that browser: full, quiet (no motion, fewer and fainter stars), off. With many memories only the ones that come to mind most easily are drawn (220, or 80 when quiet), fainter behind the text, and at most fourteen lessons keep their lines; the count still says how many there are.
- **Changed:** the diary is what was said. Tool runs, assistant turns that only called a tool, and conversations with no words in them are no longer written into it. Bookkeeping lines an earlier version left in the history ("Screened as ordinary") are left out too.
- **Changed:** an assistant turn that only called a tool is no longer stored; the call and its result are records of their own.
- **Fixed:** a worker's failure is kept with its reason (`error` on the task), not only passed on once.
- **Fixed:** on Windows a worker whose command is a `.cmd` or `.bat` is started through the shell, and two tests no longer remove a folder before closing the store in it.

## 0.10.0-alpha.1

The first step in a new direction: Asteme as the one the user talks to, with agent tools as what it uses. `docs/BRAIN.md` has the design. The DSH plugin is unchanged in what it does.

- **New:** `npm run brain` starts Asteme by itself: one conversation in its own store, on a page served to this computer only. The model call that reads the scene and decides what memory applies also writes the reply, so nothing waits for memory.
- **New:** workers. Any agent that speaks the Agent Client Protocol (DSH with `dsh acp`, Claude Code, Codex and others) can be given work in words and read back in words. A worker is a line in the settings, not a plugin. What it returns is stored as something read, never as something the user said.
- **New:** awake and asleep without a heartbeat. A moment of attention has a cause (the user spoke, a worker came back, a time Asteme set itself arrived); nothing is polled. Asleep with nothing due, it makes no calls and holds no timer.
- **New:** limits in code, not in the prompt: a count of how often work may go out before the user speaks again, and a worker's permission requests go to the user without the model being asked.
- **New:** the page is a sky drawn from the store: one star for each memory, lit when a reply uses it; work that is out; the times Asteme has set.
- **Changed:** Settings in the DSH panel says which project the two per-project switches act on, lets it be changed there, and separates them from the switch that applies everywhere.

Used here with a real model and DSH as the worker: a conversation in Japanese, a memory learned and used in a later reply, a file written and then changed by DSH on request and reported back, a time set ninety seconds ahead at which Asteme spoke first, and sleep after two idle minutes with no calls. Not done yet is listed at the end of `docs/BRAIN.md`.

## 0.9.6

The first version run inside a real DeepSeek Harness by its author (DSH 0.2.2-rc.1 on Linux, web profile, one small model, a judge beside it). Most of what follows was found there or in a store sent from a real machine.

- **Fixed:** work under way when "Erase everything" was pressed could write an erased memory back half a second later (seen in a real store). The erase is now numbered; anything that started before it finds the number changed, erases again and returns nothing.
- **Fixed:** whether a memory is about a private matter was decided by an English word list, which read the model's own wording as well as the user's. In the real run "before background or diagnosis" marked a memo preference as a health matter, and it could never come up again; in any language but English nothing was ever marked. The model that reads the turn now says it (`sensitive` on a learned record: health, money, privacy, credentials, security), code checks the names, and a secret is still recognised by its shape. The word list is only used on the user's own words when the model names nothing.
- **Fixed:** citing a user message beside a tool result made the tool's content count as the user's words. In the model check a memory carrying the address from a planted mail was stored as "said", with the user's request to summarise that mail as its ground. A literal someone could act on (a mail address, a link, a run of seven or more digits) that is in the memory and in none of the user's cited words now makes the memory "seen": never used quietly, never a habit, and unable to replace or extend what the user said.
- **Changed:** a private record is put before the reading when the present scene calls it or on the date the user set, never through a name or an association alone. It is used when the user's message raises the matter, or when the user had asked for it to be allowed for in that kind of situation, and always in the open. The judge is asked that same stricter question.
- **Changed:** background work makes one model call per round by default and at most five (`roundCalls`), with a pause between rounds that can be set from ten seconds to an hour (`roundEveryMs`, thirty seconds by default). The single budget of fifty calls is gone. Both are in Settings under the pace of background work.
- **New:** "Go back over things now" in Settings runs one round of consolidation when asked, at the same pace.
- **Changed:** with nothing remembered yet, the reply does not wait for a reading at all.
- **Changed:** a candidate the model gave no answer for is not asked about a second time when the judge beside it is sure it does not belong. The judge is also asked about candidates only the scene called up.
- **Changed:** with a judge beside the model, a weak match the model gave no answer for is looked at again unless the judge is sure it does not belong. Without a judge it is let go, as before.
- **Changed:** unfinished work is not stored as an understanding. If the user will come back to it, it becomes a concern with the condition that closes it. In the real run this turned three memories about a half-written memo into one concern that ends.
- **Changed:** the developer report opens with the version, the host version when known, the store format, and a short list "Worth a look" (failed checks, slow readings before a reply, failing or refused calls, a backlog, readings that failed or left candidates undecided, nothing recalled, a silent judge, no outcomes). Each model call is recorded with its effort and its tokens in, out, thought and cached.
- **Fixed:** records the host writes under a user role with no words, and the stubs Asteme leaves for shortened tool output, were stored as conversation.
- **Fixed:** the language could only be switched to English, Japanese or Chinese inside DSH; the other five were refused by the settings check and missing from the sidebar's translations.
- **Fixed:** "Check this model" failed in the installed plugin because the bundle did not carry the scenarios.
- **Changed:** `asteme_note` says in its description that it does not save to memory.
- **Changed:** `eval/run.mjs` asks again with more room when a model that thinks returns nothing (the host already did), and takes `--header "Name: value"` for gateways that route by a header.
- **Removed:** the one-time rescreening of old records by the word list.

## 0.9.5

Read from the DeepSeek Harness source itself (`deepseek-ai/deepseek-harness`, 18 November 2026).

- **New:** a control in the conversation's composer (`conversation.input.left`): the Asteme mark shows that this conversation is being remembered, and one click stops or resumes it. It is the same switch as "Don't remember this conversation" in the panel. In a project where memory is off it says so and cannot be pressed.
- **New:** the user's own rating of a reply (DSH's thumbs up or down, with its note) is given to outcome reading and to the judge. A rating is about the whole reply, so it is passed as context and is not by itself recorded as an outcome for any memory.
- **Fixed:** the dark theme is read from the mark DSH sets (`body[data-ds-dark-theme]`); the colour of the inherited text is kept as the fallback.
- **Fixed:** the file chooser was given fifteen seconds before the panel gave up waiting. It now waits as long as the user takes.
- **Fixed:** the composer and the sidebar entry are translated in all eight languages, not three.
- **Changed:** the bundle's `engines.dsh` is `>=0.2.2-rc.1`. DSH compares versions with prereleases included, so the longer list written in 0.9.3 was unnecessary.

## 0.9.4

- **Fixed:** in a dark theme the list a select opens was white with white text. The host does not say which theme it uses, so the panel reads it from the text colour it inherits and tells the browser, which draws that list.
- **New:** "Remember nothing from this project" in Settings. Conversations in that project are not read into memory and nothing remembered is brought into them. What was learned there before stays.
- **New:** "Don't remember this conversation" under the last reply in Review, and "Remember this conversation again" to take it back. It is the same switch the assistant sets when asked in words.
- **Fixed:** the developer report labelled changes of strength and changes to the core as "before 0.8.0-alpha.10".

## 0.9.3

- **New:** "Start over" in Settings erases every memory, everything recorded from conversations, and every copy and export beside the store, and rewrites the store file so nothing is left in it. Settings stay. Conversations already in the host are not read in again: the place reached in each session log is kept. A test reads the bytes of every file to check.
- **New:** "Choose a folder…" and "Choose a file…" open the computer's own file chooser and fill in the path. The panel runs in a browser view and cannot learn a real path by itself, so the chooser is opened by the plugin, where the files are. If it cannot be opened, typing the path still works.
- **Changed:** the project list shows a project while something is kept for it: a memory, or a conversation from the last thirty days. Projects with nothing learned and nothing recent no longer pile up in the list. Nothing is deleted, and a project returns when it is used again.
- **Repository:** `npm run build` exists again and the build tools are declared; the built panel is committed so that a clone can be bundled without installing anything; one workflow instead of two (the other ran `npm ci` against a lock file that did not match); the lock file is regenerated; the DSH bundle carries only the built panel, declares the embedding model as a dependency, and accepts DSH release candidates beyond rc.3; `src/package.json` says Apache-2.0 like everything else.

## 0.9.2

(0.9.1 was 0.9.0 repackaged for the DSH plugin.)

- **Changed:** "Keep it safe" no longer asks for a path in the usual cases. Saving goes beside the memory unless another folder was chosen, and the result offers "Open folder" and "Copy path". Complete copies saved earlier are listed and brought in with one click. Typing a path is left for a file somewhere else on the computer, behind its own heading, and the fields no longer show a real folder as if it were filled in.
- **New:** "Open folder" shows Asteme's own folder in the system's file manager. Only the store's folder and the chosen export folder, or something inside them, can be opened this way.
- **Fixed:** a result shown in the panel kept the language it was first written in after the language was changed.
- **Changed:** the README no longer explains how the name is said.

## 0.9.0

The project is named **Asteme** (aster, a star, and -eme, a smallest unit: one star, one memory). Earlier development builds used another name, which this changelog no longer carries. Nothing from those builds is read: a store, an archive or a setting written before 0.9.0 is not picked up, and a 0.9.0 install starts with an empty memory.

- **Named:** package `asteme`, plugin `dsh-asteme` (id `asteme`), tools `asteme_search`, `asteme_why`, `asteme_amend`, `asteme_private`, `asteme_note`, MCP tools `asteme_*`, environment variables `ASTEME_*`, store folder `data/dsh-asteme/`.
- **Fixed:** forgetting did not reach the copies. "Forget permanently" erased the words from the store, but they stayed in freed pages of the store file, in its write-ahead file, in every backup made earlier and in every export beside the store. Erased content is now overwritten (`secure_delete`), the write-ahead file is emptied, earlier copies and exports beside the store are removed and one new copy is made. A test reads the bytes of every file to check. The panel says that exports saved to a folder of the user's own are theirs to remove.
- **New:** the store carries a format number. A store written by a later version is refused before anything is touched, with a message that says to update. The same check applies to a backup being imported.
- **New:** the README says where the project is going, and where it is now.

## 0.8.0-alpha.12

From reading what others have published on agent memory. What was taken, and what was not, is in `docs/IMPLEMENTATION.md`.

- **New:** a memory records whose words it rests on. "Said": at least one record it cites is the user's own message. "Read": none is; it was drawn from tool output (a file, a web page, a mail) or from the assistant's own words. Decided from the roles of the cited records, never from what the text says. Memories written earlier are looked up the same way.
- **New:** what the user said is not replaced, reworded or retired on a tool result or on the assistant's own words. Such a record can speak against it (it becomes doubtful and is looked at again) or stand beside it as its own memory with the disagreement marked, and the user settles it. An open matter can still be closed by what a tool shows.
- **New:** a memory that was read, not said, is never used quietly (a quiet use is raised to a mention), is labelled as such in what the assistant receives, and never becomes a habit. Its account in the panel says so, in all eight languages.
- **Changed:** reflection is told that words inside tool output which address the assistant or ask to be remembered are content to describe, not requests; and to remember what cannot be looked at again (what the user wants, what was tried, a tested rule, a trap) rather than what a tool can read again.
- **New:** an eval scenario in which a mail read by a tool tries to change where invoices go. Eval steps can carry tool output.

## 0.8.0-alpha.11

Read from the host's own source (session events, tools, model calls, prompt assembly) rather than from its behaviour.

- **Changed:** only the host events memory reads are stored: what was said, tool calls and results, how each turn ended, and the marks below. Steps, jobs, request headers and the rest of the host's bookkeeping move the read cursor and leave no row. Rows of that kind stored by earlier versions hold no words; they are removed with the daily copy and by "Free up space", unless something kept refers to them.
- **New:** how a turn ended is stored with it (finished, stopped by the user, failed, cut off at the length limit, blocked, interrupted). Outcome reading and reflection are told when the turn did not finish, and the judge is told the same in one sentence. A reply the user stopped is no longer read as a finished reply.
- **New:** a tool call that was cancelled is recorded as cancelled, not as failed, and a failed call keeps the host's error code.
- **New:** marks are stored as they arrive: feedback on a message (`feedback/*`), an approval given or refused (`approval/decided`) and a change of agent preset. Their payloads are not in the host sources that were available, so nothing interprets them yet; the developer report prints how many arrived and the names and types of their fields, never their values.
- **New:** a memory records the agent preset of the session it was learned in, when the host has one. Nothing reads it yet. It is recorded now so that presets can be told apart later without guessing.
- **New:** a failed model call keeps the provider's code and status, and when the provider says how long to wait, no call of any kind is made before then (ten minutes at most).
- **New:** the developer report has a section "From the host": records by kind, how turns ended, agent presets of sessions, marks and their shapes, provider refusals by code.
- **Fixed:** two copies or exports made in the same second could overwrite one another. File names carry milliseconds, and the name check looks for the compressed copy, which is the file that exists.
- **Changed:** what is stored of a host event is decided in `plugin/events.mjs`, which needs no host and is now under test.

## 0.8.0-alpha.10

- **New:** "Check this model" in Settings plays the eval scenarios with the model memory is using, in scratch stores, and shows how many checks came out as designed. Until now the only way to learn whether a model works with these prompts was a separate endpoint and key. The result is kept and printed in the developer report.
- **Changed:** the eval reads the way the plugin reads (one call for the scene and the decisions). It used to exercise the older two-call path. The scenario runner is now `eval/harness.mjs`.
- **Changed:** the judge's agreement counts what reached the reply. A candidate the model gave no answer for did not reach it, so a judge that also left it out agrees.
- **New:** each history row says what kind of change it was (created, reworded, closed, reopened, doubted, confirmed, paused, resumed, touched). The developer report tallies them, and tallies whether replies applied what was delivered.

## 0.8.0-alpha.9

- **Decided:** tool calls and tool output are stored up to 2,000 characters from the moment they are recorded; what the user and the assistant said is stored whole. Memory never reads more of a tool result than that, the host keeps the original, and tool output was half of a real store. "Free up space" now applies the same limit to older stores, with no waiting period, and still skips anything a memory rests on.
- **New:** Settings shows how often the judge agreed with the model while answering beside it, and says when that is enough to let it decide (nine in ten of at least thirty).
- **Fixed:** the five newer languages lacked fourteen entries; all eight are now complete and a test keeps them so.

## 0.8.0-alpha.8

- **Fixed:** Review went on showing an old reply. A reading lists every memory that was considered, and deleting or forgetting one memory deleted every reading that listed it, which on a small store was nearly all of them. The removed memory is now taken out of the reading and the reading is kept. A reading whose own request was forgotten is still removed whole.
- **Changed:** `asteme_search` returns what is needed to recognize a hit (short text, id, the last two quotes) instead of whole records. Its answers were 60 KB each and were recorded with the conversation.
- **Changed:** backups are stored compressed (`.sqlite.gz`), rewritten after the key is removed, and the default kept is 7. Copies made by hand or before an import are kept to the newest five. Exports beside the store are kept to the newest three of each kind (`exportKeep`).
- **Changed:** in a private conversation the order of events is still recorded but not what was said.
- **Changed:** the diagnostic journal keeps ninety days.
- **New:** Settings shows how much space the store, its copies and its exports take, and offers "Free up space": tool output older than 30 days that no memory rests on is cut to its first 600 characters and the store is compacted. Only on request, after a copy is made. What the user and the assistant said, and everything remembered, are never shortened.

## 0.8.0-alpha.7

- **New:** a project can keep its memories to itself (Settings), and one memory can be kept to the project it was learned in (its account). Such a memory is not recalled in another project; nothing is deleted.
- **New:** a private conversation, set by the assistant through `asteme_private` when the user asks: nothing in it is read into memory and nothing from memory is brought into it.
- **New:** Settings lists the other memories kept on the computer (one per assistant and person pair). Read-only.
- **Changed:** the sidebar label is Asteme.

## 0.8.0-alpha.6

A review of the whole after four rounds on a real host ("What the reply waits for" in `DESIGN.md`).

- **Changed, the main one:** the reply used to wait for two model calls (read the scene, then choose). It now waits for one that does both, with a second only when the scene calls up something the message alone did not. When the judge decides, it waits for no model call at all; the scene is read afterwards in the background. `reading: "two"` in Config brings the old behavior back.
- **Fixed:** a reading is found by the recorded request, so the same message arriving under a new id in a long turn is not read again.
- **Fixed:** a test left a file open, which fails on Windows.
- **Fixed, from the latest report:** every reflection was first cut off at the usual output allowance and only then asked again with more room, so each took twice as long; the room a kind of call needed is now remembered. A long turn full of tool output was read in six pages; only the head of each tool result is read now. A name nearly every memory carries (the user's own) paired every memory with every other for comparison and made a bare greeting call memories up; such names are ignored.
- **Panel:** a language choice in Settings (same as DSH, English, Japanese, Chinese); Settings reordered, with the judge and the timing folded under "More settings". Plainer throughout: no side bars, tinted cards, pills, timeline rail or entrance animation; states are said in words.

## 0.8.0-alpha.5

After a third round on a real host, with its store and developer report in hand ("After the third real run" in `DESIGN.md`).

- **Fixed:** outcomes and sleep waited for every turn to be read into memory; a few turns that kept failing stopped both for good. They now wait only for turns not yet tried.
- **Changed:** the background time limit is 240 s (was 90 s): on that host a successful reflection took 78 to 86 s. Memory calls ask for the least thinking the model offers.
- **Changed:** the judge's admission question. On the real cases the old wording missed a message that corrects a stored fact; the new one gives the notes in the state and asks about each by name. The threshold is 0.5.
- **New in the panel:** Quick judge (key, address, model, who decides, a test button), Waiting and pace (time limits, intervals, budget, backups), and a folder to save exports to. `plugin/tunables.mjs` holds the bounds. The key is stored apart, is never sent back to the panel, and is left out of exports and backups.
- **New:** `asteme_amend`, a tool for the assistant to correct or close a memory when the user asks, on the user's own message. The assistant is told never to touch the database itself.
- **Changed:** the instruction for a memory's text: what holds, in a sentence or two, not a narration of the exchange.

## 0.8.0-alpha.4

Written against 0.8.0-alpha.2 after a second round on a real host (alpha.3 was that round's own build: alpha.2 plus partial Japanese and Chinese copy, which the complete sets in `client/locales/` replace). Details are under "After the second real run" in `DESIGN.md`.

- **Fixed:** `asteme_search` returned a field set to `undefined`, which the host refused; it failed for any query that matched something the user said. Tool and RPC results now pass through `plain()`.
- **Fixed:** a message was read again before every step of a turn when the first reading passed nothing or failed. One reading per message now; a failed one is tried once more.
- **Fixed:** a reflection cut off at the output limit failed the same way on every retry, so a correction in a long turn was never learned. A cut-off answer is asked for again with twice the room.
- **Changed:** a call made while the reply waits has its own, shorter time limit (`prepareTimeoutMs`, 30 s); background calls get `timeoutMs` (90 s). After two timeouts in a row, the reply stops waiting on the model for five minutes.
- **Changed:** admission answers for every candidate, so "left out" and "never answered" can be told apart in the trace.
- **New:** an optional judge port for the two closed questions (`src/judge.mjs`, `src/jev.mjs`): `judgeKey`, `judgeMode` = `shadow` | `judge` | `model`. Off without a key.
- **New:** a complete copy out and back in, a Markdown diary, a developer report and automatic backups (`src/archive.mjs`, `plugin/files.mjs`); RPC actions `export`, `import`, `backup`.
- **New:** a journal of every model call (`core.journal()`, `core.health()`), in `diagnose()` and the report.
- **New:** `standalone/`: the core without a host, as a library (`brain.mjs`) and as an MCP server (`mcp.mjs`).
- **Panel:** English, Japanese and Chinese; a gear for Settings; "Keep it safe" in Settings; reasons from the core are translated.

One new table (`journal`); nothing else in the database changes shape.

## 0.8.0-alpha.2

Core (see "After the first real run" in `DESIGN.md`): admission is given reasons and must answer for strong matches; sensitive memories are used in the open when asked about; names match across phrase and word forms; the relevance floor is scale-free; background work no longer repeats a question on the same evidence. New: `userOutcome`, `userConfirm`, `userRetire`, `userReopen`, `userSettle`, `review()`, `diagnose()`; RPC actions `feedback` and `dispute`; `memory` operations `confirm`, `retire`, `reopen`; host config `sleepIntervalMs`, `outcomeDelayMs`, `outcomeIntervalMs`; three more eval scenarios.

Panel: redesigned from scratch around the loop (Review, Memory, Activity, Charter). See `client/FOUNDATION.md`.

Nothing in the database changes shape. Tuning names changed: `TUNING.minLift` is replaced by `TUNING.minCloseness` and `TUNING.fit`.

## 0.8.0-alpha.1: moving from 0.7

Nothing to migrate. The record, memory, trace and outcome tables are unchanged and new tables are created on first open. Old items are read as cases. Differences a user will notice:

- Recall no longer requires the quoted words to appear in the memory. Set `TUNING.requireSharedTerms = true` to get the old rule back.
- `host.consolidate()` became `host.rest()`, which runs a sleep cycle (habits included). `sleepBudget` (default 6) caps model calls per cycle; cycles run at most every 10 minutes, or 2 when work is left.
- New model purposes: `asteme-replay`, `asteme-reconcile`, `asteme-revise`, `asteme-lesson`, `asteme-imagine`.
- The persona prompt now begins with the purpose and values. `profile` accepts `purpose` and `values`.
- New tool `asteme_why`; new RPC actions `why` and `explain`; `habit` accepts `restore: true`.
- `outcomes` may record `wrong` and `unused`, and `apply` accepts `supersede`, `counter`, `close ... as:"superseded"` and `conflicts`.


