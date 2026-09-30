# Changelog

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
