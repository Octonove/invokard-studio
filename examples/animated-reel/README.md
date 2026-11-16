# Montage + animation in one reel

![Preview](preview.gif)

A 13-second reel made from one script with both engines of Invokard Studio:

- **montage** (`reelkit`): the shots, every caption timed to the voice word by word, the cuts on words, the voice,
  music and effects mixed to −14 LUFS;
- **animation** (`skills/invokard-studio/animation`): a kinetic headline whose letters fall into place on springs and an
  underline that draws itself, a card whose numbers count up — drawn with a transparent background, **over** the
  montage — and the end card, a drawn **shot** cut on a word like any clip. The card's numbers come from `reel.py`
  (props): sentences, captioned words and drawn layers of this very reel.

Nothing comes from outside: the first run draws the pictures with Pillow and synthesises a hummed "voice" (one tone
burst per phrase, so the captions snap to it as they would to a real voice-over) and the music with ffmpeg.

```bash
cd skills/invokard-studio/animation && npm install       # once, from the repository root: the animation engine
python examples/animated-reel/reel.py --preview          # contact sheet: examples/animated-reel/work/review/preview.jpg
python examples/animated-reel/reel.py                    # the reel: examples/animated-reel/work/out/reel.mp4 + cover
python skills/invokard-studio/scripts/media.py verify examples/animated-reel/work/out/reel.mp4
```

The drawn parts are `anim/src/index.jsx` (three compositions, about 140 lines). The bridge is
`skills/invokard-studio/scripts/animation.py`:

```python
import animation as an
an.render(ENTRY, 'Headline', rk.P('anim/headline'), transparent=True)          # PNG frames with alpha
reel.ov(t0, t1, an.layer(rk.P('anim/headline')))                               # drawn over the montage
an.render(ENTRY, 'Counters', rk.P('anim/counters'), transparent=True, props=COUNTS)
reel.shot(t2, t3, an.clip(ENTRY, 'EndCard', 'endcard'))                        # a drawn shot
```

Record four real sentences over `work/vo/v01-v04.wav` and run it again: the captions, the cuts and the counters
follow your voice.
