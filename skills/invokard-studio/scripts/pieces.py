# pieces — reusable visual components on top of reelkit: brand palette, headline, chips, text blocks with highlighted
# phrases, animated chart card, numbered list items, before/after wipe, end cards and sound effects.
import os, math, functools
import numpy as np
from PIL import Image, ImageDraw
import reelkit as rk
from reelkit import W, H, P, blit, text_img, pill, rrect, shadowed, font, blurred, cover_cached, lerp, clamp01, eo, eio, eback, Func, emoji_img

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')

def sfx(name):
    """Absolute path of a bundled effect: whoosh, pop, shimmer, chime, typing, shutter, coaster, fridge."""
    p = os.path.join(ASSETS, 'sfx', name + '.mp3')
    if not os.path.exists(p): raise FileNotFoundError(f'No bundled effect "{name}" ({sorted(f[:-4] for f in os.listdir(os.path.join(ASSETS, "sfx")))})')
    return p


# ------------------------------------------------------------------ brand
class Brand:
    """Palette of a brand. `accent` highlights captions and chips; `alert` marks the negative; `accent_text` must
    contrast on `accent` (lime -> navy, coral -> white)."""
    def __init__(self, dark, dark_deep, light, light_soft, accent, accent_text, alert=(235, 96, 82), muted=(214, 224, 240)):
        self.dark, self.dark_deep, self.light, self.light_soft = tuple(dark), tuple(dark_deep), tuple(light), tuple(light_soft)
        self.accent, self.accent_text, self.alert, self.muted = tuple(accent), tuple(accent_text), tuple(alert), tuple(muted)
        self.white = (255, 255, 255)
    def activate(self):
        """Apply the brand to the engine's captions. Returns self."""
        rk.set_brand(self.accent, self.accent_text, self.dark_deep); return self

    @staticmethod
    def from_colors(dark, accent, light=None):
        """Build a palette from two measured colours (dark and accent), deriving the rest."""
        def mix(c, w, a): return tuple(int(lerp(x, y, a)) for x, y in zip(c, w))
        lum = 0.2126 * accent[0] + 0.7152 * accent[1] + 0.0722 * accent[2]
        light = light or mix(dark, (255, 255, 255), 0.55)
        return Brand(dark, mix(dark, (0, 0, 0), 0.35), light, mix(light, (255, 255, 255), 0.6), accent,
                     (255, 255, 255) if lum < 150 else mix(dark, (0, 0, 0), 0.35))

    @staticmethod
    def from_logo(path, n=6):
        """Measure the dominant colours of a logo (ignoring near-white and near-black) and build a palette from the
        darkest and the most saturated. Print the result and check it by eye: logo files lie."""
        im = Image.open(P(path)).convert('RGB'); im.thumbnail((256, 256))
        q = im.quantize(colors=16, method=Image.Quantize.MEDIANCUT).convert('RGB')
        cols = sorted(q.getcolors(256 * 256), reverse=True)
        cand = [c for _, c in cols if 40 < sum(c) / 3 < 235][:n]
        if len(cand) < 2: raise ValueError('Could not find two usable colours in the logo')
        dark = min(cand, key=lambda c: sum(c)); sat = max(cand, key=lambda c: (max(c) - min(c)) if c != dark else -1)
        print('logo colours:', cand, '-> dark', dark, 'accent', sat)
        return Brand.from_colors(dark, sat)

BRANDS = {
    'studio': Brand((30, 58, 95), (18, 36, 62), (205, 215, 232), (230, 236, 246), (206, 110, 97), (255, 255, 255)),   # navy / coral
    'lime': Brand((27, 46, 94), (14, 26, 58), (94, 164, 212), (214, 233, 247), (166, 206, 50), (14, 26, 58)),          # navy / sky / lime
    'forest': Brand((18, 40, 30), (10, 22, 16), (150, 190, 170), (214, 232, 222), (0, 142, 78), (255, 255, 255)),      # green
    'mono': Brand((24, 24, 28), (10, 10, 12), (170, 170, 178), (226, 226, 230), (255, 196, 0), (24, 24, 28)),          # black / amber
}


