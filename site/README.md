# The site

The site is not a page about Asteme. It is Asteme's own sky, with one difference: the mind behind it remembers only what the site has to say.

- **It is the conversation page itself** (`brain/page/`), built by `scripts/make-site.mjs` with its places filled the way the server fills them. The sky, the search that gathers stars, and a memory opened are the page's own code, so a change to them is a change to the site.
- **What it says is one list**: `content.mjs`. Each sentence is a star; each family is a constellation (its first line is what the others are drawn from). To change what the site says, change that file and nothing else. A sentence says only what `README.md` says. Languages that are not written there yet are not built.
- **`shim.js`** stands where the mind would be and answers the page's questions from that list: every call the page makes is answered in the browser.
- **`over.js` and `site.css`** are what the site adds: the way in (the mark's five stars come up, and then they are the sky), a sentence at the top, words to try, the film, and a line a visitor may leave.
- **A visitor's line** becomes a star in their own browser (`localStorage`) and, unless they ask otherwise, is sent nowhere. When they come back, the site says so, in their words. It is the product's promise, kept by the site itself: what you say stays with you.
- **A line put in everyone's sky** is the one thing that leaves the browser, and only when the visitor ticks the box for it. It goes to the Worker in `worker/` (Cloudflare, free tier), which throws away what is plainly not a line (`worker/sieve.js`) and keeps the rest unseen until it is decided. Whoever holds the Worker's key reads the lines at `<the Worker's address>/review` and shows or drops each one. **Showing it there is what puts a line on the site, and there it stays** until it is taken down: the page asks the Worker for the shown lines once the sky is there, each is a star at the day it was left, and a sky that hears nothing is simply without them. When there are more than a visit is given (six hundred), the newest are always there and the older take turns by the day, so none is dropped for being old. Nothing a visitor sent is ever in this repository, shown or not. To have a line taken down, open an issue: it is taken down on the same page.
- **Who may send, and how much.** There is no signing in, and there will not be: an account is something kept about a person, and this site keeps nothing about anyone. A visitor may sign a line with a name they write, or not; a line may be added to one another visitor left, and is then joined to it in the sky; and each visitor may send one line a day. "A visitor" is counted for a day under a salted hash of their address that is thrown away with the count, so someone who changes address can send again: what stands between such a person, or a script, and the sky is that sending takes leave asked for a moment before and a little work (`/pass`), that all visitors together send no more in a day than the free plan keeps, and above all that nothing is shown until a person has read it. The box appears only when `config.mjs` holds the Worker's address; how to set the Worker up is at the top of `worker/wrangler.toml`.
- The lists of words the sieve refuses are not kept here: the Worker fetches them, from [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) (CC BY 4.0) at a fixed commit. A list catches the plain cases and nothing else; the reading is what decides.
- **Read as a page**: the same sentences in order, as plain text (`#plain`). It is what a reader without scripts gets, and what anything that reads pages and is not a person gets.
- `docs/banner*.jpg`, at the top of each README, are made by `scripts/make-banners.mjs`, where their words are; the picture under the words is `docs/banner-base.jpg`.
- No tracking, no analytics, no cookies, no fonts or scripts from elsewhere. A test (`test/site.test.mjs`) holds the languages to the same shape and the page to loading nothing from outside.

```
node scripts/make-site.mjs        # builds site/dist
cd site/dist && python3 -m http.server 4188
```

`.github/workflows/pages.yml` publishes it to GitHub Pages when what it is made from changes on main. The repository's Pages setting must be "GitHub Actions".
