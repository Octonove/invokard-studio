# reelkit — the Invokard Studio compositor: 1080x1920 at 30 fps, shots, animated layers, word-by-word captions and the
# audio mix. Every frame is composed with Pillow and piped to ffmpeg (libx264). No video editor involved.
#
#   from reelkit import Reel, Captions, Still, Clip, Func, blit, pill, text_img, lerp, clamp01, eo, eio, eback
#   rk.set_base(folder)              # work folder: img/ vid/ frames/ vo/ music/ sfx/ ref/ out/ review/
#   reel = Reel('name'); reel.caps = Captions(size=70, y=1440)
#   reel.shot(t0, t1, Still('img/a.png', z=(1.0, 1.06)))       # background source for a time range
#   reel.ov(t0, t1, lambda c, tl, dur, t: ...)                 # RGBA layer drawn on top (tl = local time)
#   reel.vo('vo/v01.mp3', 0.3); reel.caps.line('v01', 'Text with *highlight*.', 'vo/v01.mp3', 0.3)
#   reel.render('out/reel.mp4', TOTAL, music='music/base.mp3')
import os, re, math, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import fonts as _fonts

W, H, FPS = 1080, 1920, 30
BASE = os.path.abspath(os.environ.get('REEL_DIR', os.getcwd()))

def set_base(path):
    """Work folder of the reel. Call it before loading anything; relative paths resolve against it."""
    global BASE; BASE = os.path.abspath(path)

def P(*a):
    """Path inside the work folder (absolute paths pass through)."""
    return a[0] if len(a) == 1 and os.path.isabs(a[0]) else os.path.join(BASE, *a)

# Default palette (a neutral navy/coral brand). Brands override the caption colours with set_brand().
NAVY = (30, 58, 95); NAVY_D = (18, 36, 62); CORAL = (206, 110, 97); CORAL_L = (255, 217, 211)
MUTED = (205, 215, 232); INK = (12, 18, 30); WHITE = (255, 255, 255); CREAM = (247, 244, 239)
HL_BG = CORAL; HL_FG = WHITE; CAP_STROKE = INK

def set_brand(hl_bg, hl_fg=WHITE, stroke=INK):
    """Caption colours: box of the highlighted word, its text, and the outline of the other words."""
    global HL_BG, HL_FG, CAP_STROKE; HL_BG, HL_FG, CAP_STROKE = tuple(hl_bg), tuple(hl_fg), tuple(stroke)

def font(kind, size): return _fonts.font(kind, size)

# ---------------------------------------------------------------- easing
def clamp01(x): return max(0.0, min(1.0, x))
def lerp(a, b, t): return a + (b - a) * t
def eo(t): t = clamp01(t); return 1 - (1 - t) ** 3                         # ease-out
def eio(t): t = clamp01(t); return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2   # ease-in-out
def eback(t, s=1.9):                                                          # overshoot ("pop")
    t = clamp01(t) - 1
    return t * t * ((s + 1) * t + s) + 1

# ---------------------------------------------------------------- images
@functools.lru_cache(None)
def load(path):
    return Image.open(P(path)).convert('RGB')

def cover(im, w=W, h=H, cx=.5, cy=.5):
    """Scale to fill w x h and crop around the focal point (cx, cy in 0..1)."""
    sw, sh = im.size; s = max(w / sw, h / sh)
    nw, nh = max(w, round(sw * s)), max(h, round(sh * s))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    x = round((nw - w) * cx); y = round((nh - h) * cy)
    return im2.crop((x, y, x + w, y + h))

@functools.lru_cache(None)
def cover_cached(path, w=W, h=H, cx=.5, cy=.5, crop=None):
    im = load(path)
    if crop: im = im.crop(crop)
    return cover(im, w, h, cx, cy)

@functools.lru_cache(None)
def blurred(path, radius=28, dark=0.55, tint=NAVY_D, crop=None):
    """Blurred, darkened full-frame version of an image (backgrounds for closing scenes)."""
    im = cover_cached(path, crop=crop).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius / 4))
    im = im.resize((W, H), Image.BICUBIC)
    return Image.blend(im, Image.new('RGB', (W, H), tint), dark)

