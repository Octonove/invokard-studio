# EXAMPLE — Maemuki · "Mis ambiciones rugen" (20 s lyric teaser: a song excerpt + the single's artwork, zero credits)
#
# What it shows: route C (your own audio). The chorus of the song was transcribed locally with faster-whisper and the
# recognised words were snapped to the real lyrics (`align.py --text lyrics.txt --start 14.6 --dur 20`), so the
# captions show the artist's words with the model's timings, word by word, key words highlighted. The artwork is
# landscape: a slow pan (Still with a moving focal point) turns it into a vertical shot. Title chip, a "chorus" label
# and a fade to the cover at the end. Nothing was generated; the whole example costs 0 credits.
#
# Work folder:  music/ambiciones.mp3 (the song)   img/ambiciones.png (artwork)   vo/chorus.wav (excerpt, cut with
# ffmpeg from 14.6 s)   vo/chorus.words.json (from align.py)   lyrics.txt
# Preview:  python reel.py --preview      Render:  python reel.py
import sys, os, math
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
STUDIO = os.environ.get('INVOKARD_STUDIO') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'scripts')
sys.path.insert(0, STUDIO)
from PIL import Image
import reelkit as rk
from reelkit import W, H, Reel, Captions, Still, Func, blit, text_img, pill, lerp, clamp01, eo, eback, P
import pieces as pz
from pieces import sfx
import align

rk.set_base(os.environ.get('REEL_DIR', os.path.dirname(os.path.abspath(__file__))))
B = pz.Brand.from_colors((26, 22, 30), (233, 140, 190)).activate()      # night grey / the shirt's pink from the artwork
TOTAL = 20.5
reel = Reel('maemuki'); caps = Captions(size=76, y=1380, maxw=940); reel.caps = caps

# ---------------------------------------------------------------- the song excerpt drives everything
reel.vo('vo/chorus.wav', 0.0, gain=1.0)                                  # the song IS the voice track: no ducking needed
caps.from_words('chorus', align.load_words(P('vo/chorus.words.json')), t0=0.0)
wt = caps.word_time
T_ROAR = wt('chorus', 14)                                                # "rugen" — the roar; the pan reaches the lyrics on the rock
T_LINES = wt('chorus', 15)                                               # "Cinco códigos…": second half

# ---------------------------------------------------------------- shots: two pans across the landscape artwork
reel.shot(0.0, T_LINES, Still('img/ambiciones.png', z=(1.00, 1.00), c0=(0.30, 0.50), c1=(0.64, 0.46)))     # from the climber to the lyrics
reel.shot(T_LINES, TOTAL, Still('img/ambiciones.png', z=(1.06, 1.16), c0=(0.62, 0.42), c1=(0.36, 0.40)))   # back to him, closer
GRAD = pz.bottom_gradient(B, y0=1000, strength=0.9)
reel.ov(0.0, TOTAL, lambda c, tl, dur, t: c.alpha_composite(GRAD))

# ---------------------------------------------------------------- layers: title, "listen" label, end fade
TITLE = pill('MIS AMBICIONES RUGEN', 'black', 46, B.white, B.dark_deep + (215,), padx=34, pady=16, tracking=3, shadow=18)
SUB = pill('estribillo', 'semi', 34, B.accent_text, B.accent, padx=24, pady=10, shadow=12)
def title(c, tl, dur, t):
    q = clamp01((tl - 0.2) / 0.4)
    blit(c, TITLE, W / 2, lerp(230, 260, eo(q)), lerp(0.85, 1, eback(q)), clamp01(q * 2))
    q2 = clamp01((tl - 0.6) / 0.35)
    blit(c, SUB, W / 2, 352, lerp(0.8, 1, eback(q2)), clamp01(q2 * 2))
reel.ov(0.0, TOTAL, title)

def roar(c, tl, dur, t):                                                 # a flash and a pulse on the key word
    pz.flash(c, tl, dur=0.18, color=(255, 240, 250))
reel.ov(T_ROAR - 0.02, T_ROAR + 0.3, roar)

def fade_out(c, tl, dur, t):
    a = clamp01(tl / dur) * 0.85
    blit(c, Image.new('RGBA', (W, H), B.dark_deep + (int(255 * a),)), W / 2, H / 2)
reel.ov(TOTAL - 1.0, TOTAL, fade_out)

reel.sfx(sfx('shimmer'), T_ROAR - 0.05, 0.22)

if __name__ == '__main__':
    os.makedirs(P('review'), exist_ok=True); os.makedirs(P('out'), exist_ok=True)
    if '--preview' in sys.argv:
        n = 14; reel.preview([round(TOTAL * (i + 0.5) / n, 2) for i in range(n)], 'review/preview.jpg', cols=7, scale=0.22); print('review/preview.jpg')
    else:
        reel.render('out/reel.mp4', TOTAL, music=None, duck=False); reel.cover(T_ROAR, 'out/cover.jpg'); print('ok -> out/reel.mp4')
