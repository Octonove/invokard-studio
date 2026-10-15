# Speed-ups that must not change results: beat_grid gives the old loop's answer, cached images are copies, and the
# faster zoom stays within a level of the old transform (LEGACY_RESAMPLE gives the old pixels back).
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter
from conftest import needs_ffmpeg, ff

def _beat_grid_reference(rk, path, t0, t1, bpm_range, step=0.02):
    """The 1.0.0 loop, kept here as the reference the vectorised version must match."""
    import subprocess
    sr, hop, n = 22050, 128, 1024
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'])
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    fr = np.lib.stride_tricks.sliding_window_view(a, n)[::hop] * np.hanning(n)
    L = np.log1p(100 * np.abs(np.fft.rfft(fr, axis=1)))
    fl = np.r_[0, np.maximum(0, np.diff(L, axis=0)).sum(1)]; fl = (fl - fl.mean()) / (fl.std() + 1e-9)
    fps = sr / hop; off = n / 2 / sr; best = None
    for bpm in np.arange(bpm_range[0], bpm_range[1], step):
        b = 60 / bpm
        for ph in np.arange(0, b, 0.004):
            ts = np.arange(t0 + ph, t1, b); idx = ((ts - off) * fps).astype(int).clip(0, len(fl) - 1)
            idx2 = ((ts + b / 2 - off) * fps).astype(int).clip(0, len(fl) - 1)
            sc = fl[idx].mean() + 0.5 * fl[idx2].mean()
            if best is None or sc > best[0]: best = (sc, bpm, t0 + ph)
    return round(best[1], 2), 60 / best[1], round(best[2], 3)

@needs_ffmpeg
def test_beat_grid_matches_the_reference_loop(rk, tmp_path):
    track = str(tmp_path / 'kick.wav')          # a 115 BPM kick with an offbeat hat and a little noise
    ff('-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*60*t)*exp(-30*mod(t,0.5217))+0.2*sin(2*PI*2200*t)*lt(mod(t+0.26,0.5217),0.04)"
       "+0.03*(random(0)-0.5)':s=22050:d=9", track)
    for t0, t1, rng in ((0.0, 9.0, (105, 125)), (1.3, 7.7, (80, 92))):
        assert rk.beat_grid(track, t0, t1, rng) == _beat_grid_reference(rk, track, t0, t1, rng)
    bpm, beat, first = rk.beat_grid(track, 0, 9, (105, 125))
    assert abs(bpm - 115) < 0.5

def test_cached_text_and_pills_are_copies(rk):
    a = rk.text_img('Hola', 'black', 60); ImageDraw.Draw(a).rectangle((0, 0, 10, 10), fill=(255, 0, 0, 255))
    b = rk.text_img('Hola', 'black', 60)
    assert a is not b and b.getpixel((2, 2)) != (255, 0, 0, 255)          # drawing on one result never leaks
    p1, p2 = rk.pill('CTA', shadow=16), rk.pill('CTA', shadow=16)
    assert p1 is not p2 and np.array_equal(np.asarray(p1), np.asarray(p2))

def _smooth_image(path):
    im = Image.new('RGB', (1400, 2400), (240, 236, 228)); d = ImageDraw.Draw(im)
    for i in range(12): d.ellipse((60 + i * 90, 100 + i * 170, 460 + i * 80, 600 + i * 150), fill=(30 + i * 15, 90, 200 - i * 10))
    d.text((100, 1200), 'Invokard', fill=(20, 20, 20), font=__import__('reelkit').font('black', 220))
    im.filter(ImageFilter.GaussianBlur(1.2)).save(path)

def test_fast_zoom_stays_close_to_the_old_transform(rk, workdir):
    _smooth_image(str(workdir / 'img' / 's.png'))
    still = rk.Still('img/s.png', z=(1.0, 1.08), c0=(.4, .4), c1=(.6, .55))
    for t in (0.0, 1.3, 3.0):
        rk.LEGACY_RESAMPLE = False; fast = np.asarray(still.frame(t, 3.0)).astype(int)
        rk.LEGACY_RESAMPLE = True; old = np.asarray(still.frame(t, 3.0)).astype(int)
        p = min(1, t / 3.0); s = still.s0 * (1.0 + 0.08 * p); sw, sh = still.im.size; vw, vh = rk.W / s, rk.H / s
        cx = min(max((0.4 + 0.2 * p) * sw, vw / 2), sw - vw / 2); cy = min(max((0.4 + 0.15 * p) * sh, vh / 2), sh - vh / 2)
        ref = np.asarray(still.im.transform((rk.W, rk.H), Image.AFFINE, (1 / s, 0, cx - vw / 2, 0, 1 / s, cy - vh / 2), resample=Image.BICUBIC)).astype(int)
        assert np.array_equal(old, ref)                                   # LEGACY_RESAMPLE: the 1.0.0 pixels
        assert np.abs(fast - old).mean() < 1.0                            # default: less than one level on average
    rk.LEGACY_RESAMPLE = False

def test_a_still_without_motion_is_composed_once(rk, workdir):
    _smooth_image(str(workdir / 'img' / 's.png'))
    still = rk.Still('img/s.png', z=(1.1, 1.1), c0=(.5, .4))
    a = still.frame(0.0, 2.0); b = still.frame(1.7, 2.0)
    assert a is not b and np.array_equal(np.asarray(a), np.asarray(b)) and still.cached is not None
    ImageDraw.Draw(a).rectangle((0, 0, 50, 50), fill=(255, 0, 0))
    assert still.frame(1.0, 2.0).getpixel((10, 10)) != (255, 0, 0)        # callers get copies

def test_a_zoom_below_one_keeps_the_black_border(rk, workdir):
    _smooth_image(str(workdir / 'img' / 's.png'))
    frame = rk.Still('img/s.png', z=(0.8, 1.0)).frame(0.0, 1.0)            # the view is wider than the image
    assert frame.size == (rk.W, rk.H) and frame.getpixel((2, rk.H // 2)) == (0, 0, 0)
