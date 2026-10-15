# EXAMPLE — "Your first reel" (≈16 s). A complete reel with no third-party media: the first run draws the images with
# Pillow and synthesises the voice and the music with ffmpeg into work/, so it renders on any machine that has the
# requirements. The same script renders 9:16, 16:9 and 1:1.
#
#   python examples/first-reel/reel.py --preview              # contact sheet: work/review/preview_9x16.jpg (seconds)
#   python examples/first-reel/reel.py                        # 9:16 -> work/out/reel_9x16.mp4 + cover (a minute or two)
#   python examples/first-reel/reel.py --format 16:9          # the same edit, landscape (YouTube, LinkedIn)
#   add --fast for a quick draft encode
#
# The "voice" is a hummed tone: one file per sentence, one burst per phrase, so the captions snap to it exactly as they
# do to a real voice-over. Record the four sentences, save them over work/vo/v01-v04.wav and run it again: the same
# script times the captions and the cuts to your voice.
import os, sys, subprocess
for _s in (sys.stdout, sys.stderr):                    # Windows consoles default to cp1252
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('INVOKARD_STUDIO') or os.path.join(HERE, '..', '..', 'skills', 'invokard-studio', 'scripts'))
import reelkit as rk
rk.set_format(sys.argv[sys.argv.index('--format') + 1] if '--format' in sys.argv else rk.env_format())   # before the next line
from reelkit import W, H, Reel, Captions, Still, Func, blit, lerp, clamp01, eo, eback
import pieces as pz
from pieces import sfx
from PIL import Image, ImageDraw

rk.set_base(os.environ.get('REEL_DIR') or os.path.join(HERE, 'work'))   # git-ignored: generated media and renders
B = pz.BRANDS['studio'].activate()
LINES = {'v01': 'Reels that look *edited*, / made by your *agent*.',
         'v02': 'Every word is *timed*. Every cut lands on a *word*.',
         'v03': '*Screenshots*, phones, before and *after*.',
         'v04': 'One script. *Any* format.'}

# ---------------------------------------------------------------- 0 · media, made once (swap any file for a real one)
def ffmpeg(*args): subprocess.run([rk.tool('ffmpeg'), '-v', 'error', '-y', *args], check=True)

def scene(night=False, size=2000):
    """A flat landscape: sky, sun (or moon), hills. Square, so it fills every format."""
    sky = ((18, 26, 58), (58, 50, 110)) if night else ((255, 196, 140), (250, 120, 110))
    im = rk.gradient(*sky, size, size); d = ImageDraw.Draw(im)
    d.ellipse((1180, 380, 1520, 720), fill=(236, 236, 250) if night else (255, 240, 200))
    for k, (y, col) in enumerate(((1250, (60, 70, 120) if night else (232, 140, 100)), (1450, (40, 50, 96) if night else (206, 110, 97)),
                                  (1650, (24, 34, 70) if night else (30, 58, 95)))):
        d.polygon([(0, size)] + [(x, y - 160 * abs(((x / size * (2 + k)) % 2) - 1)) for x in range(0, size + 1, 50)] + [(size, size)], fill=col)
    return im

def page():
    """A landing page 'screenshot'."""
    im = Image.new('RGB', (1440, 900), (250, 250, 252)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1440, 84), fill=B.dark); d.text((60, 22), 'invokard', font=rk.font('black', 38), fill='white')
    d.text((80, 170), 'Reels that look edited', font=rk.font('black', 64), fill=B.dark_deep)
    d.text((80, 260), 'Captions, cuts and the mix, composed by your agent.', font=rk.font('semi', 30), fill=(110, 116, 130))
    d.rounded_rectangle((80, 340, 400, 420), 22, fill=B.accent); d.text((122, 360), 'Get started', font=rk.font('bold', 32), fill='white')
    for i in range(3): d.rounded_rectangle((80 + i * 440, 520, 480 + i * 440, 820), 28, fill=(226 - i * 14, 232, 244))
    return im

