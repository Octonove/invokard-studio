"""animation.py — the bridge between the reel engine (reelkit, montage) and the animation engine (animation/, drawing).

The montage engine cuts photos, clips, voice, captions and music. The animation engine draws with code: kinetic type,
shapes, charts, 3D, physics. A reel can use both:

    import animation as an
    # 1 · drawn OVER the montage: render with a transparent background to a folder of PNG frames, then a layer
    an.render('anim/src/index.jsx', 'Headline', 'work/anim/headline', transparent=True)
    reel.ov(0.5, 4.0, an.layer('work/anim/headline'))
    # 2 · drawn AS a shot: render an opaque animation into vid/, extract its frames and cut to it like any clip
    reel.shot(8.0, 12.0, an.clip('anim/src/index.jsx', 'EndCard', 'endcard'))

Props for the composition go in props={...}. The animation project is a folder with src/index.jsx (registerRoot + one
<Composition> per animation), an optional public/ for its files, and a package.json (see references/animation.md).
Needs Node.js 18+ and, once, `npm install` inside skills/invokard-studio/animation.
"""
import json
import os
import shutil
import subprocess
import sys
from functools import lru_cache

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(os.path.dirname(HERE), 'animation')
CLI = os.path.join(ENGINE, 'cli.mjs')


def ready():
    """Raise with the exact fix when Node.js or the engine's packages are missing."""
    node = shutil.which('node')
    if not node:
        raise RuntimeError('The animation engine needs Node.js 18 or newer: install the LTS from https://nodejs.org and reopen the terminal.')
    if not os.path.isdir(os.path.join(ENGINE, 'node_modules')):
        raise RuntimeError(f'The animation engine is not installed yet. Run once:\n    cd "{ENGINE}"\n    npm install')
    return node


def _run(args):
    node = ready()
    r = subprocess.run([node, CLI, *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise RuntimeError(f'animation engine: {(r.stderr or r.stdout).strip()}')
    return r.stdout


def _options(props, transparent, browser, extra=()):
    out = list(extra)
    if props: out += ['--props', json.dumps(props, ensure_ascii=False)]
    if transparent: out.append('--transparent')
    if browser: out += ['--browser', browser]
    return out


def render(entry, composition, out, props=None, transparent=False, frames=None, concurrency=None, browser=None):
    """Render a composition. out ending in .mp4 = H.264; .mov = ProRes 4444 with alpha; no extension = a folder with one
    PNG per frame (000000.png, 000001.png...), the format layer() reads. Returns out."""
    extra = []
    if frames is not None: extra += ['--frames', str(frames)]
    if concurrency: extra += ['--concurrency', str(concurrency)]
    if not os.path.splitext(out)[1] and os.path.isdir(out):
        shutil.rmtree(out)                                   # a folder of frames is replaced, never mixed with an old one
    _run(['render', entry, composition, out, *_options(props, transparent, browser, extra)])
    return out


def still(entry, composition, out, frame=0, props=None, transparent=False, browser=None):
    """One frame as PNG (or JPEG when out ends in .jpg): a cover, a slide, a frame to check a design."""
    _run(['still', entry, composition, out, *_options(props, transparent, browser, ['--frame', str(frame)])])
    return out


def compositions(entry):
    """[(id, width, height, fps, frames)] declared in an entry file."""
    rows = []
    for line in _run(['list', entry]).splitlines():
        parts = line.split()
        if len(parts) >= 5:
            w, h = parts[1].split('x')
            rows.append((parts[0], int(w), int(h), int(parts[2]), int(parts[4])))
    return rows


@lru_cache(maxsize=96)
def _frame(path):
    from PIL import Image
    return Image.open(path).convert('RGBA')


def layer(folder, x=0, y=0, scale=1.0, fps=None, hold=True, loop=False, alpha=1.0):
    """A reel.ov(...) layer that draws a folder of transparent PNG frames over the montage, frame by frame.
    x, y = top-left corner on the canvas; fps = the animation's frame rate (default: the reel's); after its last frame
    it holds it (hold=True), disappears (hold=False) or starts again (loop=True)."""
    import reelkit as rk
    files = sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith('.png'))
    if not files: raise FileNotFoundError(f'No PNG frames in {folder}: render the animation with transparent=True first')
    rate = fps or rk.FPS

    def draw(c, tl, dur, t):
        i = int(tl * rate + 1e-6)
        if i >= len(files):
            if loop: i %= len(files)
            elif hold: i = len(files) - 1
            else: return
        rk.blit(c, _frame(files[i]), x, y, scale=scale, alpha=alpha, anchor='tl')
    return draw


def clip(entry, composition, name, props=None, browser=None, **clip_options):
    """Render an opaque animation to vid/<name>.mp4 of the current reel, extract its frames and return a reelkit Clip
    for reel.shot(...). clip_options go to Clip (speed, start, z, c, fx)."""
    import reelkit as rk
    import media
    os.makedirs(rk.P('vid'), exist_ok=True)
    render(entry, composition, rk.P('vid', f'{name}.mp4'), props=props, browser=browser)
    media.frames(rk.P(), name)
    return rk.Clip(name, **clip_options)


if __name__ == '__main__':
    print(__doc__)
    try:
        ready(); print('Node.js and the animation engine are ready.')
    except RuntimeError as e:
        print(e); sys.exit(1)
