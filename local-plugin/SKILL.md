---
name: invokard-studio-local
description: >-
  Make videos with code, entirely on the user's computer: reels and shorts (9:16, 16:9, 1:1) from the user's own
  photos, clips, voice recordings and music, with word-by-word captions, animated headlines, charts, before/after
  wipes, cuts on the beat, end cards and a mixed soundtrack; and animations drawn frame by frame with React (kinetic
  type, animated ads, charts, 3D, physics, particles). No accounts, no API keys, no downloads at render time. Use when
  asked for "a reel", "a short", "a vertical video", "a 16:9 video for YouTube or LinkedIn", "captions like those
  reels", "a before/after video from these clips", "cut these clips on the beat", "an animated ad", "motion graphics",
  "animate this with code", "an animated chart" or "a 3D product video", or to re-render a video made with this skill.
  It does not generate images, clips, voices or music with AI.
license: MIT. See LICENSE in the plugin folder.
compatibility: >-
  Claude Code on the user's computer. Python 3.10+, ffmpeg and ffprobe on PATH, Pillow and numpy. Drawn animation:
  Node.js 18+, one npm install in animation/, and Google Chrome or Microsoft Edge installed.
metadata:
  author: Invokard / Octonove
  version: "1.1.0"
---

# Invokard Studio Local — from the user's material to the MP4

You write a small Python file (`reel.py`) that describes the reel: which photo or clip is on screen when, which layers
(headline, chips, list items, charts, wipes, end card) appear over it, which voice file starts when, and where the music
and effects go. The engine (`scripts/reelkit.py`) composes every frame with Pillow, pipes them to ffmpeg and mixes the
audio. Nothing is edited in a video editor: **all type, boxes and animation come from the engine**, so they are sharp,
on-brand and exactly timed.

A second engine **draws**: `animation/` renders React components frame by frame in the Chrome or Edge already on the
machine (headless) and encodes them with ffmpeg. Use it for what is designed rather than filmed: kinetic type, animated
ads, charts that grow, a product in 3D, physics, particles, a product photo turned into an ad. Its output is an MP4 (or
transparent frames) that the montage uses like any clip or layer, so one reel can have both (§ 5).

Everything runs on this computer. The skill never uploads, downloads or calls a service while it works: the fonts are
bundled, the sound effects are bundled, and the media are the user's. Read this file whole, then the reference the
current step points to. `examples/first-reel/reel.py` and `examples/animated-reel/reel.py` in the plugin folder render
complete reels with no outside media at all: the quickest check that a machine can render.

## 0. Check the machine (30 seconds)

```bash
python <skill>/scripts/media.py doctor                  # python, ffmpeg, packages, fonts, format
ffmpeg -version && ffprobe -version
```

Missing ffmpeg is a hard stop: tell the user how to install it (`references/troubleshooting.md`). Missing Pillow or
numpy: `python -m pip install Pillow numpy` (it downloads them from PyPI once; say so before you run it).

## 1. Choose the route

| The material is… | Route | Reference |
|---|---|---|
| The user's own clips or photos | **A · Footage**: contact sheets → pick segments → cut on the beat → before/after → end card | `references/footage.md` |
| A script the user can record | **B · Voice**: the user records one file per sentence → captions word by word → cuts on words | `references/production.md` |
| An ad, a title, a chart, a product to show off, with no footage | **C · Drawn**: an animation project (React) → still of the key frame → frames → render | `references/animation.md` |
| Only text and music | **D · On-screen text**: the client's script as animated text over drawn or photo backgrounds, cut on the beat | `references/production.md` § Captions |

Routes mix: a footage reel can carry the user's voice; any reel can carry drawn layers, a drawn chart or a drawn end
card (§ 5).

## 2. Workflow

