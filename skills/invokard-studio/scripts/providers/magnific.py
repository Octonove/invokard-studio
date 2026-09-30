# magnific — Magnific (Freepik) REST API: images, image-to-video, voice-over, sound effects, upscale, remove background.
# Async pattern verified in production: POST -> task_id -> poll GET until COMPLETED -> generated[] URLs (they expire:
# every result is downloaded as soon as it completes). Needs MAGNIFIC_API_KEY (see providers/env.py).
#
#   from providers import magnific as mg
#   mg.image('flat vector illustration of ...', 'img/hero.png', aspect='social_story_9_16')       # seedream-v4-5, 50 cr
#   mg.video('slow push-in, background perfectly still', 'img/hero.png', 'vid/hero.mp4', seconds=5)  # kling-v2-5-pro, 28 cr/s
#   mg.voice('One sentence per call.', 'vo/v01.mp3', voice_id='GB7fZx4ubHWxbBE05abF')             # ElevenLabs Turbo v2.5
#
# The official MCP connector (mcp.magnific.com, OAuth) exposes more models (Kling 3.0, Veo 3.1, Nano Banana Pro, Lyria 3
# music) with simulate_cost; when your agent has it, prefer it. See references/providers.md.
import os, sys, time, json, base64, subprocess
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import secret

BASE = 'https://api.magnific.com'
VERIFY = os.environ.get('INVOKARD_TLS_VERIFY', '1') != '0'     # set 0 only on machines whose TLS store is broken
STATUS_ROUTES = {                                                # some models answer status on a different route
    'kling-v2-6-pro': ['/v1/ai/image-to-video/kling-v2-6/{id}', '/v1/ai/image-to-video/kling-v2-6-pro/{id}'],
    'voiceover': ['/v1/ai/voiceover/elevenlabs-turbo-v2-5/{id}', '/v1/ai/voiceover/{id}'],
}
ASPECTS = ('square_1_1', 'social_story_9_16', 'widescreen_16_9', 'portrait_2_3', 'traditional_3_4', 'standard_3_2', 'classic_4_3', 'cinematic_21_9')

class MagnificError(RuntimeError): pass

def _headers():
    return {'x-magnific-api-key': secret('MAGNIFIC_API_KEY'), 'Content-Type': 'application/json', 'Accept': 'application/json'}

def _post(path, body):
    for attempt in range(4):
        r = requests.post(BASE + path, headers=_headers(), json=body, verify=VERIFY, timeout=120)
        if r.status_code in (429,) or r.status_code >= 500:
            time.sleep(1.5 * 2 ** attempt); continue
        break
    if r.status_code == 401 or r.status_code == 403: raise MagnificError('Magnific rejected the API key (MAGNIFIC_API_KEY).')
    if r.status_code == 402: raise MagnificError('The Magnific account has no credits left.')
    if r.status_code == 410: raise MagnificError(f'Endpoint retired by Magnific: {path}. Use the MCP connector for this media type.')
    if r.status_code not in (200, 201, 202): raise MagnificError(f'Magnific POST {path} -> {r.status_code}: {r.text[:300]}')
    d = r.json(); return d.get('data', d)

def _poll(path, model, task_id, tries=150, delay=4):
    routes = STATUS_ROUTES.get(model, [f'{path}/{{id}}'])
    for _ in range(tries):
        time.sleep(delay)
        for rt in routes:
            g = requests.get(BASE + rt.replace('{id}', task_id), headers=_headers(), verify=VERIFY, timeout=30)
            if g.status_code == 404: continue
            if g.status_code >= 400: raise MagnificError(f'Magnific GET {rt} -> {g.status_code}: {g.text[:200]}')
            d = g.json(); d = d.get('data', d); st = str(d.get('status', '')).upper()
            if st == 'COMPLETED': return d
            if st in ('FAILED', 'ERROR', 'CANCELLED'): raise MagnificError(f'Magnific task {task_id} {st}: {json.dumps(d)[:300]}')
            break
    raise TimeoutError(f'Magnific task {task_id} did not complete in {tries * delay} s')

def _urls(d):
    gen = d.get('generated') or d.get('images') or d.get('output') or []
    return [g if isinstance(g, str) else (g.get('url') or g.get('image') or '') for g in gen if g]

def download(url, out):
    """Download a result URL to `out` (curl first, requests as fallback: some machines have a broken TLS store)."""
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    rc = subprocess.run(['curl', '-sSfL', '--retry', '2', '-o', out, url]).returncode
    if rc != 0 or not os.path.exists(out) or os.path.getsize(out) == 0:
        r = requests.get(url, verify=VERIFY, timeout=300); r.raise_for_status(); open(out, 'wb').write(r.content)
    return out

def run(path, body, out, model=None):
    """POST + poll + download. Returns the local path (or the result dict when out is None)."""
    d = _post(path, body)
    tid = d.get('task_id') or d.get('id')
    if not tid:                                       # synchronous endpoint (remove-background)
        urls = _urls(d) or ([d.get('url')] if d.get('url') else [])
        return download(urls[0], out) if urls and out else d
    done = _poll(path, model or path.rsplit('/', 1)[-1], tid)
    urls = _urls(done)
    if not urls: raise MagnificError(f'No result URL: {json.dumps(done)[:300]}')
    return download(urls[0], out) if out else urls[0]

