# Pure functions and frame composition: no ffmpeg needed, so they run everywhere (the voiced spans are given).
import numpy as np
import pytest
from PIL import Image

@pytest.fixture
def spans(rk, monkeypatch):
    """Pretend every audio file has these voiced spans and this duration."""
    state = {'segs': [], 'dur': 3.0}
    monkeypatch.setattr(rk, 'speech_segments', lambda path, *a, **k: list(state['segs']))
    monkeypatch.setattr(rk, 'duration', lambda path: state['dur'])
    return state

def test_each_phrase_snaps_to_its_voiced_span(rk, spans):
    spans['segs'] = [(0.10, 1.00), (1.40, 2.60)]
    words = rk.Captions().line('k', 'Hola *mundo*, esto es una prueba.', 'vo/x.mp3', 5.0)
    assert words[0]['t0'] == pytest.approx(5.10) and words[1]['t1'] == pytest.approx(6.00)      # phrase 1 fills span 1
    assert words[2]['t0'] == pytest.approx(6.40) and words[-1]['t1'] == pytest.approx(7.60)     # phrase 2 fills span 2
    assert all(a['t1'] == pytest.approx(b['t0']) for a, b in ((words[0], words[1]), (words[2], words[3])))
    # inside a phrase, time is shared by spoken length: "mundo" (5 letters) gets more than "Hola" (4)
    assert words[1]['t1'] - words[1]['t0'] > words[0]['t1'] - words[0]['t0']

def test_words_spread_over_the_voice_and_skip_the_pauses(rk, spans):
    spans['segs'] = [(0.0, 1.0), (2.0, 3.0)]                       # two spans, but three phrases: proportional mode
    words = rk.Captions().line('k', 'Uno. Dos. Tres cuatro.', 'vo/x.mp3', 0.0)
    assert words[0]['t0'] == 0.0 and words[-1]['t1'] == pytest.approx(3.0)
    assert not any(1.0 < w['t0'] < 2.0 for w in words)              # nothing starts inside the pause
    spans['segs'] = []                                             # no voice detected: the whole file is used
    words = rk.Captions().line('k', 'Uno dos.', 'vo/x.mp3', 1.0)
    assert words[0]['t0'] == 1.0 and words[-1]['t1'] == pytest.approx(4.0)

def test_blocks_are_short_and_never_overlap(rk, spans):
    spans['segs'] = [(0.0, 4.0)]
    caps = rk.Captions()
    caps.line('a', 'Una frase bastante larga que no cabe en un solo bloque de subtítulos', 'vo/a.mp3', 0.0)
    caps.line('b', 'Y otra que empieza antes de que acabe la primera', 'vo/b.mp3', 3.0)
    assert all(len(ch['words']) <= 5 for ch in caps.chunks)
    a = [ch for ch in caps.chunks if ch['words'][0] in caps.words_by_line['a']]
    assert all(x['t1'] <= y['t0'] + 1e-9 for x, y in zip(a, a[1:]))           # within a line, one block at a time
    on_screen = [ch for ch in a if ch['t0'] < 2.95]
    assert on_screen[-1]['t1'] == pytest.approx(2.95)                         # the block in progress ends when 'b' starts
    assert caps.word_time('b', 0) == pytest.approx(3.0)

def test_shown_and_spoken_forms(rk, spans):
    spans['segs'] = [(0.0, 2.0)]
    words = rk.Captions().line('k', '*40|cuarenta* euros.', 'vo/x.mp3', 0.0)
    assert words[0]['disp'] == '40' and words[0]['hl']
    assert words[0]['t1'] - words[0]['t0'] > words[1]['t1'] - words[1]['t0']   # timed as "cuarenta", shown as "40"

def test_easing_stays_in_range(rk):
    for f in (rk.eo, rk.eio):
        assert f(-1) == 0 and f(0) == 0 and f(1) == 1 and f(2) == 1
        assert all(0 <= f(x) <= 1 for x in np.linspace(0, 1, 21))
    assert rk.eback(1) == pytest.approx(1) and max(rk.eback(x) for x in np.linspace(0, 1, 50)) > 1   # it overshoots

def test_compose_a_frame(rk, spans):
    import pieces as pz
    b = pz.BRANDS['studio'].activate()
    spans['segs'] = [(0.0, 1.0)]
    reel = rk.Reel('t'); caps = rk.Captions(); reel.caps = caps
    caps.line('k', 'Un *test*.', 'vo/x.mp3', 0.0)
    reel.shot(0, 2, rk.Func(lambda t, d: Image.new('RGB', (rk.W, rk.H), (10, 10, 10))))
    reel.ov(0, 2, lambda c, tl, dur, t: c.alpha_composite(Image.new('RGBA', (100, 100), (0, 200, 0, 255)), (0, 0)))
    f = np.asarray(reel.frame_at(1.0))
    assert f.shape == (1920, 1080, 3)
    assert tuple(f[50, 50]) == (0, 200, 0)                                    # the layer
    band = f[1450 - 60:1450 + 60]
    assert (np.abs(band.astype(int) - b.accent).sum(axis=2) < 30).sum() > 500   # the highlighted word's box, at caption y
    assert (band > 240).all(axis=2).sum() > 500                               # white caption text
    reel.caps = None; plain = np.asarray(reel.frame_at(1.0)); reel.caps = caps
    assert (np.abs(plain[1390:1510].astype(int) - b.accent).sum(axis=2) < 30).sum() == 0   # cover() draws no captions
    assert tuple(np.asarray(rk.Reel('e').frame_at(0.0))[5, 5]) == rk.NAVY_D               # no shot: the default background