def gradient(top, bottom, w=W, h=H):
    a = np.linspace(0, 1, h)[:, None, None]
    arr = (np.array(top)[None, None, :] * (1 - a) + np.array(bottom)[None, None, :] * a)
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), 'RGB')

# ---------------------------------------------------------------- drawing primitives
def blit(canvas, img, x, y, scale=1.0, alpha=1.0, anchor='c', rot=0.0):
    """Composite an RGBA image on the canvas at (x, y) with scale, opacity, anchor (c tl tc bc lc rc) and rotation."""
    if img is None or alpha <= 0.004 or scale <= 0.01: return
    if abs(scale - 1) > 1e-3:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.BICUBIC)
    if rot: img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.999:
        img = img.copy(); a = np.asarray(img.getchannel('A'), dtype=np.float32) * alpha
        img.putalpha(Image.fromarray(a.astype(np.uint8)))
    if anchor == 'c': x0, y0 = x - img.width / 2, y - img.height / 2
    elif anchor == 'tl': x0, y0 = x, y
    elif anchor == 'tc': x0, y0 = x - img.width / 2, y
    elif anchor == 'bc': x0, y0 = x - img.width / 2, y - img.height
    elif anchor == 'lc': x0, y0 = x, y - img.height / 2
    elif anchor == 'rc': x0, y0 = x - img.width, y - img.height / 2
    x0, y0 = round(x0), round(y0)
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(img.width, W - x0), min(img.height, H - y0)
    if sx1 <= sx0 or sy1 <= sy0: return
    if (sx0, sy0, sx1, sy1) != (0, 0, img.width, img.height): img = img.crop((sx0, sy0, sx1, sy1))
    canvas.alpha_composite(img, (x0 + sx0, y0 + sy0))

