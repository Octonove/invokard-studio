# reelkit — the Invokard Studio compositor: 1080x1920 at 30 fps (or 1920x1080 / 1080x1080, see set_format), shots,
# animated layers, word-by-word captions and the audio mix. Every frame is composed with Pillow and piped to ffmpeg
# (libx264). No video editor involved.
#
#   import reelkit as rk; rk.set_format('9:16')                # optional: '16:9' or '1:1'; call it before anything else
#   from reelkit import Reel, Captions, Still, Clip, Func, blit, pill, text_img, lerp, clamp01, eo, eio, eback
#   rk.set_base(folder)              # work folder: img/ vid/ frames/ vo/ music/ sfx/ ref/ out/ review/
#   reel = Reel('name'); reel.caps = Captions(size=70, y=1440)
#   reel.shot(t0, t1, Still('img/a.png', z=(1.0, 1.06)))       # background source for a time range
#   reel.ov(t0, t1, lambda c, tl, dur, t: ...)                 # RGBA layer drawn on top (tl = local time)
#   reel.vo('vo/v01.mp3', 0.3); reel.caps.line('v01', 'Text with *highlight*.', 'vo/v01.mp3', 0.3)
#   reel.render('out/reel.mp4', TOTAL, music='music/base.mp3')
import os, re, json, math, shutil, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import fonts as _fonts

# ---------------------------------------------------------------- format
# 9:16 is the default and what every reel made before formats existed uses. 16:9 is for YouTube, LinkedIn, Fiverr;
# 1:1 for feeds. Pick one with REELKIT_FORMAT=16:9 in the environment or rk.set_format('16:9') at the top of the
# script, before `from reelkit import W, H` and before any source or layer is built. REELKIT_LANDSCAPE=1 (the first
# switch, kept for the scripts that use it) means 16:9.
FORMATS = {'9:16': (1080, 1920), '16:9': (1920, 1080), '1:1': (1080, 1080)}
ALIASES = {'portrait': '9:16', 'vertical': '9:16', 'reel': '9:16', 'landscape': '16:9', 'horizontal': '16:9',
           'widescreen': '16:9', 'square': '1:1'}
# Default positions (px) of the captions and of the pieces in pieces.py, per format. The 9:16 numbers are the ones the
# engine always used, so existing reels do not move. 16:9 and 1:1 share the 1080 px height, so they share the heights.
_SHORT = dict(caption_size=64, caption_y=880, caption_maxw=1400, text_y=300, text_maxw=1500, pill_maxw=1400,
              top=120, hook_y=170, label_y=110, card_y=110, item_y=150, benefit_y=740, gradient_y0=540,
              handle_y=540, wipe_label_y=900, center_y=540,
              outro_save=(150, 175, 390, 520, 597, 712, 812, 36),     # card from/to, bookmark, title, sub, cta, note, note step
              comment_y=560, comment_dy=(-150, 150, 290),             # «Comment WORD»: prompt, sub and handle offsets
              fan_size=(200, 280), fan_y=220, fan_cta_y=640)
LAYOUTS = {
    '9:16': dict(caption_size=74, caption_y=1450, caption_maxw=900, text_y=470, text_maxw=950, pill_maxw=900,
                 top=236, hook_y=300, label_y=255, card_y=215, item_y=300, benefit_y=1262, gradient_y0=1100,
                 handle_y=1000, wipe_label_y=1480, center_y=900,
                 outro_save=(360, 400, 690, 850, 942, 1090, 1218, 40),
                 comment_y=1040, comment_dy=(-148, 152, 380),
                 fan_size=(300, 420), fan_y=480, fan_cta_y=1130),
    '16:9': dict(_SHORT),
    '1:1': dict(_SHORT, caption_maxw=900, text_maxw=950, pill_maxw=900),
}

