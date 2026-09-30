---
name: invokard-studio
description: >-
  Produce complete vertical reels (1080x1920, 30 fps) for Instagram, TikTok and Shorts - script, voice-over,
  AI illustrations and animated clips or the client's own footage, word-by-word captions with the key word
  highlighted, music cut on the beat, sound effects, end card and the final MP4, composed frame by frame by a
  Python engine (reelkit) on top of ffmpeg. Use when asked for "a reel", "a short", "a vertical video for
  Instagram or TikTok", "turn this article or carousel into a video", "captions like those reels", "a before/after
  video from these clips", or to re-render or retouch a reel made with this skill. Not for generating a single
  image or clip (use your media provider directly) nor for writing only the script.
license: See LICENSE in the repository root.
compatibility: >-
  Python 3.10+, ffmpeg and ffprobe on PATH, Pillow, numpy, requests. Optional - Magnific MCP connector or
  MAGNIFIC_API_KEY, ELEVENLABS_API_KEY, faster-whisper.
metadata:
  author: Invokard / Octonove
  version: "1.0.0"
---

# Invokard Studio — from the idea to the MP4

You write a small Python file (`reel.py`) that describes the reel: which image or clip is on screen when, which layers
(headline, chips, list items, charts, wipes, end card) appear over it, which voice file starts when, and where the music
and effects go. The engine (`scripts/reelkit.py`) composes every frame with Pillow, pipes them to ffmpeg and mixes the
audio. Nothing is edited in a video editor and nothing is drawn by the AI image model: **all type, boxes and animation
come from the engine**, so they are sharp, on-brand and exactly timed.

Read this file whole. Then read the reference the current step points to. Before writing a `reel.py`, read one of the
scripts in `assets/examples/` (real, delivered reels; their media and previews live in the repository's `examples/`).

## 0. Check the machine (30 seconds)

```bash
python <skill>/scripts/../../../install.py doctor        # from the repo; or:
python <skill>/scripts/media.py fonts                   # reports fonts; downloads the emoji font if missing
ffmpeg -version && ffprobe -version
```

Missing ffmpeg is a hard stop: tell the user how to install it (see `references/troubleshooting.md`). Missing API keys
are not: the engine renders local media without any provider. Never ask the user to paste a key into the chat; point
them at `.env.example`.

## 1. Choose the route

| The material is… | Route | Reference |
|---|---|---|
| Nothing yet: a topic, an article, a carousel | **A · Generated**: script → voice (one file per sentence) → AI illustrations → clips → captions | `references/production.md` |
| The client's own clips or photos | **B · Footage**: contact sheets → pick segments → cut on the beat → before/after → end card | `references/footage.md` |
| A recorded narration, an interview, a song | **C · Own audio**: `align.py` gives word timings → captions from words | `references/production.md` § Captions |

Routes mix: a footage reel can carry a generated voice; a generated reel can end on the client's real logo photo.

## 2. Workflow

1. **Work folder** — `python scripts/new_reel.py <folder> --brand studio|lime|forest|mono --title "…"`. It creates
   `img/ vid/ frames/ vo/ music/ sfx/ ref/ out/ review/` and a `reel.py` from the template. Keep it outside the repo
   (`work/` is git-ignored). Brand: `pieces.Brand.from_logo('ref/logo.png')` measures the real colours; print them and
   look at the logo file first (media libraries are full of template logos with misleading names).
2. **Script** — 85-100 words for 35-45 s. Hook in the first sentence, one idea per sentence, an ending that echoes the
   hook. Only claim what is in the client's material: no new figures, no new promises. Health topics: an "educational
   content" note in the outro. If the user gave the script, use it verbatim (fix only what the product packaging spells
   differently, and say so).
3. **Voice** — one call per sentence so every sentence has its own file and timing: `vo/v01.mp3, v02…`.
   Providers in `references/providers.md` (Magnific MCP `audio_tts`, Magnific REST `providers/magnific.py voice`,
   ElevenLabs `providers/elevenlabs.py`). Then `python scripts/media.py voice <folder>`: durations and voiced spans;
   every timing and cut derives from them. No voice (client script on screen, music only)? Skip to 4.
