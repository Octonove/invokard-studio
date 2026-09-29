import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
// JavaScript setup is also directly executable before the TypeScript bundle exists.
// @ts-expect-error The standalone setup entry intentionally ships without a declaration file.
import { setup } from '../plugins/invokard-studio/scripts/setup.mjs';

const require = createRequire(import.meta.url);
const ffprobe = (require('ffprobe-static') as { path: string }).path;
const ffmpeg = require('ffmpeg-static') as string;
const execute = promisify(execFile);

test('read-only setup reports missing tools without creating user configuration or exposing credentials', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'invokard-setup-'));
  try {
    const result = await setup({ toolsDir: path.join(temp, 'tools'), env: { PATH: '', HIGGSFIELD_API_KEY: 'secret-test-value' } });
    assert.equal(result?.ready, false);
    assert.equal(result.ffmpeg.ready, false);
    assert.equal(result.ffprobe.ready, false);
    assert.equal(result.installed, false);
    assert.deepEqual(await readdir(temp), []);
    assert.ok(!JSON.stringify(result).includes('secret-test-value'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('setup checks the actual binary at an explicit path containing spaces', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'Invokard José setup '));
  try {
    const result = await setup({ toolsDir: temp, env: { PATH: '', FFPROBE_PATH: ffprobe, FFMPEG_PATH: path.join(temp, 'missing.exe') } });
    assert.equal(result.ffprobe.ready, true);
    assert.equal(result.ffprobe.path, ffprobe);
    assert.match(result.ffprobe.version, /^ffprobe version /);
    assert.equal(result.ffmpeg.ready, false);
    assert.equal(result.ready, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('explicit tools installation passes literal directory arguments and reports installer failure honestly', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'invokard-setup-install-'));
  const toolsDir = path.join(temp, "tools José & literal's");
  let installCommand: { command: string; args: string[] } | undefined;
  try {
    const result = await setup({
      installTools: true, toolsDir, npmCli: import.meta.filename, env: { PATH: '' },
      run: async (command: string, args: string[]) => {
        if (args.includes('install')) {
          installCommand = { command, args };
          return { code: 1, stdout: '', stderr: 'simulated network failure' };
        }
        return { code: 1, stdout: '', stderr: '' };
      },
    });
    assert.equal(result.ready, false);
    assert.equal(result.installed, false);
    assert.equal(installCommand?.command, process.execPath);
    assert.ok(installCommand?.args.includes(toolsDir));
    assert.ok(installCommand?.args.includes('ffmpeg-static@5.3.0'));
    assert.ok(installCommand?.args.includes('ffprobe-static@3.1.0'));
    assert.ok(result.notes.some((note: string) => /installation failed/i.test(note)));
    assert.ok(!(await readdir(toolsDir)).includes('config.json'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('an explicit install verifies real binaries before saving configuration and is idempotent', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'invokard-tools José '));
  const toolsDir = path.join(temp, "tools & user's");
  const extension = process.platform === 'win32' ? '.exe' : '';
  let installs = 0;
  try {
    const run = async (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      if (args.includes('install')) {
        installs++;
        const installedFfmpeg = path.join(toolsDir, 'node_modules', 'ffmpeg-static', `ffmpeg${extension}`);
        const installedFfprobe = path.join(toolsDir, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, `ffprobe${extension}`);
        await mkdir(path.dirname(installedFfmpeg), { recursive: true });
        await mkdir(path.dirname(installedFfprobe), { recursive: true });
        // Replace only the network installer; binary discovery and execution are real.
        await copyFile(ffmpeg, installedFfmpeg);
        await copyFile(ffprobe, installedFfprobe);
        return { code: 0, stdout: '', stderr: '' };
      }
      try { return { code: 0, ...await execute(command, args, { env: options.env, windowsHide: true }) }; }
      catch { return { code: 1, stdout: '', stderr: '' }; }
    };
    const options = { installTools: true, toolsDir, npmCli: import.meta.filename, env: { PATH: '' }, run };
    const first = await setup(options);
    assert.equal(first.ready, true);
    assert.equal(first.installed, true);
    const stored = JSON.parse(await readFile(path.join(toolsDir, 'config.json'), 'utf8'));
    assert.equal(stored.ffmpegPath, first.ffmpeg.path);
    assert.equal(stored.ffprobePath, first.ffprobe.path);
    assert.deepEqual(Object.keys(stored).sort(), ['ffmpegPath', 'ffprobePath']);
    const second = await setup(options);
    assert.equal(second.ready, true);
    assert.equal(second.installed, false);
    assert.equal(installs, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
