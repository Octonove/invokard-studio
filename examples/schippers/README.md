# Schippers New Zealand — "T&T Cleaner" (31 s, client footage, no voice-over)

A Fiverr order: 34 phone clips of a tractor being foamed and rinsed, a logo file, and a four-line script the client
wanted on screen. No voice-over. Delivered in one session, zero credits on video.

| | |
|---|---|
| Route | **B · Footage** (`references/footage.md`) |
| Sources | 19 of the client's 34 clips (portrait and landscape mixed), their script verbatim, their logo colours |
| Generated | one music track (Lyria 3 Pro, 160 credits), spliced so its break and final hit land where the edit needs them |
| Sound | the real pressure washer, cut from the clips with `media.py sound`; bundled whoosh / shimmer / chime |
| Engine pieces | `text_layer` (script with highlighted phrases), `wipe_scene` (before/after on the grille logo), `logo_card` + `end_card_layer` on the final hit, `blur_in` |
| Timing | every cut on a 115 BPM grid measured with `media.py beats`; text changes on bar starts |

What makes it look edited rather than assembled: the wipe. The dirty grille and the clean grille were shot from
different distances, so the dirty frame is scaled ×1.2 and shifted until both logos sit on the same pixels (measured
with a brightness mask of the chrome, see `dirty_frame` in `reel.py`). The wordmark was rebuilt as text because the
client's logo file was 538 px wide.

Files: the whole edit is [`reel.py`](../../skills/invokard-studio/assets/examples/schippers/reel.py) (shipped inside
the skill so agents can read it); here: `schippers-tt-cleaner.mp4` (720p delivery copy), `cover.jpg`, `preview.gif`.
The client's clips are not included; to re-render, put them in a work folder and follow the header of `reel.py`.