def format_name(fmt):
    """Canonical name ('9:16', '16:9', '1:1') of a format given as a name, an alias (portrait, landscape, square...),
    'WIDTHxHEIGHT' or a (width, height) tuple."""
    if isinstance(fmt, (tuple, list)): fmt = f'{fmt[0]}x{fmt[1]}'
    f = str(fmt).strip().lower().replace(' ', '')
    f = ALIASES.get(f, f)
    if f in FORMATS: return f
    for name, (w, h) in FORMATS.items():
        if f == f'{w}x{h}': return name
    raise ValueError(f'Unknown format "{fmt}". Use one of: 9:16 (1080x1920), 16:9 (1920x1080), 1:1 (1080x1080)')

def env_format():
    """Format asked for by the environment: REELKIT_FORMAT, else REELKIT_LANDSCAPE (any value but 0/false/no/off), else 9:16."""
    f = os.environ.get('REELKIT_FORMAT', '').strip()
    if f: return format_name(f)
    if os.environ.get('REELKIT_LANDSCAPE', '').strip().lower() not in ('', '0', 'false', 'no', 'off'): return '16:9'
    return '9:16'

FORMAT = env_format()
W, H = FORMATS[FORMAT]
FPS = 30
LAYOUT = dict(LAYOUTS[FORMAT])      # edit a key to move that default for the whole reel, e.g. rk.LAYOUT['caption_y'] = 860

def set_format(fmt='9:16'):
    """Canvas of the reel: '9:16' (1080x1920, default), '16:9' (1920x1080) or '1:1' (1080x1080). Call it at the top of
    the script, before `from reelkit import W, H` (those names are copies) and before building sources, layers or
    captions: their default positions come from LAYOUT. Returns (W, H)."""
    global FORMAT, W, H, LAYOUT
    FORMAT = format_name(fmt); W, H = FORMATS[FORMAT]; LAYOUT = dict(LAYOUTS[FORMAT])
    return W, H

BASE = os.path.abspath(os.environ.get('REEL_DIR', os.getcwd()))

def set_base(path):
    """Work folder of the reel. Call it before loading anything; relative paths resolve against it."""
    global BASE; BASE = os.path.abspath(path)

def P(*a):
    """Path inside the work folder (absolute paths pass through)."""
    return a[0] if len(a) == 1 and os.path.isabs(a[0]) else os.path.join(BASE, *a)

def source_key(path):
    """(absolute path, modification time) of an input file: the key of every cache, so a cache never serves a file
    from another work folder (after set_base) or the old version of a regenerated file. Clear error if it is missing."""
    p = P(path)
    try: return p, os.stat(p).st_mtime_ns
    except FileNotFoundError:
        raise FileNotFoundError(f'{path}: file not found (looked for {p}; work folder {BASE}, set with rk.set_base)') from None

def tool(name):
    """Path of ffmpeg or ffprobe, or an error that says how to install them."""
    p = shutil.which(name)
    if not p: raise RuntimeError(f'{name} was not found on PATH. Install ffmpeg (it includes ffprobe), reopen the terminal and '
                                 f'check with `python install.py doctor`; see references/troubleshooting.md.')
    return p

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
def load(path):
    """An image of the work folder as RGB (cached; shared, do not draw on it)."""
    return _load(*source_key(path))

@functools.lru_cache(None)
def _load(path, mtime):
    return Image.open(path).convert('RGB')

def cover(im, w=None, h=None, cx=.5, cy=.5):
    """Scale to fill w x h (default: the canvas) and crop around the focal point (cx, cy in 0..1)."""
    w, h = w or W, h or H
    sw, sh = im.size; s = max(w / sw, h / sh)
    nw, nh = max(w, round(sw * s)), max(h, round(sh * s))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    x = round((nw - w) * cx); y = round((nh - h) * cy)
    return im2.crop((x, y, x + w, y + h))

def cover_cached(path, w=None, h=None, cx=.5, cy=.5, crop=None):
    """cover() of an image file, cached (shared, do not draw on it)."""
    return cover_key(source_key(path), w or W, h or H, cx, cy, crop)

@functools.lru_cache(None)
def cover_key(key, w, h, cx=.5, cy=.5, crop=None):
    im = _load(*key)
    if crop: im = im.crop(crop)
    return cover(im, w, h, cx, cy)