# ------------------------------------------------------------------ sources and helpers
def source(name, img, **kw):
    """The animated clip if its frames exist (frames/<name>/), otherwise the still image. Lets you build and preview the
    whole edit BEFORE spending credits on video. kw: speed, start, z, c."""
    d = P('frames', name)
    if os.path.isdir(d) and len(os.listdir(d)) > 20:
        return rk.Clip(name, **{k: v for k, v in kw.items() if k in ('speed', 'start', 'z', 'c')})
    return rk.Still(img, z=kw.get('z', (1.0, 1.05)), c0=kw.get('c', (.5, .5)))

def bottom_gradient(b, y0=1100, strength=0.94):
    """Dark veil over the lower third so white captions read on light backgrounds. Add it as the FIRST layer."""
    ramp = np.clip((np.arange(H) - y0) / (H - y0), 0, 1) ** 1.2 * strength
    im = Image.new('RGBA', (W, H), b.dark_deep + (0,))
    im.putalpha(Image.fromarray((np.repeat(ramp[:, None], W, axis=1) * 255).astype(np.uint8))); return im

def fit_pill(text, maxw, size, **kw):
    """A pill that shrinks its type until it fits maxw (never below 30 px: unreadable on a phone)."""
    while True:
        im = pill(text, 'black', size, **kw)
        if im.width - 40 <= maxw or size <= 30: return im
        size -= 2

