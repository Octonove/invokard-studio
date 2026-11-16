# media.py CLI tests: sys.argv hands every argument over as a string (`COMMANDS[sys.argv[1]](*sys.argv[2:])`), so each numeric
# argument has to survive that. These run the real CLI in a subprocess, with the arguments exactly as a shell would pass them.
# Needs ffmpeg/ffprobe on PATH (they synthesise the media).
import os, re, sys, subprocess, tempfile, shutil
import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'skills', 'invokard-studio', 'scripts')
MEDIA = os.path.join(SCRIPTS, 'media.py')
sys.path.insert(0, SCRIPTS)

pytestmark = pytest.mark.skipif(shutil.which('ffmpeg') is None, reason='ffmpeg not installed')

def cli(*args):
    r = subprocess.run([sys.executable, MEDIA, *map(str, args)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    assert r.returncode == 0, f'media.py {" ".join(map(str, args))} failed:\n{r.stderr}'
    return r.stdout

def probe(path, entries, stream=None):
    sel = ['-select_streams', stream] if stream else []
    return subprocess.check_output(['ffprobe', '-v', 'error', *sel, '-show_entries', entries, '-of', 'csv=p=0', path]).decode().strip()

def duration(path): return float(probe(path, 'format=duration'))

@pytest.fixture(scope='module')
def work():
    d = tempfile.mkdtemp(prefix='invokard-cli-')
    os.makedirs(os.path.join(d, 'img'))
    for i in range(7): Image.new('RGB', (90, 160), (30 * i, 80, 120)).save(os.path.join(d, 'img', f'a{i}.png'))
    # 3 s portrait clip with a tone, and an 8 s 120 BPM click track (a 30 ms burst every 0.5 s)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=270x480:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', os.path.join(d, 'clip.mp4')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=8', '-af',
                    "volume='if(lt(mod(t,0.5),0.03),1,0)':eval=frame", os.path.join(d, 'click.wav')], check=True)
    yield d
    shutil.rmtree(d, ignore_errors=True)

def test_sheet_img_cols_arrive_as_a_string(work):
    # the reported failure: `sheet-img <work> 5` raised TypeError (int // str). 7 images in 3 columns -> 3 rows
    cli('sheet-img', work, '3')
    assert Image.open(os.path.join(work, 'review', 'imgs.jpg')).size == (3 * (300 + 6), 3 * (533 + 34))
    cli('sheet-img', work, '5')
    assert Image.open(os.path.join(work, 'review', 'imgs.jpg')).size == (5 * (300 + 6), 2 * (533 + 34))
    cli('sheet-img', work)                                  # without the optional argument: the default (5) still works
    assert Image.open(os.path.join(work, 'review', 'imgs.jpg')).size == (5 * (300 + 6), 2 * (533 + 34))

def test_beats_window_and_bpm_range_as_strings(work):
    out = cli('beats', os.path.join(work, 'click.wav'), '0', '8', '110', '130')
    assert abs(float(re.match(r'BPM ([\d.]+)', out).group(1)) - 120) < 1.0

def test_energy_step_as_a_string(work):
    lines = cli('energy', os.path.join(work, 'click.wav'), '2').strip().splitlines()
    assert 3 <= len(lines) <= 4 and all('dB' in l for l in lines)        # 8 s in 2 s windows (the default 0.5 s would give ~16)

def test_splice_times_as_strings(work):
    out = os.path.join(work, 'spliced.wav')
    cli('splice', os.path.join(work, 'click.wav'), out, '2', '4', '6.5', '0.05')
    assert abs(duration(out) - 7.0) < 0.1                   # padded up to total + 0.5 s; the edit itself (2 s + 4 s) is shorter

def test_sound_start_dur_highpass_fade_as_strings(work):
    out = os.path.join(work, 'cut.wav')
    cli('sound', os.path.join(work, 'clip.mp4'), out, '0.5', '1.5', '200', '0.3')
    assert abs(duration(out) - 1.5) < 0.1

def test_silence_duration_as_a_string(work):
    out = os.path.join(work, 'quiet.wav')
    cli('silence', out, '1.5')
    assert abs(duration(out) - 1.5) < 0.1

def test_verify_frame_count_as_a_string(work):
    clip = os.path.join(work, 'clip.mp4')
    cli('verify', clip, '4')                                # 4 thumbnails in a 7-column sheet -> one row
    assert Image.open(os.path.join(work, 'clip_sheet.jpg')).size == (7 * 274, 484)

def test_frame_time_as_a_string(work):
    cli('frame', os.path.join(work, 'clip.mp4'), '1.5')
    assert Image.open(os.path.join(work, 'clip_1.5.png')).size == (270, 480)

def test_web_height_and_crf_as_strings(work):
    out = os.path.join(work, 'clip-web.mp4')
    cli('web', os.path.join(work, 'clip.mp4'), out, '360', '30')
    assert probe(out, 'stream=height', 'v:0') == '360'

def test_gif_width_fps_start_dur_as_strings(work):
    out = os.path.join(work, 'clip.gif')
    cli('gif', os.path.join(work, 'clip.mp4'), out, '120', '8', '0.5', '1')
    assert probe(out, 'stream=width', 'v:0') == '120' and 0.8 < duration(out) < 1.3

def test_extract_start_dur_as_strings(work):
    cli('extract', work, 'seg', os.path.join(work, 'clip.mp4'), '0.5', '0.4')
    assert 10 <= len(os.listdir(os.path.join(work, 'frames', 'seg'))) <= 14       # 0.4 s at 30 fps

def test_python_callers_may_pass_numbers(work):
    # the same functions called from Python with real numbers (the CLI is only one of the two ways in)
    import media
    media.sheet_img(work, 4)
    assert Image.open(os.path.join(work, 'review', 'imgs.jpg')).size == (4 * (300 + 6), 2 * (533 + 34))
    out = os.path.join(work, 'clip-web-num.mp4')
    media.web(os.path.join(work, 'clip.mp4'), out, 360, 30)
    assert probe(out, 'stream=height', 'v:0') == '360'
