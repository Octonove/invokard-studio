# Installer and skill-format tests.
import os, re, sys, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, 'skills', 'invokard-studio')

def test_skill_frontmatter_follows_the_spec():
    text = open(os.path.join(SKILL, 'SKILL.md'), encoding='utf-8').read()
    assert text.startswith('---\n')
    fm = text.split('---\n')[1]
    name = re.search(r'^name:\s*(.+)$', fm, re.M).group(1).strip()
    desc = re.search(r'^description:\s*(.+)$', fm, re.M).group(1).strip()
    assert name == 'invokard-studio' == os.path.basename(SKILL)
    assert re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', name) and len(name) <= 64
    assert 0 < len(desc) <= 1024
    assert len(text.splitlines()) <= 500

def test_skill_references_exist():
    text = open(os.path.join(SKILL, 'SKILL.md'), encoding='utf-8').read()
    for rel in re.findall(r'`(references/[a-z_]+\.md)`', text):
        assert os.path.exists(os.path.join(SKILL, rel)), rel
    for rel in ('scripts/reelkit.py', 'scripts/pieces.py', 'scripts/media.py', 'scripts/align.py', 'scripts/new_reel.py', 'assets/sfx/whoosh.mp3', 'assets/fonts/Inter-Black.ttf'):
        assert os.path.exists(os.path.join(SKILL, rel)), rel

def test_project_install_and_uninstall():
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), '--project', tmp, '--agents', 'claude,codex'], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        for rel in ('.claude/skills/invokard-studio/SKILL.md', '.agents/skills/invokard-studio/SKILL.md', '.agents/skills/invokard-studio/scripts/reelkit.py'):
            assert os.path.exists(os.path.join(tmp, *rel.split('/'))), rel
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), 'uninstall', '--project', tmp], capture_output=True, text=True)
        assert r.returncode == 0 and not os.path.exists(os.path.join(tmp, '.claude', 'skills', 'invokard-studio'))

def test_uninstall_never_touches_foreign_folders():
    with tempfile.TemporaryDirectory() as tmp:
        foreign = os.path.join(tmp, '.claude', 'skills', 'invokard-studio'); os.makedirs(foreign)
        open(os.path.join(foreign, 'SKILL.md'), 'w').write('---\nname: invokard-studio\ndescription: someone else\n---\n')
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), 'uninstall', '--project', tmp], capture_output=True, text=True)
        assert r.returncode == 0 and os.path.exists(os.path.join(foreign, 'SKILL.md')) and 'kept' in r.stdout
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), '--project', tmp, '--agents', 'claude'], capture_output=True, text=True)
        assert 'skip' in r.stdout and os.path.exists(os.path.join(foreign, 'SKILL.md'))       # install refuses to overwrite it

def test_link_install_and_uninstall():
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), '--project', tmp, '--agents', 'claude', '--link'], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        t = os.path.join(tmp, '.claude', 'skills', 'invokard-studio')
        assert os.path.exists(os.path.join(t, 'SKILL.md'))
        if 'link ' in r.stdout:                                                                # junction/symlink succeeded
            assert os.path.exists(os.path.join(tmp, '.claude', 'skills', '.invokard-studio.link'))
            assert not os.path.exists(os.path.join(SKILL, '.installed-by-invokard-studio'))    # the repo itself is never marked
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), 'uninstall', '--project', tmp], capture_output=True, text=True)
        assert r.returncode == 0 and not os.path.lexists(t), r.stdout
        assert os.path.exists(os.path.join(SKILL, 'SKILL.md'))                                 # the source survived

def test_doctor_runs():
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'install.py'), 'doctor'], capture_output=True, text=True, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    assert 'python' in r.stdout and 'ffmpeg' in r.stdout
    assert 'MAGNIFIC_API_KEY' in r.stdout and 'sk-' not in r.stdout      # names only, never values

def test_new_reel_scaffold():
    with tempfile.TemporaryDirectory() as tmp:
        dest = os.path.join(tmp, 'demo')
        r = subprocess.run([sys.executable, os.path.join(SKILL, 'scripts', 'new_reel.py'), dest, '--brand', 'lime', '--title', 'Demo'], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        assert os.path.isdir(os.path.join(dest, 'img')) and os.path.exists(os.path.join(dest, 'reel.py'))
        src = open(os.path.join(dest, 'reel.py'), encoding='utf-8').read()
        assert "BRANDS['lime']" in src and '__STUDIO__' not in src
