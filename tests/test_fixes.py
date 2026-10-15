# One test per bug found in the review of the 1.0.0 engine. Each failed before its fix.
import os, sys, time, subprocess
import numpy as np
import pytest
from PIL import Image
from conftest import SCRIPTS, needs_ffmpeg, synth_voice

def _img(path, color, size=(200, 300)):
    os.makedirs(os.path.dirname(path), exist_ok=True); Image.new('RGB', size, color).save(path)

def test_image_caches_follow_the_work_folder(rk, tmp_path):
    import pieces as pz
    a, b = tmp_path / 'a', tmp_path / 'b'
    _img(str(a / 'img' / 'x.png'), (255, 0, 0)); _img(str(b / 'img' / 'x.png'), (0, 0, 255))
    def colours():
        return (rk.load('img/x.png').getpixel((5, 5)), rk.cover_cached('img/x.png').getpixel((5, 5)),
                rk.blurred('img/x.png', dark=0).getpixel((500, 900)), pz.photo_card('img/x.png', 100, 140).getpixel((100, 100))[:3])
    rk.set_base(str(a)); red = colours()
    rk.set_base(str(b)); blue = colours()                     # same relative path, other folder: used to return the red image
    assert all(c[0] > 200 and c[2] < 50 for c in red) and all(c[2] > 200 and c[0] < 50 for c in blue)

def test_image_cache_sees_a_regenerated_file(rk, workdir):
    p = str(workdir / 'img' / 'x.png'); _img(p, (255, 0, 0))
    assert rk.load('img/x.png').getpixel((0, 0)) == (255, 0, 0)
    _img(p, (0, 255, 0)); t = time.time() + 5; os.utime(p, (t, t))
    assert rk.load('img/x.png').getpixel((0, 0)) == (0, 255, 0)

@needs_ffmpeg
def test_audio_caches_follow_the_work_folder(rk, tmp_path):
    for d, parts in (('a', ((220, 0.6),)), ('b', ((220, 0.6), (None, 0.4), (330, 0.8)))):
        os.makedirs(tmp_path / d / 'vo'); synth_voice(str(tmp_path / d / 'vo' / 'v01.mp3'), parts)
    rk.set_base(str(tmp_path / 'a')); da, sa = rk.duration('vo/v01.mp3'), rk.speech_segments('vo/v01.mp3')
    rk.set_base(str(tmp_path / 'b')); db, sb = rk.duration('vo/v01.mp3'), rk.speech_segments('vo/v01.mp3')
    assert db > da + 1.0 and len(sa) == 1 and len(sb) == 2

def test_missing_files_say_where_they_were_looked_for(rk, workdir):
    with pytest.raises(FileNotFoundError, match='work folder'): rk.Still('img/nope.png')
    with pytest.raises(FileNotFoundError, match='vo/nope.mp3.*work folder'): rk.Reel('x').vo('vo/nope.mp3', 0.3)

def test_missing_ffmpeg_is_explained(rk, workdir, monkeypatch):
    open(workdir / 'vo' / 'v.wav', 'wb').write(b'not really audio')
    monkeypatch.setattr(rk.shutil, 'which', lambda name: None)
    with pytest.raises(RuntimeError, match='ffprobe was not found on PATH.*install.py doctor'): rk.duration('vo/v.wav')
    env = {**os.environ, 'PATH': str(workdir / 'img')}                # a PATH without ffmpeg
    r = subprocess.run([sys.executable, os.path.join(SCRIPTS, 'media.py'), 'silence', str(workdir / 's.wav'), '1'], capture_output=True, text=True, env=env)
    assert r.returncode == 1 and 'not found on PATH' in r.stdout and 'Traceback' not in r.stderr

def _reel_with_a_shot(rk):
    reel = rk.Reel('x'); reel.shot(0, 1, rk.Func(lambda t, d: Image.new('RGB', (rk.W, rk.H)))); return reel

