# Production reference — the user's voice and images, captions, safe zones, audio

Index: Voice · Images · Captions · Composition and safe zones · Audio · New brands

## Voice

The voice is the user's (or a person they choose), recorded **one file per sentence**: that is what gives every caption
and every cut its timing.

- Ask for it like this: "Record each sentence as its own file, in a quiet room, phone 20-30 cm from your mouth: v01 is
  '…', v02 is '…'. Leave half a second of silence before and after. Send me the files or put them in vo/." Give the
  sentences numbered, exactly as they will appear in the captions.
- Any format ffmpeg reads works: `vo/v01.m4a` (iPhone voice memo), `.mp3`, `.wav`, `.ogg`. Keep the names `v01, v02…`.
- While the recordings do not exist yet, build the edit anyway: `examples/first-reel/reel.py` shows how to make a
  stand-in "voice" (one tone burst per phrase) with ffmpeg, so captions and cuts can be laid out and previewed. When the
  real files arrive, save them over the stand-ins and run again: the same `reel.py` re-times everything.
- `python scripts/media.py voice <folder>` prints each file's duration and its voiced spans (silencedetect): use them
  to place each sentence (`T = {'v01': 0.30, 'v02': …}`, every sentence starting ~0.3 s after the previous one ends).
- Long pauses or breaths inside a file shift the word timings: if a caption runs ahead of the voice, split that
  sentence into two files, or ask for that sentence again with no long pause.

## Images

- The user's photos go in `img/`: at least 1080 px on the short side for 9:16. `media.py sheet-img <folder>` puts them
  on one sheet: look at it before choosing. Never use a photo the user did not give or does not own.
- Framing without new material: `Still(img, z=(1.0, 1.06), c=(.5, .45))` zooms slowly; `Still(img, z=(2.0, 2.3),
  c0=(x, y))` reframes a detail; a pan across a wide image: `Still(path, z=(1.0, 1.0), c0=(.3, .5), c1=(.7, .5))`.
- Landscape photos or clips on a vertical reel: fit them 1420 px wide over their own blurred copy (`media.py extract …
  fit`) rather than cropping. On a 16:9 reel it is the other way round: portrait material is fitted at full height.
- Screenshots read best in `pieces.browser_frame()` or `pieces.phone_frame()`.
- Backgrounds, cards, charts and title shots can be drawn: by the pieces (gradients, cards, lists, outros) or by the
  animation engine (`references/animation.md`).

## Captions (`Captions.line(key, text, audio, t0, y=, size=)`)

- `*word*` highlighted (accent box, upper case) · ` / ` forces a block break · `shown|spoken` when the written form
  differs from the spoken one (`40|forty`) · `show=False` registers timings without drawing (useful in outros).
- If the number of phrases (split on `.,:;?!`) equals the number of voiced spans from `silencedetect`, each phrase snaps
  to its span; otherwise words are spread proportionally over the voiced time, skipping pauses. "…" does not count as
  punctuation: write ".".
- `caps.word_time(key, i)` → the second word `i` is spoken (the ` / ` marker does not count). Every cut starts here.
- Size 64-72 px; never below 60. Blocks hold up to 4 words / ~22 characters; single-word blocks merge with their
  neighbour when the gap is short.
- Reels with no voice (route D): `pieces.text_layer('Client script *highlighted*')` sets the script on screen, one
  layer per line, timed to the beat (`references/footage.md` § Beat grid).
- Timed words from anywhere else (a subtitle file the user already has): `caps.from_words(key, [(text, start, end)],
  t0)`, with times in seconds from the start of that audio.

## Composition and safe zones (1080x1920 canvas; 16:9 and 1:1 below)

- Instagram covers ≈220 px at the top and ≈360 px at the bottom. Headlines and chips between y=230 and y=520; captions
  at y≈1440; nothing important below y≈1560. Minimum type 30 px (secondary chips 36-44, headlines 70+).
- **16:9 (1920x1080) and 1:1 (1080x1080).** `rk.set_format('16:9')` first (or `new_reel.py --format 16:9`). The
  height is 1080, so everything is tighter: headlines from y≈110, captions at y≈880 with size 60-64, nothing important
  below y≈1000; 16:9 gives room to the sides (text up to 1400-1500 px wide). The pieces take these defaults from
  `rk.LAYOUT`. A square photo fills every format.
- On white or light photos, white captions need `pieces.bottom_gradient(B)` as the FIRST layer.
- Item framing: `source(k, img, start=0.25, z=(1.14, 1.24), c=(.5, .46))` lifts the subject and leaves room for the
  benefit at y≈1262.
- The cover comes from `reel.cover(t, path)`; in the feed it is cropped to 4:5 through the centre.

## Audio

- Music: a track the user has the rights to, in `music/`. The engine trims from the first onset (`music_start`) and
  ducks it under the voice (sidechain). `music_gain` 0.22-0.28 with voice, 0.5-0.6 without. No track: the reel works
  with voice and effects only.
- Final mix normalised to −14 LUFS, true peak −2 dBFS with a limiter (`render_audio` options). Effects gain 0.25-0.40.
  The gain is fixed for the whole reel (two passes, `linear=True`): a hook spoken at 0 s keeps the same level as the rest.
  When the limiter has to shave a lot of peaks (loud clicks or hits over a quiet mix) the reel can land up to ~1 dB under
  −14 LUFS; `media.py verify` shows it.
- Cutting on the beat, splicing a track to reach its break or final hit, real sounds from footage: `references/footage.md`.
- You cannot listen. Say so in the delivery and give the measured numbers (`media.py verify`).

## New brands

`pieces.Brand(dark, dark_deep, light, light_soft, accent, accent_text)` or `Brand.from_colors(dark, accent)` or
`Brand.from_logo('ref/logo.png')` (measures the logo with a median-cut quantiser; print and check). `accent_text` must
contrast on `accent` (lime → navy, coral → white). `B.activate()` applies it to the captions.
