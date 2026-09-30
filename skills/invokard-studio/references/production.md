# Production reference — generated reels (route A) and captions from your own audio (route C)

Index: Images · Video · Captions · Composition and safe zones · Audio · New brands

## Images

Two ways to generate: the **Magnific MCP connector** (`images_generate`, best model choice, style references,
`simulate_cost`) or the **REST helper** `providers/magnific.py` (`image()`, key in the environment). The prompts are
the same.

- Model: `imagen-nano-banana-2` on the MCP (= Nano Banana Pro; note that `-flash` is Nano Banana 2, a different model),
  `aspectRatio "9:16"`, `resolution "2k"`, 75 cr each. On REST: `seedream-v4-5` (50 cr, `social_story_9_16`) or
  `nano-banana-pro` (aspect `9:16`, resolution `2K`). Launch all the images of a reel in parallel.
- **Consistent style**: upload ONE reference image of the client (a carousel slide, their illustration) and pass it in
  every call as `references: [{type: "style", identifier}]` (MCP) or use `image_from_ref` (REST).
- **Same character in several scenes**: generate one scene first and pass it as `{type: "image", identifier}` while
  describing "the same woman from the reference image…" and her traits.
- **Pair for a morph** (before/after of the same scene): generate the "before", then ask for the "after" with that image
  as reference: "Exactly the same scene, same camera angle and composition, but now…". They match pixel for pixel.
- Prompt block that works for flat illustration (adapt the palette; **colours by NAME, never hex**: a hex code can be
  painted as text):
  > Flat vector illustration matching the style reference exactly: clean simple geometric shapes, soft two-tone cel
  > shading. Strict palette: [colour names]. Large organic rounded blob shapes behind the subject on a pure white
  > background. Vertical 9:16 composition, main subject centred in the middle band, keep the top 22% and the bottom
  > 30% calm and mostly empty for text overlays. Absolutely no text, no letters, no numbers, no logos.
- Photographic product shots: Seedream 4.5 sometimes paints a fake social-media UI with gibberish text when the prompt
  says "for a social media reel", and adds logos on products despite "no brand marks". Describe the object and the
  light, not the destination; regenerate on any stray glyph.
- Every word on screen is set by the engine, not the image model: always ask for images WITHOUT text.

## Video