def app():
    """A phone app 'screenshot'."""
    im = Image.new('RGB', (900, 1950), (245, 246, 250)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 900, 300), fill=B.accent); d.text((60, 170), 'My reels', font=rk.font('black', 80), fill='white')
    for i in range(6):
        y = 360 + i * 250; d.rounded_rectangle((50, y, 850, y + 210), 36, fill='white')
        d.rounded_rectangle((80, y + 30, 230, y + 180), 26, fill=(B.dark, B.accent, (94, 164, 212))[i % 3])
        d.text((270, y + 50), f'Reel {i + 1}', font=rk.font('bold', 54), fill=B.dark_deep); d.text((270, y + 120), '0:16 · 9:16', font=rk.font('semi', 36), fill=(130, 136, 150))
    return im

def logo():
    t = rk.text_img('first reel', 'black', 150, B.dark); im = Image.new('RGBA', (t.width + 70, t.height), (0, 0, 0, 0))
    im.alpha_composite(t, (0, 0)); ImageDraw.Draw(im).ellipse((t.width + 8, t.height - 78, t.width + 58, t.height - 28), fill=B.accent + (255,))
    return im

def voice(path, text):
    """One tone burst per phrase, as long as its words, with a short pause between phrases (like a sentence spoken)."""
    phrases = [p for p in text.replace(' / ', ' ').replace(',', ',|').replace('.', '.|').split('|') if p.strip()]
    ins, labels = [], []
    for i, ph in enumerate(phrases):
        dur = 0.12 + 0.30 * len(ph.split())
        ins += ['-f', 'lavfi', '-i', f'sine=frequency={150 + 18 * i}:duration={dur:.2f}:sample_rate=44100']
        labels.append(f'[{len(labels)}]')
        if i < len(phrases) - 1: ins += ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.3']; labels.append(f'[{len(labels)}]')
    ffmpeg(*ins, '-filter_complex', ''.join(labels) + f'concat=n={len(labels)}:v=0:a=1,tremolo=f=5:d=0.5,volume=0.5[a]', '-map', '[a]', path)

def music(path, seconds):
    """120 BPM: a kick on every beat, a hat between beats, a soft two-chord pad."""
    expr = ('0.55*sin(2*PI*52*t)*exp(-14*mod(t,0.5))+0.06*(random(0)-0.5)*lt(mod(t+0.25,0.5),0.04)'
            '+0.05*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(lt(mod(t,4),2))'
            '+0.05*(sin(2*PI*196*t)+sin(2*PI*246.9*t)+sin(2*PI*293.7*t))*(gte(mod(t,4),2))')
    ffmpeg('-f', 'lavfi', '-i', f"aevalsrc='{expr}':s=44100:d={seconds}", '-af', 'afade=t=out:st={0}:d=1.5'.format(seconds - 1.5), path)

def make_media():
    for d in ('img', 'vo', 'music', 'ref', 'out', 'review'): os.makedirs(rk.P(d), exist_ok=True)
    for name, build in (('img/day.png', scene), ('img/night.png', lambda: scene(night=True)), ('img/page.png', page), ('img/app.png', app), ('ref/logo.png', logo)):
        if not os.path.exists(rk.P(name)): build().save(rk.P(name))
    for k, text in LINES.items():
        if not os.path.exists(rk.P(f'vo/{k}.wav')): voice(rk.P(f'vo/{k}.wav'), text)
    if not os.path.exists(rk.P('music/base.wav')): music(rk.P('music/base.wav'), 22)

make_media()

# ---------------------------------------------------------------- 1 · voice and captions (python media.py voice examples/first-reel/work)
reel = Reel('first-reel'); caps = Captions(size=70, y=1440, maxw=920) if H > W else Captions(size=62); reel.caps = caps
T, t = {}, 0.3
for k in LINES: T[k] = t; t = reel.vo(f'vo/{k}.wav', t) + 0.35          # each sentence starts 0.35 s after the previous
TOTAL = t + 2.6
for k, text in LINES.items(): caps.line(k, text, f'vo/{k}.wav', T[k])
wt = caps.word_time                                                        # wt('v02', 5): when the 6th word is spoken

