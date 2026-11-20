# From private to published

The order things happen in, and what each step needs. Decided 2026-11-19; change it here when the plan changes.

1. **Now: private, rights reserved.** `LICENSE` grants nothing. Nobody outside is given the code.
2. **A public page.** A separate public repository holding only `public/README.md`, `public/README.ja.md` and `public/media/`. It shows what Asteme is and says nothing of how it is made. Its purpose is that people know the name before the code exists for them.
3. **Ready to publish** when, on Windows, the following have been seen to work by a person: permission asked and answered through DSH, voice input, the way of speaking in ordinary sessions, the sky (going in, moving, turning), and an installer that a person who is not a developer can use.
4. **Publish the code under Apache-2.0, with a NOTICE.** Chosen over MIT for two things MIT does not say: an express patent grant, and that the license gives no right to the name or the mark. MIT was weighed again on 2026-11-20 and set aside; this is settled and is not reopened without a new reason. `LICENSE` is replaced at that point; versions before it stay unlicensed.
5. **The name and the mark stay the project's.** A copy that is changed is welcome and carries another name. `TRADEMARKS.md` says so in plain words. (Nothing is registered. Registering is a later decision and costs money.)
6. **What is paid for is not the code.**
   - A signed desktop build that installs and updates itself, for people who do not want to build it.
   - Later, when there are users to want it: encrypted synchronisation between a person's own devices.
   - Sponsorship, with early builds for sponsors.

## Not decided

- Where the paid build is sold, and for how much.
- Whether the desktop build needs DSH or stands alone. It can stand alone today (`brain/cli.mjs`); it has no installer.

## Before the code is published: a list

Each line is done when someone has seen it, not when it is believed.

- [x] Tests pass on Windows, macOS and Linux, Node 22 and 24 (CI).
- [x] The plugin builds and loads on all three (CI: Verify plugin).
- [ ] On Windows, by a person: a message copied; going into the sky and out with movement on; the six rows of the settings' Memory tab; the erase confirmation (on a second profile); Activity with jobs waiting; the way back from the panel.
- [x] Reset, the scene of its waking, and its greeting, five times inside DSH: five of five on Linux (an earlier single failure was not reproduced).
- [ ] An update tried the way a user would do it: plugin off and on, browser reloaded, and the page is whole.
- [x] `LICENSE` replaced with Apache-2.0 and `NOTICE` written, the "not published yet" lines taken out of the READMEs (English and Japanese here; the other six by whoever keeps them), `TRADEMARKS.md` in force, the CI badge in the README: 0.11.0.
- [ ] The limits in the README are the limits there are that day.

## Telling people

Nothing that tastes of an advertisement. One person made a thing and shows it where people who make things show theirs: "I made this", the film, a link, and then answering whoever asks. No slogan, no list of features, no campaign, no schedule of posts, no asking for stars.

- **What is posted:** the film itself, placed where it plays without a click, with two or three plain sentences in the person's own voice: what it is, why it was made, what it does not do yet. The link to the repository last.
- **Where:** the places the person already reads and writes. The DSH and DeepSeek community first, because they can try it at once. Then, only if it feels right on the day, Hacker News as "Show HN", r/LocalLLaMA, X. Written for each place, or not posted there.
- **After:** whoever writes is answered the same day, by the person, plainly. What people could not get to work is the next version.
- **Not done:** comparing it with other people's work by name; promising what is not built; posting the same text twice; answering criticism with anything but what is true and what will change.

## What is published, and where

Decided 2026-11-20, and changed the same day: before publication is exactly when a new way of installing can be tried freely, so it is tried now and not put off.

- Two packages on npm, both made from this repository at each release: `dsh-asteme` (the plugin; DSH installs and updates plugins from npm by default, and the community list keeps versions by it) and `asteme` (the library and the `asteme` command). Both names are already held, at 0.0.1.
- One public repository, `asteme/asteme`: the source, the documents, the issues, the releases, the film, and what DSH installs (the built plugin as a package inside it, with the built file attached to each release). Every link given to people points here.
- The separate repository that held only the built plugin is not published. It stays as it is until people who installed from it have moved, then it is retired.
- Before the day: installing from the one repository is tried on a clean DSH profile on Windows (a new install, and an update over the old bundle). If it cannot be made to work in time, the old way is published as it is and this is done after.

The first published version is 0.11.0, tagged `v0.11.0`. Versions before it stay unlicensed. The repository is published with a new history of one commit. Making a repository public publishes every commit that can still be reached in it, and pull requests cannot be deleted, so the surest way is a repository made new under the same name; the packages on npm point at the name, not at the history, and need nothing done.
