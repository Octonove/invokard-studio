# EXAMPLE — Schippers New Zealand · "T&T Cleaner" (31 s, client footage, no voice-over, cut on the beat)
#
# What it shows: a reel built ONLY from the client's own phone clips (34 files), the client's script as on-screen text,
# a before/after wipe with the two logos lined up, and every cut placed on a beat grid measured from the music.
# The music is one AI track (Lyria 3 Pro) spliced so its break falls on the BEFORE shot and its final hit lands the
# end card. Real pressure-washer sound comes from the clips themselves.
#
# Work folder layout (set REEL_DIR or run from it):
#   frames/<shot>/0001.jpg…   from `media.py extract <work> <shot> IMG_xxxx.mp4 <start> <dur>` (landscape clips fitted)
#   music/v2_edit.wav         `media.py splice base.mp3 music/v2_edit.wav 18.863 50.167 31.8`
#   sfx/v2_*.wav              `media.py sound IMG_4359.mp4 sfx/v2_spray_4359.wav 10.5 1.3`
# Preview:  python reel.py --preview      Render:  python reel.py      Cover:  python reel.py --cover
import sys, os
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
STUDIO = os.environ.get('INVOKARD_STUDIO') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'scripts')
sys.path.insert(0, STUDIO)
from PIL import Image, ImageDraw
import reelkit as rk
from reelkit import W, H, Reel, Clip, Func, blit, lerp, clamp01, eo, eback, P, font
import pieces as pz
from pieces import sfx

rk.set_base(os.environ.get('REEL_DIR', os.path.dirname(os.path.abspath(__file__))))
GREEN, GREY = (0, 142, 78), (84, 95, 101)                       # measured from the client's logo (#008e4e / #545f65)
B = pz.Brand.from_colors((18, 40, 30), GREEN).activate()         # accent = the logo green -> highlight boxes

# ---------------------------------------------------------------- beat grid (python media.py beats music/base.mp3 -> 115 BPM, first beat 8.428)
BEAT = 60 / 115
def bar(k): return 8.428 + 4 * k * BEAT
T_SPLICE = bar(5)                       # 18.863: the track jumps to its bar 20 here (media.py splice)
T_BREAK = T_SPLICE + 4 * BEAT           # 20.950: the music stops  -> BEFORE
T_REVEAL = T_SPLICE + 8 * BEAT          # 23.037: the music returns -> wipe to AFTER
T_HIT = T_SPLICE + 20 * BEAT            # 29.298: final hit          -> end card lands
T_CARD = T_HIT - 2 * BEAT
TOTAL = round(T_HIT + 2.0, 3)

# (shot, beats, zoom) — one shot per beat count; the first ends on beat -14 of the grid
SHOTS = [('v2_4354', None, (1.00, 1.07)), ('v2_4353', 2, (1.04, 1.10)), ('v2_4356', 2, (1.00, 1.06)), ('v2_4357b', 2, (1.00, 1.05)),
         ('v2_4354b', 2, (1.00, 1.05)), ('v2_4356b', 2, (1.00, 1.05)), ('v2_4357a', 4, (1.00, 1.06)),
         ('v2_4348', 3, (1.00, 1.05)), ('v2_4350', 2, (1.00, 1.04)), ('v2_4352', 3, (1.00, 1.04)),
         ('v2_4359b', 2, (1.00, 1.05)), ('v2_4360', 2, (1.00, 1.05)), ('v2_4369', 3, (1.00, 1.06)), ('v2_4369b', 2, (1.00, 1.06)),
         ('v2_4374', 2, (1.00, 1.04)), ('v2_4373', 2, (1.00, 1.04)), ('v2_4375', 3, (1.00, 1.05))]
reel = Reel('schippers'); t = 0.0
for name, beats, z in SHOTS:
    t1 = 8.428 - 14 * BEAT if beats is None else t + beats * BEAT
    reel.shot(t, t1, Clip(name, z=z)); t = t1

# ---------------------------------------------------------------- the client's script, verbatim, as text blocks
for t0, t1, txt in [(0.15, 4.20, 'Your tractor takes *a beating* out here…'),
                    (4.30, 8.38, '…so why not give it *the clean it deserves?* 👀'),
                    (8.47, 12.55, 'A few minutes with *MS Schippers* *T&T Cleaner*'),
                    (12.65, 20.90, "and we're *cutting through the grime*"),
                    (T_REVEAL + 0.05, T_CARD - 0.05, 'and getting it looking *fresh again.*')]:
    reel.ov(t0, t1, pz.text_layer(txt, y=470))