4. **Images** — prompts and the style-reference trick in `references/production.md` § Images. Ask for **no text** in the
   images. Then `python scripts/media.py sheet-img <folder>` and LOOK at `review/imgs.jpg`: consistent style, no stray
   letters, the logo is the right one.
5. **Edit with stills first** — write `reel.py` using `pieces.source(name, 'img/x.png')` (it uses the still until the
   clip exists) and run `python reel.py --preview`. Look at `review/preview.jpg`. Fix rhythm, framing and layers BEFORE
   spending on video. This step is where the reel is made; do not rush it.
6. **Video** — one clip per shot that needs motion, from its own illustration (image-to-video). Recipe per shot type and
   `simulate_cost` in `references/production.md` § Video. Download to `vid/<name>.mp4`, `media.py frames <folder>`,
   `media.py sheet-motion <folder>`, and check that no clip invented objects. Shots under 2 s: keep the still with a
   zoom, it costs nothing.
7. **Music and effects** — one music track (Lyria via the MCP, or the user's own). The engine trims from the first
   onset and ducks it under the voice. Effects are bundled: `pieces.sfx('whoosh'|'pop'|'shimmer'|'chime'|'typing'|
   'shutter'|'coaster'|'fridge')`. Cut on the beat when there is no voice: `media.py beats` → `references/footage.md`.
8. **Render and verify** — `python reel.py`, then `python scripts/media.py verify out/reel.mp4`: specs, loudness
   (target −14 LUFS) and a contact sheet taken from the final MP4. Look at that sheet. Then look at 2-3 full frames
   (`media.py frame out/reel.mp4 <t>`) at the moments that matter: a caption change, the wipe, the end card.
9. **Deliver** — `out/reel.mp4` + `out/cover.jpg` (`reel.cover(t, 'out/cover.jpg')`) + caption text and hashtags in a
   `.md` + the sources (`reel.py`, `img/`, `vo/`, `music/`, `ref/`; never `frames/`). Do not publish anything: the
   client approves. Report what was generated, what it cost, and what you could not verify (you cannot listen to the
   mix: say so, and point at the loudness numbers instead).

## 3. Rules that come from real mistakes

- **Cost.** Video is >95 % of the spend. Estimate one clip × number of clips (`providers/costs.py` or the MCP's
  `simulate_cost`) before launching; if the batch passes 5,000 credits, stop and ask. A 12-shot reel should cost
  ~3,000 credits, not 40,000.
- **Look at every sheet.** `imgs.jpg`, `motion.jpg`, `preview.jpg`, the `verify` sheet. An unwatched render is not
  delivered.
- **Logos.** Never trust a file name. Open it. If it is small, rebuild the wordmark as text with the measured colours
  (the Schippers example does this) or compose it on white and upscale ×4.
- **Third-party brands.** Never reuse a logo or identity that is not the client's (e.g. the supplier of a service they
  sell). The tractor maker's badge may appear because it is on the client's own footage; it is never added.
- **Cuts come from the voice**, never by eye: `caps.word_time(key, i)` and the spans from `media.py voice`.
- **Short clips.** Generate 3-5 s even for a 1.5 s shot. Never slow a clip below `speed=0.8` (24 fps sources judder);
  to lengthen, put a `Still` of the same image before it with the zoom matched.
- **Safe zones.** Instagram covers ~220 px at the top and ~360 px at the bottom. Headlines and chips between y=230 and
  y=520; captions at y≈1440; nothing important below y≈1560. Minimum type 30 px (secondary chips 36-44, headlines 70+).
- **Captions on light backgrounds** need `pieces.bottom_gradient(brand)` as the FIRST layer.
- **Text in images.** All text is set by the engine. If a generated image shows letters, regenerate it.
- **Music from the client's clips is theirs.** Real sounds (a washer, an engine) can be cut from the footage with
  `media.py sound`; a song playing in the background of a clip is not a licence to use it.

## 4. The engine in one screen (full reference: `references/api.md`)