def shadowed(img, radius=22, offset=(0, 14), opacity=0.45, pad=None):
    """Return img with a soft drop shadow (the result is larger by `pad` on each side)."""
    pad = pad if pad is not None else radius * 2 + max(abs(offset[0]), abs(offset[1]))
    out = Image.new('RGBA', (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new('RGBA', out.size, (0, 0, 0, 0))
    a = img.getchannel('A').point(lambda v: int(v * opacity))
    blk = Image.new('RGBA', img.size, (0, 0, 0, 255)); blk.putalpha(a)
    sh.paste(blk, (pad + offset[0], pad + offset[1]))
    sh = sh.filter(ImageFilter.GaussianBlur(radius))
    out.alpha_composite(sh); out.alpha_composite(img, (pad, pad))
    return out

def rrect(w, h, r, fill, outline=None, width=0):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=fill, outline=outline, width=width)
    return im

def text_img(text, kind, size, fill=WHITE, stroke=0, stroke_fill=INK, tracking=0, shadow=0):
    """Text rendered on a transparent image (kind: black extrabold bold semi reg display serif serifi)."""
    f = font(kind, size); asc, desc = f.getmetrics(); pad = stroke + 4
    if tracking:
        widths = [f.getlength(c) for c in text]; tw = sum(widths) + tracking * (len(text) - 1)
    else:
        tw = f.getlength(text)
    im = Image.new('RGBA', (int(math.ceil(tw)) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if tracking:
        x = pad
        for c, cw in zip(text, widths):
            d.text((x, pad), c, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill); x += cw + tracking
    else:
        d.text((pad, pad), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    if shadow: im = shadowed(im, radius=shadow, offset=(0, max(2, shadow // 3)), opacity=0.55)
    return im

def emoji_img(ch, size):
    """A colour emoji on a transparent image (needs a colour emoji font, see fonts.py)."""
    f = font('emoji', 109 if os.path.basename(_fonts.path('emoji') or '') == 'NotoColorEmoji.ttf' else int(size * 0.95))
    b = f.getbbox(ch)
    im = Image.new('RGBA', (b[2] - b[0] + 8, b[3] - b[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4 - b[0], 4 - b[1]), ch, font=f, embedded_color=True)
    if im.height > size * 1.1: im = im.resize((round(im.width * size / im.height), size), Image.LANCZOS)
    return im

def pill(text, kind='bold', size=40, fg=WHITE, bg=CORAL, padx=28, pady=12, r=None, tracking=0, dot=None, shadow=16):
    """Rounded label with optional leading dot and shadow."""
    t = text_img(text, kind, size, fg, tracking=tracking)
    f = font(kind, size); asc, desc = f.getmetrics()
    extra = (size * 0.55 + 14) if dot else 0
    w = int(t.width - 8 + 2 * padx + extra); h = int(size * 1.18 + 2 * pady)
    r = h // 2 if r is None else r
    im = rrect(w, h, r, bg)
    if dot:
        dd = int(size * 0.42); cx = padx + dd // 2 + 2; cy = h // 2
        ImageDraw.Draw(im).ellipse((cx - dd // 2, cy - dd // 2, cx + dd // 2, cy + dd // 2), fill=dot)
    ty = (h - (asc + desc)) // 2 - 4 + int(size * 0.06)
    im.alpha_composite(t, (int(padx + extra - 4), ty))
    return shadowed(im, radius=shadow, offset=(0, shadow // 2), opacity=0.35) if shadow else im

def wrap(text, kind, size, maxw):
    f = font(kind, size); words = text.split(' '); lines = []; cur = ''
    for w_ in words:
        cand = (cur + ' ' + w_).strip()
        if f.getlength(cand) <= maxw or not cur: cur = cand
        else: lines.append(cur); cur = w_
    if cur: lines.append(cur)
    return lines

# ---------------------------------------------------------------- frame sources
class Still:
    """A still image with a slow zoom (z=(start, end) scale) and a moving focal point (c0 -> c1, in 0..1)."""
    def __init__(self, path, z=(1.0, 1.06), c0=(.5, .5), c1=None, crop=None, fx=None):
        im = load(path)
        if crop: im = im.crop(crop)
        if fx: im = fx(im)
        sw, sh = im.size; s0 = max(W / sw, H / sh); zmax = max(z)
        k = s0 * zmax
        self.im = im.resize((round(sw * k), round(sh * k)), Image.LANCZOS)
        self.s0 = 1 / zmax; self.z = z; self.c0 = c0; self.c1 = c1 or c0
    def frame(self, t, dur):
        p = clamp01(t / dur) if dur > 0 else 0
        s = self.s0 * lerp(self.z[0], self.z[1], p)
        sw, sh = self.im.size; vw, vh = W / s, H / s
        cx = lerp(self.c0[0], self.c1[0], p) * sw; cy = lerp(self.c0[1], self.c1[1], p) * sh
        cx = min(max(cx, vw / 2), sw - vw / 2); cy = min(max(cy, vh / 2), sh - vh / 2)
        a = 1 / s
        return self.im.transform((W, H), Image.AFFINE, (a, 0, cx - vw / 2, 0, a, cy - vh / 2), resample=Image.BICUBIC)

class Clip:
    """Frames of a video clip extracted to frames/<name>/0001.jpg... (see `media.py frames` / `media.py extract`).
    speed scales playback, start is the offset inside the clip (s), z a zoom over the shot, fx(im, t) a per-frame effect."""
    def __init__(self, name, speed=1.0, start=0.0, z=(1.0, 1.0), c=(.5, .5), fx=None):
        self.dir = P('frames', name)
        if not os.path.isdir(self.dir): raise FileNotFoundError(f'No frames folder for clip "{name}": {self.dir}')
        self.files = sorted(f for f in os.listdir(self.dir) if f.lower().endswith(('.jpg', '.png')))
        self.n = len(self.files)
        if self.n == 0: raise FileNotFoundError(f'Clip "{name}" has no frames in {self.dir}')
        self.speed, self.start, self.z, self.c, self.fx = speed, start, z, c, fx
    def get(self, idx):
        idx = min(max(idx, 0), self.n - 1)
        return Image.open(os.path.join(self.dir, self.files[idx])).convert('RGB')
    def frame(self, t, dur):
        im = self.get(int(round((self.start + t * self.speed) * FPS)))
        zz = lerp(self.z[0], self.z[1], clamp01(t / dur) if dur else 0)
        if abs(zz - 1) > 1e-3:
            vw, vh = W / zz, H / zz; cx, cy = self.c[0] * W, self.c[1] * H
            cx = min(max(cx, vw / 2), W - vw / 2); cy = min(max(cy, vh / 2), H - vh / 2)
            a = 1 / zz
            im = im.transform((W, H), Image.AFFINE, (a, 0, cx - vw / 2, 0, a, cy - vh / 2), resample=Image.BICUBIC)
        if self.fx: im = self.fx(im, t)
        return im

class Func:
    """A source drawn by a function f(t_local, duration) -> RGB image (procedural scenes, wipes, end cards)."""
    def __init__(self, f): self.f = f
    def frame(self, t, dur): return self.f(t, dur)

# ---------------------------------------------------------------- audio analysis
@functools.lru_cache(None)
def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', P(path)]).decode().strip())

@functools.lru_cache(None)
def speech_segments(path, noise='-38dB', d=0.1):
    """(start, end) spans with voice, from ffmpeg silencedetect. Phrase timings and cuts derive from these."""
    dur = duration(path)
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', P(path), '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    ss = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', err)]
    se = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', err)]
    segs, cur = [], 0.0
    for s, e in zip(ss, se + [dur] * (len(ss) - len(se))):
        if s <= 0.03: cur = e; continue
        if s - cur > 0.05: segs.append((cur, s))
        cur = e
    if dur - cur > 0.08: segs.append((cur, dur))
    return segs

def music_start(path):
    """Second of the first strong onset of a music track (skips a quiet intro)."""
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', P(path), '-ac', '1', '-ar', '8000', '-f', 's16le', '-'])
    a = np.frombuffer(raw, np.int16).astype(np.float32)
    win = 4000; rms = np.array([np.sqrt(np.mean(a[i:i + win] ** 2)) for i in range(0, len(a) - win, win)])
    if not len(rms): return 0.0
    med = np.median(rms[: min(len(rms), 120)])
    for i, v in enumerate(rms):
        if v >= 0.8 * med: return round(i * 0.5, 2)
    return 0.0

def beat_grid(path, t0=0.0, t1=None, bpm_range=(80, 160), step=0.02):
    """Fit a beat grid to a music track: returns (bpm, beat_seconds, first_beat). Spectral flux + tempo/phase sweep.
    Plain autocorrelation gets the tempo wrong on busy mixes; the sweep does not."""
    sr, hop, n = 22050, 128, 1024
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', P(path), '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'])
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    t1 = t1 or len(a) / sr
    if len(a) < 4 * sr: raise ValueError(f'{path}: {len(a) / sr:.2f} s of audio is too short for a beat grid (need at least 4 s)')
    if t1 - t0 < 2: raise ValueError(f'beat_grid window {t0}-{t1} s is too short (need at least 2 s)')
    fr = np.lib.stride_tricks.sliding_window_view(a, n)[::hop] * np.hanning(n)
    S = np.abs(np.fft.rfft(fr, axis=1)); L = np.log1p(100 * S)
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

# ---------------------------------------------------------------- word-by-word captions
PUNCT = '.,:;?!'
class Captions:
    """Captions timed word by word. Syntax: *word* highlighted · ' / ' forces a block break ·
    shown|spoken when the written form differs from the spoken one ("40|forty")."""
    def __init__(self, size=74, y=1450, maxw=900):
        self.size, self.y, self.maxw = size, y, maxw
        self.chunks = []; self.words_by_line = {}

    def _parse(self, text):
        out = []
        for raw in text.split(' '):
            if not raw: continue                                      # doubled or trailing spaces
            if raw == '/':                                            # block break: applies to the previous word
                if out: out[-1]['brk'] = True
                continue
            m = re.match(r'^(.*?)([' + re.escape(PUNCT) + r']*)$', raw)
            core, punct = m.group(1), m.group(2)
            hl = core.startswith('*') and core.endswith('*') and len(core) > 1
            core = core.strip('*')
            disp, spoken = (core.split('|') + [None])[:2]
            spoken = spoken or disp
            out.append({'disp': disp + punct, 'hl': hl, 'w': len(re.sub(r'\W', '', spoken)) + 1.6,
                        'end_phrase': bool(re.search(r'[.,:;?!]', punct)), 'brk': False})
        return out

    def line(self, key, text, audio, t0, y=None, size=None, show=True):
        """Time `text` against its voice file (one sentence per file works best) starting at t0. If the phrase count
        (split on .,:;?!) equals the number of voiced spans, each phrase snaps to its span; otherwise words are spread
        proportionally over the voiced time, skipping pauses."""
        words = self._parse(text); segs = speech_segments(audio)
        phrases, cur = [], []
        for w_ in words:
            cur.append(w_)
            if w_['end_phrase']: phrases.append(cur); cur = []
        if cur: phrases.append(cur)
        if segs and len(phrases) == len(segs):
            for ph, (a, b) in zip(phrases, segs):
                tot = sum(x['w'] for x in ph); acc = 0
                for x in ph:
                    x['t0'] = t0 + a + (b - a) * acc / tot; acc += x['w']; x['t1'] = t0 + a + (b - a) * acc / tot
        else:
            if not segs: segs = [(0.0, duration(audio))]
            tot_sp = sum(b - a for a, b in segs); tot = sum(x['w'] for x in words)
            def real(ts):
                for a, b in segs:
                    if ts <= b - a: return a + ts
                    ts -= b - a
                return segs[-1][1]
            acc = 0
            for x in words:
                x['t0'] = t0 + real(tot_sp * acc / tot); acc += x['w']; x['t1'] = t0 + real(tot_sp * acc / tot)
        return self._place(key, words, y, size, show)

    def from_words(self, key, words, t0=0.0, y=None, size=None, show=True):
        """Captions from already-timed words, e.g. from `align.py` (faster-whisper): a list of (text, start, end) with
        start/end relative to the audio, which begins at t0 in the reel. `text` may use *highlight* and shown|spoken."""
        parsed = []
        for text, a, b in words:
            w_ = self._parse(text)[0]; w_['t0'] = t0 + a; w_['t1'] = t0 + b; parsed.append(w_)
        return self._place(key, parsed, y, size, show)

    def _place(self, key, words, y, size, show):
        self.words_by_line[key] = words
        if not show: return words
        size = size or self.size; y = self.y if y is None else y
        chunk = []; chunks = []
        for i, x in enumerate(words):
            chunk.append(x)
            nxt = words[i + 1] if i + 1 < len(words) else None
            chars = sum(len(c['disp']) + 1 for c in chunk)
            if nxt is None or x['end_phrase'] or x['brk'] or len(chunk) >= 4 or chars + len(nxt['disp']) > 22:
                chunks.append(chunk); chunk = []
        merged = []                                   # avoid stray one-word blocks
        for ch in chunks:
            if merged:
                prev = merged[-1]
                chars = sum(len(c['disp']) + 1 for c in prev + ch)
                gap = ch[0]['t0'] - prev[-1]['t1']
                if (len(prev) <= 1 or len(ch) <= 1) and chars <= 24 and gap < 0.40 and len(prev) + len(ch) <= 5:
                    merged[-1] = prev + ch; continue
            merged.append(ch)
        chunks = merged
        if chunks:                                    # the previous line must not overlap this one
            ini = chunks[0][0]['t0'] - 0.05
            for prev in self.chunks:
                if prev['t0'] < ini < prev['t1']: prev['t1'] = ini
        for i, ch in enumerate(chunks):
            start = ch[0]['t0'] - 0.05
            end = chunks[i + 1][0]['t0'] - 0.05 if i + 1 < len(chunks) else ch[-1]['t1'] + 0.35
            self.chunks.append({'words': ch, 't0': start, 't1': end, 'y': y, 'size': size, 'layout': None})
        return words

    def word_time(self, key, idx):
        """Second at which word `idx` of line `key` is spoken (the ' / ' marker does not count). Base of every cut."""
        return self.words_by_line[key][idx]['t0']

    def word_end(self, key, idx): return self.words_by_line[key][idx]['t1']

    @functools.lru_cache(None)
    def _word_img(self, disp, hl, size):
        if hl:
            t = text_img(disp.upper().strip(PUNCT) + ('' if not disp[-1] in PUNCT else disp[-1]), 'black', size, HL_FG)
            box = rrect(t.width + 18, int(size * 1.28), 16, HL_BG + (255,))
            box.alpha_composite(t, (9, (box.height - t.height) // 2 - int(size * 0.06)))
            return shadowed(box, radius=12, offset=(0, 6), opacity=0.5, pad=30)
        t = text_img(disp, 'black', size, WHITE, stroke=8, stroke_fill=CAP_STROKE)
        return shadowed(t, radius=12, offset=(0, 6), opacity=0.55, pad=30)

    def _layout(self, ch):
        size = ch['size']; f = font('black', size); sp = f.getlength(' ') * 0.9
        items = []
        for x in ch['words']:
            img = self._word_img(x['disp'], x['hl'], size)
            items.append((x, img, img.width - 60 - (0 if x['hl'] else 16)))
        lines, cur, cw = [], [], 0
        for it in items:
            add = it[2] + (sp if cur else 0)
            if cur and cw + add > self.maxw: lines.append((cur, cw)); cur, cw = [it], it[2]
            else: cur.append(it); cw += add
        if cur: lines.append((cur, cw))
        lh = size * 1.32; y0 = ch['y'] - lh * (len(lines) - 1) / 2; out = []
        for li, (its, lw) in enumerate(lines):
            x = W / 2 - lw / 2
            for x_, img, ww in its:
                out.append((x_, img, x + ww / 2, y0 + li * lh)); x += ww + sp
        ch['layout'] = out

    def draw(self, canvas, t):
        for ch in self.chunks:
            if not (ch['t0'] <= t < ch['t1']): continue
            if ch['layout'] is None: self._layout(ch)
            for x, img, cx, cy in ch['layout']:
                age = t - x['t0']
                if age < -0.02: continue
                sc = lerp(0.55, 1.0, eback(age / 0.17)); al = clamp01((age + 0.02) / 0.07)
                blit(canvas, img, cx, cy, sc, al)

# ---------------------------------------------------------------- composition and render
class Reel:
    def __init__(self, name):
        self.name = name; self.shots = []; self.ovs = []; self.audio = []; self.caps = None
    def shot(self, t0, t1, src): self.shots.append((t0, t1, src)); return src
    def ov(self, t0, t1, fn): self.ovs.append((t0, t1, fn))
    def vo(self, path, t, gain=1.0):
        """Voice track starting at t. Returns the time it ends (next sentence usually starts ~0.3 s later)."""
        self.audio.append(('vo', path, t, gain)); return t + duration(path)
    def sfx(self, path, t, gain=0.5): self.audio.append(('sfx', path, t, gain))

    def frame_at(self, t):
        base = None
        for t0, t1, src in self.shots:
            if t0 <= t < t1: base = (src, t - t0, t1 - t0)
        if base is None: im = Image.new('RGB', (W, H), NAVY_D)
        else: im = base[0].frame(base[1], base[2])
        c = im.convert('RGBA')
        for t0, t1, fn in self.ovs:
            if t0 <= t < t1: fn(c, t - t0, t1 - t0, t)
        if self.caps: self.caps.draw(c, t)
        return c.convert('RGB')

    def preview(self, times, out, cols=5, scale=0.3):
        """Contact sheet of frames at `times` -> out (jpg). Always look at it before spending on video or rendering."""
        ims = [self.frame_at(t) for t in times]
        w, h = int(W * scale), int(H * scale); rows = math.ceil(len(ims) / cols)
        sheet = Image.new('RGB', (cols * (w + 8), rows * (h + 40)), 'white'); d = ImageDraw.Draw(sheet)
        for i, im in enumerate(ims):
            x, y = (i % cols) * (w + 8), (i // cols) * (h + 40)
            sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 32)); d.text((x + 4, y + 6), f't={times[i]:.2f}', fill='black', font=font('bold', 22))
        os.makedirs(os.path.dirname(P(out)) or '.', exist_ok=True); sheet.save(P(out), quality=88)

    def render_video(self, out, total, crf=16, preset='slow'):
        n = int(round(total * FPS))
        cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
               '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', out]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for f in range(n):
            pr.stdin.write(self.frame_at(f / FPS).tobytes())
            if f % 150 == 0: print(f'  frame {f}/{n}', flush=True)
        pr.stdin.close(); pr.wait()
        if pr.returncode: raise RuntimeError(f'ffmpeg video encode failed ({pr.returncode})')

    def render_audio(self, out, total, music=None, music_gain=0.30, music_offset=None, music_fade_in=0.5, music_fade_out=2.2,
                     duck=True, loudness=-14, true_peak=-2.0, limiter=True):
        """Mix voice + music (ducked under the voice with a sidechain compressor) + effects; loudness-normalised.
        music_offset=None starts the music at its first strong onset. Works with any subset: voice only, music only..."""
        args = ['ffmpeg', '-v', 'error', '-y']; parts = []; vo_l = []; sx_l = []
        for i, (kind, path, t, g) in enumerate(self.audio):
            args += ['-i', P(path)]; ms = int(round(t * 1000))
            parts.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},volume={g}[a{i}]')
            (vo_l if kind == 'vo' else sx_l).append(f'[a{i}]')
        if not self.audio and not music: raise ValueError('Nothing to mix: add voice, effects or music')
        def mixed(labels, name):
            if len(labels) == 1: parts.append(f'{labels[0]}apad=whole_dur={total}[{name}]')
            else: parts.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0:dropout_transition=0,apad=whole_dur={total}[{name}]')
        final = []
        if vo_l:
            mixed(vo_l, 'vo')
            if music and duck: parts.append('[vo]asplit=2[vo1][vosc]'); final.append('[vo1]')
            else: final.append('[vo]')
        if music:
            if music_offset is None: music_offset = music_start(music)
            mi = len(self.audio); args += ['-i', P(music)]
            fade = f'afade=t=in:d={music_fade_in},' if music_fade_in else ''
            fade += f'afade=t=out:st={max(0, total - music_fade_out)}:d={music_fade_out},' if music_fade_out else ''
            parts.append(f'[{mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start={music_offset}:end={music_offset + total},'
                         f'asetpts=PTS-STARTPTS,{fade}apad=whole_dur={total},volume={music_gain}[mus]')
            if vo_l and duck:
                parts.append('[mus][vosc]sidechaincompress=threshold=0.025:ratio=4:attack=20:release=380:makeup=1[md]'); final.append('[md]')
            else: final.append('[mus]')
        if sx_l: mixed(sx_l, 'sx'); final.append('[sx]')
        if len(final) == 1: parts.append(f'{final[0]}anull[mix]')
        else: parts.append(f'{"".join(final)}amix=inputs={len(final)}:normalize=0:dropout_transition=0[mix]')
        lim = f',alimiter=limit={10 ** (true_peak / 20):.3f}:attack=4:release=60:level=false' if limiter else ''
        parts.append(f'[mix]atrim=end={total},loudnorm=I={loudness}:TP={true_peak}:LRA=11,aresample=48000{lim}[out]')
        args += ['-filter_complex', ';'.join(parts), '-map', '[out]', '-c:a', 'pcm_s16le', out]
        subprocess.run(args, check=True)

    def cover(self, t, out, quality=93):
        """Cover image: the frame at t WITHOUT captions."""
        caps, self.caps = self.caps, None
        try: self.frame_at(t).save(P(out), quality=quality)
        finally: self.caps = caps

    def render(self, out, total, music=None, music_gain=0.24, music_offset=None, **audio_kw):
        """Video + audio mix + mux in one call. Intermediates (_video.mp4, _audio.wav) stay next to `out`."""
        out = P(out); d = os.path.dirname(out) or '.'; os.makedirs(d, exist_ok=True)
        v, a = os.path.join(d, '_video.mp4'), os.path.join(d, '_audio.wav')
        self.render_video(v, total); self.render_audio(a, total, music, music_gain, music_offset, **audio_kw); self.mux(v, a, out)
        return out

    def mux(self, video, audio, out):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        '-shortest', '-movflags', '+faststart', out], check=True)