Only through the Magnific MCP connector today (`video_generate` with `keyframes.start` = the illustration's identifier);
the REST helper covers Kling 2.5/2.6 image-to-video (`providers/magnific.py video`). Recipe per shot type:

| Shot | slug (MCP) | Note |
|---|---|---|
| Food / object | `google-veo3_1-lite` (4, 6 or 8 s) | Sharpest line. Check it invents nothing. |
| Characters and action | `kling-26` (5 or 10 s) | Add "background perfectly still". |
| 3 s clip or free length | `kling-30` (3-15 s) | Default for reels: 70 cr/s at 720p, 90 at 1080p. |
| Rescue, lip-sync, native audio | `bytedance-seedance-pro-2.5` | 17-20× the price. Last resort. |
| Dialogue with lip-sync | `google-veo3_1` (4/6/8 s) | Generates voice and mouth from the prompt. |

- **Default: Kling 3.0 at 720p** — 70 cr/s, 350 cr for a 5 s clip with start and end frames. At 720p the `url` from
  `creations_wait` already comes at 716x1284: no `creations_deliver` needed. Three reels with five clips each cost 1,610
  cr of video (3,389 in total with images, music and voice).
- Always `keyframes.start` with the illustration; for morphs also `keyframes.end` (Kling 2.5 at 720p and Kling 3.0 Turbo
  do not accept an end frame). `withSoundEffects: false`.
- Base prompt: "2D flat vector motion-graphics animation. [one or two sentences of concrete action]. Keep the exact flat
  illustration style, colors and composition. Static camera, no zoom. Background perfectly still. No new objects, no
  text, no letters." Never ask for background drift: Kling exaggerates it and warps the composition.
- Veo 3.1 Lite with characters added a second bag and another loaf despite "no new objects": use it for objects only.
- Wait with `creations_wait` (max 25 s per call; loop). Real resolution: Veo's `url` is already 1080p; Kling/Seedance
  need `creations_deliver` profile `h264` **one at a time** (in parallel: "Too many delivery renders").
- "requires additional permissions" errors are intermittent: read again or use `creations_get`; nothing is lost.
- `simulate_cost` is mandatory before a batch: one clip × number of clips. Above ~5,000 credits, ask.
- Download to `vid/<name>.mp4` with `media.py download`, then `media.py frames <folder>` and `media.py sheet-motion`.

## Captions (`Captions.line(key, text, audio, t0, y=, size=)`)

- `*word*` highlighted (accent box, upper case) · ` / ` forces a block break · `shown|spoken` when the written form
  differs from the spoken one (`40|forty`) · `show=False` registers timings without drawing (useful in outros).
- If the number of phrases (split on `.,:;?!`) equals the number of voiced spans from `silencedetect`, each phrase snaps
  to its span; otherwise words are spread proportionally over the voiced time, skipping pauses. "…" does not count as
  punctuation: write ".".
- `caps.word_time(key, i)` → the second word `i` is spoken (the ` / ` marker does not count). Every cut starts here.
- Size 64-72 px; never below 60. In the TTS text the key word stays lower case; the engine upper-cases it on screen.
- Blocks hold up to 4 words / ~22 characters; single-word blocks merge with their neighbour when the gap is short.

### Captions from one long audio (route C)

- Recorded narration or interview: `python scripts/align.py vo/narration.mp3 --lang en --text "the exact words"
  --out vo/narration.words.json` (faster-whisper, local). Passing `--text` snaps the recognised words to the real ones,
  so the captions show your script with the model's timings. Without `--text` you get the recognised words: review them.
- A song: same, with `--start`/`--dur` for the excerpt; times are relative to the excerpt. Vocals over a full mix are
  harder: use the `large-v3` model, pass the lyrics as `--text`, and check `unmatched` in the JSON. See the Maemuki
  example.
- ElevenLabs narration: `providers/elevenlabs.py tts_timed()` returns exact per-word timings, no whisper needed.
- Then `caps.from_words('k', align.load_words(path), t0)` where `t0` is where that audio starts in the reel. Mark
  highlights by editing the JSON `text` fields (`*word*`).

## Composition and safe zones (1080x1920 canvas)

- Instagram covers ≈220 px at the top and ≈360 px at the bottom. Headlines and chips between y=230 and y=520; captions
  at y≈1440; nothing important below y≈1560. Minimum type 30 px (secondary chips 36-44, headlines 70+).
- On white-background illustrations, white captions need `pieces.bottom_gradient(B)` as the FIRST layer.
- Item framing: `source(k, img, start=0.25, z=(1.14, 1.24), c=(.5, .46))` lifts the subject and leaves room for the
  benefit at y≈1262. `Still(img, z=(2.0, 2.3), c0=(x, y))` reframes a detail without generating anything.
- The cover comes from `reel.cover(t, path)`; in the feed it is cropped to 4:5 through the centre.
- Landscape stills or clips: fit them 1420 px wide over their own blurred copy (`media.py extract … fit`) rather than
  cropping. A pan across a landscape artwork: `Still(path, z=(1.0, 1.0), c0=(.3, .5), c1=(.7, .5))`.

## Audio

- Music: MCP `audio_music_generate` model `google-lyria-3-pro` (160 cr; `durationSeconds` is often ignored, tracks come
  out 40-60 s). The engine trims from the first onset (`music_start`) and ducks it under the voice (sidechain).
  `music_gain` 0.22-0.28 with voice, 0.5-0.6 without. The REST music endpoint answered 410 in September 2026.
- Final mix normalised to −14 LUFS, true peak −2 dBFS with a limiter (`render_audio` options). Effects gain 0.25-0.40.
- Cutting on the beat, splicing a track to reach its break or final hit, real sounds from footage: `references/footage.md`.
- You cannot listen. Say so in the delivery and give the measured numbers (`media.py verify`).

## New brands

`pieces.Brand(dark, dark_deep, light, light_soft, accent, accent_text)` or `Brand.from_colors(dark, accent)` or
`Brand.from_logo('ref/logo.png')` (measures the logo with a median-cut quantiser; print and check). `accent_text` must
contrast on `accent` (lime → navy, coral → white). `B.activate()` applies it to the captions.
