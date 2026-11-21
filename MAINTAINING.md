# Keeping Asteme

How this project is kept, for whoever keeps it: a person, or an agent working for one. It is written to hold while the project changes, so it says who decides and how a change travels, and names few files. `CONTRIBUTING.md` is how to make a change; this is how the keeping is done.

When this file and a habit disagree, the file is changed or the habit is. They are not left to disagree.

## Who decides

- **The owner** decides what Asteme is and what is published: the license, the name, a release going out, anything said in public.
- **The designer** (the person or agent the owner has given the design to) decides how things are built: behaviour, structure, the words on the screens, what a release contains. One designer at a time.
- **A maintaining agent** is hands and eyes: it syncs, builds, tests on real machines, reports what it saw, and keeps the repository's machinery running. It proposes; it does not decide.

A report says what was seen, what was not looked at, and what is guessed, in that order and kept apart. "Not verified" is a complete and welcome sentence.

## What a maintaining agent may change by itself

- Machinery: CI configuration, release mechanics, packaging paths, line-ending and ignore files, dependency pins that CI proves.
- Translations of documents that it keeps (the READMEs other than English and Japanese), following the English.
- A fix for something that stops everyone working (the page will not load, the tests cannot run), on one condition: the same report carries the diff and the reason, so the designer can take it in or replace it.

Everything else under `src/`, `brain/`, `plugin/` and `client/`, every prompt, every word on a screen, and every rule in this file is changed by the designer. An agent that thinks one of these is wrong says so with evidence; it does not edit it. Two hands writing the same code without telling each other is how a fix is lost at the next sync.

## How a change travels

After an update is installed, the plugin is turned off and on (or the harness restarted) and the browser reloaded, every time, before anything is tested or reported. A program goes on running the code it started with.

1. A change is one thing. It has a reason that can be said in a sentence, and that sentence is its `CHANGELOG.md` entry.
2. It comes with a test that fails without it, where a test can tell. Where only an eye can tell, the report says who looked, on what machine.
3. `npm test` passes on Windows, macOS and Linux before it is merged. A red check is never merged "to fix later".
4. What the user sees is the same in all eight languages in the same change. A word added in English and nowhere else fails the tests on purpose.
5. Documents that describe the changed behaviour change in the same commit. A document that is known to be wrong is worse than none.
6. Nothing private enters the repository: no stores, no transcripts, no reports or evidence files, no keys. A key that was ever pasted anywhere is revoked, not hidden.

## Branches and commits

- `main` is always releasable: tests green, the built plugin regenerated from it.
- Work happens on short branches named for what they do (`fix/first-star-twice`), merged by squash so that one change is one commit on `main`.
- A commit message says what changed and why, in the imperative, in English. No ticket numbers as the whole message, no "misc".
- History on `main` is not rewritten after publication. (Before the first publication it is cleaned once, by the owner.)

## Versions

Semantic versioning, read strictly:

- Before 1.0: `0.MINOR.PATCH`. MINOR when what a user or an integrator relies on changes (a screen moves, a stored thing changes shape, an API route changes); PATCH for fixes and additions that break nothing.
- A pre-release is `-alpha.N` or `-rc.N` and is never the "latest" release.
- No two builds that leave the designer's hands carry the same version. A candidate is `X.Y.Z-rc.N`, and the last commit before the tag sets `X.Y.Z`. (Eight candidates once went out as `0.11.0`; what was running could not be told from what was on the disk.) That last commit changes nothing but the version in its five files and the regenerated plugin, and a maintaining agent may make it once the designer has named the candidate as the release.
- The store format has its own number. A change to it ships with a migration and a test that opens a store of the old format.
- The version lives in five files (listed in `CONTRIBUTING.md`); they change together.
- 1.0 is declared by the owner when the store format and the plugin's routes are meant to hold.

## Releases

A release is cut from `main` by a tag `vX.Y.Z` on a commit whose checks are green.

1. `CHANGELOG.md` has a section for the version: what changed and why, in the words a user would recognise. Each entry begins **Added**, **Changed**, **Fixed** or **Removed**.
2. The built plugin in the repository is regenerated from that commit (`npm run bundle -- --git-package`) and committed with it.
3. The tag is pushed. The release workflow tests the tag on all three systems, builds the plugin, and attaches the packed file to a draft release whose text is that version's section of the changelog.
4. A person reads the draft, installs from it on a clean profile, and publishes it. Publishing is the owner's.
5. The repository is public before a release is published (npm records where a package was built only for a public repository, and the packages are published with that record). Publishing the release publishes the two packages to npm at that version (`asteme`, the library and the command; `dsh-asteme`, what DSH installs and updates from). npm is where DSH looks by default, so a release is not out until both are there. A version on npm cannot be replaced: what is wrong is fixed by the next one.
6. A release that turns out broken is followed by a fixed one. A published tag is never moved.

## Issues

- One issue is one problem or one request. Templates ask for what is needed to act on it: the version, the system, what was done, what was expected, what happened.
- Labels say the kind (`bug`, `request`, `question`, `docs`), the place (`conversation`, `memory`, `plugin`, `install`), and the state (`needs-info`, `confirmed`, `wontfix`). Nothing else.
- A bug is `confirmed` only when someone other than the reporter has seen it or a test shows it.
- An issue waiting on its reporter for 30 days is closed with a kind word and can be reopened.
- A security problem is not an issue: `SECURITY.md`.

## Pull requests

- Small, one thing, with the changelog line and the test.
- The designer reviews anything that changes behaviour or words. Machinery can be reviewed by a maintaining agent.
- A pull request from outside is thanked whether or not it is merged, and told plainly which.
- Generated files (the built panel, the built plugin) are regenerated by the maintainer, not hand-edited in a pull request.

## What a bot or an agent does without being asked

Does: label a new issue by its template; ask once for missing details; run the checks; draft a release from a tag; open a pull request for a dependency update that CI proves; close what has waited 30 days on its reporter.

Does not: merge to `main`; publish a release; change the license, this file, or anything the designer owns; answer a security report; speak for the owner in public; touch an owner's store, or erase anything, to test.

When unsure which list a thing is on, it is on the second.

## Dependencies

Few, pinned, and each one earning its place. An update is one pull request per dependency, merged when the checks are green on all three systems and the plugin still installs on a clean profile. A dependency that runs a script at install is named in the README, with what the script is for.

## When the project changes

These rules name roles, not people, and steps, not tools. When a tool is replaced, the step stays and its line here is edited in the same change. When a rule stops being followed, that is a finding: either it was wrong and is removed, with the reason in the changelog, or it was right and the work is brought back to it.