@needs_ffmpeg
def test_render_checks_the_audio_before_the_video(rk, workdir):
    synth_voice(str(workdir / 'vo' / 'v01.mp3'))
    reel = _reel_with_a_shot(rk); reel.vo('vo/v01.mp3', 0); reel.sfx('sfx/missing.mp3', 0.5)
    with pytest.raises(FileNotFoundError, match='sfx/missing.mp3'): reel.render('out/a.mp4', 1.0)
    reel = _reel_with_a_shot(rk); reel.vo('vo/v01.mp3', 0)
    with pytest.raises(FileNotFoundError, match='music/missing.mp3'): reel.render('out/a.mp4', 1.0, music='music/missing.mp3')
    with pytest.raises(ValueError, match='Nothing to mix.*media.py silence'): _reel_with_a_shot(rk).render('out/a.mp4', 1.0)
    with pytest.raises(ValueError, match='positive'): reel.render('out/a.mp4', 0)
    assert not os.path.exists(workdir / 'out' / '_video.mp4')        # failed in a second, not after the whole video

@needs_ffmpeg
def test_a_dead_encoder_is_reported(rk, workdir):
    with pytest.raises(RuntimeError, match='ffmpeg'):                  # used to surface as a bare BrokenPipeError
        _reel_with_a_shot(rk).render_video('out/v.mp4', 1.0, preset='no-such-preset')

def test_caption_tokens_that_used_to_crash(rk):
    caps = rk.Captions()
    words = caps._parse('a ** b * c')                                 # stray asterisks: IndexError in _word_img before
    assert [w['disp'] for w in words] == ['a', 'b', 'c']
    for w in words: caps._word_img(w['disp'], w['hl'], 70)
    out = caps.from_words('k', [('hola', 0, .3), ('', .3, .4), ('/', .4, .4), ('*mundo*', .4, .8)])   # IndexError before
    assert [w['disp'] for w in out] == ['hola', 'mundo'] and out[0]['brk'] and out[1]['hl']
    assert caps.word_time('k', 1) == pytest.approx(0.4)

def test_voiced_spans_reads_every_number_ffmpeg_prints(rk):
    log = ('[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.600113 | silence_duration: 0.600113\n'
           '[silencedetect @ 0x1] silence_start: 1.39998\n[silencedetect @ 0x1] silence_end: 1.70007 | silence_duration: 0.300091\n')
    assert rk.voiced_spans(log, 2.6) == [(0.600113, 1.39998), (1.70007, 2.6)]
    # ffmpeg 6 prints tiny times in exponent form and can print a negative start: the old regex read '2.08333e-05' as
    # 2.08 s and skipped '-0.0133', pairing the wrong starts and ends
    log2 = 'silence_start: -0.0133\nsilence_end: 0.5 | x\nsilence_start: 1.2e+00\n'
    assert rk.voiced_spans(log2, 2.0) == [(0.5, 1.2)]
    assert rk.voiced_spans('silence_start: 3.5e-05\nsilence_end: 0.4 | x\n', 1.0) == [(0.4, 1.0)]

def test_cover_creates_its_folder(rk, workdir):
    _reel_with_a_shot(rk).cover(0.5, 'deliver/cover.jpg')
    assert os.path.getsize(workdir / 'deliver' / 'cover.jpg') > 1000

def test_media_lists_files_in_any_case_and_once(tmp_path):
    sys.path.insert(0, SCRIPTS); import media
    for n in ('IMG_1.MOV', 'b.mov', 'GX01.MP4', 'c.mp4', 'notes.txt', 'd.Mp4'): open(tmp_path / n, 'w').close()
    names = [os.path.basename(f) for f in media._videos([str(tmp_path), str(tmp_path), str(tmp_path / 'b.mov')])]
    assert sorted(names) == sorted(['IMG_1.MOV', 'b.mov', 'GX01.MP4', 'c.mp4', 'd.Mp4']) and len(names) == 5

