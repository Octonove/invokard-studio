# EXAMPLE — "Montage + animation" (≈15 s). One script, both engines of Invokard Studio:
#   · the montage engine (reelkit) cuts the shots, times every caption to the voice and mixes voice, music and effects;
#   · the animation engine draws, with code, a kinetic headline and a counter card (transparent, over the montage) and
#     the end card (a shot of its own). The counter card gets its numbers from this script (props).
# Everything is generated on the first run (pictures with Pillow, a hummed "voice" and the music with ffmpeg), so it
# renders on any machine with the requirements plus Node.js.
#
#   cd skills/invokard-studio/animation && npm install     # once: the animation engine
#   python examples/animated-reel/reel.py --preview          # contact sheet: work/review/preview.jpg
#   python examples/animated-reel/reel.py                    # -> work/out/reel.mp4 + cover (add --fast for a draft)
#
# The drawn parts live in anim/src/index.jsx. Edit them and run again: the animations are re-rendered when the file
# changes (or delete work/anim).
import hashlib, os, sys, subprocess
for _s in (sys.stdout, sys.stderr):                    # Windows consoles default to cp1252
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('INVOKARD_STUDIO') or os.path.join(HERE, '..', '..', 'skills', 'invokard-studio', 'scripts'))
import reelkit as rk
rk.set_format('9:16')                                  # the drawn compositions are 1080x1920
from reelkit import W, H, Reel, Captions, Still, Func
import pieces as pz
from pieces import sfx
import animation as an
from PIL import ImageDraw

rk.set_base(os.environ.get('REEL_DIR') or os.path.join(HERE, 'work'))   # git-ignored: generated media and renders
B = pz.BRANDS['studio'].activate()
ANIM = os.path.join(HERE, 'anim', 'src', 'index.jsx')
LINES = {'v01': 'Some reels are *edited*.',
         'v02': 'Others are *drawn* with code.',
         'v03': 'This one is *both*, / made from *one* script.',
         'v04': 'Voice, captions, music / and *animation*.'}

# ---------------------------------------------------------------- 0 · media, made once (swap any file for a real one)
def ffmpeg(*args): subprocess.run([rk.tool('ffmpeg'), '-v', 'error', '-y', *args], check=True)

def scene(night=False, size=2000):
    sky = ((18, 26, 58), (58, 50, 110)) if night else ((255, 196, 140), (250, 120, 110))
    im = rk.gradient(*sky, size, size); d = ImageDraw.Draw(im)
    d.ellipse((1180, 380, 1520, 720), fill=(236, 236, 250) if night else (255, 240, 200))
    for k, (y, col) in enumerate(((1250, (60, 70, 120) if night else (232, 140, 100)), (1450, (40, 50, 96) if night else (206, 110, 97)),
                                  (1650, (24, 34, 70) if night else (30, 58, 95)))):
        d.polygon([(0, size)] + [(x, y - 160 * abs(((x / size * (2 + k)) % 2) - 1)) for x in range(0, size + 1, 50)] + [(size, size)], fill=col)
    return im

def voice(path, text):
    """One tone burst per phrase, as long as its words: the captions snap to it as they do to a real voice-over."""
    phrases = [p for p in text.replace(' / ', ' ').replace(',', ',|').replace('.', '.|').split('|') if p.strip()]
    ins, labels = [], []
    for i, ph in enumerate(phrases):
        ins += ['-f', 'lavfi', '-i', f'sine=frequency={150 + 18 * i}:duration={0.12 + 0.30 * len(ph.split()):.2f}:sample_rate=44100']
        labels.append(f'[{len(labels)}]')
        if i < len(phrases) - 1: ins += ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.3']; labels.append(f'[{len(labels)}]')
    ffmpeg(*ins, '-filter_complex', ''.join(labels) + f'concat=n={len(labels)}:v=0:a=1,tremolo=f=5:d=0.5,volume=0.5[a]', '-map', '[a]', path)

def music(path, seconds):
    expr = ('0.55*sin(2*PI*52*t)*exp(-14*mod(t,0.5))+0.06*(random(0)-0.5)*lt(mod(t+0.25,0.5),0.04)'
            '+0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(lt(mod(t,4),2))'
            '+0.05*(sin(2*PI*196*t)+sin(2*PI*246.9*t)+sin(2*PI*293.7*t))*(gte(mod(t,4),2))')
    ffmpeg('-f', 'lavfi', '-i', f"aevalsrc='{expr}':s=44100:d={seconds}", '-af', f'afade=t=out:st={seconds - 1.5}:d=1.5', path)