@functools.lru_cache(None)
def disc(d, col):
    im = Image.new('RGBA', (d, d), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse((0, 0, d - 1, d - 1), fill=tuple(col) + (255,)); return im

def badge(txt, b, d=104):
    """Round accent badge with a number or a short word."""
    im = disc(d, b.accent).copy(); t = text_img(txt, 'black', int(d * 0.56), b.accent_text)
    im.alpha_composite(t, ((d - t.width) // 2, (d - t.height) // 2 - int(d * 0.03)))
    return shadowed(im, radius=14, offset=(0, 8), opacity=0.35)

def mix(c1, c2, a): return tuple(int(lerp(u, v, a)) for u, v in zip(c1, c2))

def flash(canvas, tl, dur=0.22, color=(255, 255, 255)):
    a = clamp01(1 - tl / dur)
    if a > 0.01: blit(canvas, Image.new('RGBA', (W, H), color + (int(235 * a),)), W / 2, H / 2)

def appear(c, img, x, y, t, t0, anchor='c', dur=0.32):
    """Draw img with an elastic entrance starting at second t0."""
    if t < t0: return
    q = clamp01((t - t0) / dur)
    blit(c, img, x, y, lerp(0.75, 1, eback(q)), clamp01(q * 2.2), anchor)

def ring(canvas, cx, cy, r, p, color, width=7, dash=False, alpha=1.0):
    """A circle that draws itself (p: 0 -> 1) to point at a detail."""
    size = int(r * 2 + width * 4); im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    box = (width * 2, width * 2, size - width * 2, size - width * 2)
    if dash:
        n = 22; sweep = 360 * clamp01(p)
        for i in range(n):
            a0 = -90 + i * (360 / n)
            if a0 + 90 > sweep: break
            d.arc(box, a0, a0 + (360 / n) * 0.55, fill=color + (255,), width=width)
    else:
        d.arc(box, -90, -90 + 360 * clamp01(p), fill=color + (255,), width=width)
    blit(canvas, im, cx, cy, alpha=alpha)

@functools.lru_cache(None)
def photo_card(path, w, h, crop=None, border=0, radius=28, cx=.5, cy=.4):
    """Rounded thumbnail with optional white border and shadow (mosaics, end cards)."""
    im = cover_cached(path, w, h, cx, cy, crop).convert('RGBA')
    mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255); im.putalpha(mask)
    if border:
        out = rrect(w + 2 * border, h + 2 * border, radius + border // 2, (255, 255, 255, 255)); out.alpha_composite(im, (border, border)); im = out
    return shadowed(im, radius=26, offset=(0, 16), opacity=0.5)

@functools.lru_cache(None)
def chip(txt, size=40, style='glass', b=None, dot=None):
    """Small label: 'glass' (dark translucent), 'white', or 'accent' (needs b)."""
    if style == 'white': return pill(txt, 'bold', size, (b.dark if b else (30, 58, 95)), (255, 255, 255, 245), padx=26, pady=12, dot=dot, shadow=16)
    if style == 'accent': return pill(txt, 'black', size, b.accent_text, b.accent, padx=26, pady=12, shadow=16)
    return pill(txt, 'bold', size, (255, 255, 255), (12, 18, 30, 200), padx=28, pady=13, dot=dot, shadow=18)


# ------------------------------------------------------------------ text block with highlighted phrases (no voice needed)
_blocks = {}
def text_block(txt, size=84, maxw=950, box=None, text=(255, 255, 255), stroke=(18, 22, 20), kind='black'):
    """On-screen text (hook lines, client scripts) laid out in centred lines. Words between *asterisks* share one
    rounded box in `box` colour (default: the caption highlight); a highlighted run never breaks across lines.
    Emoji render in colour. The type shrinks in steps of 4 until the block fits maxw."""
    box = tuple(box or rk.HL_BG); key = (txt, size, maxw, box, text, stroke, kind)
    if key in _blocks: return _blocks[key]
    toks, hl, words = txt.split(' '), False, []
    for tok in toks:
        a = tok.startswith('*'); z = tok.rstrip('.,;:?!…').endswith('*') or tok.endswith('*')
        clean = tok.replace('*', '')
        if a: hl = True
        words.append((clean, hl))
        if z: hl = False
    units = []                                        # a highlighted run is one unbreakable unit
    for w_, h in words:
        if h and units and units[-1][0][1]: units[-1].append((w_, h))
        else: units.append([(w_, h)])
    def word_img(w_, sz, h):
        if all(ord(ch) > 0x2600 for ch in w_): return emoji_img(w_, sz), False
        f = font(kind, sz); bb = f.getbbox(w_)
        if h:
            im = Image.new('RGBA', (bb[2] - bb[0] + 8, bb[3] - bb[1] + 8), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((4 - bb[0], 4 - bb[1]), w_, font=f, fill=text); return im, True
        s = max(6, sz // 10)
        im = Image.new('RGBA', (bb[2] - bb[0] + 2 * s + 8, bb[3] - bb[1] + 2 * s + 8), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((s + 4 - bb[0], s + 4 - bb[1]), w_, font=f, fill=text, stroke_width=s, stroke_fill=stroke); return im, False
    while True:
        sp = int(size * 0.28); lines, cur, cw = [], [], 0
        for u in units:
            ims = [word_img(w_, size, h) for w_, h in u]
            uw = sum(i.width for i, _ in ims) + sp * (len(ims) - 1)
            if cur and cw + sp + uw > maxw: lines.append(cur); cur, cw = [], 0
            cw += (sp if cur else 0) + uw; cur.extend(ims)
        lines.append(cur)
        if max(sum(i.width for i, _ in l) + sp * (len(l) - 1) for l in lines) <= maxw or size < 52: break
        size -= 4
    lh = int(size * 1.32); pad = int(size * 0.22)
    canvas = Image.new('RGBA', (maxw + 80, lh * len(lines) + 40), (0, 0, 0, 0)); d = ImageDraw.Draw(canvas)
    for li, l in enumerate(lines):
        lw = sum(i.width for i, _ in l) + sp * (len(l) - 1); x = (canvas.width - lw) // 2; y = 20 + li * lh; k = 0
        while k < len(l):
            if l[k][1]:
                j = k; x0 = x + sum(l[m][0].width + sp for m in range(k))
                while j + 1 < len(l) and l[j + 1][1]: j += 1
                x1 = x + sum(l[m][0].width + sp for m in range(j + 1)) - sp
                d.rounded_rectangle((x0 - pad, y - pad * 0.35, x1 + pad, y + lh - pad * 0.9), radius=int(size * 0.22), fill=box + (255,))
                k = j + 1
            else: k += 1
        for im, h in l:
            yy = y + (lh - im.height) // 2 - int(size * 0.08)
            canvas.alpha_composite(im, (x, max(0, yy))); x += im.width + sp
    _blocks[key] = canvas
    return canvas

def text_layer(txt, y=470, size=84, maxw=950, pop=0.28, fade_out=0.14, **kw):
    """Layer that pops a text_block in (elastic scale) and fades it out at the end of its range."""
    img = text_block(txt, size, maxw, **kw)
    def f(c, tl, dur, t):
        a = clamp01(tl / 0.18) * (1 - clamp01((tl - (dur - fade_out)) / fade_out))
        s = lerp(0.86, 1.0, eback(clamp01(tl / pop)))
        blit(c, img, W // 2, y, scale=s, alpha=a)
    return f


# ------------------------------------------------------------------ hook headline
def headline(b, kicker, line, highlight, y=236):
    """Layer: kicker in a pill + line + key phrase in an accent pill. Safe zone at the top (y >= 220)."""
    def f(c, tl, dur, t):
        blit(c, pill(kicker, 'black', 32, b.white, b.dark, padx=26, pady=12, tracking=3, shadow=12), W / 2, y,
             lerp(0.85, 1, eback(clamp01(tl / 0.35))), clamp01((tl - 0.05) / 0.25))
        blit(c, text_img(line, 'black', 74, b.dark), W / 2, y + 94, lerp(1.05, 1, eo(tl / 0.5)), clamp01((tl - 0.12) / 0.25))
        blit(c, fit_pill(highlight, 900, 84, fg=b.accent_text, bg=b.accent, padx=34, pady=12, r=24, shadow=20), W / 2, y + 208,
             lerp(0.7, 1, eback(clamp01((tl - 0.25) / 0.45))), clamp01((tl - 0.22) / 0.2))
    return f

def hook(b, line, highlight, y=300, size=72):
    """Layer: white line with shadow + accent pill below (for photo/video backgrounds)."""
    def f(c, tl, dur, t):
        blit(c, text_img(line, 'black', size, b.white, shadow=12), W / 2, y, lerp(1.05, 1, eo(tl / 0.6)), clamp01((tl - 0.08) / 0.3))
        blit(c, fit_pill(highlight, 940, size, fg=b.accent_text, bg=b.accent, padx=30, pady=14, r=20, shadow=22), W / 2, y + 108,
             lerp(0.9, 1, eback(clamp01((tl - 0.15) / 0.45))), clamp01((tl - 0.12) / 0.25))
    return f

def section_label(b, n, txt):
    """Layer: «n · TEXT» pill at the top (safe zone)."""
    im = pill(f'{n} · {txt}' if n else txt, 'black', 44, b.white, b.dark, padx=34, pady=16, tracking=2, shadow=20)
    def f(c, tl, dur, t):
        q = clamp01(tl / 0.35)
        blit(c, im, W / 2, lerp(215, 255, eo(q)), lerp(0.85, 1, eback(q)), clamp01(q * 2))
    return f


# ------------------------------------------------------------------ chart card with animated curve
def curve_img(w, h, fn, p, color, width=10, ss=2):
    """Trace fn(x) -> [0, 1] up to fraction p, supersampled for a clean edge."""
    im = Image.new('RGBA', (w * ss, h * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im); p = clamp01(p)
    if p <= 0.004: return im.resize((w, h))
    xs = np.linspace(0, p, max(2, int(160 * p))); pts = [(x * w * ss, (1 - fn(x)) * h * ss) for x in xs]
    d.line(pts, fill=color + (255,), width=width * ss, joint='curve'); r = width * ss / 2
    for (x, y) in (pts[0], pts[-1]): d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))
    return im.resize((w, h), Image.LANCZOS)

class Card:
    """White card at the top with a header, a legend and a baseline. draw() returns the origin of the plot area."""
    def __init__(self, b, w=940, h=300, x=70, y=215, plot=(56, 92, 828, 176)):
        self.b, self.w, self.h, self.x, self.y, self.plot = b, w, h, x, y, plot
        self.img = shadowed(rrect(w, h, 38, (255, 255, 255, 250)), radius=26, offset=(0, 14), opacity=0.30)
    def draw(self, c, p, header, legend=()):
        b, pl = self.b, self.plot; y = lerp(self.y - 60, self.y, eo(p))
        blit(c, self.img, W / 2, y + self.h / 2, 1, clamp01(p * 1.4))
        if p < 0.35: return None
        a = clamp01((p - 0.35) / 0.4)
        blit(c, text_img(header, 'black', 30, b.dark, tracking=3), self.x + pl[0] - 6, y + 28, 1, a, 'tl')
        lx = self.x + self.w - 44
        for txt, col in reversed(legend):
            ti = text_img(txt, 'bold', 30, b.dark); lx -= ti.width - 8
            blit(c, ti, lx, y + 26, 1, a, 'tl'); blit(c, disc(24, col), lx - 28, y + 38, 1, a, 'tl'); lx -= 62
        d = ImageDraw.Draw(c); by = y + pl[1] + pl[3] * 0.76
        for xx in range(int(self.x + pl[0]), int(self.x + pl[0] + pl[2]), 26):
            d.line((xx, by, xx + 13, by), fill=b.light_soft + (int(255 * a),), width=4)
        return (self.x + pl[0], y + pl[1])
    def curve(self, c, origin, fn, p, color, width=10):
        blit(c, curve_img(self.plot[2], self.plot[3], fn, p, color, width), origin[0], origin[1], 1, 1, 'tl')


# ------------------------------------------------------------------ numbered list item ("the N ...")
def list_item(b, n, total, name, benefit, y_name=300, y_benefit=1262):
    """Layer for one item of a list: numbered badge, name in a pill, progress dots and the benefit below."""
    name_p = fit_pill(name, 760, 58, fg=b.white, bg=b.dark, padx=34, pady=14, shadow=18)
    bd = badge(str(n), b); ben_p = fit_pill(benefit, 900, 40, fg=b.dark_deep, bg=(255, 255, 255, 245), padx=28, pady=13, shadow=16)
    bw, nw = bd.width - 60, name_p.width - 40; gw = bw + 18 + nw
    def f(c, tl, dur, t):
        q = clamp01(tl / 0.32); x0 = W / 2 - gw / 2
        blit(c, bd, x0 + bw / 2, y_name, lerp(0.3, 1, eback(q)), clamp01(q * 2.5))
        blit(c, name_p, x0 + bw + 18 + nw / 2, y_name, lerp(0.8, 1, eback(clamp01((tl - 0.05) / 0.32))), clamp01((tl - 0.04) / 0.18))
        for k in range(total):
            on = k < n
            blit(c, disc(22 if on else 16, b.accent if on else b.light_soft), W / 2 + (k - (total - 1) / 2) * 44, y_name + 98, 1, clamp01(tl / 0.2))
        qb = clamp01((tl - 0.28) / 0.35)
        if qb > 0: blit(c, ben_p, W / 2, lerp(y_benefit + 30, y_benefit, eo(qb)), 1, qb)
    return f


# ------------------------------------------------------------------ before / after wipe
def _handle(b, r=50):
    im = Image.new('RGBA', (2 * r + 20, 2 * r + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((12, 14, 12 + 2 * r, 14 + 2 * r), fill=(0, 0, 0, 70)); d.ellipse((10, 10, 10 + 2 * r, 10 + 2 * r), fill=(255, 255, 255, 255))
    c = 10 + r
    d.polygon([(c - 12, c - 16), (c - 12, c + 16), (c - 32, c)], fill=b.accent); d.polygon([(c + 12, c - 16), (c + 12, c + 16), (c + 32, c)], fill=b.accent)
    return im

def split_frame(before, after, xw, b, handle=True, y_handle=1000):
    """RGBA frame: `after` revealed on the left up to x=xw over `before`, with a white bar and a handle."""
    im = before.copy()
    if xw > 0: im.paste(after.crop((0, 0, int(xw), H)), (0, 0))
    c = im.convert('RGBA')
    if 0 < xw < W:
        ImageDraw.Draw(c).rectangle((int(xw) - 5, 0, int(xw) + 5, H), fill=(255, 255, 255, 235))
        if handle: blit(c, _handle(b), int(xw), y_handle)
    return c

def wipe_scene(before, after, b, hold=0.0, sweep=0.85, labels=('BEFORE', 'AFTER'), y_label=1480, settle=None, y_handle=1000):
    """Scene (Func): shows `before` for `hold` s (label BEFORE), then a bar sweeps from the left revealing `after`
    (label AFTER). settle=None finishes the wipe; settle=x stops the bar at x for a split screen.
    before/after: frame sources with .frame(t, dur); line them up so the subject sits in the same place in both."""
    L_before = pill(labels[0], 'black', 46, (255, 255, 255), (20, 24, 22, 215), padx=32, pady=14, shadow=0)
    L_after = pill(labels[1], 'black', 46, b.accent_text, b.accent, padx=32, pady=14, shadow=0)
    def after_width(tw):                              # pixels of `after` revealed from the left edge
        target = W if settle is None else settle
        return target * eo(clamp01(tw / sweep))
    def scene(t, dur):
        bf = before.frame(t, dur); tw = t - hold
        if tw < 0:
            c = bf.convert('RGBA')
            blit(c, L_before, W // 2, y_label, lerp(0.85, 1, eback(clamp01((t - 0.15) / 0.3))), clamp01((t - 0.15) / 0.2))
        else:
            xw = after_width(tw); c = split_frame(bf, after.frame(tw, dur - hold), xw, b, y_handle=y_handle)
            a_b = clamp01((W - xw - 260) / 200); a_a = clamp01((xw - 300) / 200) * (1 - clamp01((t - (dur - 0.25)) / 0.25))
            if a_b > 0: blit(c, L_before, (xw + W) / 2, y_label, alpha=a_b)
            if a_a > 0: blit(c, L_after, xw / 2, y_label, alpha=a_a)
        return c.convert('RGB')
    return Func(scene)


# ------------------------------------------------------------------ end cards
def _bookmark(b, size=150):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im); w = size * 0.52; x0 = (size - w) / 2
    d.polygon([(x0, size * 0.08), (x0 + w, size * 0.08), (x0 + w, size * 0.92), (x0 + w / 2, size * 0.70), (x0, size * 0.92)], fill=b.accent + (255,))
    return shadowed(im, radius=16, offset=(0, 8), opacity=0.4)

def logo_card(logo, w=860, pad=60, min_h=230, line=None, line_size=50, line_color=None, accent=None):
    """White rounded card holding a logo (fitted to width) and an optional product line under it. Check the logo file
    BY EYE first: media libraries are full of template logos with misleading names."""
    lg = (logo if isinstance(logo, Image.Image) else Image.open(P(logo))).convert('RGBA')
    lw = min(lg.width, w - 100); lg = lg.resize((lw, round(lw * lg.height / lg.width)), Image.LANCZOS)
    extra = (line_size + 46) if line else 0
    ch = max(min_h, lg.height + pad + extra + (40 if accent else 0)); card = rrect(w, ch, 46, (255, 255, 255, 252))
    y = (ch - lg.height - extra) // 2; card.alpha_composite(lg, ((w - lg.width) // 2, y))
    if line:
        t = text_img(line, 'bold', line_size, line_color or (84, 95, 101)); card.alpha_composite(t, ((w - t.width) // 2, y + lg.height + 30))
    if accent: ImageDraw.Draw(card).rounded_rectangle((w / 2 - 60, ch - 44, w / 2 + 60, ch - 36), radius=4, fill=accent + (255,))
    return shadowed(card, radius=30, offset=(0, 18), opacity=0.45)

def end_card_layer(card, t_pop=0.2, y=900):
    """Layer: pops a logo_card in at t_pop (local time). Time it on a music hit."""
    def f(c, tl, dur, t):
        a = clamp01((tl - t_pop) / 0.2); s = lerp(0.8, 1.0, eback(clamp01((tl - t_pop) / 0.4)))
        blit(c, card, W // 2, y, scale=s, alpha=a)
    return f

def blur_in(src, dur=0.6, delay=0.0, radius=18, dark=0.35, tint=(10, 20, 15)):
    """Source that starts sharp and blurs/darkens over `dur` s (background for an end card over live footage)."""
    from PIL import ImageFilter
    def f(t, d):
        im = src.frame(t, d); k = clamp01((t - delay) / dur)
        if k > 0: im = Image.blend(im.filter(ImageFilter.GaussianBlur(radius * k)), Image.new('RGB', im.size, tint), dark * k)
        return im
    return Func(f)

def outro_save(b, background, logo, title='Save this reel', sub='and send it to someone who needs it', cta='', note=()):
    """Closing scene: logo on a white card + bookmark + title + CTA pill + legal note (tuple of lines)."""
    bg = blurred(background, radius=30, dark=0.80, tint=b.dark_deep)
    card = logo_card(logo, w=860, pad=60); book = _bookmark(b)
    def scene(t, dur):
        c = bg.copy().convert('RGBA'); q = clamp01(t / 0.45)
        blit(c, card, W / 2, lerp(360, 400, eo(q)), lerp(0.9, 1, eback(q)), clamp01(q * 2))
        qb = clamp01((t - 0.25) / 0.45); pulse = 1 + 0.035 * math.sin(max(0, t - 0.7) * 4.2)
        blit(c, book, W / 2, 690, lerp(0.4, pulse, eback(qb)), clamp01(qb * 2))
        blit(c, text_img(title, 'black', 92, b.white, shadow=10), W / 2, 850, lerp(0.9, 1, eo(clamp01((t - 0.35) / 0.4))), clamp01((t - 0.35) / 0.3))
        blit(c, text_img(sub, 'semi', 46, b.muted, shadow=6), W / 2, 942, 1, clamp01((t - 0.6) / 0.35))
        if cta:
            qp = clamp01((t - 0.9) / 0.4)
            blit(c, fit_pill(cta, 900, 54, fg=b.accent_text, bg=b.accent, padx=40, pady=18, shadow=22), W / 2, 1090, lerp(0.8, 1, eback(qp)), clamp01(qp * 2))
        a = clamp01((t - 1.3) / 0.5)
        for i, ln in enumerate(note):
            blit(c, text_img(ln, 'semi', 30, b.muted), W / 2, 1218 + i * 40, 1, a * 0.85)
        return c.convert('RGB')
    return Func(scene)

def outro_comment(c, tl, b, word, sub, handle, y=1040, prompt='Comment'):
    """«Comment WORD» block (comment-to-get funnels). Draw inside a scene with a dark background."""
    blit(c, text_img(prompt, 'black', 96, b.white, shadow=10), W / 2, y - 148, lerp(0.9, 1, eo(tl / 0.5)), clamp01(tl / 0.4))
    pw = pill(word, 'black', 132, b.accent_text, b.accent, padx=44, pady=18, r=26, tracking=4, shadow=26)
    pulse = 1 + 0.012 * math.sin(max(0, tl - 0.5) * 3.4)
    blit(c, pw, W / 2, y, lerp(0.7, pulse, eback(clamp01((tl - 0.18) / 0.5))), clamp01((tl - 0.15) / 0.3))
    blit(c, text_img(sub, 'semi', 50, b.muted, shadow=6), W / 2, y + 152, 1, clamp01((tl - 0.5) / 0.4))
    blit(c, pill(handle, 'semi', 36, b.muted, (255, 255, 255, 26), padx=24, pady=10, dot=b.accent, shadow=0), W / 2, y + 380, 1, clamp01((tl - 0.8) / 0.5))

def outro_fan(b, background, photos, word, sub, handle, size=(300, 420), y_photos=480, y_cta=1130, extra=None):
    """Closing scene: blurred background + fan of photo cards + «Comment WORD». photos: list of (path, cx, cy[, crop])."""
    bg = blurred(background, radius=34, dark=0.72, tint=b.dark_deep)
    cards = [photo_card(f[0], size[0], size[1], crop=(f[3] if len(f) > 3 else None), radius=16, border=12, cx=f[1], cy=f[2]) for f in photos]
    n = len(cards); xs = [W / 2 + (i - (n - 1) / 2) * (size[0] - 10) for i in range(n)]; rots = [lerp(7, -7, i / max(1, n - 1)) for i in range(n)]
    def scene(t, dur):
        c = bg.copy().convert('RGBA')
        for i, (im, x, r) in enumerate(zip(cards, xs, rots)):
            q = clamp01((t - i * 0.14) / 0.35)
            if q > 0: blit(c, im, x, y_photos + abs(i - (n - 1) / 2) * 18, lerp(0.85, 1, eback(q)), q, rot=r)
        if extra: extra(c, t)
        outro_comment(c, t, b, word, sub, handle, y=y_cta)
        return c.convert('RGB')
    return Func(scene)
