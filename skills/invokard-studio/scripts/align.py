# align — word timings for captions when the voice was NOT generated sentence by sentence: a recorded narration, a song,
# an interview. Runs faster-whisper locally (optional dependency, see requirements-align.txt) and, when you pass the
# real text, snaps the recognised words to it so the captions show YOUR words with the model's timings.
#
#   python align.py vo/narration.mp3 --lang es --text "the exact words spoken" --out vo/narration.words.json
#   python align.py song.mp3 --lang es --text lyrics.txt --start 42 --dur 30 --out vo/chorus.words.json
#
# Output JSON: {"words": [{"text": "...", "start": s, "end": s}, ...], "engine": ..., "model": ..., "unmatched": n}
# Times are relative to the (trimmed) audio. Load them in a reel with:  caps.from_words('k', load_words(path), t0)
import os, sys, json, argparse, difflib, re, subprocess, tempfile
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

def load_words(path):
    """[(text, start, end), ...] from a words JSON."""
    d = json.load(open(path, encoding='utf-8')); return [(w['text'], w['start'], w['end']) for w in d['words']]

def _norm(w): return re.sub(r'[^\w]', '', w.lower())

def transcribe(audio, lang=None, model='small', prompt=None, device='cpu', compute='int8'):
    """Recognised words with timings via faster-whisper. `model` is a size (tiny/base/small/medium/large-v3) or a
    local CTranslate2 model folder. Downloads the model on first use unless INVOKARD_OFFLINE=1."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit('faster-whisper is not installed. Run: pip install -r requirements-align.txt')
    try:                                              # a cached or local model never touches the network
        m = WhisperModel(model, device=device, compute_type=compute, local_files_only=True)
    except Exception as e:
        if os.environ.get('INVOKARD_OFFLINE'): raise SystemExit(f'Model "{model}" is not available offline: {e}')
        print(f'model "{model}" not cached, downloading…', flush=True)
        m = WhisperModel(model, device=device, compute_type=compute)
    segs, info = m.transcribe(audio, language=lang, beam_size=5, temperature=0, word_timestamps=True, vad_filter=True,
                              vad_parameters={'min_silence_duration_ms': 200, 'speech_pad_ms': 30}, initial_prompt=prompt,
                              condition_on_previous_text=False)
    words = []
    for s in segs:
        for w in (s.words or []):
            words.append({'text': w.word.strip(), 'start': round(w.start, 3), 'end': round(w.end, 3), 'p': round(w.probability, 3)})
    return words, {'engine': 'faster-whisper', 'model': str(model), 'language': info.language, 'language_probability': round(info.language_probability, 3)}

def snap(recognised, reference):
    """Assign recognised timings to the reference words (the real script/lyrics) with a sequence alignment.
    Reference words with no match take the span between their timed neighbours. Returns (words, unmatched)."""
    ref = reference.split(); a = [_norm(w['text']) for w in recognised]; b = [_norm(w) for w in ref]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False); times = [None] * len(ref)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): times[j1 + k] = (recognised[i1 + k]['start'], recognised[i1 + k]['end'])
        elif tag == 'replace' and (i2 - i1) == (j2 - j1):
            for k in range(i2 - i1): times[j1 + k] = (recognised[i1 + k]['start'], recognised[i1 + k]['end'])
        elif tag == 'replace':                      # spread the recognised span over the reference words
            t0, t1 = recognised[i1]['start'], recognised[i2 - 1]['end']; n = j2 - j1
            for k in range(n): times[j1 + k] = (t0 + (t1 - t0) * k / n, t0 + (t1 - t0) * (k + 1) / n)
    unmatched = sum(1 for t in times if t is None)
    for j in range(len(ref)):                       # fill gaps between timed neighbours
        if times[j] is not None: continue
        prev = next((times[k][1] for k in range(j - 1, -1, -1) if times[k]), 0.0)
        nxt_i = next((k for k in range(j + 1, len(ref)) if times[k]), None)
        nxt = times[nxt_i][0] if nxt_i is not None else prev + 0.4
        n = (nxt_i if nxt_i is not None else len(ref)) - j; span = max(0.05, (nxt - prev) / n)
        times[j] = (prev, prev + span); prev += span
    out = []
    for w, (s, e) in zip(ref, times):
        if out and s < out[-1]['end']: s = out[-1]['end']
        out.append({'text': w, 'start': round(s, 3), 'end': round(max(e, s + 0.05), 3)})
    return out, unmatched

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('audio'); ap.add_argument('--lang', default=None); ap.add_argument('--model', default='small')
    ap.add_argument('--text', default=None, help='the real words (string or a .txt file); recognised words snap to them')
    ap.add_argument('--start', type=float, default=None); ap.add_argument('--dur', type=float, default=None)
    ap.add_argument('--out', default=None); ap.add_argument('--prompt', default=None, help='vocabulary hint for the recogniser')
    a = ap.parse_args()
    audio = a.audio
    if a.start is not None or a.dur is not None:      # trim first so timings are relative to the excerpt
        tmp = os.path.join(tempfile.gettempdir(), 'align_excerpt.wav')
        cmd = ['ffmpeg', '-v', 'error', '-y'] + (['-ss', str(a.start)] if a.start else []) + (['-t', str(a.dur)] if a.dur else []) + ['-i', audio, '-ac', '1', '-ar', '16000', tmp]
        subprocess.run(cmd, check=True); audio = tmp
    text = a.text
    if text and os.path.exists(text): text = open(text, encoding='utf-8').read()
    prompt = a.prompt or (text[:600] if text else None)
    rec, meta = transcribe(audio, a.lang, a.model, prompt)
    if text: words, unmatched = snap(rec, ' '.join(text.split()))
    else: words, unmatched = rec, 0
    meta.update({'words': words, 'unmatched': unmatched, 'recognised': ' '.join(w['text'] for w in rec)})
    out = a.out or os.path.splitext(a.audio)[0] + '.words.json'
    json.dump(meta, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(words)} words -> {out}   ({meta["engine"]} {meta["model"]}, {meta["language"]} p={meta["language_probability"]}, {unmatched} unmatched)')
    print('recognised:', meta['recognised'][:300])

if __name__ == '__main__': main()
