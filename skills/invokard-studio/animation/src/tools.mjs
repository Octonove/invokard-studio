// The two outside programs the engine needs: a Chromium browser (Chrome or Edge already installed, or one downloaded
// once) and ffmpeg (the one on PATH, or the one installed with the engine's npm packages).
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {chromium} from 'playwright-core';

const require = createRequire(import.meta.url);

const which = (cmd) => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {encoding: 'utf8'});
  const first = r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean) : '';
  return first && existsSync(first.trim()) ? first.trim() : null;
};

export function findFfmpeg() {
  if (process.env.INVOKARD_FFMPEG) return process.env.INVOKARD_FFMPEG;
  const onPath = which('ffmpeg');
  if (onPath) return onPath;
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch { /* optional dependency not installed */ }
  return null;
}

const GL = {
  angle: ['--use-gl=angle', '--use-angle=default'],
  swangle: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  egl: ['--use-gl=egl'],
};

// Chrome or Edge already on the machine first (nothing to download), then a browser installed with
// `invokard-animation browser`. INVOKARD_BROWSER (a path) or INVOKARD_BROWSER_CHANNEL (chrome, msedge) force one.
export async function launchBrowser({executablePath, channel, gl} = {}) {
  const args = gl ? GL[gl] || [] : [];
  if (gl && !GL[gl]) throw new Error(`Unknown --gl "${gl}". Use one of: ${Object.keys(GL).join(', ')}`);
  const path = executablePath || process.env.INVOKARD_BROWSER;
  const forced = channel || process.env.INVOKARD_BROWSER_CHANNEL;
  const tries = path ? [{executablePath: path}] : forced ? [{channel: forced}]
    : ['chrome', 'msedge'].map((c) => ({channel: c})).concat([{}]);   // Edge is always there on Windows
  const problems = [];
  for (const t of tries) {
    try {
      const browser = await chromium.launch({headless: true, args, ...t});
      return {browser, name: t.executablePath ? `browser at ${t.executablePath}` : t.channel || 'downloaded Chromium', version: browser.version()};
    } catch (e) {
      problems.push(`${t.executablePath || t.channel || 'downloaded Chromium'}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error('No browser could be started. Install Google Chrome or Microsoft Edge, or download one for the engine with ' +
    '`node cli.mjs browser` (about 100 MB, once).\n' + problems.join('\n'));
}

// Downloads the headless Chromium build that playwright-core uses, into its own cache folder.
export function installBrowser() {
  const cli = join(dirname(require.resolve('playwright-core/package.json')), 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'install', 'chromium-headless-shell'], {stdio: 'inherit'});
  return r.status ?? 1;
}
