"""Builds Invokard Studio Local, the plugin for Anthropic's directory, from this repository.

The engines are copied from skills/invokard-studio (so both editions stay identical where they overlap); every part
that uses online media services or the network is taken out with exact replacements, and the build stops if one of
them no longer matches. The hand-written files (SKILL.md, the production guide, README, manifests) live next to this
script.

    python local-plugin/build.py <output folder>            # writes the plugin there (the invokard-studio-local repo)
    python local-plugin/build.py <output folder> --check    # fails if the folder differs from a fresh build
"""
import filecmp
import json
import os
import re
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SKILL = os.path.join(REPO, 'skills', 'invokard-studio')
NAME = 'invokard-studio-local'

# Words that must not appear anywhere in the local plugin (case-insensitive).
FORBIDDEN = ['magnific', 'elevenlabs', 'referral.', 'affiliate', 'lyria', 'faster-whisper', 'faster_whisper',
             'fonts.googleapis', 'fonts.gstatic', 'raw.githubusercontent', 'curl ', "'curl'", 'install chromium',
             'api_key=', '.env.example', 'kling', 'seedance', 'veo3', 'nano banana', 'mcp connector']


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)


def patch(text, pairs, where):
    for old, new in pairs:
        n = text.count(old)
        if n != 1:
            raise SystemExit(f'{where}: expected one match, found {n}: {old[:70]!r}')
        text = text.replace(old, new)
    return text


def cut(text, start, end, where, keep_end=True):
    """Removes from `start` (included) to `end` (kept when keep_end), both found exactly once."""
    i, j = text.find(start), text.find(end)
    if text.count(start) != 1 or text.count(end) != 1 or j < i:
        raise SystemExit(f'{where}: cannot cut from {start[:50]!r} to {end[:50]!r}')
    return text[:i] + (text[j:] if keep_end else text[j + len(end):])


