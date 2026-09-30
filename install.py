#!/usr/bin/env python3
# install.py — put the Invokard Studio skill where your agent looks for skills, and check the machine.
#
#   python install.py                    # detect installed agents, install the skill for each (user-level)
#   python install.py --project .        # into this project's skill folders (.agents/skills + .claude/skills)
#   python install.py --agents claude,codex,antigravity,gemini,cursor,windsurf
#   python install.py --link             # symlink/junction instead of copying (edits in the repo apply at once)
#   python install.py doctor             # ffmpeg, python packages, fonts, keys (names only), agents found
#   python install.py uninstall          # remove what this script installed (and nothing else)
#
# Every agent that follows the Agent Skills standard reads .agents/skills; Claude Code reads .claude/skills; each also
# has a user-level folder. The skill folder is self-contained: copying it is the whole install.
import os, sys, stat, shutil, subprocess, argparse, platform
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass

ROOT = os.path.dirname(os.path.abspath(__file__))
SKILL = 'invokard-studio'
SRC = os.path.join(ROOT, 'skills', SKILL)
HOME = os.path.expanduser('~')

# Where each agent reads user-level skills, and how we detect that the agent is installed.
AGENTS = {
    'claude':      {'user': os.path.join(HOME, '.claude', 'skills'),                'project': '.claude/skills',   'detect': [os.path.join(HOME, '.claude')]},
    'codex':       {'user': os.path.join(HOME, '.codex', 'skills'),                 'project': '.agents/skills',   'detect': [os.path.join(HOME, '.codex')]},
    'antigravity': {'user': os.path.join(HOME, '.gemini', 'config', 'skills'),      'project': '.agents/skills',   'detect': [os.path.join(HOME, '.gemini', 'antigravity'), os.path.join(HOME, '.gemini', 'config')]},
    'gemini':      {'user': os.path.join(HOME, '.gemini', 'skills'),                'project': '.agents/skills',   'detect': [os.path.join(HOME, '.gemini', 'settings.json'), os.path.join(HOME, '.gemini', 'GEMINI.md')]},
    'cursor':      {'user': os.path.join(HOME, '.cursor', 'skills'),                'project': '.cursor/skills',   'detect': [os.path.join(HOME, '.cursor')]},
    'windsurf':    {'user': os.path.join(HOME, '.codeium', 'windsurf', 'skills'),   'project': '.windsurf/skills', 'detect': [os.path.join(HOME, '.codeium', 'windsurf')]},
    'agents':      {'user': os.path.join(HOME, '.agents', 'skills'),                'project': '.agents/skills',   'detect': []},   # the shared standard folder
}
MARKER = '.installed-by-invokard-studio'          # written inside a COPIED skill folder
SIDECAR = '.' + SKILL + '.link'                    # written NEXT TO a linked skill folder (never inside: that is the repo)

def detected():
    return [a for a, d in AGENTS.items() if any(os.path.exists(p) for p in d['detect'])]

def is_link(path):
    """Symlink on any OS, or an NTFS junction (os.path.islink says False for those)."""
    if os.path.islink(path): return True
    if platform.system() == 'Windows':
        try: return bool(os.lstat(path).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
        except OSError: return False
    return False

def owned(target):
    """True only for a skill folder this script created: a copy carrying MARKER, or a link recorded by its sidecar."""
    if not os.path.lexists(target): return False
    if os.path.exists(os.path.join(target, MARKER)) and not is_link(target): return True
    return is_link(target) and os.path.exists(os.path.join(os.path.dirname(target), SIDECAR))

def remove(target):
    """Remove an owned skill folder. Links are unlinked, never followed."""
    if is_link(target):
        try: os.rmdir(target)                      # junction
        except OSError: os.unlink(target)          # symlink
        side = os.path.join(os.path.dirname(target), SIDECAR)
        if os.path.exists(side): os.remove(side)
    else:
        shutil.rmtree(target)

def place(dest, link):
    """Copy (or link) the skill folder to dest/<SKILL>. Refuses to touch a folder it did not create."""
    target = os.path.join(dest, SKILL)
    if os.path.lexists(target):
        if owned(target): remove(target)
        else: print(f'  skip {target}: exists and was not installed by this script (remove it yourself first)'); return None
    os.makedirs(dest, exist_ok=True)
    if link:
        try:
            if platform.system() == 'Windows': subprocess.run(['cmd', '/c', 'mklink', '/J', target, SRC], check=True, capture_output=True)
            else: os.symlink(SRC, target)
            open(os.path.join(dest, SIDECAR), 'w', encoding='utf-8').write(SRC + '\n')
            print(f'  link {target} -> {SRC}'); return target
        except Exception as e:
            print(f'  link failed ({e}); copying instead')
    shutil.copytree(SRC, target, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'NotoColorEmoji.ttf'))
    open(os.path.join(target, MARKER), 'w', encoding='utf-8').write('installed by install.py\n')
    print(f'  copy {target}'); return target