def _b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()

# ---------------------------------------------------------------- image
def image(prompt, out, model='seedream-v4-5', aspect='social_story_9_16', **extra):
    """Text-to-image. seedream-v4-5 (50 cr, real 2K, good with legible text) is the default; z-image (5 cr, ~1024 px
    square, ignores aspect) for drafts; nano-banana-pro (aspect '9:16', resolution '2K') for style references.
    Never put a hex colour in a prompt: it can end up painted as text. Ask for NO text: the engine sets all the type."""
    if model == 'nano-banana-pro':
        body = {'prompt': prompt, 'aspect_ratio': extra.pop('aspect_ratio', '9:16'), 'resolution': extra.pop('resolution', '2K'), **extra}
    elif model == 'z-image':
        body = {'prompt': prompt, **extra}
    else:
        body = {'prompt': prompt, 'aspect_ratio': aspect, **extra}
    return run(f'/v1/ai/text-to-image/{model}', body, out, model)

def image_from_ref(prompt, refs, out, model='flux-2-klein', aspect='social_story_9_16', **extra):
    """Image-to-image from 1-4 reference files (base64). flux-2-klein: 10-45 cr, 1k only (2k fails)."""
    refs = [refs] if isinstance(refs, str) else refs
    body = {'prompt': prompt, 'aspect_ratio': aspect, 'resolution': '1k', **extra}
    for i, p in enumerate(refs[:4]): body['input_image' if i == 0 else f'input_image_{i + 1}'] = _b64(p)
    return run(f'/v1/ai/text-to-image/{model}', body, out, model)

# ---------------------------------------------------------------- video
def video(prompt, image_path, out, model='kling-v2-5-pro', seconds=5, **extra):
    """Image-to-video from a still. kling-v2-5-pro 720p 28 cr/s (5 or 10 s); kling-v2-6-pro 1080p 45 cr/s.
    Prompt pattern that keeps illustrations intact: '... Static camera. Background perfectly still. No new objects, no text.'"""
    body = {'prompt': prompt, 'image': _b64(image_path), 'duration': str(seconds), **extra}
    return run(f'/v1/ai/image-to-video/{model}', body, out, model)

# ---------------------------------------------------------------- audio
VOICES_ES = {   # ElevenLabs voice ids verified through Magnific on 2026-09-22 (Castilian Spanish)
    'marina': 'GB7fZx4ubHWxbBE05abF', 'carolina': 'UOIqAnmS11Reiei1Ytkc', 'madrid38': 'RN21UDW82pAS9bWvJkGP',
    'announcer': 'D7dkYvH17OKLgp4SLulf', 'narrator': 'KWmTRJO645Geepnk0D4B', 'gabriel': 'gGr0c5znjcZfTNIRdJZ1',
}
def voice(text, out, voice_id='KWmTRJO645Geepnk0D4B', stability=0.5, similarity=0.75, speed=1.0):
    """Voice-over through Magnific (ElevenLabs Turbo v2.5). ONE SENTENCE PER CALL: each sentence gets its own file and
    its own timing, which is what the caption engine needs. voice_id is an ElevenLabs voice id (see VOICES_ES)."""
    body = {'text': text, 'voice_id': VOICES_ES.get(voice_id, voice_id), 'stability': stability, 'similarity_boost': similarity,
            'speed': speed, 'use_speaker_boost': True}
    return run('/v1/ai/voiceover/elevenlabs-turbo-v2-5', body, out, 'voiceover')

def sound_effect(text, out, **extra):
    """Sound effect from a description (ElevenLabs). Price not published."""
    return run('/v1/ai/sound-effects', {'text': text, **extra}, out, 'sound-effects')

def music(prompt, out, seconds=30):
    """Music generation. NOTE: on 2026-09-22 this endpoint answered 410 (retired). Generate music through the MCP
    connector (google-lyria-3-pro, 160 cr) or bring your own track; this call raises a clear error if still retired."""
    return run('/v1/ai/music-generation', {'prompt': prompt, 'music_length_seconds': max(10, min(240, int(seconds)))}, out, 'music-generation')

# ---------------------------------------------------------------- editing
def upscale(image_path, out, precision=False, **extra):
    ep = '/v1/ai/image-upscaler-precision' if precision else '/v1/ai/image-upscaler'
    return run(ep, {'image': _b64(image_path), **extra}, out, 'image-upscaler')

def remove_background(image_url, out):
    """Synchronous; the result URL expires in 5 minutes, so it is downloaded at once. Needs a public image URL."""
    return run('/v1/ai/beta/remove-background', {'image_url': image_url}, out)

if __name__ == '__main__':
    print('models:', 'seedream-v4-5 z-image nano-banana-pro flux-2-klein | kling-v2-5-pro kling-v2-6-pro | voiceover elevenlabs-turbo-v2-5')
    print('key:', 'set' if os.environ.get('MAGNIFIC_API_KEY') else 'not in environment (a .env file is read on first call)')
