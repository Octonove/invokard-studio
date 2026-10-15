# Shared helpers for the tests: the scripts on sys.path, synthetic media made with ffmpeg, and fixtures that put the
# engine's global state (work folder, format) back the way they found it.
import os, sys, shutil, subprocess
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'skills', 'invokard-studio', 'scripts')
if SCRIPTS not in sys.path: sys.path.insert(0, SCRIPTS)

HAS_FFMPEG = shutil.which('ffmpeg') is not None and shutil.which('ffprobe') is not None
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason='ffmpeg/ffprobe not installed')

def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)

def synth_voice(path, parts=((220, 0.8), (None, 0.3), (330, 0.9)), rate=44100):
    """A synthetic 'voice': tone bursts (frequency, seconds) separated by silences (None, seconds)."""
    ins, n = [], 0
    for freq, dur in parts:
        ins += ['-f', 'lavfi', '-i', f'sine=frequency={freq}:duration={dur}:sample_rate={rate}' if freq else f'anullsrc=r={rate}:cl=mono:d={dur}']; n += 1
    ff(*ins, '-filter_complex', ''.join(f'[{i}]' for i in range(n)) + f'concat=n={n}:v=0:a=1[a]', '-map', '[a]', path)
    return path

def probe(path, entries='stream=width,height'):
    return subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', path]).decode().split()

@pytest.fixture
def rk():
    """The engine, reset to 9:16 and to its work folder after the test."""
    import reelkit
    base = reelkit.BASE
    yield reelkit
    reelkit.set_format('9:16'); reelkit.set_base(base)

@pytest.fixture
def workdir(tmp_path, rk):
    """An empty work folder with the usual sub-folders, set as the engine's base."""
    for sub in ('img', 'vid', 'frames', 'vo', 'music', 'ref', 'out', 'review'): (tmp_path / sub).mkdir()
    rk.set_base(str(tmp_path))
    return tmp_path
