# new_reel — creates the work folder of a reel with its structure and a reel.py ready to edit.
# Usage: python new_reel.py <folder> [--brand studio|lime|forest|mono] [--title "Text"] [--format 9:16|16:9|1:1]
import os, sys
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

FOLDERS = ('img', 'vid', 'frames', 'vo', 'music', 'sfx', 'ref', 'out', 'review')
BRANDS = ('studio', 'lime', 'forest', 'mono')
USAGE = 'usage: new_reel.py <folder> [--brand studio|lime|forest|mono] [--title "Text"] [--format 9:16|16:9|1:1]'

def main():
    a = sys.argv[1:]
    if not a or a[0].startswith('--'): print(USAGE); sys.exit(1)
    def opt(name, default):
        if name not in a: return default
        i = a.index(name)
        if i + 1 >= len(a): print(f'{name} needs a value\n{USAGE}'); sys.exit(1)
        return a[i + 1]
    here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
    import reelkit as rk                               # the format names live in the engine
    dest = os.path.abspath(a[0]); brand = opt('--brand', 'studio'); title = opt('--title', os.path.basename(dest))
    if brand not in BRANDS: print(f'unknown brand "{brand}": use {", ".join(BRANDS)} (or build one in reel.py)'); sys.exit(1)
    try: fmt = rk.format_name(opt('--format', rk.env_format()))
    except ValueError as e: print(e); sys.exit(1)
    for d in FOLDERS: os.makedirs(os.path.join(dest, d), exist_ok=True)
    out = os.path.join(dest, 'reel.py')
    if os.path.exists(out): print('exists', out, '- not overwritten'); return
    s = open(os.path.join(here, 'template_reel.py'), encoding='utf-8').read()
    s = s.replace("r'__STUDIO__'", repr(here)).replace('__BRAND__', brand).replace('__TITLE__', title).replace('__FORMAT__', fmt)
    open(out, 'w', encoding='utf-8').write(s); print('created', out, '· brand:', brand, '· format:', fmt)
    print('folders:', ', '.join(FOLDERS))

if __name__ == '__main__': main()