```python
import reelkit as rk; from reelkit import Reel, Captions, Still, Clip, Func, blit, text_img, pill, lerp, clamp01, eo, eio, eback
import pieces as pz; from pieces import source, sfx
rk.set_base(folder); B = pz.BRANDS['lime'].activate()          # or pz.Brand.from_logo('ref/logo.png').activate()
reel = Reel('name'); caps = Captions(size=70, y=1440, maxw=920); reel.caps = caps
t_end = reel.vo('vo/v01.mp3', 0.30)                            # returns where the sentence ends
caps.line('v01', 'Sentence with *key* *words*, / next block.', 'vo/v01.mp3', 0.30)   # *hl* · / break · shown|spoken
caps.from_words('song', align.load_words('vo/chorus.words.json'), t0=2.0)          # from align.py / elevenlabs.tts_timed
t = caps.word_time('v01', 2)                                    # the second the 3rd word is spoken → cut here
reel.shot(0.0, t, source('hero', 'img/hero.png', z=(1.0, 1.06), c=(.5, .45)))       # Still until frames/hero/ exists
reel.shot(t, 5.0, Clip('hero', speed=1.0, start=0.25, z=(1.14, 1.24)))
reel.ov(0.0, 5.0, lambda c, tl, dur, T: c.alpha_composite(pz.bottom_gradient(B)))  # layer: (canvas, local t, dur, global t)
reel.ov(0.0, t, pz.headline(B, 'KICKER', 'Hook line', 'KEY PHRASE'))
reel.ov(t, 5.0, pz.list_item(B, 1, 3, 'ITEM', 'One-line benefit'))
reel.ov(0.0, 4.0, pz.text_layer('Client script *highlighted*', y=470))            # on-screen text without voice
reel.shot(5.0, 8.0, pz.wipe_scene(before_src, after_src, B, hold=1.0))             # before/after
reel.shot(8.0, 11.0, pz.outro_save(B, 'img/hero.png', 'ref/logo.png', cta='Book a call · site.com'))
reel.sfx(sfx('whoosh'), t - 0.12, 0.32); reel.sfx(sfx('chime'), 8.3, 0.30)
reel.preview([0.5, 2.0, 4.5, 6.0, 9.0], 'review/preview.jpg', cols=5, scale=0.22)
reel.render('out/reel.mp4', 11.0, music='music/base.mp3', music_gain=0.24); reel.cover(1.2, 'out/cover.jpg')
```

Layers are functions `f(canvas, t_local, duration, t_global)` drawing RGBA on the canvas with `blit`. Sources are
objects with `.frame(t_local, duration)` returning an RGB 1080x1920 image: `Still`, `Clip`, `Func(f)`, and the scenes
in `pieces` (`wipe_scene`, `outro_save`, `outro_fan`, `blur_in`). Easing: `eo` (out), `eio` (in-out), `eback` (pop).

## 5. Deliverable checklist

- [ ] `out/reel.mp4` is 1080x1920, 30 fps, H.264 + AAC, −14 LUFS ± 1, peak ≤ −1 dBFS (`media.py verify`)
- [ ] The verify sheet and 2-3 full frames were looked at; captions never sit below y≈1560 or over a face/product
- [ ] Every claim on screen is in the client's material; the brand colours were measured, not guessed
- [ ] `out/cover.jpg` reads inside the 4:5 centre crop of the feed
- [ ] Sources delivered without `frames/`; cost reported per provider line; nothing published

## References

- `references/production.md` — image and video prompts, style references, morphs, caption syntax, safe zones, audio.
- `references/footage.md` — reels from the client's clips: contact sheets, extract, beat grid, music splice, wipe, end card.
- `references/providers.md` — Magnific MCP tools, Magnific REST, ElevenLabs, faster-whisper; credits; keys.
- `references/api.md` — every function of `reelkit.py`, `pieces.py`, `media.py`, `align.py` with its arguments.
- `references/troubleshooting.md` — ffmpeg, fonts, Windows console, TLS, long renders.
- `assets/examples/<name>/reel.py` — `schippers` (client footage, no voice, cut on the beat), `ekilib` (illustrations +
  voice + animated chart + list), `maemuki` (a song and its artwork: lyrics timed with `align.py`). Read the one closest
  to your route before writing yours.
