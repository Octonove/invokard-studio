# Engine tests: no provider, no credits. Needs ffmpeg/ffprobe on PATH (they synthesise the audio and encode the render).
import os, sys, json, subprocess, tempfile, shutil
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'skills', 'invokard-studio', 'scripts')
sys.path.insert(0, SCRIPTS)
import reelkit as rk
import pieces as pz
import align

pytestmark = pytest.mark.skipif(shutil.which('ffmpeg') is None, reason='ffmpeg not installed')

@pytest.fixture(scope='module')
def work():
    d = tempfile.mkdtemp(prefix='invokard-test-')
    rk.set_base(d)
    for sub in ('img', 'vo', 'out', 'review'): os.makedirs(os.path.join(d, sub))
    rk.gradient((30, 58, 95), (206, 110, 97)).save(os.path.join(d, 'img', 'bg.png'))
    # a synthetic "voice": two bursts separated by 0.3 s of silence -> two voiced spans
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.8', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.3',
                    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.9', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1[a]', '-map', '[a]',
                    os.path.join(d, 'vo', 'v01.mp3')], check=True)
    yield d
    shutil.clearcache = None
    shutil.rmtree(d, ignore_errors=True)

def test_fonts_resolve():
    import fonts
    st = fonts.status()
    assert all(v and 'MISSING' not in v for k, v in st.items() if k != 'emoji'), st

def test_speech_segments_and_caption_timing(work):
    segs = rk.speech_segments('vo/v01.mp3')
    assert len(segs) == 2, segs
    caps = rk.Captions(size=70, y=1440)
    words = caps.line('v01', 'Hello *world*, this is a *test*.', 'vo/v01.mp3', 1.0)
    assert len(words) == 6
    assert words[0]['t0'] == pytest.approx(1.0 + segs[0][0], abs=0.02)       # first phrase snaps to the first span
    assert words[2]['t0'] == pytest.approx(1.0 + segs[1][0], abs=0.02)       # second phrase to the second span
    assert words[1]['hl'] and words[5]['hl'] and not words[0]['hl']
    assert words[1]['disp'] == 'world,'
    assert caps.word_time('v01', 2) < caps.word_time('v01', 5)
    assert all(ch['t0'] < ch['t1'] for ch in caps.chunks)

def test_caption_syntax_shown_spoken_and_breaks():
    caps = rk.Captions()
    w = caps._parse('*40|forty* people / came.')
    assert w[0]['disp'] == '40' and w[0]['hl'] and w[0]['w'] > 5      # weight from the spoken form "forty"
    assert w[1]['brk'] is True and w[2]['end_phrase'] is True

def test_caption_parse_is_robust_to_typos():
    caps = rk.Captions()
    assert [w['disp'] for w in caps._parse('/ hello  world /')] == ['hello', 'world']      # leading, doubled, trailing markers
    assert caps._parse('hello  world')[0]['brk'] is False and len(caps._parse('a  b')) == 2
    assert caps._parse('') == []

def test_beat_grid_refuses_short_audio(work):
    short = os.path.join(work, 'short.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', short], check=True)
    with pytest.raises(ValueError): rk.beat_grid(short)

def test_from_words_and_word_time():
    caps = rk.Captions()
    caps.from_words('song', [('*Aquí*', 0.0, 0.3), ('se', 0.3, 0.5), ('curra,', 0.5, 0.9), ('se', 1.0, 1.1), ('sangra.', 1.1, 1.6)], t0=10.0)
    assert caps.word_time('song', 0) == 10.0 and caps.word_time('song', 4) == 11.1
    assert caps.chunks and caps.chunks[0]['t0'] == pytest.approx(9.95)

def test_text_block_keeps_highlight_runs_together():
    b = pz.BRANDS['forest'].activate()
    im = pz.text_block('Your tractor takes *a beating* out here…', 84, 950)
    assert im.width == 1030 and im.height > 100
    im2 = pz.text_block('A few minutes with *MS Schippers* *T&T Cleaner*', 84, 950)
    # the highlighted run "MS Schippers T&T Cleaner" is one unbreakable unit: the type shrinks so it fits on one line
    # (two lines total) instead of splitting it across three
    assert 150 < im2.height <= im.height

def test_align_snap_interpolates_gaps():
    rec = [{'text': 'y', 'start': 0.0, 'end': 0.2}, {'text': 'se', 'start': 0.2, 'end': 0.4}, {'text': 'curra', 'start': 0.4, 'end': 0.9},
           {'text': 'sangra', 'start': 1.1, 'end': 1.6}]
    words, unmatched = align.snap(rec, 'Aquí se curra, se sangra')
    assert [w['text'] for w in words] == ['Aquí', 'se', 'curra,', 'se', 'sangra']
    # "y" misheard for "Aquí" keeps its timing (same-length replace); the second "se" was never heard: interpolated
    assert unmatched == 1 and words[0]['start'] == 0.0 and words[2]['start'] == 0.4 and words[4]['start'] == 1.1
    assert 0.9 <= words[3]['start'] < words[3]['end'] <= 1.1
    assert all(a['end'] <= b['start'] + 1e-6 for a, b in zip(words, words[1:]))

def test_beat_grid_on_synthetic_click(work):
    click = os.path.join(work, 'click.wav')      # 120 BPM click track: a 30 ms burst every 0.5 s
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=8', '-af',
                    "volume='if(lt(mod(t,0.5),0.03),1,0)':eval=frame", click], check=True)
    bpm, beat, first = rk.beat_grid(click, 0, 8, (100, 140))
    assert abs(bpm - 120) < 1.0 and abs(first % 0.5) < 0.05

def test_render_smoke(work):
    b = pz.BRANDS['studio'].activate()
    reel = rk.Reel('smoke'); caps = rk.Captions(size=70, y=1440); reel.caps = caps
    reel.vo('vo/v01.mp3', 0.2); caps.line('v01', 'Hello *world*, this is a *test*.', 'vo/v01.mp3', 0.2)
    reel.shot(0, 2.0, rk.Still('img/bg.png', z=(1.0, 1.05)))
    reel.ov(0, 2.0, pz.headline(b, 'TEST', 'Engine check', 'IT RENDERS'))
    reel.sfx(pz.sfx('pop'), 0.5, 0.3)
    reel.preview([0.3, 1.0], 'review/preview.jpg', cols=2, scale=0.2)
    out = reel.render('out/smoke.mp4', 2.0, music=None)
    info = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'csv=p=0', out]).decode().split()
    assert 'h264,1080,1920' in info and 'aac' in info
    assert abs(float(info[-1]) - 2.0) < 0.1
    reel.cover(1.0, 'out/cover.jpg'); assert os.path.getsize(rk.P('out/cover.jpg')) > 10000

def test_render_music_only_and_no_duck(work):
    reel = rk.Reel('m'); reel.shot(0, 1.0, rk.Still('img/bg.png'))
    out = reel.render('out/music.mp4', 1.0, music='vo/v01.mp3', music_gain=0.5, music_offset=0.0, music_fade_out=0.2)
    assert os.path.getsize(out) > 1000
