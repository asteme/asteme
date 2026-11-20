# What this folder is

The contents of the public page, kept beside the code they describe. The code repository stays private; this folder is what goes into a public repository of its own (README files and `media/` only, nothing else).

It says what Asteme is for a person who meets it. It says nothing of how it is made, on purpose: no architecture, no file names, no model names, no measurements. Keep it that way until the code is published.

The pictures and the three films are made from the page's own preview with made-up scenes (`STORY=<scene> node brain/preview.mjs`). Nothing in them is anyone's real conversation or memory, and nothing in them is a thing the page cannot do: the words, the line under a reply, the day lines, the task handed to DSH and the stars are the page itself.

There is one film for each language, each with a small story of its own: `asteme-ja.mp4` (the season for pickling plums), `asteme-en.mp4` (no deploys on Fridays), `asteme-zh.mp4` (going home for the New Year). About forty seconds each, 1440 by 810. The music is a short piece for piano, strings and celesta written for these films, one tune that returns where the memory does; each language's is paced to its own film. It is played from the GeneralUser GS sound set (S. Christian Collins), whose licence allows that use freely; nothing in it is a recording of anyone's.

A README on GitHub shows a film in the page only when the film was uploaded through GitHub's own editor (drag the `.mp4` into the README while editing; it becomes a `user-attachments` address). Until that is done, the picture at the top of each README is a still from its film and opens the film when pressed. On the day the page goes public, upload the three films that way and run `node scripts/public-films.mjs --en <address> --ja <address> --zh <address>`, which puts each address in place of its still. The film at the top replaces the still; the two pictures further down stay, because a page is also read by people who never press play. There is no GIF: it was three times the size of a film and showed less.

This file is not part of the public page. Do not copy it there.
