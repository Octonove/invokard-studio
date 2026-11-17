# Changelog

## Unreleased

- **Bundled fonts.** Fifteen open-licensed families (Inter, Outfit, Figtree, Poppins, Montserrat, Space Grotesk,
  Barlow, Barlow Condensed, Oswald, Anton, Bebas Neue, Playfair Display, Fraunces, Shrikhand, Caveat; SIL OFL, every
  weight, latin and latin-ext) ship in `animation/fonts` and never touch the network. Other Google Fonts families
  are still downloaded once and cached. `node cli.mjs doctor` lists them; `tools/fetch_fonts.mjs` rebuilds the set.
- **Offline switch.** `INVOKARD_OFFLINE=1` (or a `LOCAL_ONLY` file next to the engine's package.json) turns every
  download off: fonts, the browser download and remote videos. Tested in `test/offline.test.mjs`.
- **Invokard Studio Local**, a separate plugin with no online services, built from this repository with
  `local-plugin/build.py`: the same engines without the provider integrations, the affiliate links, Whisper or any
  download; CI builds it and audits it on every change.

## 1.1.0 · 16 November 2026 — the animation engine, montage + animation, the Claude Code plugin, 16:9 and 1:1

- **Animation engine** (`skills/invokard-studio/animation/`, Node.js 18+): videos drawn with code. A composition is a
  React component that draws a frame from its number; the engine bundles it with esbuild, opens it in the Chrome or
  Edge already installed (or a headless Chromium downloaded once), renders in several tabs at once and encodes MP4
  (H.264, BT.709 converted and tagged), ProRes 4444 with alpha, or PNG frames with alpha. API: `Composition`, `Still`,
  `Sequence`, `Series`, `Loop`, `Freeze`, `useCurrentFrame`, `useVideoConfig`, `spring`, `measureSpring`,
  `interpolate`, `interpolateColors`, `Easing`, `random`, `staticFile`, `Img`, `OffthreadVideo` (frames extracted with
  ffmpeg), `delayRender`; Google Fonts downloaded once into `.invokard/fonts`, offline after that, and loaded before
  any component mounts (components that measure text on mount get the real font); 3D through `invokard-studio/three`
  (three.js + @react-three/fiber, drawn once per frame). CLI: `list`, `still`, `frames`, `render`, `doctor`, `browser`;
  Node API: `renderMedia`, `renderStill`, `renderStills`, `listCompositions`. Renders are deterministic: the same
  input gives the same bytes.
- **Inside agent sandboxes**: when the sandbox forbids listing the folders above the project (Codex on Windows does),
  esbuild stops with "Access is denied"; the engine then builds again in a safe mode that resolves every import and
  reads every file itself, with the same result pixel for pixel. `INVOKARD_BUNDLE=safe` forces it.
- **macOS**: the whole frame is captured. Headless Chrome on macOS painted about 87 px less than the viewport it
  reported, and the bottom of every frame came out white.
- **Montage + animation**: `scripts/animation.py` renders a composition from a reel script and uses it as a layer drawn
  over the montage (`layer()`, transparent frames) or as a shot (`clip()`), with props passed from Python.
- **Examples**: `examples/animated-reel` (a reel that uses both engines, generated from scratch, rendered in CI) and
  `examples/animation` (four animated ads: a character, a product in 3D, physics, particles; under their own terms).
- **Claude Code plugin**: `.claude-plugin/plugin.json` and `marketplace.json`:
  `claude plugin marketplace add Octonove/invokard-studio`, then `claude plugin install invokard-studio@invokard-studio`.
- **Generated media, said once and openly**: when a request needs AI video, images, voices, music or 3D and no provider
  is connected, the skill tells the user what it would add, that it is optional, and gives the Magnific or ElevenLabs
  link marked as an affiliate link (SKILL.md § 7, references/providers.md).
- **install.py** never copies `node_modules` or font caches; `doctor` reports Node.js and the animation engine.
- **CLI fixes** (`media.py`): `beats` printed its tuple and exited with status 1 although it worked (only an int is an
  exit status now); `web()` called from Python with a number for `crf` crashed. `tests/test_media_cli.py` runs the CLI
  with every argument as a string and the same functions from Python with numbers.
- **CI** also runs the animation engine's tests (`npm test`) and renders `examples/animated-reel` on Ubuntu, Windows and
  macOS.

Merged on 15 October 2026 (#1) and part of this release:

- **Formats: 16:9 and 1:1.** `rk.set_format('16:9' | '1:1' | '9:16')`, `REELKIT_FORMAT`, or `new_reel.py --format`;
  `REELKIT_LANDSCAPE=1` (the first landscape switch) still means 16:9. Captions and pieces take their default
  positions from `rk.LAYOUT`; 9:16 keeps the 1.0.0 numbers and its frames are unchanged pixel for pixel (checked on
  22 frames that use every piece). `media.py --format` cuts frames and extracts for the format; review sheets, `verify`
  and `web` follow the video's shape. `Clip` crops frames of another size instead of returning them, and `frame_at`
  refuses a frame of the wrong size (1080x1920 and 1920x1080 have the same bytes: ffmpeg encoded garbage silently).
- **New pieces**: `browser_frame()` and `phone_frame()` (screenshots in a window or a phone).
- **Fixes**, each with a test in `tests/test_fixes.py`: caches keyed by relative path served another folder's files
  after `set_base()` and old versions of regenerated files; missing files and a missing ffmpeg now say what to do;
  `render()` checks the audio inputs before the video (a missing music file used to fail after the whole render);
  a dead encoder is reported instead of a `BrokenPipeError`; stray `*`/`**` and empty words in captions no longer
  crash; `silencedetect` times in exponent form are read correctly; `cover()` creates its folder; `media.py`
  prints usage on wrong arguments, takes `sheet-img` columns from the command line, finds `.MP4`/`.JPG` files on
  Linux/macOS and no longer lists `.MOV` clips twice on Windows; `new_reel.py` validates the brand and survives a
  path with a quote. `render_video`, `render_audio` and `mux` resolve relative paths against the work folder.
  The duration of raw ADTS `.aac` is measured instead of estimated from the bitrate (3.43 s for 3.2 s of speech);
  `align.py` cuts each excerpt to a temporary file of its own and deletes it; colour emoji work with bitmap emoji
  fonts at any size (Apple Color Emoji on macOS raised "invalid pixel size"); `media.py doctor` checks the machine
  from an installed copy of the skill, which has no `install.py`.
- **Faster**: zooms and pans resample with `resize(box)` (a frame with a moving still, a headline and captions: 167 to
  50 ms; frames differ from 1.0.0 by 0.3-0.7 levels on average, `rk.LEGACY_RESAMPLE = True` restores them exactly);
  stills without motion are composed once; text and pills are cached; `beat_grid` is ~10x faster with the same result.
  `render(..., preset='veryfast')` for drafts.
- **Example**: `examples/first-reel` renders a complete reel with no outside media (it draws and synthesises its own),
  in 9:16, 16:9 or 1:1.
- **Tests and CI**: 75 tests (formats, fixes, pure caption timing, frame composition, speed-ups against the old code,
  the example); GitHub Actions on Ubuntu (Python 3.10 with the oldest supported versions, 3.13), Windows (3.14) and
  macOS (3.13).
  `requirements-dev.txt`; the requirements cap the next major versions.
- **Docs**: README rewritten for a first-time user (install with a virtual environment, first reel in 5 minutes,
  formats, troubleshooting, FAQ), in English and Spanish; SKILL.md and the references cover formats.
- **Audio: the opening keeps its level.** `render_audio` (and so `render`) normalises with one fixed gain for the whole
  reel, measured in a first pass (`linear=True`, now the default). Single-pass `loudnorm` is dynamic and starts with too
  little gain, so a hook spoken in the first seconds came out quieter than the same audio later: up to 5-6 dB on a real
  video, ~5 dB in the new test. It also missed −14 LUFS on short reels (−11.8 LUFS in that test).
  When the gain would push the peaks past `true_peak` (speech at −14 LUFS / −2 dBTP usually does: there are 12 dB of
  room and the voice mixes measured had peaks ~14 dB above their loudness), `loudnorm` silently refuses linear mode; the
  engine then applies the same gain with `volume` and lets the existing limiter catch the peaks (real voice mix: −14.3
  LUFS, peak −2.0 dBTP, opening and repeat within 0.0 dB). With `limiter=False` that case stays dynamic. `linear=False` brings back
  the old behaviour. Cost: one extra audio-only ffmpeg pass.
- **Tests**: `test_loudness_keeps_the_opening_level` — the same second at 0 s and at 13.5 s must come out within 0.5 dB,
  for a plain tone (linear `loudnorm`) and for a signal with speech-like peaks (`volume` + limiter).

## 1.0.0 · 30 September 2026 — rebuilt around the reel engine

The repository is rebuilt from scratch. The 0.x TypeScript plugin for Codex is kept in git history under the tag
`v0.2.0-codex`.

- **Engine** (`skills/invokard-studio/scripts/reelkit.py`): frame-by-frame compositor on Pillow + ffmpeg, 1080x1920 at
  30 fps; `Still`, `Clip`, `Func` sources; layers; word-by-word captions timed from the voice (`line`) or from timed
  words (`from_words`); audio mix with ducking, loudness normalisation and a true-peak limiter; works with voice only,
  music only or both; `beat_grid` and `music_start`.
- **Components** (`pieces.py`): brands (`Brand.from_logo`), headline, hook, chips, `text_block` with highlighted runs and
  colour emoji, animated chart `Card`, `list_item`, `wipe_scene` (before/after), `logo_card` + `end_card_layer`,
  `blur_in`, `outro_save`, `outro_fan`, `outro_comment`.
- **Tools** (`media.py`): frames, `extract` (real footage, landscape blur-fit), contact sheets (images, motion, footage),
  voice spans, beats, energy, splice, sound, silence, compare, verify, frame, web, gif, fonts.
- **Alignment** (`align.py`): faster-whisper word timings, snapped to the real text when given.
- **Providers**: Magnific REST (images, image-to-video, voice-over, effects, upscale, remove background), ElevenLabs
  (TTS with per-word timestamps), credit table and estimates; the Magnific MCP connector documented for agents.
- **Skill**: `SKILL.md` following the Agent Skills standard, with references for production, footage, providers, the
  API and troubleshooting. Installs into Claude Code, Codex, Antigravity, Gemini CLI, Cursor and Windsurf with
  `install.py`; `install.py doctor` checks the machine.
- **Fonts**: Inter and Playfair Display bundled (OFL); Noto Color Emoji downloadable; system fonts as fallback.
- **Examples**: Schippers (client footage, cut on the beat), Ekilib (illustrations + voice + chart), Maemuki (a song
  and its artwork, lyrics timed with `align.py`), Simplifica con IA (three prompt reels).
- **Tests**: engine (captions, text blocks, alignment, beat grid, smoke render) and installer.

## 0.2.0 · 30 September 2026 (Codex build, retired)

Word-synchronised ASS captions, faster-whisper transcription, provider job recovery. See tag `v0.2.0-codex`.

## 0.1.0 · 29 September 2026 (Codex build, retired)

First private beta: TypeScript MCP + CLI, FFmpeg exports, Higgsfield/Magnific adapters.
