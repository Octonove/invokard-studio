# new_reel — creates the work folder of a reel with its structure and a reel.py ready to edit.
# Usage: python new_reel.py <folder> [--brand studio|lime|forest|mono] [--title "Text"]
import os, sys
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

FOLDERS = ('img', 'vid', 'frames', 'vo', 'music', 'sfx', 'ref', 'out', 'review')

def main():
    a = sys.argv[1:]
    if not a or a[0].startswith('--'): print('usage: new_reel.py <folder> [--brand studio|lime|forest|mono] [--title "Text"]'); sys.exit(1)
    dest = os.path.abspath(a[0]); brand = a[a.index('--brand') + 1] if '--brand' in a else 'studio'
    title = a[a.index('--title') + 1] if '--title' in a else os.path.basename(dest)
    here = os.path.dirname(os.path.abspath(__file__))
    for d in FOLDERS: os.makedirs(os.path.join(dest, d), exist_ok=True)
    out = os.path.join(dest, 'reel.py')
    if os.path.exists(out): print('exists', out, '- not overwritten'); return
    s = open(os.path.join(here, 'template_reel.py'), encoding='utf-8').read()
    s = s.replace('__STUDIO__', here).replace('__BRAND__', brand).replace('__TITLE__', title)
    open(out, 'w', encoding='utf-8').write(s); print('created', out, '· brand:', brand)
    print('folders:', ', '.join(FOLDERS))

if __name__ == '__main__': main()