def test_media_usage_and_sheet_columns_from_the_command_line(tmp_path):
    media = [sys.executable, os.path.join(SCRIPTS, 'media.py')]
    r = subprocess.run(media + ['extract', 'only-one-arg'], capture_output=True, text=True)
    assert r.returncode == 2 and 'usage: python media.py extract work name source start dur [mode]' in r.stdout and 'Traceback' not in r.stderr
    for i, c in enumerate([(200, 30, 30), (30, 200, 30), (30, 30, 200)]): _img(str(tmp_path / 'img' / f'{i}.PNG'), c, (1920, 1080))
    r = subprocess.run(media + ['sheet-img', str(tmp_path), '2'], capture_output=True, text=True)   # cols was a str: TypeError
    assert r.returncode == 0, r.stderr
    sheet = Image.open(tmp_path / 'review' / 'imgs.jpg'); assert sheet.width == 2 * 306
    px = np.asarray(sheet.convert('RGB'))[30 + 533 // 2, 150]                 # a landscape image is letterboxed, not squashed
    assert px[0] > 150 and np.asarray(sheet.convert('RGB'))[40, 150].min() > 240

def test_new_reel_rejects_an_unknown_brand(tmp_path):
    r = subprocess.run([sys.executable, os.path.join(SCRIPTS, 'new_reel.py'), str(tmp_path / 'r'), '--brand', 'pink'], capture_output=True, text=True)
    assert r.returncode == 1 and 'unknown brand' in r.stdout and not (tmp_path / 'r' / 'reel.py').exists()

def test_elevenlabs_words_from_alignment():
    sys.path.insert(0, os.path.join(SCRIPTS, 'providers'))
    from providers.elevenlabs import words_from_alignment
    chars = list('Hola  mundo. ')
    t = [i * 0.1 for i in range(len(chars))]
    assert words_from_alignment(chars, t, [x + 0.08 for x in t]) == [
        {'text': 'Hola', 'start': 0.0, 'end': 0.38}, {'text': 'mundo.', 'start': 0.6, 'end': 1.18}]
    assert words_from_alignment([], [], []) == []

@needs_ffmpeg
def test_raw_aac_duration_is_measured_not_estimated(rk, workdir):
    # ADTS .aac has no index: ffprobe estimates the duration from the bitrate, and silences throw it off (3.43 s here)
    p = str(workdir / 'vo' / 'v.aac')
    synth_voice(str(workdir / 'vo' / 'v.wav'), ((None, 0.6), (220, 0.8), (None, 0.9), (330, 0.9)))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(workdir / 'vo' / 'v.wav'), '-c:a', 'aac', p], check=True)
    assert rk.duration('vo/v.aac') == pytest.approx(3.2, abs=0.05)
    assert rk.duration('vo/v.wav') == pytest.approx(3.2, abs=0.01)           # other formats keep ffprobe's exact value

@needs_ffmpeg
def test_duration_of_containers_whose_format_name_has_commas(rk, workdir):
    p = str(workdir / 'vo' / 'v.m4a')                                         # format_name: mov,mp4,m4a,3gp,3g2,mj2
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1.5', '-c:a', 'aac', p], check=True)
    assert rk.duration('vo/v.m4a') == pytest.approx(1.5, abs=0.05)

@needs_ffmpeg
def test_align_excerpts_never_share_a_temporary_file(rk, workdir):
    import align                                                              # faster-whisper is not needed to cut
    src = synth_voice(str(workdir / 'vo' / 'song.wav'), ((220, 3.0),))
    a, b = align.excerpt(src, 0.5, 1.0), align.excerpt(src, 1.0, 1.5)        # was always <tmp>/align_excerpt.wav
    try:
        assert a != b and rk.duration(a) == pytest.approx(1.0, abs=0.05) and rk.duration(b) == pytest.approx(1.5, abs=0.05)
    finally:
        for p in (a, b): os.remove(p)
