# Changelog

## Unreleased

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
