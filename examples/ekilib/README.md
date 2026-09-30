# Ekilib — "¿Tu azúcar es una montaña rusa?" (45 s, Spanish, illustrations + voice + animated chart)

An educational reel for a nutrition clinic, built from one of their carousels: nine sentences of voice-over, thirteen
illustrations in the client's flat style, twelve animated clips, a numbered list of six foods, an animated
glucose/insulin card, a before/after morph of a plate and a "save this reel" outro with the clinic's logo.

| | |
|---|---|
| Route | **A · Generated** (`references/production.md`) |
| Voice | ElevenLabs v3 through the Magnific MCP, one file per sentence (`vo/v01…v09.mp3`) |
| Images | Nano Banana Pro with the client's illustration as a `style` reference; same character across scenes with an `image` reference |
| Clips | Seedance 2.5 / Kling (this was the reel that taught the cost rule: estimate first, 5,000 credits is the alarm) |
| Music | Lyria 3 Pro, ducked under the voice by the engine |
| Engine pieces | `headline`, `list_item`, `Card` + `curve`, `bottom_gradient`, `outro_save`, word-by-word `Captions` |
| Timing | every cut is `caps.word_time()`; the six items snap to the pauses of the voice (`media.py voice`) |

Files: the edit is [`reel.py`](../../skills/invokard-studio/assets/examples/ekilib/reel.py) (shipped inside the skill
so agents can read it); here: `ekilib-montana-rusa.mp4` (720p copy), `cover.jpg`, `preview.gif`. The illustrations,
clips and voice files are not included (client material).
