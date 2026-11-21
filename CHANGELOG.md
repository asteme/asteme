# Changelog

What changed in each version and why.

## 0.12.0

Speaking of its own accord. Nothing here runs on a schedule of its own: what is new is something to say, an occasion to say it, and leave to say nothing.

- **Added:** a reply may come as two or three messages. Where a person would send a second short message instead of one longer one (an afterthought, a question after the answer), the model may give `more` beside `reply`: one or two further messages, each stored and shown as a message of its own, a moment apart, with the writing dots between them. What belongs to the reply (a time it set, a face, the memories it used) stays with the first. Stopped in between, the rest is not said.
- **Added:** things kept in mind. `{act:"hold", about}` keeps something with no time on it to bring up when the user is next around: how a thing turned out, a question it was not the moment to ask. They are its own words, kept in the store (`brain:mind`, eight at most), shown to it as `INPUT.mind`, and shown to the user under "What it was doing" as "When you are next here", where each can be taken back. It lets one go itself with `unwake`.
- **Added:** coming back is an occasion. The page says when the user comes to the conversation (`/api/here`: on opening it and on turning back to it, at most once a minute). After three hours away (`absenceMs`), and only when something is kept in mind, Asteme is woken with "the user is back" and decides for itself whether to say one of those things. Saying nothing is the ordinary case and is not an error. Once for one coming back; never while it is thinking or work is out.
- **Changed:** when what it last brought up itself went unanswered, it is told to bring up less and keep less. The record of what was seen and answered was already in front of it (`INPUT.unanswered`); this is what it is for.
- **Changed:** what a reflection is sent. It was given the last twenty readings of any conversation, each with every candidate and every decision. On a store in use for some weeks that was most of the call (a median of 27,000 tokens in, 200 calls a day), and more than half of those readings belonged to another conversation. It is now given this turn's own readings whole, and of earlier ones only those of the same conversation that passed something on (six at most, with the decisions for what was passed), which is what laying a reported result to what produced it needs.
- **Fixed:** opening the conversation inside DSH showed, for a second or two, a small ring and a paragraph of explanation in the top corner, then an empty frame, then the conversation; where the device asks for less movement the ring did not even turn. There is now the mark in the middle, its stars coming up one after another, and it stays until the conversation's page has loaded and then gives way to it.
- **Fixed:** the word "You" was written twice in each of the eight word files (the build warned of it on every run). Once now.

## 0.11.0

The first published version. Apache-2.0, with a NOTICE.

- **Fixed:** saying something always brings the newest into view, also after scrolling far back to read. Before, the conversation followed only when it was already at its end, and a message sent from further up went out unseen. (The same value was read, undeclared, after each reload of the state and failed silently there; it is one value now.)
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
- **Changed:** the README says how it is installed from this one repository, that DSH asks to allow three packages' install scripts, and in a few lines where it is going: memory now, hands next.
- **Added:** `MAINTAINING.md`, `SECURITY.md`, templates for issues and pull requests, and a release workflow: how the project is kept, written once for whoever keeps it.
