# REEL — __TITLE__
# Built with Invokard Studio (reelkit). Preview:  python reel.py --preview    Render:  python reel.py
import sys, os, math
for _s in (sys.stdout, sys.stderr):                    # Windows consoles default to cp1252; keep unicode in prints safe
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
sys.path.insert(0, os.environ.get('INVOKARD_STUDIO', r'__STUDIO__'))
import reelkit as rk
from reelkit import W, H, Reel, Captions, Still, Clip, Func, blit, text_img, pill, lerp, clamp01, eo, eio, eback
import pieces as pz
from pieces import source, sfx

HERE = os.path.dirname(os.path.abspath(__file__)); rk.set_base(HERE)
B = pz.BRANDS['__BRAND__'].activate()                 # or pz.Brand.from_logo('ref/logo.png').activate()
reel = Reel('reel'); caps = Captions(size=70, y=1440, maxw=920); reel.caps = caps      # captions stay above y≈1560

# ---------------------------------------------------------------- 1 · voice: one file per sentence  (python media.py voice .)
# Caption syntax:  *word* = highlighted · / = block break · shown|spoken when the text differs from the speech ("40|forty")
T = {'v01': 0.30, 'v02': 3.40}                     # each sentence starts where the previous one ends + ~0.3 s
TOTAL = 12.0                                       # last sentence + 3-4 s of outro
for k, t in T.items(): reel.vo(f'vo/{k}.mp3', t)
caps.line('v01', 'First sentence with its *key* *words*.', 'vo/v01.mp3', T['v01'])
caps.line('v02', 'Second sentence, / split in *two* blocks.', 'vo/v02.mp3', T['v02'], size=66)
wt = caps.word_time                                # wt('v02', 3) -> second when the 4th word is spoken: every cut comes from here

# ---------------------------------------------------------------- 2 · shots (cuts derive from the voice, never by eye)
T_B = T['v02'] - 0.10
T_END = wt('v02', 4) + 1.2
reel.shot(0.0, T_B, source('shot_a', 'img/shot_a.png', speed=1.0, z=(1.0, 1.06), c=(.5, .45)))
reel.shot(T_B, T_END, source('shot_b', 'img/shot_b.png', start=0.25, z=(1.14, 1.24), c=(.5, .46)))

# ---------------------------------------------------------------- 3 · layers
GRAD = pz.bottom_gradient(B)
reel.ov(0.0, T_END, lambda c, tl, dur, t: c.alpha_composite(GRAD))
reel.ov(0.0, T_B, pz.headline(B, 'KICKER', 'Hook line', 'KEY PHRASE'))
reel.ov(T_B, T_END, pz.list_item(B, 1, 3, 'ITEM NAME', 'One-line benefit'))

# ---------------------------------------------------------------- 4 · outro (LOOK at the logo file before using it)
reel.shot(T_END, TOTAL, pz.outro_save(B, 'img/shot_a.png', 'ref/logo.png', cta='Book a call · domain.com',
                                      note=('Educational content. It does not replace', 'individual professional advice.')))

# ---------------------------------------------------------------- 5 · sound
reel.sfx(sfx('whoosh'), T_B - 0.12, 0.32)
reel.sfx(sfx('pop'), T_B + 0.02, 0.34)
reel.sfx(sfx('chime'), T_END + 0.3, 0.30)

if __name__ == '__main__':
    os.makedirs(rk.P('review'), exist_ok=True); os.makedirs(rk.P('out'), exist_ok=True)
    if '--preview' in sys.argv:                    # ALWAYS before rendering: contact sheet in review/preview.jpg
        n = 21; reel.preview([round(TOTAL * (i + 0.5) / n, 2) for i in range(n)], 'review/preview.jpg', cols=7, scale=0.22)
        print('review/preview.jpg')
    else:
        reel.render('out/reel.mp4', TOTAL, music='music/base.mp3', music_gain=0.24)
        reel.cover(1.2, 'out/cover.jpg')
        print('ok -> out/reel.mp4 · verify with: python media.py verify out/reel.mp4')