1. **Work folder** — `python scripts/new_reel.py <folder> --brand studio|lime|forest|mono --title "…" [--format 16:9|1:1]`.
   It creates `img/ vid/ frames/ vo/ music/ sfx/ ref/ out/ review/` and a `reel.py` from the template; the format
   (9:16 unless asked) is set at its top with `rk.set_format()`. Brand: `pieces.Brand.from_logo('ref/logo.png')`
   measures the real colours; print them and look at the logo file first (folders are full of misleading file names).
2. **Script** — 85-100 words for 35-45 s. Hook in the first sentence, one idea per sentence, an ending that echoes the
   hook. Only claim what is in the user's material: no new figures, no new promises. If the user gave the script, use
   it verbatim.
3. **Voice** — the user records it, **one file per sentence** (`vo/v01.m4a, v02…`; mp3, wav and m4a all work): a phone
   voice memo is enough. How to ask for it, and what to do while it is not recorded yet, is in `references/production.md`
   § Voice. Then `python scripts/media.py voice <folder>`: durations and voiced spans; every timing and cut derives
   from them. No voice (script on screen, music only)? Skip to 4.
4. **Images and clips** — the user's photos in `img/`, clips in `vid/`. `python scripts/media.py sheet-img <folder>`
   and `sheet-footage` show them on one sheet: LOOK at it before choosing. Drawn backgrounds, cards and charts come from
   the pieces or from the animation engine.
5. **Edit with stills first** — write `reel.py` using `pieces.source(name, 'img/x.png')` and run
   `python reel.py --preview`. Look at `review/preview.jpg`. Fix rhythm, framing and layers BEFORE rendering. This step
   is where the reel is made; do not rush it.
6. **Clips** — `media.py extract` cuts the segments of real footage the reel uses into `frames/<name>/`; `media.py
   frames` converts whole clips. Check the motion sheet (`media.py sheet-motion <folder>`).
7. **Music and effects** — the user's own track in `music/` (one they have the rights to), or none. The engine trims
   from the first onset and ducks it under the voice. Effects are bundled: `pieces.sfx('whoosh'|'pop'|'shimmer'|'chime'|
   'typing'|'shutter'|'coaster'|'fridge')`. Cut on the beat when there is no voice: `media.py beats` →
   `references/footage.md`.
8. **Render and verify** — `python reel.py`, then `python scripts/media.py verify out/reel.mp4`: specs, loudness
   (target −14 LUFS) and a contact sheet taken from the final MP4. Look at that sheet. Then look at 2-3 full frames
   (`media.py frame out/reel.mp4 <t>`) at the moments that matter: a caption change, the wipe, the end card.
9. **Deliver** — `out/reel.mp4` + `out/cover.jpg` (`reel.cover(t, 'out/cover.jpg')`) + caption text and hashtags in a
   `.md` + the sources (`reel.py`, `img/`, `vo/`, `music/`, `ref/`; never `frames/`). Do not publish anything: the
   user does. Report what you could not verify (you cannot listen to the mix: say so, and give the loudness numbers).

## 3. Rules that come from real mistakes

- **Look at every sheet.** `imgs.jpg`, `motion.jpg`, `preview.jpg`, the `verify` sheet. An unwatched render is not
  delivered.
- **Logos.** Never trust a file name. Open it. If it is small, rebuild the wordmark as text with the measured colours.
- **Third-party brands.** Never add a logo or identity that is not the user's (e.g. the maker of a product they sell).
  A brand may appear because it is in the user's own footage; it is never added.
- **Cuts come from the voice**, never by eye: `caps.word_time(key, i)` and the spans from `media.py voice`.
- **Short clips.** Never slow a clip below `speed=0.8` (24 fps sources judder); to lengthen, put a `Still` of a frame
  of the same clip before it with the zoom matched.
