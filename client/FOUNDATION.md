# ASTEME panel

The panel is built for one loop: the system recalls, the person sees what it recalled and says whether that was right, and the system learns from the answer. Every screen is one step of that loop.

## What each screen is for

| Screen | The question it answers | What the person can do there |
| --- | --- | --- |
| **Review** | Is anything waiting for me? What did the last reply have in view? | Answer what it is unsure of; say whether each recalled memory was right, out of place or wrong; call for one it left out |
| **Memory** | What does it know? | Search; open any memory |
| **A memory's account** | Why does it think that, and how do I change it? | Confirm, pause, close, delete, forget with its source messages |
| **Activity** | What does it do when I am not there? | Read what it reread, compared, drew or imagined, and why; see why nothing is happening |
| **Charter** | What is it for? | Write the purpose, the values, names, manner and agreements |
| **Settings** | Is it on, is it healthy, and is it safe? | Switch, model, how the model calls are going; the quick judge (key, address, model, who decides); how long to wait and how often to work; save a complete copy, a diary or a developer report; bring a copy in; backups |

Review is first because it is the only screen where a click teaches the system something. A verdict there becomes an outcome in the core (`userOutcome`), which is the scarcest input the core has.

Charter and Memory are separate tabs on purpose. One is what the person told it to be and nothing learned can change it; the other is what it worked out.

## Rules

1. **The person's own words are the end of every explanation.** A memory is shown with the quote it rests on. An account ends at dated messages. A verdict by the person is shown as theirs.
2. **No field names, enums or scores on screen.** `words.mjs` turns every value into a phrase ("comes to mind easily", "out of place once"). A value the copy does not know falls back to itself, so a new backend value shows up as text and not as a blank.
3. **One mark carries meaning; nothing decorates.** The *star*: bigger means it comes to mind more easily, hollow means not in use, a ring means the last reply drew on it. Explanations are told in order under plain labels (the *trace*), with no rail, nodes, side bars, tinted cards or pills. A state is said in words.
4. **Rows open; accounts act.** A row in a list is one target that opens the account. Every action is in the account, next to the evidence, so nothing is changed from a list by a stray click.
5. **A question takes one click and can be taken back.** Verdicts have Undo. "No longer true" can be reversed from the account ("Put back in use"). Only delete and forget ask first, and forget names what else goes with it.
6. **What just happened is said at the bottom edge**, outside the scrolling area, so nothing being read moves. Failures are shown next to the control that failed.
7. **Unsaved work never scrolls away.** The charter's save bar sits below the scrolling area and the tab carries a mark.
8. **Opening something keeps your place.** An account opens over the tabs. Back or Escape returns focus and scroll to the row it was opened from. Tabs stay mounted, so a search or a draft survives.
9. **One broken view does not blank the panel** (`Boundary` in `ui.jsx`).

## Files

| Layer | Files |
| --- | --- |
| Theme | `tokens.css`: every color, size, radius and duration as a named role. `styles.css` has no raw values. |
| Primitives | `ui.jsx`: Button, IconButton, Field, Switch, Tabs, Disclosure, Section, Chip, Notice, Star, Trace, RowButton, TextLink, Facts, Confirm, Boundary |
| Words | `words.mjs`, `copy.mjs`, `format.mjs` |
| Screens | `page.jsx` (shell and navigation), `review.jsx`, `memory.jsx`, `detail.jsx`, `activity.jsx`, `charter.jsx`, `settings.jsx` |
| State | `model.mjs`: the store. `perform(action, payload, { key, notice })` for anything that changes data; `request(action, payload)` for reads such as `why` and `sources`. |

## Retheming

Change `tokens.css` only. The default derives everything from the host text color (`currentColor`), so it follows the DSH theme with no light/dark switch; hue is used for state only. To use explicit colors, override the roles:

```css
.asteme-page {
  --ast-accent: #4f6bed;
  --ast-focus: #4f6bed;
  --ast-primary-bg: #4f6bed;
  --ast-primary-fg: #ffffff;
  --ast-primary-line: transparent;
  --ast-text-muted: #6b6b6b;
}
```

While the defaults are `currentColor`-based, set `color` on leaf text and controls, not on containers: a derived token resolves against the color of the element that uses it.

## What the panel needs from the backend

`plugin/settings.mjs` provides all of it. Beyond the 0.7 snapshot: `review`, `diagnosis`, `charter`, `learning.sleep`, per-item `accessibility`, `stats`, `doubt`, and on `memory.delivery`: `request`, `asked`, `heldBack`, `undecided`, `outcomes`. Actions: `feedback`, `dispute`, `why`, `explain`, `sources`, `memory` with `confirm`, `retire`, `reopen` in addition to pause, resume, delete, forget; `habit` with `restore`.

Against a 0.7 backend the panel still renders what the snapshot holds and says what is unavailable.

## Copy

`copy.mjs` exports `en`, `ja` and `zh` (the last two live in `locales/`); `index.jsx` registers them and a test keeps their keys and placeholders in step. Each names its language in `_lang`, which dates and numbers follow. Reasons the core writes itself arrive as fixed English sentences and are translated by key (`reasonWord` in `words.mjs`); one the copy does not know is shown as it is.

Strings with `{placeholders}` are filled by `say()` in `words.mjs`, so the host's `t` is not asked to interpolate.

## Preview

`preview/preview.html` is a single self-contained file. Its first scenario is data produced by the real core: `node client/preview/snapshot.mjs` plays `sandbox/story.mjs` plus a few more days and writes the snapshot, each memory's account and its source messages to `preview/engine.snapshot.json`. Actions in the preview are handled by `preview/mock.mjs`, which changes that data closely enough to try every control; it is not the core.

```
npm install --no-save esbuild react react-dom
node client/preview/snapshot.mjs && node client/preview/build.mjs
```

## Checked

Light and dark at 360, 480 and 720 px; keyboard paths (tabs, open, Back, Escape, confirmations); every state (empty, loading failure, restart required, memory off, 0.7 backend); no sideways scroll at 360; text contrast at or above 4.5:1 and control edges at or above 3:1 in both themes; no React warnings in a development build. Not checked inside DSH.
