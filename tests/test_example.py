# The self-contained example renders on any machine (no third-party media), and the screenshot frames it uses.
import os, sys, subprocess
import pytest
from PIL import Image
from conftest import ROOT, needs_ffmpeg

EXAMPLE = os.path.join(ROOT, 'examples', 'first-reel', 'reel.py')

@needs_ffmpeg
@pytest.mark.parametrize('fmt, size', [('9:16', (1080, 1920)), ('16:9', (1920, 1080))])
def test_first_reel_example_previews(tmp_path, fmt, size):
    env = {**os.environ, 'REEL_DIR': str(tmp_path)}
    r = subprocess.run([sys.executable, EXAMPLE, '--preview', '--format', fmt], capture_output=True, text=True, env=env, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    sheet = tmp_path / 'review' / f'preview_{fmt.replace(":", "x")}.jpg'
    assert sheet.exists() and Image.open(sheet).width > 1000
    assert Image.open(tmp_path / 'img' / 'page.png').size == (1440, 900)       # the media it drew for itself
    assert sorted(os.listdir(tmp_path / 'vo')) == ['v01.wav', 'v02.wav', 'v03.wav', 'v04.wav']

def test_browser_and_phone_frames(rk):
    import pieces as pz
    shot = Image.new('RGB', (1440, 900), (200, 30, 30))
    win = pz.browser_frame(shot, 1000, url='example.com')
    assert 1000 < win.width < 1200 and win.getpixel((0, 0))[3] == 0              # shadow pad, transparent corner
    assert win.getpixel((win.width // 2, win.height // 2))[:3] == (200, 30, 30)   # the screenshot fills the window
    ph = pz.phone_frame(shot, 800)
    assert 800 < ph.height < 950 and ph.width < ph.height and ph.getpixel((0, 0))[3] == 0
    assert ph.getpixel((ph.width // 2, ph.height // 2))[:3] == (200, 30, 30)