# ---------------------------------------------------------------- 2 · shots: every cut is a word time
T_ZOOM, T_SHOTS, T_WIPE, T_END = wt('v02', 5) - 0.1, T['v03'] - 0.15, wt('v03', 3) - 0.1, T['v04'] + 0.6
reel.shot(0.0, T['v02'] - 0.1, Still('img/day.png', z=(1.0, 1.08), c0=(.45, .55), c1=(.6, .5)))
reel.shot(T['v02'] - 0.1, T_ZOOM, Still('img/night.png', z=(1.05, 1.12), c0=(.5, .55)))
reel.shot(T_ZOOM, T_SHOTS, Still('img/night.png', z=(2.2, 2.4), c0=(.67, .27)))          # a detail, nothing generated
reel.shot(T_SHOTS, T_WIPE, Func(lambda tl, d: rk.gradient(B.dark, B.dark_deep)))
reel.shot(T_WIPE, T_END, pz.wipe_scene(Still('img/night.png', z=(1.0, 1.0)), Still('img/day.png', z=(1.0, 1.0)), B, hold=0.35, sweep=0.7,
                                       y_label=round(H * 0.62)))                       # labels above the captions
reel.shot(T_END, TOTAL, pz.outro_save(B, 'img/day.png', 'ref/logo.png', title='One script', sub='9:16 · 16:9 · 1:1',
                                      cta='github.com/Octonove/invokard-studio'))

# ---------------------------------------------------------------- 3 · layers
GRAD = pz.bottom_gradient(B)
reel.ov(0.0, T_SHOTS, lambda c, tl, dur, t: c.alpha_composite(GRAD))
reel.ov(0.0, T['v02'] - 0.1, pz.headline(B, 'INVOKARD STUDIO', 'Your first reel', 'IN 5 MINUTES'))
reel.ov(T['v02'] - 0.1, T_SHOTS, pz.section_label(B, 1, 'TIMED FROM THE VOICE'))
BROWSER = pz.browser_frame('img/page.png', 940 if H >= W else 1000, url='invokard.studio')
PHONE = pz.phone_frame('img/app.png', 700 if H > W else 640)
def screenshots(c, tl, dur, t):                        # each one pops in on its word; positions per format, clear of the captions
    bx, by, px, py = (W / 2, 640, W / 2 + 200, 1020) if H > W else (W * 0.42, H * 0.42, W * 0.80, H * 0.44) if W > H else (W * 0.45, H * 0.38, W * 0.76, H * 0.46)
    pz.appear(c, BROWSER, bx, by, t, wt('v03', 0) - 0.05)
    pz.appear(c, PHONE, px, py, t, wt('v03', 1) - 0.05)
reel.ov(T_SHOTS, T_WIPE, screenshots)

# ---------------------------------------------------------------- 4 · sound: music on the beat grid, effects on the cuts
for t_cut in (T['v02'] - 0.1, T_ZOOM, T_SHOTS, T_WIPE): reel.sfx(sfx('whoosh'), t_cut - 0.12, 0.25)
reel.sfx(sfx('pop'), wt('v03', 0), 0.3); reel.sfx(sfx('pop'), wt('v03', 1), 0.3); reel.sfx(sfx('chime'), T_END + 0.3, 0.3)

if __name__ == '__main__':
    tag = rk.FORMAT.replace(':', 'x')
    if '--preview' in sys.argv:                        # ALWAYS before rendering
        n = 14; reel.preview([round(TOTAL * (i + 0.5) / n, 2) for i in range(n)], f'review/preview_{tag}.jpg', cols=7 if H > W else 4, scale=0.22)
        print(rk.P(f'review/preview_{tag}.jpg'))
    else:
        bpm, beat, first = rk.beat_grid('music/base.wav', 0, 12)
        print(f'music: {bpm} BPM, first beat at {first} s')
        out = reel.render(f'out/reel_{tag}.mp4', TOTAL, music='music/base.wav', music_gain=0.30, music_offset=0.0,
                          preset='veryfast' if '--fast' in sys.argv else 'slow')
        reel.cover(1.2, f'out/cover_{tag}.jpg')
        print(f'ok -> {out}\nverify: python skills/invokard-studio/scripts/media.py verify "{out}"')
