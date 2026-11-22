# Making the films

Three films, one for each of three languages, each its own story (`words.mjs` says what is said and when). They are the conversation page itself, driven through the preview's stage door and filmed as the browser paints it; the score is written to the same clock.

What is needed: Node, `ffmpeg`, Python 3 with `numpy`, Chrome, and two things installed beside these scripts (they are not dependencies of Asteme):

```
cd scripts/film
npm install --no-save playwright @audio-samples/piano-mp3-velocity3 @audio-samples/piano-mp3-velocity5 @audio-samples/piano-mp3-velocity8
```

Then, from the top of the repository, for each of `ja`, `en`, `zh`:

```
node scripts/film/film.mjs ja        # films it: about 75 seconds, on the clock
node scripts/film/encode.mjs ja      # frames, in the order of their own times, to a silent film
python3 scripts/film/score.py        # the score (once; it is the same for all three)
ffmpeg -i "$FILM_OUT/score.wav" -af "loudnorm=I=-19:TP=-2:LRA=14" -ar 48000 "$FILM_OUT/score-n.wav"
ffmpeg -i "$FILM_OUT/ja/silent.mp4" -i "$FILM_OUT/score-n.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -t 74.3 -movflags +faststart public/media/asteme-ja.mp4
```

`FILM_OUT` is where the work is kept (the system's temporary folder when it is not set). `FILM_CHROME` names a Chrome to use, and `FILM_MODULES` a folder of `node_modules` that has `playwright`, when they are not where they are looked for.

Two things learned the hard way, kept in the code: the frames a browser hands over do not always arrive in order (they are sorted by their own time before encoding), and every wait is to a moment on the clock, not for a length of time (waits added together drift, and the rhythm goes).

The piano is the Salamander Grand Piano V3 samples by Alexander Holm, CC BY 3.0.
