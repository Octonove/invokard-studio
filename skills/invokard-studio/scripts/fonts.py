# fonts — resolves the typefaces the engine draws with. Bundled open-licensed fonts first, system fonts as fallback.
#
# Kinds:  black · extrabold · bold · semi · reg · display (Inter Display Black) · serif · serifi · emoji
# Override any kind with a path in the FONTS dict, or point INVOKARD_FONT_DIR at a folder holding files with the
# same names as assets/fonts/. Colour emoji needs a COLR/CBDT font: Noto Color Emoji (downloaded on demand by
# `python media.py fonts`) or the system one (Segoe UI Emoji on Windows, Apple Color Emoji on macOS).
import os, sys, functools
from PIL import ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(os.path.dirname(HERE), 'assets', 'fonts')
USER_DIR = os.environ.get('INVOKARD_FONT_DIR')

FILES = {
    'black': 'Inter-Black.ttf', 'extrabold': 'Inter-ExtraBold.ttf', 'bold': 'Inter-Bold.ttf',
    'semi': 'Inter-SemiBold.ttf', 'reg': 'Inter-Regular.ttf', 'display': 'InterDisplay-Black.ttf',
    'serif': 'PlayfairDisplay.ttf', 'serifi': 'PlayfairDisplay.ttf', 'emoji': 'NotoColorEmoji.ttf',
}
# Variable fonts: (axis weight) applied after loading. Playfair Display ships as one variable file.
VARIATIONS = {'serif': [800], 'serifi': [600]}

SYSTEM = {
    'win32': {'black': 'C:/Windows/Fonts/seguibl.ttf', 'extrabold': 'C:/Windows/Fonts/seguibl.ttf', 'bold': 'C:/Windows/Fonts/segoeuib.ttf',
              'semi': 'C:/Windows/Fonts/seguisb.ttf', 'reg': 'C:/Windows/Fonts/segoeui.ttf', 'display': 'C:/Windows/Fonts/seguibl.ttf',
              'serif': 'C:/Windows/Fonts/georgiab.ttf', 'serifi': 'C:/Windows/Fonts/georgiaz.ttf', 'emoji': 'C:/Windows/Fonts/seguiemj.ttf'},
    'darwin': {'black': '/System/Library/Fonts/Supplemental/Arial Black.ttf', 'extrabold': '/System/Library/Fonts/Supplemental/Arial Black.ttf',
               'bold': '/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'semi': '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
               'reg': '/System/Library/Fonts/Supplemental/Arial.ttf', 'display': '/System/Library/Fonts/Supplemental/Arial Black.ttf',
               'serif': '/System/Library/Fonts/Supplemental/Georgia Bold.ttf', 'serifi': '/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf',
               'emoji': '/System/Library/Fonts/Apple Color Emoji.ttc'},
    'linux': {'black': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'extrabold': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              'bold': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'semi': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              'reg': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'display': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'serifi': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf',
              'emoji': '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'},
}

FONTS = {}   # kind -> resolved path (filled lazily; assign directly to force a file)

def path(kind):
    """Resolved file for a font kind, or None when nothing is available (only emoji may legitimately be missing)."""
    if kind in FONTS and FONTS[kind]: return FONTS[kind]
    name = FILES[kind]
    for d in ([USER_DIR] if USER_DIR else []) + [BUNDLED]:
        p = os.path.join(d, name)
        if os.path.exists(p): FONTS[kind] = p; return p
    plat = 'win32' if sys.platform.startswith('win') else 'darwin' if sys.platform == 'darwin' else 'linux'
    p = SYSTEM[plat].get(kind)
    if p and os.path.exists(p): FONTS[kind] = p; return p
    if kind == 'emoji': return None
    raise FileNotFoundError(f'No font for kind "{kind}". Expected {name} in {BUNDLED} (run: python media.py fonts) or set INVOKARD_FONT_DIR.')

@functools.lru_cache(None)
def font(kind, size):
    p = path(kind)
    if p is None: raise FileNotFoundError('No colour emoji font found. Run `python media.py fonts` to download Noto Color Emoji.')
    f = ImageFont.truetype(p, size)
    if kind in VARIATIONS and p.endswith(FILES[kind]) and os.path.basename(p) == FILES[kind]:
        try: f.set_variation_by_axes(VARIATIONS[kind])
        except Exception: pass   # static font or FreeType without variation support: use as is
    return f

def status():
    """Which file each kind resolves to (for `doctor`)."""
    out = {}
    for k in FILES:
        try: out[k] = path(k) or 'missing (optional)'
        except FileNotFoundError: out[k] = 'MISSING'
    return out