for d in ('img', 'vo', 'music', 'out', 'review', 'anim'): os.makedirs(rk.P(d), exist_ok=True)
for name, build in (('img/day.png', scene), ('img/night.png', lambda: scene(night=True))):
    if not os.path.exists(rk.P(name)): build().save(rk.P(name))
for k, text in LINES.items():
    if not os.path.exists(rk.P(f'vo/{k}.wav')): voice(rk.P(f'vo/{k}.wav'), text)
if not os.path.exists(rk.P('music/base.wav')): music(rk.P('music/base.wav'), 24)

# ---------------------------------------------------------------- 1 · the drawn parts (animation engine)
words = sum(len(t.replace('*', '').replace(' / ', ' ').split()) for t in LINES.values())
COUNTS = {'title': 'In this reel', 'items': [{'label': 'sentences', 'value': len(LINES)},
                                              {'label': 'captioned words', 'value': words},
                                              {'label': 'drawn layers', 'value': 3}]}
stamp = hashlib.sha1(open(ANIM, 'rb').read() + repr(COUNTS).encode()).hexdigest()[:10]   # re-render when they change
def drawn(name, composition, **kw):
    out = rk.P('anim', f'{name}-{stamp}')
    if not os.path.isdir(out): an.render(ANIM, composition, out, transparent=True, **kw)
    return out
HEADLINE = drawn('headline', 'Headline')
COUNTERS = drawn('counters', 'Counters', props=COUNTS)
END = rk.Clip(f'endcard-{stamp}') if os.path.isdir(rk.P('frames', f'endcard-{stamp}')) else an.clip(ANIM, 'EndCard', f'endcard-{stamp}')

# ---------------------------------------------------------------- 2 · voice and captions (montage engine)
reel = Reel('animated-reel'); caps = Captions(size=70, y=1440, maxw=920); reel.caps = caps
T, t = {}, 0.3
for k in LINES: T[k] = t; t = reel.vo(f'vo/{k}.wav', t) + 0.35
for k, text in LINES.items(): caps.line(k, text, f'vo/{k}.wav', T[k])
wt = caps.word_time
T_DRAWN, T_BOTH, T_END = T['v02'] - 0.1, T['v03'] - 0.1, wt('v04', 3) - 0.2
TOTAL = max(t + 1.8, T_END + 4.0)

# ---------------------------------------------------------------- 3 · shots: every cut is a word time
reel.shot(0.0, T_DRAWN, Still('img/day.png', z=(1.0, 1.08), c0=(.45, .55), c1=(.6, .5)))
reel.shot(T_DRAWN, T_BOTH, Still('img/night.png', z=(1.05, 1.14), c0=(.5, .55)))
reel.shot(T_BOTH, T_END, Still('img/night.png', z=(1.6, 1.75), c0=(.66, .3)))
reel.shot(T_END, TOTAL, END)                                                 # a drawn shot, cut on a word like any clip

# ---------------------------------------------------------------- 4 · layers: the drawn ones go over the montage
GRAD = pz.bottom_gradient(B)
reel.ov(0.0, T_END, lambda c, tl, dur, t: c.alpha_composite(GRAD))
reel.ov(0.0, T_DRAWN, pz.headline(B, 'INVOKARD STUDIO', 'Montage', 'AND ANIMATION'))
reel.ov(T_DRAWN, T_BOTH, an.layer(HEADLINE))
reel.ov(T_BOTH, T_END, an.layer(COUNTERS))

# ---------------------------------------------------------------- 5 · sound
for t_cut in (T_DRAWN, T_BOTH, T_END): reel.sfx(sfx('whoosh'), t_cut - 0.12, 0.25)
reel.sfx(sfx('pop'), T_BOTH + 0.35, 0.3); reel.sfx(sfx('chime'), T_END + 0.3, 0.3)

if __name__ == '__main__':
    if '--preview' in sys.argv:                        # ALWAYS before rendering
        n = 14; reel.preview([round(TOTAL * (i + 0.5) / n, 2) for i in range(n)], 'review/preview.jpg', cols=7, scale=0.22)
        print(rk.P('review/preview.jpg'))
    else:
        out = reel.render('out/reel.mp4', TOTAL, music='music/base.wav', music_gain=0.30, music_offset=0.0,
                          preset='veryfast' if '--fast' in sys.argv else 'slow')
        reel.cover(T_DRAWN + 1.4, 'out/cover.jpg')
        print(f'ok -> {out}\nverify: python skills/invokard-studio/scripts/media.py verify "{out}"')
