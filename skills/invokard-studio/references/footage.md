# Footage reference — reels from the client's own clips (route B)

The method that produced `assets/examples/schippers/`: 34 phone clips, no voice-over, the client's script on screen,
a before/after wipe, every cut on a beat grid, an end card on the final hit. Zero credits on video.

## 1. Look at everything before choosing

```bash
python scripts/media.py sheet-footage <work> <folder-with-clips>      # review/footage_NN.jpg, timestamped frames per clip
```

Read the sheets like a rush log: which clips show the problem (dirty), the product, the action, the result (clean).
Write the shot list as `(name, file, start, duration)` in the reel script. Portrait and landscape mix freely: `extract`
fits landscape clips 1420 px wide over their own blurred copy so nothing is cropped away.

```bash
python scripts/media.py extract <work> <shot> IMG_4358.mp4 0.10 1.50           # auto: fill portrait / fit landscape
python scripts/media.py extract <work> <shot> IMG_4358.mp4 0.10 1.50 fit       # force
```

Extract ~0.35 s more than the shot needs so `Clip.start` and zooms have slack.

## 2. Cut on the beat

```bash
python scripts/media.py beats music/base.mp3 8 52          # BPM, beat length, first beat  (window 8-52 s)
python scripts/media.py energy music/base.mp3              # loudness per 0.5 s: find the break and the final hit
```

`beat_grid` sweeps tempo and phase over the spectral flux; plain autocorrelation gets busy mixes wrong. Then:

```python
BEAT = 60 / 115; def bar(k): return first_beat + 4 * k * BEAT
SHOTS = [('grille_dirty', 2, (1.0, 1.06)), ('hydraulics', 2, (1.04, 1.10)), ...]     # (frames folder, beats, zoom)
t = 0.0
for name, beats, z in SHOTS: reel.shot(t, t + beats * BEAT, Clip(name, z=z)); t += beats * BEAT
```

Text blocks (the client's script) change on bar starts: `reel.ov(bar(0), bar(1) - 0.05, pz.text_layer('…', y=470))`.
Air hits on block changes: `reel.sfx(sfx('whoosh'), bar(k) - 0.14, 0.25)`.

## 3. Use the track's own structure

A 30 s reel rarely fits a 60 s track's break and ending. Splice on bar starts with a 25 ms crossfade:

```bash
python scripts/media.py splice music/base.mp3 music/edit.wav 18.863 50.167 31.8   # keep 0-18.863, jump to 50.167
```

Plan the reel so the **break** (energy drop) falls on the "before" shot and the **final hit** lands the end card:
`T_HIT = splice_time + 20 * BEAT; reel.ov(T_HIT - 2 * BEAT, TOTAL, pz.end_card_layer(card, t_pop=2 * BEAT - 0.18))`.
Render with `music_offset=0.0, music_fade_out=0.3` so the engine does not trim or fade the edited track.

Lyria (`google-lyria-3-pro`) ignores the requested duration and returns 40-60 s: that is what makes the splice possible.

## 4. Real sound from the footage

```bash
python scripts/media.py sound IMG_4359.mp4 sfx/spray.wav 10.5 1.3       # highpass 120 Hz, fades
python scripts/media.py sound IMG_4358.mp4 sfx/ambience.wav 0 2.1 80 0.4
reel.sfx('sfx/spray.wav', T_FOAM, 0.34); reel.sfx('sfx/ambience.wav', T_BREAK + 0.05, 2.2)   # ambience fills the music break
```

Only sounds that are the client's own recording. A song playing in the background of a clip is not licensed.

## 5. Before / after wipe

```python
before = Clip('grille_dirty', speed=0.8); after = Clip('grille_clean', speed=0.9)
reel.shot(T_BREAK, T_REVEAL + 2 * BEAT, pz.wipe_scene(before, after, B, hold=T_REVEAL - T_BREAK, sweep=0.85))
```

The wipe only works if the subject sits on the same pixels in both clips. When the two shots were framed differently:

1. Isolate the subject in one frame of each clip with a brightness/saturation mask (`scipy.ndimage` closing + fill,
   keep the blob under a seed point) and compare boxes and centres. Phase correlation on edges does NOT work on
   perforated grilles or textured surfaces.
2. Scale and shift the raw (unscaled) frame of the wider clip inside the 1080-wide band of the composition — never the
   composed frame, so both bands measure the same — with a `Func` source (see `dirty_frame` in the Schippers example).
3. No `Clip` zoom on either side of the wipe.

`settle=540` stops the bar in the middle for a split-screen cover (`pz.split_frame` builds the still).

## 6. End card

```python
CARD = pz.logo_card('ref/logo.png', w=960, line='Product name', accent=B.accent)        # or a PIL image (rebuilt wordmark)
reel.shot(T_CARD, TOTAL, pz.blur_in(Clip('final_wide', speed=0.8), dur=0.6, delay=0.45)) # the last shot blurs under the card
reel.ov(T_CARD, TOTAL, pz.end_card_layer(CARD, t_pop=T_HIT - T_CARD - 0.18, y=900))      # lands on the hit
reel.sfx(sfx('chime'), T_HIT, 0.30)
```

A logo file under ~600 px wide pixelates at reel size: rebuild the wordmark as text with the measured colours
(`font('bold', 112)` + `font('reg', 112)`) and say so in the delivery.

## 7. Cover

`pz.split_frame(before_frame, after_frame, W // 2, B)` + `pz.text_block(hook)` at y=470 + the two labels. Keep the
subject inside the 4:5 centre crop.

## 8. What to tell the client

Which clips were used and why the others were left out (duplicates, faces, unreadable macro, over length); what was
corrected from their script (spelling as printed on the product); that the music is AI-generated (no third-party
rights); that the logo was rebuilt, if it was.
