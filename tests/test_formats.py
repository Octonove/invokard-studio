# Formats: 9:16 stays the default and keeps its numbers; 16:9 and 1:1 (env or set_format) move the canvas, the
# captions, the pieces and the media tools with it.
import os, sys, subprocess
import numpy as np
import pytest
from PIL import Image
from conftest import SCRIPTS, needs_ffmpeg, synth_voice, probe, ff

def _engine_in_subprocess(env_extra, code='import reelkit as rk; c = rk.Captions(); print(rk.FORMAT, rk.W, rk.H, c.y)'):
    env = {k: v for k, v in os.environ.items() if k not in ('REELKIT_FORMAT', 'REELKIT_LANDSCAPE')}
    env.update(env_extra)
    return subprocess.run([sys.executable, '-c', code], cwd=SCRIPTS, env=env, capture_output=True, text=True)

@pytest.mark.parametrize('env, expected', [
    ({}, '9:16 1080 1920 1450'),
    ({'REELKIT_LANDSCAPE': '1'}, '16:9 1920 1080 880'),             # the switch existing landscape scripts already use
    ({'REELKIT_LANDSCAPE': '0'}, '9:16 1080 1920 1450'),
    ({'REELKIT_FORMAT': '1:1'}, '1:1 1080 1080 880'),
    ({'REELKIT_FORMAT': 'landscape', 'REELKIT_LANDSCAPE': '0'}, '16:9 1920 1080 880'),
])
def test_format_from_environment(env, expected):
    r = _engine_in_subprocess(env)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == expected

def test_bad_format_in_environment_says_what_is_valid():
    r = _engine_in_subprocess({'REELKIT_FORMAT': '4:5'})
    assert r.returncode != 0 and 'Unknown format "4:5"' in r.stderr and '16:9' in r.stderr

def test_format_names(rk):
    assert rk.format_name('16:9') == rk.format_name('landscape') == rk.format_name('1920x1080') == rk.format_name((1920, 1080)) == '16:9'
    assert rk.format_name(' Portrait ') == '9:16' and rk.format_name('square') == '1:1'
    with pytest.raises(ValueError): rk.format_name('1080x1350')
    assert rk.set_format('16:9') == (1920, 1080) and (rk.W, rk.H) == (1920, 1080)
    assert rk.set_format('9:16') == (1080, 1920)

def test_portrait_defaults_are_the_historic_ones(rk):
    import pieces as pz
    rk.set_format('9:16')
    c = rk.Captions(); assert (c.size, c.y, c.maxw) == (74, 1450, 900)
    card = pz.Card(pz.BRANDS['studio']); assert (card.x, card.y) == (70, 215)
    L = rk.LAYOUT
    assert (L['top'], L['text_y'], L['benefit_y'], L['wipe_label_y'], L['handle_y'], L['center_y'], L['gradient_y0']) == (236, 470, 1262, 1480, 1000, 900, 1100)
    assert L['outro_save'] == (360, 400, 690, 850, 942, 1090, 1218, 40) and L['fan_size'] == (300, 420)

def test_layout_is_a_copy(rk):
    rk.set_format('16:9'); rk.LAYOUT['caption_y'] = 1
    rk.set_format('16:9'); assert rk.LAYOUT['caption_y'] == 880          # the presets are never edited in place

def _drawn_box(layer, rk, dur=3.0, t=2.0):
    c = Image.new('RGBA', (rk.W, rk.H), (0, 0, 0, 0)); layer(c, t, dur, t)
    return c.getchannel('A').getbbox()

@pytest.mark.parametrize('fmt', ['9:16', '16:9', '1:1'])
def test_captions_and_pieces_stay_inside_the_canvas(rk, fmt):
    rk.set_format(fmt)
    import pieces as pz
    b = pz.BRANDS['lime'].activate()
    caps = rk.Captions()
    caps.from_words('k', [('Una', 0.0, 0.3), ('*línea*', 0.3, 0.8), ('de', 0.8, 0.9), ('prueba', 0.9, 1.3), ('bastante', 1.3, 1.7), ('larga.', 1.7, 2.2)])
    box = _drawn_box(lambda c, tl, d, t: caps.draw(c, 2.1), rk)
    assert box and box[3] < rk.H - 20 and box[1] > rk.H / 2                       # lower half, not cut by the edge
    # list item: badge + name at the top AND the benefit pill further down, all visible
    box = _drawn_box(pz.list_item(b, 2, 5, 'ITEM NAME', 'One-line benefit'), rk)
    assert box[1] < rk.LAYOUT['item_y'] and rk.LAYOUT['benefit_y'] < box[3] < rk.H - 20
    for layer in (pz.headline(b, 'KICKER', 'Hook line', 'KEY PHRASE'), pz.hook(b, 'A line', 'A PILL'), pz.text_layer('Some *text* here')):
        box = _drawn_box(layer, rk); assert box and box[1] > 0 and box[3] < rk.H / 2
    assert _drawn_box(pz.end_card_layer(pz.logo_card(Image.new('RGBA', (600, 160), (30, 58, 95, 255)))), rk)[3] < rk.H - 20