def build(out):
    sk = os.path.join(out, 'skills', NAME)

    # ------------------------------------------------------------ hand-written files
    write(os.path.join(out, 'README.md'), read(os.path.join(HERE, 'README.md')))
    write(os.path.join(out, 'SECURITY.md'), read(os.path.join(HERE, 'SECURITY.md')))
    copy(os.path.join(REPO, 'LICENSE'), os.path.join(out, 'LICENSE'))
    write(os.path.join(out, '.claude-plugin', 'plugin.json'), read(os.path.join(HERE, 'plugin.json')))
    write(os.path.join(out, '.claude-plugin', 'marketplace.json'), read(os.path.join(HERE, 'marketplace.json')))
    # The directory takes the listing icon from .claude-plugin/icon.png once, the first time the plugin is saved there.
    copy(os.path.join(HERE, 'icon.png'), os.path.join(out, '.claude-plugin', 'icon.png'))
    write(os.path.join(out, '.github', 'workflows', 'test.yml'), read(os.path.join(HERE, 'test.yml')))
    write(os.path.join(out, '.gitignore'),'node_modules/\n.invokard/\n__pycache__/\n*.pyc\nwork/\n**/frames/\n**/review/\n'
          '*.f.png\n.DS_Store\nThumbs.db\n')
    write(os.path.join(sk, 'SKILL.md'), read(os.path.join(HERE, 'SKILL.md')))
    write(os.path.join(sk, 'references', 'production.md'), read(os.path.join(HERE, 'production.md')))

    # ------------------------------------------------------------ montage engine (scripts), copied
    for f in ('pieces.py', 'new_reel.py', 'template_reel.py', 'animation.py'):
        copy(os.path.join(SKILL, 'scripts', f), os.path.join(sk, 'scripts', f))
    reelkit = read(os.path.join(SKILL, 'scripts', 'reelkit.py'))
    reelkit = re.sub(r'Captions from already-timed words, e\.g\. from `align\.py` \(faster-whisper\)',
                     'Captions from already-timed words (a subtitle file, for instance)', reelkit, count=1)
    if 'faster-whisper' in reelkit:
        raise SystemExit('reelkit.py: the faster-whisper mention moved; update the build')
    write(os.path.join(sk, 'scripts', 'reelkit.py'), reelkit)
    fonts = read(os.path.join(SKILL, 'scripts', 'fonts.py'))
    fonts = patch(fonts, [(
        '# same names as assets/fonts/. Colour emoji needs a COLR/CBDT font: Noto Color Emoji (downloaded on demand by\n'
        '# `python media.py fonts`) or the system one (Segoe UI Emoji on Windows, Apple Color Emoji on macOS).',
        '# same names as assets/fonts/. Colour emoji needs a COLR/CBDT font: the system one (Segoe UI Emoji on Windows,\n'
        '# Apple Color Emoji on macOS, Noto Color Emoji on Linux).')], 'fonts.py')
    write(os.path.join(sk, 'scripts', 'fonts.py'), fonts)

    media = read(os.path.join(SKILL, 'scripts', 'media.py'))
    media = cut(media, 'def download(dest, url):', 'def frames(work, *names):', 'media.py download')
    media = cut(media, "EMOJI_URL = '", 'def doctor():', 'media.py fonts')
    media = patch(media, [
        ('"""Check this machine from the skill folder itself (an installed copy has no install.py): python, ffmpeg, packages, fonts, keys (names only)."""',
         '"""Check this machine from the skill folder itself: python, ffmpeg, packages, fonts and the reel format."""'),
        ("for mod, pkg in (('PIL', 'Pillow'), ('numpy', 'numpy'), ('requests', 'requests')):",
         "for mod, pkg in (('PIL', 'Pillow'), ('numpy', 'numpy')):"),
        ("row(pkg, 'missing: python -m pip install Pillow numpy requests', False)",
         "row(pkg, 'missing: python -m pip install Pillow numpy', False)"),
        ("    sys.path.insert(0, os.path.join(HERE, 'providers')); from env import has\n"
         "    for key in ('MAGNIFIC_API_KEY', 'ELEVENLABS_API_KEY'):\n"
         "        row(key, 'set' if has(key) else 'missing (optional; see .env.example)', True if has(key) else None)\n", ''),
        ("COMMANDS = {'download': download, 'frames': frames,", "COMMANDS = {'frames': frames,"),
        ("'gif': gif, 'fonts': fonts_cmd,\n", "'gif': gif,\n"),
        ("    missing = [t for t in (('curl',) if cmd in ('download', 'fonts') else () if cmd in ('sheet-img', 'sheet-motion', 'doctor') else ('ffmpeg', 'ffprobe'))",
         "    missing = [t for t in (() if cmd in ('sheet-img', 'sheet-motion', 'doctor') else ('ffmpeg', 'ffprobe'))"),
        ("""        print(f'{" and ".join(missing)} not found on PATH. Install {"curl" if missing == ["curl"] else "ffmpeg (it includes ffprobe)"}, '
              'reopen the terminal and check with `python install.py doctor` (references/troubleshooting.md).'); return 1""",
         """        print(f'{" and ".join(missing)} not found on PATH. Install ffmpeg (it includes ffprobe), '
              'reopen the terminal and check with `python media.py doctor` (references/troubleshooting.md).'); return 1"""),
    ], 'media.py')
    write(os.path.join(sk, 'scripts', 'media.py'), media)

    for sub in ('fonts', 'sfx'):
        for f in sorted(os.listdir(os.path.join(SKILL, 'assets', sub))):
            if f.startswith('NotoColorEmoji') or f == 'LICENSE-NotoColorEmoji.txt':
                continue
            copy(os.path.join(SKILL, 'assets', sub, f), os.path.join(sk, 'assets', sub, f))

    # ------------------------------------------------------------ references, copied with the online parts taken out
    ref = lambda f: read(os.path.join(SKILL, 'references', f))
    animation_md = patch(ref('animation.md'), [
        ('No browser is downloaded when Chrome or Edge is installed (Edge always is on Windows). On a machine with neither,\n'
         '`node cli.mjs browser` downloads a headless Chromium once (~100 MB). ffmpeg on PATH is used first; otherwise the copy\n'
         'installed by npm.',
         'It draws in the Chrome or Edge installed on the machine (Edge always is on Windows), without opening a window; this\n'
         'build downloads no browser, so install one of the two if neither is there. ffmpeg on PATH is used first; otherwise\n'
         'the copy installed by npm.'),
        ('Any other Google Fonts family is downloaded on its first render and kept in `.invokard/fonts/`, so later\n'
         'renders work offline (ship that folder with a template to make it work offline from the first render).\n'
         '`INVOKARD_OFFLINE=1` turns every download off.',
         'This local build never downloads a font: for another typeface, put its file in the project\'s `public/` and declare\n'
         'it with `@font-face`.'),
        ("any Google family, the module name without spaces (`PlayfairDisplay`)",
         "one of the fifteen bundled families, the module name without spaces (`PlayfairDisplay`)"),
        ('| `No browser could be started` | Install Chrome or Edge, or `node cli.mjs browser`; `INVOKARD_BROWSER=<path>` to force one |',
         '| `No browser could be started` | Install Chrome or Edge; `INVOKARD_BROWSER=<path>` to force one |'),
        ('| `Could not load the font …` | not a bundled family, and it could not be downloaded: check the name and the connection (after the first download it is cached in `.invokard/fonts`) |',
         '| `Could not load the font …` | it is not one of the fifteen bundled families: use one of them, or load the user\'s font file from `public/` with `@font-face` |'),
    ], 'animation.md')
    write(os.path.join(sk, 'references', 'animation.md'), animation_md)

    api_md = patch(ref('api.md'), [
        ('| `download` | dest url | curl download (skips if present) |\n', ''),
        ('| `fonts` | | Download the emoji font, report all fonts |\n', ''),
        ('| `doctor` | | Python, ffmpeg, packages, fonts, format, keys (names only); works from an installed copy of the skill |',
         '| `doctor` | | Python, ffmpeg, packages, fonts and format |'),
    ], 'api.md')
    api_md = re.sub(r'\(`align\.py`, `elevenlabs\.tts_time[^)]*\)', '`[(text, start, end)]`, times in seconds', api_md)
    api_md = api_md[:api_md.index('## align.py')].rstrip() + '\n'
    write(os.path.join(sk, 'references', 'api.md'), api_md)

    footage_md = patch(ref('footage.md'), [
        ('Lyria (`google-lyria-3-pro`) ignores the requested duration and returns 40-60 s: that is what makes the splice possible.\n\n', ''),
    ], 'footage.md')
    write(os.path.join(sk, 'references', 'footage.md'), footage_md)

    trouble = ref('troubleshooting.md')
    trouble = patch(trouble, [
        ('  then `python -m pip install -r requirements.txt`.\n'
         '- `python -m pytest` says "No module named pytest": `python -m pip install -r requirements-dev.txt`.',
         '  then `python -m pip install Pillow numpy`.'),
        ('the new PATH is inherited. `install.py doctor` (repository) or `scripts/media.py doctor` (any copy of the skill)\n  shows the version it finds.',
         'the new PATH is inherited. `scripts/media.py doctor` shows the version it finds.'),
        ('The colour\n  emoji font (Noto Color Emoji, 25 MB) is optional: `python scripts/media.py fonts` downloads it. Without it the\n'
         '  system emoji font is used when present (Segoe UI Emoji, Apple Color Emoji).',
         'Colour emoji\n  use the system emoji font (Segoe UI Emoji on Windows, Apple Color Emoji on macOS; on Linux, install\n'
         '  fonts-noto-color-emoji).'),
    ], 'troubleshooting.md')
    trouble = cut(trouble, '## TLS', '## Formats (16:9, 1:1)', 'troubleshooting.md TLS')
    trouble = trouble[:trouble.index('## Provider errors')].rstrip() + '\n'
    write(os.path.join(sk, 'references', 'troubleshooting.md'), trouble)

    # ------------------------------------------------------------ animation engine, copied; network code taken out
    an_src = os.path.join(SKILL, 'animation')
    an_out = os.path.join(sk, 'animation')
    for f in ('cli.mjs', 'package.json', 'package-lock.json'):
        copy(os.path.join(an_src, f), os.path.join(an_out, f))
    for f in sorted(os.listdir(os.path.join(an_src, 'src'))):
        if f in ('server.mjs', 'tools.mjs'):
            continue
        copy(os.path.join(an_src, 'src', f), os.path.join(an_out, 'src', f))
    server = read(os.path.join(an_src, 'src', 'server.mjs'))
    server = cut(server, '// ---------------------------------------------------------------- fonts',
                 '// ---------------------------------------------------------------- video frames', 'server.mjs fonts')
    server = server.replace('// ---------------------------------------------------------------- video frames', (
        '// ---------------------------------------------------------------- fonts (local build: bundled families only)\n'
        'async function fontCss(res, search) {\n'
        "  const family = (new URLSearchParams(search).get('family') || '').split(':')[0];\n"
        "  if (LIBRARY[family]) return sendFile(res, join(LIB, LIBRARY[family], 'font.css'));\n"
        '  return send(res, 404, `The font "${family}" is not bundled with this local build. Bundled: ${bundledFonts().join(\', \')}. ` +\n'
        "    'Or put your own font file in public/ and declare it with @font-face.');\n"
        '}\n\n'
        '// ---------------------------------------------------------------- video frames'), 1)
    server = patch(server, [
        ("const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';\n", ''),
        ('      if (path === \'/__fonts/css2\') return await fontCss(res, url.search, fontsDir);',
         '      if (path === \'/__fonts/css2\') return await fontCss(res, url.search);'),
        ("        const source = local || (/^https?:\\/\\//.test(src) ? src : null);", '        const source = local;'),
    ], 'server.mjs')
    write(os.path.join(an_out, 'src', 'server.mjs'), server)
    tools = read(os.path.join(an_src, 'src', 'tools.mjs'))
    start = tools.index('// Downloads the headless Chromium build')
    end = tools.index('\n}\n', tools.index('export function installBrowser()')) + 3      # the function's own closing brace
    tools = tools[:start] + ('// This local build downloads no browser: it uses the Chrome or Edge installed on the machine.\n'
                             'export function installBrowser() {\n'
                             "  console.error('This local build downloads nothing: install Google Chrome or Microsoft Edge, and the engine uses it.');\n"
                             '  return 1;\n}\n') + tools[end:]
    write(os.path.join(an_out, 'src', 'tools.mjs'), tools)
    write(os.path.join(an_out, 'LOCAL_ONLY'), 'This copy of the animation engine never uses the network: fonts come only '
          'from fonts/ and no browser or remote video is downloaded.\n')
    lib = os.path.join(an_src, 'fonts')
    for root, _, files in os.walk(lib):
        for f in files:
            if f == 'README.md':
                continue
            src = os.path.join(root, f)
            copy(src, os.path.join(an_out, 'fonts', os.path.relpath(src, lib)))
    index = json.loads(read(os.path.join(lib, 'index.json')))
    write(os.path.join(an_out, 'fonts', 'README.md'), '# Bundled fonts\n\nOpen-licensed families (SIL Open Font Licence 1.1; '
          'each folder has its `OFL.txt`), latin and latin-ext, every weight the family ships:\n\n' +
          '\n'.join(f'- {f}' for f in index) + '\n')

    # ------------------------------------------------------------ examples (they draw and synthesise their own media)
    for ex, files in (('first-reel', ('reel.py', 'README.md', 'preview.jpg')),
                      ('animated-reel', ('reel.py', 'README.md', 'preview.gif', 'anim/package.json', 'anim/src/index.jsx'))):
        for f in files:
            src = os.path.join(REPO, 'examples', ex, f)
            dst = os.path.join(out, 'examples', ex, f)
            if f.endswith(('.py', '.md', '.json', '.jsx')):
                t = read(src).replace('skills/invokard-studio/', f'skills/{NAME}/') \
                             .replace("'skills', 'invokard-studio', 'scripts'", f"'skills', '{NAME}', 'scripts'")
                write(dst, t)
            else:
                copy(src, dst)


