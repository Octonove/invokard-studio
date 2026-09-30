# env — credentials and settings, read from the environment or a .env file. Values are never printed or logged.
import os

def load_dotenv(paths=None):
    """Load KEY=VALUE lines from the first .env found (cwd, the work folder's parents, the repo root). Existing
    environment variables win. Returns the file used or None."""
    cands = list(paths or [])
    here = os.getcwd()
    for _ in range(4):
        cands.append(os.path.join(here, '.env')); here = os.path.dirname(here)
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
    cands.append(os.path.join(root, '.env')); cands.append(os.path.expanduser('~/.invokard-studio/.env'))
    for p in cands:
        if not os.path.isfile(p): continue
        for line in open(p, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k, v = line.split('=', 1); k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ: os.environ[k] = v
        return p
    return None

def secret(name, required=True):
    """A credential by name. Looks in the environment, then in .env files. Never returns a placeholder."""
    v = os.environ.get(name)
    if not v:
        load_dotenv(); v = os.environ.get(name)
    if not v and required:
        raise RuntimeError(f'{name} is not set. Export it or add it to a .env file (see .env.example). Never paste keys into the chat.')
    return v

def has(name):
    return bool(secret(name, required=False))

def masked(name):
    """'set' / 'missing' for reports. Never the value."""
    return 'set' if has(name) else 'missing'
