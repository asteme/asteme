# The site

The site is not a page about Asteme. It is Asteme's own sky, with one difference: the mind behind it remembers only what the site has to say.

- **It is the conversation page itself** (`brain/page/`), built by `scripts/make-site.mjs` with its places filled the way the server fills them. The sky, the search that gathers stars, and a memory opened are the page's own code, so a change to them is a change to the site.
- **What it says is one list**: `content.mjs`. Each sentence is a star; each family is a constellation (its first line is what the others are drawn from). To change what the site says, change that file and nothing else. A sentence says only what `README.md` says. Languages that are not written there yet are not built.
- **`shim.js`** stands where the mind would be and answers the page's questions from that list. Nothing is fetched from anywhere: every call the page makes is answered in the browser.
- **`over.js` and `site.css`** are what the site adds: the way in (the mark's five stars come up, and then they are the sky), a sentence at the top, words to try, the film, and a line a visitor may leave.
- **A visitor's line** becomes a star in their own browser (`localStorage`) and, unless they ask otherwise, is sent nowhere. When they come back, the site says so, in their words. It is the product's promise, kept by the site itself: what you say stays with you.
- **A line put in everyone's sky** is the one thing that leaves the browser, and only when the visitor ticks the box for it. It goes to the Worker in `worker/` (Cloudflare, free tier), which keeps the text, its language and the day and nothing about who sent it, for thirty days at most. `.github/workflows/lines.yml` fetches what waits once a day, `scripts/sieve-lines.mjs` throws away what is plainly not a line, and the rest is proposed as a pull request to `lines.json`. **Merging that pull request is what shows a line**, so every line on the site has been read by a person. The newest eighty are shown. To have a line taken down, open an issue: removing it from `lines.json` removes it from the site. The box appears only when `config.mjs` holds the Worker's address; how to set the Worker up is at the top of `worker/wrangler.toml`.
- The lists of words the sieve refuses are not kept here: they are fetched when it runs, from [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) (CC BY 4.0) at a fixed commit. A list catches the plain cases and nothing else; the reading is what decides.
- **Read as a page**: the same sentences in order, as plain text (`#plain`). It is what a reader without scripts gets, and what anything that reads pages and is not a person gets.
- No tracking, no analytics, no cookies, no fonts or scripts from elsewhere. A test (`test/site.test.mjs`) holds the languages to the same shape and the page to loading nothing from outside.

```
node scripts/make-site.mjs        # builds site/dist
cd site/dist && python3 -m http.server 4188
```

`.github/workflows/pages.yml` publishes it to GitHub Pages when what it is made from changes on main. The repository's Pages setting must be "GitHub Actions".