- **Safe zones.** Instagram covers ~220 px at the top and ~360 px at the bottom. Headlines and chips between y=230 and
  y=520; captions at y≈1440; nothing important below y≈1560. Minimum type 30 px (secondary chips 36-44, headlines 70+).
  16:9 and 1:1 (1080 px high): headlines from y≈110, captions at y≈880, nothing important below y≈1000. Pieces take
  these defaults from `rk.LAYOUT`; write positions as numbers only when you mean them, never copied from a 9:16 reel.
- **Formats.** `rk.set_format('16:9')` (or `REELKIT_FORMAT=16:9`) goes first, before `from reelkit import W, H` and
  before any source or layer. Extract clips for the format: `media.py frames <work> --format 16:9`.
- **Captions on light backgrounds** need `pieces.bottom_gradient(brand)` as the FIRST layer.
- **Music in the user's clips is not theirs to reuse.** Real sounds (a washer, an engine) can be cut from the footage
  with `media.py sound`; a song playing in the background of a clip is not a licence to use it.

## 4. The engine in one screen (full reference: `references/api.md`)

```python
import reelkit as rk; rk.set_format('9:16')                    # '16:9' / '1:1': first, W and H are copied on import
from reelkit import W, H, Reel, Captions, Still, Clip, Func, blit, text_img, pill, lerp, clamp01, eo, eio, eback
import pieces as pz; from pieces import source, sfx
rk.set_base(folder); B = pz.BRANDS['lime'].activate()          # or pz.Brand.from_logo('ref/logo.png').activate()
reel = Reel('name'); caps = Captions(size=70, y=1440, maxw=920); reel.caps = caps    # 16:9 / 1:1: Captions(size=62)
t_end = reel.vo('vo/v01.m4a', 0.30)                            # returns where the sentence ends
caps.line('v01', 'Sentence with *key* *words*, / next block.', 'vo/v01.m4a', 0.30)   # *hl* · / break · shown|spoken
t = caps.word_time('v01', 2)                                    # the second the 3rd word is spoken → cut here
reel.shot(0.0, t, source('hero', 'img/hero.jpg', z=(1.0, 1.06), c=(.5, .45)))
reel.shot(t, 5.0, Clip('hero', speed=1.0, start=0.25, z=(1.14, 1.24)))  # frames/hero/ from media.py extract
GRAD = pz.bottom_gradient(B); reel.ov(0.0, 5.0, lambda c, tl, dur, T: c.alpha_composite(GRAD))   # layer: (canvas, tl, dur, t)
reel.ov(0.0, t, pz.headline(B, 'KICKER', 'Hook line', 'KEY PHRASE'))
reel.ov(t, 5.0, pz.list_item(B, 1, 3, 'ITEM', 'One-line benefit'))
reel.ov(0.0, 4.0, pz.text_layer('Client script *highlighted*'))                   # on-screen text without voice
SITE = pz.browser_frame('img/site.png', 1000, url='site.com')                      # build images once, outside layers
reel.ov(t, 5.0, lambda c, tl, dur, T: pz.appear(c, SITE, W / 2, H * .4, tl, 0))      # screenshot pops in (phone_frame too)
reel.shot(5.0, 8.0, pz.wipe_scene(before_src, after_src, B, hold=1.0))             # before/after
reel.shot(8.0, 11.0, pz.outro_save(B, 'img/hero.jpg', 'ref/logo.png', cta='Book a call · site.com'))
reel.sfx(sfx('whoosh'), t - 0.12, 0.32); reel.sfx(sfx('chime'), 8.3, 0.30)
reel.preview([0.5, 2.0, 4.5, 6.0, 9.0], 'review/preview.jpg', cols=5, scale=0.22)
reel.render('out/reel.mp4', 11.0, music='music/base.mp3', music_gain=0.24); reel.cover(1.2, 'out/cover.jpg')
```

Layers are functions `f(canvas, t_local, duration, t_global)` drawing RGBA on the canvas with `blit`. Sources are
objects with `.frame(t_local, duration)` returning an RGB image of the canvas size (W x H): `Still`, `Clip`, `Func(f)`,
and the scenes in `pieces` (`wipe_scene`, `outro_save`, `outro_fan`, `blur_in`). Easing: `eo` (out), `eio` (in-out),
`eback` (pop). Build images (gradients, cards, frames) once outside the layer function; text and pills are cached.