def blurred(path, radius=28, dark=0.55, tint=NAVY_D, crop=None):
    """Blurred, darkened full-frame version of an image (backgrounds for closing scenes)."""
    return _blurred(source_key(path), radius, dark, tuple(tint), crop, W, H)

@functools.lru_cache(None)
def _blurred(key, radius, dark, tint, crop, w, h):
    im = cover_key(key, w, h, crop=crop).resize((w // 4, h // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius / 4))
    im = im.resize((w, h), Image.BICUBIC)
    return Image.blend(im, Image.new('RGB', (w, h), tint), dark)

def gradient(top, bottom, w=None, h=None):
    w, h = w or W, h or H
    a = np.linspace(0, 1, h)[:, None, None]
    arr = (np.array(top)[None, None, :] * (1 - a) + np.array(bottom)[None, None, :] * a)
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), 'RGB')

# ---------------------------------------------------------------- drawing primitives
def memo_image(fn):
    """Cache an image builder (text, pills): layers rebuild the same label on every frame, and each build blurs a
    shadow. Callers get a copy, so drawing on the result never alters the cache. Unhashable arguments skip the cache."""
    cached = functools.lru_cache(maxsize=256)(fn)
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        try: im = cached(*a, **kw)
        except TypeError: return fn(*a, **kw)         # a list as a colour, say
        return im.copy()
    wrapper.cache_clear = cached.cache_clear
    return wrapper

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

@memo_image
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

@memo_image
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
LEGACY_RESAMPLE = False   # True: zooms and pans resample with the affine transform of 1.0.0 (same pixels, ~4x slower)

def view(im, a, x0, y0, vw, vh):
    """The vw x vh window of im at (x0, y0), scaled to the canvas (a = vw / W). A resize with a box is ~4x faster than
    the affine transform and as sharp; a window that leaves the image (zoom below 1) keeps the transform, black outside."""
    sw, sh = im.size
    if LEGACY_RESAMPLE or x0 < -0.5 or y0 < -0.5 or x0 + vw > sw + 0.5 or y0 + vh > sh + 0.5:
        return im.transform((W, H), Image.AFFINE, (a, 0, x0, 0, a, y0), resample=Image.BICUBIC)
    return im.resize((W, H), Image.BICUBIC, box=(max(0.0, x0), max(0.0, y0), min(sw, x0 + vw), min(sh, y0 + vh)))

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
        self.static = z[0] == z[1] and tuple(self.c0) == tuple(self.c1); self.cached = None   # no motion: one frame
    def frame(self, t, dur):
        if self.static and self.cached and self.cached[0] == (W, H, LEGACY_RESAMPLE): return self.cached[1].copy()
        p = clamp01(t / dur) if dur > 0 else 0
        s = self.s0 * lerp(self.z[0], self.z[1], p)
        sw, sh = self.im.size; vw, vh = W / s, H / s
        cx = lerp(self.c0[0], self.c1[0], p) * sw; cy = lerp(self.c0[1], self.c1[1], p) * sh
        cx = min(max(cx, vw / 2), sw - vw / 2); cy = min(max(cy, vh / 2), sh - vh / 2)
        im = view(self.im, 1 / s, cx - vw / 2, cy - vh / 2, vw, vh)
        if self.static: self.cached = ((W, H, LEGACY_RESAMPLE), im.copy())
        return im

