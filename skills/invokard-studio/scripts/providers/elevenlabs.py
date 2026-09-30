# elevenlabs — direct ElevenLabs API: text-to-speech with per-word timestamps (so a whole narration can drive the
# captions without whisper), voice listing. Needs ELEVENLABS_API_KEY.
#
#   from providers import elevenlabs as el
#   el.tts('One sentence.', 'vo/v01.mp3')                                   # mp3, default multilingual v2
#   words = el.tts_timed('Full narration ...', 'vo/narration.mp3')          # also writes vo/narration.words.json
#   caps.from_words('n', align.load_words('vo/narration.words.json'), t0)
import os, sys, json, base64, re
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import secret

BASE = 'https://api.elevenlabs.io/v1'
VERIFY = os.environ.get('INVOKARD_TLS_VERIFY', '1') != '0'
DEFAULT_VOICE = 'KWmTRJO645Geepnk0D4B'      # Spanish male narrator; use voices() to pick another

def _h(): return {'xi-api-key': secret('ELEVENLABS_API_KEY')}

def voices():
    r = requests.get(f'{BASE}/voices', headers=_h(), verify=VERIFY, timeout=60); r.raise_for_status()
    return [(v['voice_id'], v['name'], v.get('labels', {})) for v in r.json().get('voices', [])]

def tts(text, out, voice_id=DEFAULT_VOICE, model='eleven_multilingual_v2', stability=0.5, similarity=0.75, speed=1.0):
    """Plain TTS to mp3. One sentence per call keeps the caption timing simple."""
    body = {'text': text, 'model_id': model, 'voice_settings': {'stability': stability, 'similarity_boost': similarity, 'speed': speed}}
    r = requests.post(f'{BASE}/text-to-speech/{voice_id}?output_format=mp3_44100_128', headers={**_h(), 'Content-Type': 'application/json'},
                      json=body, verify=VERIFY, timeout=120)
    if r.status_code != 200: raise RuntimeError(f'ElevenLabs {r.status_code}: {r.text[:300]}')
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True); open(out, 'wb').write(r.content); return out

def tts_timed(text, out, voice_id=DEFAULT_VOICE, model='eleven_multilingual_v2', **settings):
    """TTS with character timestamps -> mp3 + <out>.words.json with (word, start, end). Lets one long narration drive
    word-by-word captions with exact timings instead of one file per sentence."""
    body = {'text': text, 'model_id': model, 'voice_settings': {'stability': settings.get('stability', 0.5), 'similarity_boost': settings.get('similarity', 0.75)}}
    r = requests.post(f'{BASE}/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128',
                      headers={**_h(), 'Content-Type': 'application/json'}, json=body, verify=VERIFY, timeout=180)
    if r.status_code != 200: raise RuntimeError(f'ElevenLabs {r.status_code}: {r.text[:300]}')
    d = r.json(); os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    open(out, 'wb').write(base64.b64decode(d['audio_base64']))
    al = d.get('alignment') or d.get('normalized_alignment'); chars, t0s, t1s = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
    words, cur, s0 = [], '', None
    for ch, a, b in zip(chars, t0s, t1s):
        if ch.isspace():
            if cur: words.append({'text': cur, 'start': round(s0, 3), 'end': round(prev_end, 3)}); cur, s0 = '', None
            continue
        if s0 is None: s0 = a
        cur += ch; prev_end = b
    if cur: words.append({'text': cur, 'start': round(s0, 3), 'end': round(prev_end, 3)})
    meta = {'engine': 'elevenlabs', 'model': model, 'voice_id': voice_id, 'words': words, 'unmatched': 0}
    wp = os.path.splitext(out)[0] + '.words.json'; json.dump(meta, open(wp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return [(w['text'], w['start'], w['end']) for w in words]

if __name__ == '__main__':
    for vid, name, labels in voices()[:40]: print(vid, name, labels.get('language', ''), labels.get('gender', ''), labels.get('accent', ''))