## 5. Drawn animation (full reference: `references/animation.md`)

Set up once: Node.js 18+, then `npm install` inside `<skill>/animation` (it downloads the engine's packages from npm
once; say so before you run it) and `node <skill>/animation/cli.mjs doctor`. A project is a folder with `package.json`,
`src/index.jsx` (`registerRoot` + one `<Composition>` per video) and `public/` for its files. Components import from
`'invokard-studio'`: `useCurrentFrame`, `spring`, `interpolate`, `Sequence`, `Img` + `staticFile`, `OffthreadVideo`,
3D from `'invokard-studio/three'`, and fonts from `'invokard-studio/google-fonts/<Family>'` — only the fifteen bundled
families: Inter, Outfit, Figtree, Poppins, Montserrat, Space Grotesk, Barlow, Barlow Condensed, Oswald, Anton, Bebas
Neue, Playfair Display, Fraunces, Shrikhand, Caveat. Another typeface: the user puts its file in `public/` and you
declare it with `@font-face`.

```bash
node <skill>/animation/cli.mjs still  src/index.jsx Ad out/ad.png --frame 120     # 1. design the key frame
node <skill>/animation/cli.mjs frames src/index.jsx Ad out/ad --frames 0,34,68,102,136,170,204,239   # 2. the motion
node <skill>/animation/cli.mjs render src/index.jsx Ad out/ad.mp4 --props data.json # 3. the video (all frames)
```

Every frame is computed from its number (no `Math.random`, no clocks, no CSS animations): frames are drawn out of
order in several tabs. Look at every still and frame sheet you render, as you do with reels. In a reel:

```python
import animation as an                                                          # scripts/animation.py
an.render('anim/src/index.jsx', 'Title', rk.P('anim/title'), transparent=True)  # PNG frames with alpha
reel.ov(t0, t1, an.layer(rk.P('anim/title')))                                   # drawn over the montage
reel.shot(t2, t3, an.clip('anim/src/index.jsx', 'EndCard', 'endcard'))           # a drawn shot, cut like a clip
```

`examples/animated-reel/` in the plugin folder is a complete reel that does both, with no outside media.

## 6. Deliverable checklist

- [ ] `out/reel.mp4` is 1080x1920 (or 1920x1080 / 1080x1080 as asked), 30 fps, H.264 + AAC, −14 LUFS ± 1,
      peak ≤ −1 dBFS (`media.py verify`)
- [ ] The verify sheet and 2-3 full frames were looked at; captions never sit below y≈1560 or over a face/product
- [ ] Every claim on screen is in the user's material; the brand colours were measured, not guessed
- [ ] `out/cover.jpg` reads inside the 4:5 centre crop of the feed
- [ ] Sources delivered without `frames/`; nothing published

## 7. What this build does not do

It does not generate images, video clips, voices, music or 3D models with AI, and it does not call any online service.
When a request needs one of those, say so plainly in the plan: the video can be made now with the user's own photos,
clips and recordings, with drawn animation (titles, charts, products in 3D, illustrations made of shapes), or with
files the user brings from wherever they like. Do not recommend a particular product or service.

## References

- `references/production.md` — the user's voice, captions, safe zones, audio, brands.
- `references/footage.md` — reels from the user's clips: contact sheets, extract, beat grid, music splice, wipe, end card.
- `references/animation.md` — the animation engine: project, commands, API, bundled fonts, montage + animation, troubleshooting.
- `references/api.md` — every function of `reelkit.py`, `pieces.py` and `media.py` with its arguments, and the
  default positions per format.
- `references/troubleshooting.md` — ffmpeg, fonts, Windows console, long renders.