# ---------------------------------------------------------------- before / after on the grille logo
# The dirty grille (4358) is framed wider than the clean one (4377). The dirty frame is scaled 1.2x and shifted so both
# logos sit on the same pixels (measured with a brightness mask of the chrome). Background: the clip's own blur-fit.
dirty = Clip('v2_4358', speed=0.8); clean = Clip('v2_4377', speed=0.9)
RAW = P('frames', 'v2_4358raw'); N_RAW = len(os.listdir(RAW))
K, TX, TY = 1.20, 662 * 1420 / 1280 - 170 - 704 * 1.20, 386 * 1420 / 1280 - 369 * 1.20
def dirty_frame(t, dur):
    base = dirty.frame(t, dur); idx = min(max(int(round(t * 0.8 * 30)), 0), N_RAW - 1)
    raw = Image.open(os.path.join(RAW, f'{idx + 1:04d}.jpg')).convert('RGB')
    band = raw.transform((W, 799), Image.AFFINE, (1 / K, 0, -TX / K, 0, 1 / K, -TY / K), resample=Image.BICUBIC)
    base.paste(band, (0, 600)); return base
HOLD = T_REVEAL - T_BREAK
reel.shot(T_BREAK, T_REVEAL + 2 * BEAT, pz.wipe_scene(Func(dirty_frame), clean, B, hold=HOLD, sweep=0.85))

t = T_REVEAL + 2 * BEAT                                            # the clean tractor, piece by piece
for name, beats, z in (('v2_4379b', 2, (1.00, 1.05)), ('v2_4382', 2, (1.00, 1.05)), ('v2_4380', 2, (1.00, 1.05)), ('v2_4376', 2, (1.00, 1.03))):
    reel.shot(t, t + beats * BEAT, Clip(name, z=z)); t += beats * BEAT

# ---------------------------------------------------------------- end card on the final hit
def wordmark():
    """The client's wordmark rebuilt as text: the file they sent was 538 px wide and pixelated at reel size."""
    a, b = font('bold', 112), font('reg', 112); wa, wb = a.getlength('Schippers'), b.getlength(' New Zealand')
    im = Image.new('RGBA', (int(wa + wb) + 20, 170), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.text((10, 10), 'Schippers', font=a, fill=GREEN); d.text((10 + wa, 10), ' New Zealand', font=b, fill=GREY)
    return im.crop(im.getbbox())
CARD = pz.logo_card(wordmark(), w=960, pad=80, line='T&T Cleaner 2.0', line_size=50, line_color=GREY, accent=GREEN)
reel.shot(T_CARD, TOTAL, pz.blur_in(Clip('v2_4376', speed=0.8, start=2 * BEAT, z=(1.03, 1.10)), dur=0.6, delay=0.45))
reel.ov(T_CARD, TOTAL, pz.end_card_layer(CARD, t_pop=T_HIT - T_CARD - 0.18, y=900))

# ---------------------------------------------------------------- sound: air hits on block changes, the real washer, the break's ambience
for tc, g in ((4.254, 0.22), (8.428, 0.28), (12.602, 0.24), (T_REVEAL, 0.32)): reel.sfx(sfx('whoosh'), tc - 0.14, g)
for f, tc, g in (('v2_spray_4359', 12.602, 0.34), ('v2_spray_4360', 13.645, 0.28), ('v2_rinse_4374', 17.298, 0.30),
                 ('v2_rinse_4373', 18.341, 0.28), ('v2_rinse_4375', 19.385, 0.32)):
    reel.sfx(f'sfx/{f}.wav', tc, g)
reel.sfx('sfx/v2_amb_4358.wav', T_BREAK + 0.05, 2.2)
reel.sfx(sfx('shimmer'), T_REVEAL + 0.12, 0.28)
reel.sfx(sfx('chime'), T_HIT, 0.30)

def cover(out):
    """Cover: the grille split in two (AFTER | BEFORE) under the hook."""
    c = pz.split_frame(dirty_frame(HOLD + 0.18, 3.13), clean.frame(0.18, 1.05), W // 2, B)
    blit(c, pz.pill('AFTER', 'black', 46, B.accent_text, B.accent, padx=32, pady=14, shadow=0), W // 4, 1480)
    blit(c, pz.pill('BEFORE', 'black', 46, (255, 255, 255), (20, 24, 22, 215), padx=32, pady=14, shadow=0), W * 3 // 4, 1480)
    blit(c, pz.text_block('Your tractor takes *a beating* out here…'), W // 2, 470)
    c.convert('RGB').save(P(out), quality=92)

if __name__ == '__main__':
    os.makedirs(P('review'), exist_ok=True); os.makedirs(P('out'), exist_ok=True)
    if '--preview' in sys.argv:
        reel.preview([0.6, 2.7, 4.8, 7.4, 9.2, 11.8, 13.1, 15.4, 17.8, 20.2, 21.8, 23.35, 24.4, 26.7, 28.6, 29.5, 30.8], 'review/preview.jpg', cols=6, scale=0.2)
        print('review/preview.jpg')
    elif '--cover' in sys.argv:
        cover('out/cover.jpg'); print('out/cover.jpg')
    else:
        reel.render('out/reel.mp4', TOTAL, music='music/v2_edit.wav', music_gain=0.6, music_offset=0.0, music_fade_out=0.3)
        cover('out/cover.jpg'); print('ok -> out/reel.mp4')