class Clip:
    """Frames of a video clip extracted to frames/<name>/0001.jpg... (see `media.py frames` / `media.py extract`).
    speed scales playback, start is the offset inside the clip (s), z a zoom over the shot, fx(im, t) a per-frame effect.
    Frames of another size than the canvas (extracted for another format) are scaled and cropped to fill it."""
    def __init__(self, name, speed=1.0, start=0.0, z=(1.0, 1.0), c=(.5, .5), fx=None):
        self.name, self.dir = name, P('frames', name)
        if not os.path.isdir(self.dir): raise FileNotFoundError(f'No frames folder for clip "{name}": {self.dir}')
        self.files = sorted(f for f in os.listdir(self.dir) if f.lower().endswith(('.jpg', '.png')))
        self.n = len(self.files)
        if self.n == 0: raise FileNotFoundError(f'Clip "{name}" has no frames in {self.dir}')
        self.speed, self.start, self.z, self.c, self.fx = speed, start, z, c, fx
        self.warned = False
    def get(self, idx):
        idx = min(max(idx, 0), self.n - 1)
        im = Image.open(os.path.join(self.dir, self.files[idx])).convert('RGB')
        if im.size != (W, H):
            if not self.warned:
                print(f'note: the frames of clip "{self.name}" are {im.width}x{im.height} and the reel is {W}x{H} ({FORMAT}): '
                      f'they are cropped to fill. Extract them for this format: python media.py frames <work> {self.name} --format {FORMAT}', flush=True)
                self.warned = True
            im = cover(im)
        return im
    def frame(self, t, dur):
        im = self.get(int(round((self.start + t * self.speed) * FPS)))
        zz = lerp(self.z[0], self.z[1], clamp01(t / dur) if dur else 0)
        if abs(zz - 1) > 1e-3:
            vw, vh = W / zz, H / zz; cx, cy = self.c[0] * W, self.c[1] * H
            cx = min(max(cx, vw / 2), W - vw / 2); cy = min(max(cy, vh / 2), H - vh / 2)
            im = view(im, 1 / zz, cx - vw / 2, cy - vh / 2, vw, vh)
        if self.fx: im = self.fx(im, t)
        return im

class Func:
    """A source drawn by a function f(t_local, duration) -> RGB image (procedural scenes, wipes, end cards)."""
    def __init__(self, f): self.f = f
    def frame(self, t, dur): return self.f(t, dur)

# ---------------------------------------------------------------- audio analysis
def duration(path):
    """Seconds of an audio or video file (ffprobe; cached per file version)."""
    return _duration(*source_key(path))