def audit(out):
    problems, count = [], 0
    for root, dirs, files in os.walk(out):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.invokard', 'work')]
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, out)
            count += 1
            size = os.path.getsize(p)
            binary = f.lower().endswith(('.png', '.jpg', '.gif', '.webp', '.woff2', '.ttf', '.mp3'))
            if not binary and size > 256 * 1024:
                problems.append(f'{rel}: {size} bytes (over 256 KiB)')
            if size > 5 * 1024 * 1024:
                problems.append(f'{rel}: over 5 MiB')
            if f in ('.DS_Store', 'Thumbs.db', 'desktop.ini'):
                problems.append(f'{rel}: system file')
            if not binary:
                low = read(p).lower()
                for w in FORBIDDEN:
                    if w in low:
                        problems.append(f'{rel}: contains "{w}"')
    if count > 512:
        problems.append(f'{count} files (over 512)')
    desc = re.search(r'description: >-\n((?:  .*\n)+)', read(os.path.join(out, 'skills', NAME, 'SKILL.md'))).group(1)
    if len(' '.join(l.strip() for l in desc.splitlines())) > 1024:
        problems.append('SKILL.md description over 1024 characters')
    return problems, count


def same_tree(a, b):
    cmp = filecmp.dircmp(a, b, ignore=['.git', 'node_modules', '.invokard', 'work', '__pycache__'])
    diff = cmp.left_only + cmp.right_only + cmp.diff_files + cmp.funny_files
    for sub in cmp.common_dirs:
        diff += [os.path.join(sub, d) for d in same_tree(os.path.join(a, sub), os.path.join(b, sub))]
    return diff


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit(__doc__)
    target = os.path.abspath(args[0])
    if '--check' in sys.argv:
        tmp = tempfile.mkdtemp()
        build(tmp)
        diff = same_tree(tmp, target)
        shutil.rmtree(tmp)
        if diff:
            raise SystemExit('The local plugin differs from a fresh build: ' + ', '.join(diff[:20]))
        print('local plugin is up to date')
    else:
        keep = {'.git'}
        if os.path.isdir(target):
            for f in os.listdir(target):
                if f not in keep and f not in ('node_modules',):
                    p = os.path.join(target, f)
                    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
        build(target)
        problems, count = audit(target)
        if problems:
            raise SystemExit('Audit failed:\n- ' + '\n- '.join(problems))
        print(f'built {target}: {count} files, audit clean')
