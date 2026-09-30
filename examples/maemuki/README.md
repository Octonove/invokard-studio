# Maemuki — "Mis ambiciones rugen" (20 s lyric teaser from a song and its artwork)

An artist's single and the artwork of the single, nothing else. The chorus becomes a vertical teaser with the lyrics
appearing word by word, exactly when they are sung, key words highlighted, over a slow pan across the landscape
artwork. **Zero credits: nothing was generated.**

| | |
|---|---|
| Route | **C · Own audio** (`references/production.md` § Captions from one long audio) |
| Timing | `align.py music/ambiciones.mp3 --lang es --model small --text lyrics.txt --start 14.6 --dur 20` (the `small` model downloads on first use; a local CTranslate2 folder works too, e.g. `--model ../models/faster-whisper-small`) — the recognised words are snapped to the real lyrics, so the captions show the artist's words with the model's timings |
| Shots | two `Still` pans across the 1536x1024 artwork (moving focal point), `bottom_gradient` so the captions read |
| Engine pieces | `Captions.from_words`, `pill` title, `flash` on the key word, fade to the cover |
| Audio | the song excerpt is the voice track (`reel.vo`, no music, `duck=False`) |

The chorus lyrics come from the artwork itself. The two lines after it were recognised by the model and should be
checked by the artist before publishing; `chorus.words.json` reports `unmatched: 0` for the snap.

Files: the edit is [`reel.py`](../../skills/invokard-studio/assets/examples/maemuki/reel.py) (shipped inside the skill
so agents can read it); here: `lyrics.txt`, `chorus.words.json`, `maemuki-mis-ambiciones-rugen.mp4` (720p copy),
`cover.jpg`, `preview.gif`. The song and the artwork are not included (the artist's).
