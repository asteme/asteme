# Making the films

Three films, one for each of three languages, each its own story (`words.mjs` says what is said and when; `sky/<lang>.json` is the rest of that person's sky). They are the conversation page itself, driven through the preview's stage door and filmed frame by frame on the film's own clock; the score is written to the same clock, so each film has its own playing of the one theme.

What is needed: Node, `ffmpeg`, Python 3 with `numpy`, Chrome, the fonts Inter and Noto Sans CJK (SC and JP), and two things installed beside these scripts (they are not dependencies of Asteme; the piano is every recorded loudness of every recorded key, about 80 MB):

```
cd scripts/film
npm install --no-save playwright @audio-samples/piano-release @audio-samples/piano-velocity1 @audio-samples/piano-velocity2 @audio-samples/piano-velocity3 @audio-samples/piano-velocity4 @audio-samples/piano-velocity5 @audio-samples/piano-velocity6 @audio-samples/piano-velocity7 @audio-samples/piano-velocity8 @audio-samples/piano-velocity9 @audio-samples/piano-velocity10 @audio-samples/piano-velocity11 @audio-samples/piano-velocity12 @audio-samples/piano-velocity13 @audio-samples/piano-velocity14 @audio-samples/piano-velocity15 @audio-samples/piano-velocity16
```

Then, from the top of the repository, for each of `en`, `ja`, `zh`:

```
node scripts/film/film.mjs en        # films it: about a minute of film, three or four minutes to make
python3 scripts/film/score.py en     # plays the score for that film and records it
node scripts/film/encode.mjs en      # the still, the frames and the sound, as asteme-en.mp4
```

The film and its still (`poster.jpg`, which becomes `public/media/film-en.jpg`) are left in `$FILM_OUT/en`. `FILM_OUT` is where the work is kept (the system's temporary folder when it is not set). `FILM_CHROME` names a Chrome to use, `FILM_MODULES` a folder of `node_modules` that has `playwright`, and `FILM_SAMPLES` a folder whose `node_modules` has the piano, when they are not where they are looked for.

`python3 scripts/film/score.py en --notes` prints the score as text, with the film's moments beside the beats, and says if a note grates against the chord under it.

## How they are made, and why that way

- **The film's clock, not the wall's.** The page runs on a clock the film moves forward one thirtieth of a second at a time, and a picture is taken at each step. Nothing is recorded as it happens, so a busy machine cannot make the film stutter, and every moment falls where `words.mjs` says it does. The page's CSS animations are set to the same clock before each picture, and time stands still while the page fetches something.
- **Readable where it is shown.** GitHub shows the film at less than half its size and without sound until someone asks for it. So the page is filmed 1120 by 630 with its letters set to 19 px (a setting anyone has), each picture is taken at 1920 by 1080, and nothing the film says depends on hearing it. The first second is a still of the moment the film is about (tonight's message, the reply that brings something back, and that memory open beside them with the sentence it rests on), because that is what the README shows before anyone presses play.
- **A hand, not a script.** Keys come unevenly; an input method shows the reading underlined before the words (the film draws that underline itself, as it draws the caret, so both keep the film's time); the pointer moves on a slight curve and is only there when a hand would be.
- **What the film adds to the page** is said at the top of `film.mjs`: a veil for the days passing, three lines of the README's own words, the hour of the promise, the name at the end. Everything else is the page.
- **The music** is one theme, Asteme's mark read as notes, played three ways (`score.py` says how). It is written to the moments `words.mjs` names: it is heard when the memory comes back, breaks off when the days begin to pass, and goes on from the very note it stopped before when Asteme speaks first.

Everything in the films is made up; nobody's real conversation or memory is in them.

The piano is the Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), from the `@audio-samples` packages on npm.