@pytest.mark.parametrize('fmt', ['9:16', '16:9', '1:1'])
def test_outros_fit_the_canvas(rk, workdir, fmt):
    rk.set_format(fmt)
    import pieces as pz
    b = pz.BRANDS['studio'].activate()
    rk.gradient((40, 40, 40), (40, 40, 40), 1200, 1200).save(workdir / 'img' / 'bg.png')
    Image.new('RGBA', (600, 160), (30, 58, 95, 255)).save(workdir / 'ref' / 'logo.png')
    bg = np.asarray(rk.blurred('img/bg.png', radius=30, dark=0.80, tint=b.dark_deep)).astype(int)
    frame = pz.outro_save(b, 'img/bg.png', 'ref/logo.png', cta='Book a call', note=('Legal note line', 'second line')).frame(3.0, 3.0)
    assert frame.size == (rk.W, rk.H)
    rows = np.where(np.abs(np.asarray(frame).astype(int) - bg).max(axis=(1, 2)) > 8)[0]
    assert rows.min() > 20 and rows.max() < rk.H - 20                           # the legal note is on screen, not cut
    fan = pz.outro_fan(b, 'img/bg.png', [('img/bg.png', .5, .5)] * 3, 'GUIDE', 'and I send it', '@handle').frame(3.0, 3.0)
    assert fan.size == (rk.W, rk.H)

def test_wrong_frame_size_is_an_error_not_a_scrambled_video(rk):
    rk.set_format('16:9')
    reel = rk.Reel('x'); reel.shot(0, 1, rk.Func(lambda t, d: Image.new('RGB', (1080, 1920))))
    with pytest.raises(ValueError, match='1080x1920 frame but the reel is 1920x1080'): reel.frame_at(0.5)

def test_clip_frames_from_another_format_are_fitted(rk, workdir, capsys):
    os.makedirs(workdir / 'frames' / 'c')
    for i in range(3): Image.new('RGB', (1080, 1920), (i * 40, 0, 0)).save(workdir / 'frames' / 'c' / f'{i + 1:04d}.jpg')
    rk.set_format('16:9')
    clip = rk.Clip('c')
    assert clip.frame(0.0, 1.0).size == (1920, 1080) and clip.frame(0.04, 1.0).size == (1920, 1080)
    assert capsys.readouterr().out.count('--format 16:9') == 1                   # one note per clip, not one per frame

@needs_ffmpeg
@pytest.mark.parametrize('fmt, size', [('16:9', '1920,1080'), ('1:1', '1080,1080')])
def test_render_in_other_formats(rk, workdir, fmt, size):
    rk.set_format(fmt)
    import pieces as pz
    b = pz.BRANDS['forest'].activate()
    synth_voice(str(workdir / 'vo' / 'v01.mp3'))
    rk.gradient((30, 58, 95), (206, 110, 97)).save(workdir / 'img' / 'bg.png')
    reel = rk.Reel('f'); caps = rk.Captions(); reel.caps = caps
    reel.vo('vo/v01.mp3', 0.1); caps.line('v01', 'Hola *mundo*, esto es una prueba.', 'vo/v01.mp3', 0.1)
    reel.shot(0, 1.5, rk.Still('img/bg.png', z=(1.0, 1.05))); reel.ov(0, 1.5, pz.headline(b, 'K', 'Line', 'PHRASE'))
    out = reel.render('out/f.mp4', 1.5, preset='ultrafast')
    assert probe(out, 'stream=width,height')[0] == size
    reel.cover(1.0, 'out/cover.jpg'); assert Image.open(rk.P('out/cover.jpg')).size == (rk.W, rk.H)

@needs_ffmpeg
def test_media_frames_and_extract_follow_the_format(workdir):
    portrait, landscape = str(workdir / 'portrait.mp4'), str(workdir / 'vid' / 'wide.mp4')
    ff('-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=0.6', portrait)
    ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=0.6', landscape)
    media = [sys.executable, os.path.join(SCRIPTS, 'media.py')]
    env = {k: v for k, v in os.environ.items() if k not in ('REELKIT_FORMAT', 'REELKIT_LANDSCAPE')}
    def run(*args): r = subprocess.run(media + list(args), capture_output=True, text=True, env=env); assert r.returncode == 0, r.stdout + r.stderr; return r.stdout
    assert '(fit)' in run('extract', str(workdir), 'p16', portrait, '0', '0.5', '--format', '16:9')    # portrait clip on a 16:9 reel
    assert '(fill)' in run('extract', str(workdir), 'w16', landscape, '0', '0.5', '--format=16:9')
    assert '(fit)' in run('extract', str(workdir), 'w9', landscape, '0', '0.5')                         # default 9:16, as before
    run('frames', str(workdir), 'wide', '--format', 'square')
    sizes = {n: Image.open(workdir / 'frames' / n / '0001.jpg').size for n in ('p16', 'w16', 'w9', 'wide')}
    assert sizes == {'p16': (1920, 1080), 'w16': (1920, 1080), 'w9': (1080, 1920), 'wide': (1080, 1080)}

def test_new_reel_writes_the_format(tmp_path):
    dest = tmp_path / 'wide'
    r = subprocess.run([sys.executable, os.path.join(SCRIPTS, 'new_reel.py'), str(dest), '--format', '16:9'], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    src = (dest / 'reel.py').read_text(encoding='utf-8')
    assert "rk.set_format('16:9')" in src and src.index('rk.set_format') < src.index('from reelkit import W, H')
    compile(src, 'reel.py', 'exec')
    r = subprocess.run([sys.executable, os.path.join(SCRIPTS, 'new_reel.py'), str(tmp_path / 'x'), '--format', '4:5'], capture_output=True, text=True)
    assert r.returncode == 1 and 'Unknown format' in r.stdout and not (tmp_path / 'x').exists()