@functools.lru_cache(None)
def _duration(path, mtime):
    r = subprocess.run([tool('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: raise RuntimeError(f'ffprobe could not read the duration of {path}: {(r.stderr or r.stdout).strip()[:300]}') from None

def speech_segments(path, noise='-38dB', d=0.1):
    """(start, end) spans with voice, from ffmpeg silencedetect. Phrase timings and cuts derive from these."""
    return _speech_segments(source_key(path), noise, d)

@functools.lru_cache(None)
def _speech_segments(key, noise, d):
    dur = _duration(*key)
    err = subprocess.run([tool('ffmpeg'), '-hide_banner', '-nostats', '-i', key[0], '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    return voiced_spans(err, dur)

_NUM = r'(-?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)'      # ffmpeg 6 prints tiny times as 2.08333e-05; negatives can appear
def voiced_spans(log, dur):
    """Voiced (start, end) spans from the log of ffmpeg's silencedetect and the file's duration."""
    ss = [max(0.0, float(x)) for x in re.findall(r'silence_start: ' + _NUM, log)]
    se = [max(0.0, float(x)) for x in re.findall(r'silence_end: ' + _NUM, log)]
    segs, cur = [], 0.0
    for s, e in zip(ss, se + [dur] * (len(ss) - len(se))):
        if s <= 0.03: cur = e; continue
        if s - cur > 0.05: segs.append((cur, s))
        cur = e
    if dur - cur > 0.08: segs.append((cur, dur))
    return segs

def music_start(path):
    """Second of the first strong onset of a music track (skips a quiet intro)."""
    raw = subprocess.check_output([tool('ffmpeg'), '-v', 'error', '-i', source_key(path)[0], '-ac', '1', '-ar', '8000', '-f', 's16le', '-'])
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
    raw = subprocess.check_output([tool('ffmpeg'), '-v', 'error', '-i', source_key(path)[0], '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'])
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
        starts = t0 + np.arange(0, b, 0.004)                     # one candidate grid per phase, all scored at once
        counts = np.ceil((t1 - starts) / b).astype(int)           # len(np.arange(start, t1, b)) of each phase
        sc = np.empty(len(starts))
        for cnt in np.unique(counts):
            rows = np.flatnonzero(counts == cnt); st = starts[rows][:, None]; k = np.arange(cnt)[None, :]
            ts = np.where(k == 0, st, np.where(k == 1, st + b, st + k * ((st + b) - st)))   # what np.arange computes
            idx = ((ts - off) * fps).astype(int).clip(0, len(fl) - 1)
            idx2 = ((ts + b / 2 - off) * fps).astype(int).clip(0, len(fl) - 1)
            sc[rows] = fl[idx].mean(axis=1) + 0.5 * fl[idx2].mean(axis=1)
        i = int(np.argmax(sc))                                     # first best phase, as the old loop kept it
        if best is None or sc[i] > best[0]: best = (sc[i], bpm, starts[i])
    return round(best[1], 2), 60 / best[1], round(best[2], 3)

# ---------------------------------------------------------------- word-by-word captions
PUNCT = '.,:;?!'
class Captions:
    """Captions timed word by word. Syntax: *word* highlighted · ' / ' forces a block break ·
    shown|spoken when the written form differs from the spoken one ("40|forty"). size, y and maxw default to the
    format's LAYOUT (9:16: 74, 1450, 900)."""
    def __init__(self, size=None, y=None, maxw=None):
        self.size = LAYOUT['caption_size'] if size is None else size
        self.y = LAYOUT['caption_y'] if y is None else y
        self.maxw = LAYOUT['caption_maxw'] if maxw is None else maxw
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
            if not core and not punct: continue                       # a stray '*' or '**': nothing to show
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
            ws = self._parse(text)
            if not ws:                                    # an empty word, or a lone ' / ' marker: break the previous block
                if text.strip() == '/' and parsed: parsed[-1]['brk'] = True
                continue
            w_ = ws[0]; w_['t0'] = t0 + a; w_['t1'] = t0 + b; parsed.append(w_)
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
        if im.size != (W, H):        # a wrong size would not fail in ffmpeg: 1080x1920 and 1920x1080 have the same bytes
            raise ValueError(f'The shot at t={t:.2f} s returned a {im.width}x{im.height} frame but the reel is {W}x{H} ({FORMAT}). '
                             f'Sources must return full frames; if you changed the format, call rk.set_format() before building them.')
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
        if n < 1: raise ValueError(f'total={total} s is less than one frame')
        cmd = [tool('ffmpeg'), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
               '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', P(out)]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        try:
            for f in range(n):
                data = self.frame_at(f / FPS).tobytes()
                try: pr.stdin.write(data)
                except OSError as e:                      # BrokenPipeError (or EINVAL on Windows): ffmpeg has quit
                    pr.wait()
                    raise RuntimeError(f'ffmpeg stopped reading frames at frame {f}/{n} (exit code {pr.returncode}); its own error is printed above') from e
                if f % 150 == 0: print(f'  frame {f}/{n}', flush=True)
        finally:
            try: pr.stdin.close()
            except OSError: pass
            pr.wait()
        if pr.returncode: raise RuntimeError(f'ffmpeg video encode failed ({pr.returncode})')

    def render_audio(self, out, total, music=None, music_gain=0.30, music_offset=None, music_fade_in=0.5, music_fade_out=2.2,
                     duck=True, loudness=-14, true_peak=-2.0, limiter=True, linear=True):
        """Mix voice + music (ducked under the voice with a sidechain compressor) + effects; loudness-normalised.
        music_offset=None starts the music at its first strong onset. Works with any subset: voice only, music only...
        linear=True (default) normalises in two passes with one fixed gain for the whole reel: a first pass measures the
        mix, the second applies the gain. Single-pass loudnorm (linear=False) is dynamic and starts with too little gain,
        so a hook spoken in the first seconds comes out quieter than the same audio later (measured: up to 5-6 dB).
        When that gain would push the peaks past true_peak, loudnorm refuses linear mode, so the gain is applied with
        `volume` and the limiter catches the peaks (without the limiter it falls back to dynamic mode)."""
        self.check(music)
        args = [tool('ffmpeg'), '-v', 'error', '-y']; parts = []; vo_l = []; sx_l = []
        for i, (kind, path, t, g) in enumerate(self.audio):
            args += ['-i', P(path)]; ms = int(round(t * 1000))
            parts.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},volume={g}[a{i}]')
            (vo_l if kind == 'vo' else sx_l).append(f'[a{i}]')
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
        norm = f'loudnorm=I={loudness}:TP={true_peak}:LRA=11'
        if linear:                                   # first pass: measure the whole mix; second pass: one fixed gain
            probe = parts + [f'[mix]atrim=end={total},{norm}:print_format=json[out]']
            # no '-v error' here: loudnorm prints its JSON report at info level
            err = subprocess.run([tool('ffmpeg'), '-hide_banner', '-nostats'] + args[3:] + ['-filter_complex', ';'.join(probe), '-map', '[out]', '-f', 'null', '-'],
                                 capture_output=True, text=True, check=True).stderr
            m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
            gain = loudness - float(m['input_i'])
            if not math.isfinite(gain) or float(m['input_i']) <= -70: pass     # silent or too short to measure: stay dynamic
            elif limiter and float(m['input_tp']) + gain > true_peak:
                # loudnorm only stays linear if the gain keeps the peaks under true_peak; otherwise it silently goes dynamic.
                # Speech at -14 LUFS / -2 dBTP usually doesn't fit (12 dB of room; measured peaks ~14 dB above loudness):
                # same fixed gain here, and the limiter below catches the peaks.
                norm = f'volume={gain:.2f}dB'
            else:
                lra = min(50.0, max(11.0, float(m['input_lra']) + 1.0))   # a target LRA below the source forces dynamic mode
                norm = (f'loudnorm=I={loudness}:TP={true_peak}:LRA={lra:.1f}:linear=true:measured_I={m["input_i"]}:'
                        f'measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}')
        parts.append(f'[mix]atrim=end={total},{norm},aresample=48000{lim}[out]')
        args += ['-filter_complex', ';'.join(parts), '-map', '[out]', '-c:a', 'pcm_s16le', P(out)]
        subprocess.run(args, check=True)

    def check(self, music=None):
        """Fail fast, before minutes of rendering: ffmpeg is installed, every audio file exists, there is something to mix."""
        tool('ffmpeg'); tool('ffprobe')
        missing = [p for _, p, _, _ in self.audio if not os.path.isfile(P(p))] + ([music] if music and not os.path.isfile(P(music)) else [])
        if missing: raise FileNotFoundError(f'Audio file(s) not found: {", ".join(map(str, missing))} (work folder {BASE})')
        if not self.audio and not music:
            raise ValueError('Nothing to mix: add a voice (reel.vo), effects (reel.sfx) or music=. For a reel without sound, add '
                             'silence: python media.py silence vo/silence.wav <seconds>, then reel.vo("vo/silence.wav", 0)')

    def cover(self, t, out, quality=93):
        """Cover image: the frame at t WITHOUT captions."""
        caps, self.caps = self.caps, None
        os.makedirs(os.path.dirname(P(out)) or '.', exist_ok=True)
        try: self.frame_at(t).save(P(out), quality=quality)
        finally: self.caps = caps

    def render(self, out, total, music=None, music_gain=0.24, music_offset=None, crf=16, preset='slow', **audio_kw):
        """Video + audio mix + mux in one call. Intermediates (_video.mp4, _audio.wav) stay next to `out`.
        crf/preset go to x264 (preset='veryfast' for drafts); the rest to render_audio."""
        if not total > 0: raise ValueError(f'total must be a positive number of seconds (got {total})')
        self.check(music)                                 # before the video, not after it
        out = P(out); d = os.path.dirname(out) or '.'; os.makedirs(d, exist_ok=True)
        v, a = os.path.join(d, '_video.mp4'), os.path.join(d, '_audio.wav')
        self.render_video(v, total, crf=crf, preset=preset); self.render_audio(a, total, music, music_gain, music_offset, **audio_kw); self.mux(v, a, out)
        return out

    def mux(self, video, audio, out):
        subprocess.run([tool('ffmpeg'), '-v', 'error', '-y', '-i', P(video), '-i', P(audio), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        '-shortest', '-movflags', '+faststart', P(out)], check=True)
