import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = ['ffmpeg-static@5.3.0', 'ffprobe-static@3.1.0'];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env, shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { child.kill(); finish(1); }, options.timeoutMs ?? 15000);
    child.stdout.on('data', (value) => { stdout = (stdout + value).slice(-65536); });
    child.stderr.on('data', (value) => { stderr = (stderr + value).slice(-65536); });
    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code ?? 1));
  });
}

async function inspectTool(name, toolsDir, env, run) {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const installed = name === 'ffmpeg'
    ? path.join(toolsDir, 'node_modules', 'ffmpeg-static', `ffmpeg${extension}`)
    : path.join(toolsDir, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, `ffprobe${extension}`);
  const override = env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  const candidates = override ? [override] : [installed, name];
  for (const candidate of candidates) {
    if (candidate !== name && !(await exists(candidate))) continue;
    const result = await run(candidate, ['-version'], { env, timeoutMs: 15000 });
    const version = String(result.stdout ?? '').split(/\r?\n/)[0];
    if (result.code === 0 && version.startsWith(`${name} version `)) {
      return { ready: true, path: candidate, version };
    }
  }
  return { ready: false, path: override || null, version: null };
}

async function findNpmCli(explicit, env) {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    explicit, env.npm_execpath,
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const entry of (env.PATH || env.Path || '').split(path.delimiter)) {
    if (entry) candidates.push(path.join(entry, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  }
  for (const candidate of candidates) {
    if (candidate && (explicit === candidate || path.basename(candidate) === 'npm-cli.js') && await exists(candidate)) return path.resolve(candidate);
  }
  return null;
}

/** Check local dependencies. Network/disk installation occurs only with installTools: true.
 * run is an optional process-execution adapter used by integration tests and embedders.
 * No credentials are accepted, saved or returned by setup.
 */
export async function setup(options = {}) {
  const env = options.env ?? process.env;
  const toolsDir = path.resolve(options.toolsDir ?? env.INVOKARD_TOOLS_DIR ?? path.join(homedir(), '.invokard-studio', 'tools'));
  const run = options.run ?? runProcess;
  const notes = [];
  const node = { ready: Number(process.versions.node.split('.')[0]) >= 22, version: process.versions.node };
  const inspect = () => Promise.all(['ffmpeg', 'ffprobe'].map((name) => inspectTool(name, toolsDir, env, run)));
  let [ffmpeg, ffprobe] = await inspect();
  let installed = false;
  if (!node.ready) notes.push('Node.js 22 or later is required.');
  if (options.installTools && node.ready && (!ffmpeg.ready || !ffprobe.ready)) {
    const npmCli = await findNpmCli(options.npmCli, env);
    if (!npmCli) {
      notes.push('npm was not found. Install Node.js with npm, or pass --npm-cli with the absolute path to npm-cli.js.');
    } else {
      await mkdir(toolsDir, { recursive: true });
      const packageFile = path.join(toolsDir, 'package.json');
      if (!(await exists(packageFile))) {
        await writeFile(packageFile, JSON.stringify({ name: 'invokard-local-tools', private: true, version: '1.0.0' }, null, 2) + '\n', { flag: 'wx' });
      }
      const result = await run(process.execPath, [npmCli, 'install', '--prefix', toolsDir, '--no-audit', '--no-fund', '--save-exact', ...PACKAGES], { cwd: toolsDir, env, timeoutMs: 300000 });
      if (result.code === 0) {
        [ffmpeg, ffprobe] = await inspect();
        installed = ffmpeg.ready && ffprobe.ready;
        if (installed) {
          const temporary = path.join(toolsDir, `config.${process.pid}.tmp`);
          await writeFile(temporary, JSON.stringify({ ffmpegPath: ffmpeg.path, ffprobePath: ffprobe.path }, null, 2) + '\n', { mode: 0o600 });
          await rename(temporary, path.join(toolsDir, 'config.json'));
        } else notes.push('Installation completed, but the binaries did not pass verification. Check explicit FFMPEG_PATH/FFPROBE_PATH overrides and platform support.');
      } else notes.push('Tools installation failed. Check network access and npm in a terminal, then retry setup explicitly.');
    }
  }
  if (!ffmpeg.ready || !ffprobe.ready) notes.push('Provide FFmpeg and ffprobe on PATH, set FFMPEG_PATH/FFPROBE_PATH, or run setup with --install-tools.');
  notes.push('Provider credentials are optional for local rendering. Configure them in your OS environment or the provider OAuth page, never in chat.');
  return { ready: node.ready && ffmpeg.ready && ffprobe.ready, node, toolsDir, ffmpeg, ffprobe, installed, notes };
}

// The filename check prevents this standalone entry from executing when esbuild
// includes setup() in studio.mjs. In that case the main CLI owns argument parsing.
if (path.basename(fileURLToPath(import.meta.url)) === 'setup.mjs' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--install-tools') options.installTools = true;
    else if (flag === '--tools-dir' || flag === '--npm-cli') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag === '--tools-dir' ? 'toolsDir' : 'npmCli'] = args[++i];
    } else throw new Error(`Unknown setup option: ${flag}`);
  }
  try {
    const result = await setup(options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.ready ? 0 : 1;
  } catch {
    process.stderr.write('Setup failed. Check directory permissions and local dependencies.\n');
    process.exitCode = 1;
  }
}