def targets(args, agents):
    if args.project:
        proj = os.path.abspath(args.project)
        return [os.path.join(proj, *rel.split('/')) for rel in sorted({AGENTS[a]['project'] for a in agents})]
    return [AGENTS[a]['user'] for a in agents]

def install(args):
    agents = args.agents.split(',') if args.agents else detected() or ['agents']
    bad = [a for a in agents if a not in AGENTS]
    if bad: print('unknown agent(s):', ', '.join(bad), '| known:', ', '.join(AGENTS)); return 2
    if 'agents' not in agents and any(a in ('codex', 'antigravity', 'gemini', 'cursor') for a in agents): agents.append('agents')
    for dest in targets(args, agents): place(dest, args.link)
    print('\nInstalled for:', ', '.join(agents))
    print('Invoke it as $invokard-studio (Codex), /invokard-studio (Antigravity, Gemini CLI) or just ask for a reel (Claude Code, Cursor).')
    print('Next: python install.py doctor')

def uninstall(args):
    agents = args.agents.split(',') if args.agents else list(AGENTS)
    n = 0
    for dest in targets(args, agents):
        t = os.path.join(dest, SKILL)
        if not os.path.lexists(t): continue
        if owned(t): remove(t); print('  removed', t); n += 1
        else: print('  kept   ', t, '(not installed by this script)')
    print(f'{n} installation(s) removed')

def doctor(args):
    ok = True
    def row(label, value, good=True):
        nonlocal ok
        mark = '-- ' if good is None else ('ok ' if good else '!! ')
        ok = ok and (good is not False); print(f'  {mark}{label:22s} {value}')
    print('Invokard Studio doctor\n')
    v = sys.version_info; row('python', f'{v.major}.{v.minor}.{v.micro}', v >= (3, 10))
    for tool in ('ffmpeg', 'ffprobe'):
        p = shutil.which(tool)
        if p:
            out = subprocess.run([tool, '-version'], capture_output=True, text=True).stdout.splitlines()[0]
            row(tool, out.split(' Copyright')[0])
        else: row(tool, 'NOT FOUND - see skills/invokard-studio/references/troubleshooting.md', False)
    for mod, pkg in (('PIL', 'Pillow'), ('numpy', 'numpy'), ('requests', 'requests')):
        try: m = __import__(mod); row(pkg, getattr(m, '__version__', 'present'))
        except ImportError: row(pkg, 'missing - pip install -r requirements.txt', False)
    try: import faster_whisper; row('faster-whisper', faster_whisper.__version__ + ' (optional, align.py)')
    except ImportError: row('faster-whisper', 'not installed (optional: pip install -r requirements-align.txt)', None)
    sys.path.insert(0, os.path.join(SRC, 'scripts'))
    try:
        import fonts
        for k, p in fonts.status().items():
            missing = 'MISSING' in (p or '')
            row(f'font {k}', os.path.basename(p) if p and not missing else p, None if (k == 'emoji' and missing) else not missing)
    except Exception as e: row('fonts', str(e), False)
    from providers import env
    for key in ('MAGNIFIC_API_KEY', 'ELEVENLABS_API_KEY'):
        row(key, env.masked(key) + ('' if env.has(key) else ' (optional; see .env.example)'), True if env.has(key) else None)
    found = detected()
    row('agents detected', ', '.join(found) or 'none (skills go to ~/.agents/skills)', None)
    for a in found:
        t = os.path.join(AGENTS[a]['user'], SKILL)
        here = os.path.exists(os.path.join(t, 'SKILL.md'))
        row(f'skill for {a}', ('installed (link)' if is_link(t) else 'installed') if here else 'not installed (python install.py)', True if here else None)
    print('\n' + ('All good.' if ok else 'Fix the lines marked !! and run again.'))
    return 0 if ok else 1

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Install the Invokard Studio skill into your agents.')
    ap.add_argument('command', nargs='?', default='install', choices=['install', 'doctor', 'uninstall'])
    ap.add_argument('--agents', help='comma list: claude,codex,antigravity,gemini,cursor,windsurf,agents (default: detected)')
    ap.add_argument('--project', help='install into this project folder instead of the user-level folders')
    ap.add_argument('--link', action='store_true', help='symlink/junction the repo skill instead of copying')
    a = ap.parse_args()
    sys.exit({'install': install, 'doctor': doctor, 'uninstall': uninstall}[a.command](a) or 0)
