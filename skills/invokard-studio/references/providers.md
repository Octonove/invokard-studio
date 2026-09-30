# Providers reference — where images, video, voice and music come from

The engine is provider-agnostic: it reads files from `img/`, `vid/`, `vo/`, `music/`. Anything that produces those files
works. These are the integrations that have been used in production, cheapest first for each job.

## Connect

| Provider | How | Key / login | Gives |
|---|---|---|---|
| **Magnific MCP** (recommended) | Add `https://mcp.magnific.com` as an MCP server in your agent; sign in with OAuth in the browser | your Magnific account | images, video (Kling 3.0, Veo 3.1, Seedance), voice (`audio_tts`), music (Lyria 3), `simulate_cost`, uploads for references |
| **Magnific REST** | `MAGNIFIC_API_KEY` in the environment → `scripts/providers/magnific.py` | https://www.magnific.com/user/organization/api-keys | images (Seedream 4.5, Nano Banana Pro, z-image, Flux Klein), image-to-video (Kling 2.5/2.6), voice-over (ElevenLabs Turbo v2.5), sound effects, upscale, remove background |
| **ElevenLabs** | `ELEVENLABS_API_KEY` → `scripts/providers/elevenlabs.py` | https://elevenlabs.io/app/settings/api-keys | voice-over; `tts_timed()` returns per-word timings |
| **faster-whisper** (local) | `pip install -r requirements-align.txt` → `scripts/align.py` | none | word timings from any recorded voice or song |
| **Your own files** | drop them in the work folder | none | photos, clips, a recorded voice, a licensed track |

Keys live in the environment or in a `.env` file (see `.env.example`). Never in the chat, never in a script, never in
the work folder. `providers/env.py` reads them; `install.py doctor` reports only "set"/"missing".

### MCP server configuration snippets

Claude Code (`.mcp.json` in the project, or `claude mcp add --transport http magnific https://mcp.magnific.com`):
```json
{ "mcpServers": { "magnific": { "type": "http", "url": "https://mcp.magnific.com" } } }
```
Codex CLI: `codex mcp add magnific --url https://mcp.magnific.com` then `codex mcp login magnific`.
Antigravity / Gemini CLI: add the same URL in the MCP settings (`~/.gemini/settings.json` → `mcpServers`), sign in when prompted.
Cursor: Settings → MCP → add server with the URL.

## Magnific MCP — the tools the agent calls

- `images_generate` — `model` slug (`imagen-nano-banana-2` = Nano Banana Pro, 75 cr, slug checked in a live MCP session
  on 2026-09-20; the REST API calls the same model `nano-banana-pro`), `aspectRatio "9:16"`,
  `resolution "2k"`, `references: [{type: "style"|"image", identifier}]`. Upload a reference with
  `creations_request_upload` → PUT the file with curl → `creations_finalize_upload`.
- `video_generate` — `model` slug (`kling-30` default at 720p, 70 cr/s; `kling-26`; `google-veo3_1-lite`;
  `bytedance-seedance-pro-2.5`), `keyframes: {start, end}` with image identifiers, `withSoundEffects: false`.
- `audio_tts` — model `eleven_v3` (or `eleven_multilingual_v2`), one call per sentence, voice from `audio_voices_list`.
- `audio_music_generate` — `google-lyria-3-pro` (160 cr, 30-180 s requested; ignores the exact length) or ElevenLabs Music.
- `audio_sfx_generate` — a described effect when the bundled ones do not fit.
- `simulate_cost` — same arguments as the tool: run it for one clip and multiply. Mandatory before a batch.
- `creations_wait` (≤8 ids, ≤25 s per call, loop) · `creations_get` for long lists · download the `url` field with
  `media.py download` (curl). `creations_deliver` profile `h264` one at a time for Kling/Seedance at 1080p.
- Moderation rejects prompts with real people, minors or brands: rephrase neutrally.

## Magnific REST — `scripts/providers/magnific.py`

```python
from providers import magnific as mg
mg.image(prompt, 'img/a.png', model='seedream-v4-5', aspect='social_story_9_16')   # 50 cr, real 2K, legible text
mg.image(prompt, 'img/a.png', model='nano-banana-pro', aspect_ratio='9:16', resolution='2K')
mg.image_from_ref(prompt, ['ref/style.png'], 'img/b.png')                          # flux-2-klein, 1k only
mg.video(prompt, 'img/a.png', 'vid/a.mp4', model='kling-v2-5-pro', seconds=5)      # 28 cr/s at 720p; kling-v2-6-pro 45 cr/s 1080p
mg.voice('One sentence.', 'vo/v01.mp3', voice_id='narrator')                       # ElevenLabs Turbo v2.5 through Magnific
mg.sound_effect('short whoosh, airy', 'sfx/whoosh2.mp3')
mg.upscale('img/logo.png', 'img/logo_4x.png'); mg.remove_background(url, 'img/cut.png')
```

Facts learned the hard way: `z-image` ignores aspect and resolution (always ~1024 square); `flux-2-klein` fails at 2k;
Kling 2.6 creates on `kling-v2-6-pro` but reports status on `kling-v2-6`; result URLs expire (download at once);
the music endpoint answered **410** on 2026-09-22 (use the MCP or your own track); voice ids are **ElevenLabs** ids
(`VOICES_ES` has six verified Castilian voices), not Magnific's internal numbers.

## ElevenLabs — `scripts/providers/elevenlabs.py`

```python
from providers import elevenlabs as el
el.tts('One sentence.', 'vo/v01.mp3', voice_id=..., model='eleven_multilingual_v2')
words = el.tts_timed('Whole narration…', 'vo/narration.mp3')      # + vo/narration.words.json → caps.from_words()
el.voices()                                                       # list voice ids with language/gender labels
```

## Costs (credits, checked 2026-09-21 — `providers/costs.py`)

| Job | Model | Credits |
|---|---|---|
| Illustration | Nano Banana Pro (MCP) / Seedream 4.5 (REST) | 75 / 50 per image |
| Draft image | z-image | 5 |
| Clip | Kling 3.0 720p (MCP) | 70 per second (350 for 5 s) |
| Clip | Kling 2.5 Pro 720p (REST) | 28 per second |
| Clip | Kling 2.6 Pro 1080p | 45 per second |
| Clip | Veo 3.1 Lite / Veo 3.1 | 40 / 200 per second |
| Clip | Seedance 2.5 Pro 1080p | 790 per second |
| Music | Lyria 3 Pro (MCP) | 160 per track |
| Voice, effects, upscale, remove background | — | not published: report as "unpriced" |

A 40 s reel with 10 illustrations, 8 clips of 5 s on Kling 3.0 720p and one track: 750 + 2,800 + 160 ≈ 3,700 credits.
`python scripts/providers/costs.py images=10 video_seconds=40 music_tracks=1` prints the estimate.
