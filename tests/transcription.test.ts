import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import childProcess from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transcribe } from '../plugins/invokard-studio/src/transcription.js';
import type { Project } from '../plugins/invokard-studio/src/types.js';

function wav() {
  const samples = 44100, buffer = Buffer.alloc(44 + samples * 4);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(44100, 24); buffer.writeUInt32LE(44100 * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) { const value = Math.round(Math.sin(i * 440 * Math.PI * 2 / 44100) * 2000); buffer.writeInt16LE(value, 44 + i * 4); buffer.writeInt16LE(value, 46 + i * 4); }
  return buffer;
}
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "invokard transcript café d'été "));
  await mkdir(path.join(dir, 'assets')); await writeFile(path.join(dir, 'assets', 'voice.wav'), wav());
  const project = { assets: [{ id: 'voice', kind: 'audio', path: 'assets/voice.wav' }], captions: [] } as unknown as Project;
  return { dir, project };
}
function configured(t: any, exe?: string, model?: string) {
  const oldExe = process.env.WHISPER_CPP_PATH, oldModel = process.env.WHISPER_MODEL_PATH;
  if (exe) process.env.WHISPER_CPP_PATH = exe; else delete process.env.WHISPER_CPP_PATH;
  if (model) process.env.WHISPER_MODEL_PATH = model; else delete process.env.WHISPER_MODEL_PATH;
  t.after(() => {
    if (oldExe === undefined) delete process.env.WHISPER_CPP_PATH; else process.env.WHISPER_CPP_PATH = oldExe;
    if (oldModel === undefined) delete process.env.WHISPER_MODEL_PATH; else process.env.WHISPER_MODEL_PATH = oldModel;
  });
}
async function whisperFixture(t: any, dir: string, mode = 'success') {
  const executable = path.join(dir, 'whisper-cli.exe'), model = path.join(dir, 'ggml-test.bin'), script = path.join(dir, 'fake-whisper.cjs');
  await writeFile(executable, 'Deterministic executable stand-in; never run directly'); await writeFile(model, 'No actual speech model used by this test');
  await writeFile(script, `const fs = require('node:fs');
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('-osrt') || !args.includes('-m') || !args.includes('-f') || !args.includes('-l') || !args.includes('-of')) process.exit(41);
if (!fs.existsSync(value('-m')) || !['es', 'auto'].includes(value('-l'))) process.exit(42);
const audio = fs.readFileSync(value('-f')), fmt = audio.indexOf('fmt ');
if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt16LE(fmt + 10) !== 1 || audio.readUInt32LE(fmt + 12) !== 16000 || audio.readUInt16LE(fmt + 22) !== 16) process.exit(43);
if (${JSON.stringify(mode)} === 'failure') process.exit(44);
fs.writeFileSync(value('-of') + '.srt', ${JSON.stringify(mode === 'malformed' ? 'bad transcript' : "1\n00:00:00,100 --> 00:00:00,600\nCafé d'été: una voz.\n\n2\n00:00:00,650 --> 00:00:00,950\nSegunda frase.\n")});
if (${JSON.stringify(mode)} === 'hang') setInterval(() => {}, 1000);`);
  configured(t, executable, model);
  const canonicalExecutable = await realpath(executable);
  const realSpawn = childProcess.spawn;
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const spy = mock.method(childProcess, 'spawn', ((exe: any, args: any, options: any) => {
    if (exe !== canonicalExecutable) return realSpawn(exe, args, options);
    const child = realSpawn(process.execPath, [script, ...args], options); child.once('spawn', began); return child;
  }) as typeof childProcess.spawn);
  t.after(() => spy.mock.restore());
  return { started };
}

test('missing optional whisper.cpp setup gives actionable errors and creates no export', async t => {
  const { dir, project } = await fixture(); configured(t);
  await assert.rejects(transcribe(dir, project, 'voice'), /WHISPER_CPP_PATH.*WHISPER_MODEL_PATH/s);
  assert.deepEqual(await readdir(dir), ['assets']);
});

test('transcription converts real audio to 16k mono, parses timed SRT and preserves previous runs', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir);
  const original = structuredClone(project);
  const result = await transcribe(dir, project, 'voice', { language: 'es' });
  assert.deepEqual(result.captions, [{ start: 0.1, end: 0.6, text: "Café d'été: una voz." }, { start: 0.65, end: 0.95, text: 'Segunda frase.' }]);
  assert.match(await readFile(result.srt, 'utf8'), /00:00:00,100 --> 00:00:00,600/);
  assert.deepEqual(project, original, 'Transcription must not silently update project captions');
  const originalSrt = await readFile(result.srt); const second = await transcribe(dir, project, 'voice');
  assert.notEqual(second.srt, result.srt); assert.deepEqual(await readFile(result.srt), originalSrt);
  assert.deepEqual(await readdir(path.dirname(result.srt)), ['transcript.srt'], 'Intermediate audio should be removed');
});

test('transcription rejects malformed output and removes failed work without fabricating captions', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir, 'malformed');
  await assert.rejects(transcribe(dir, project, 'voice'), /Invalid SRT/i);
  assert.deepEqual(project.captions, []);
  assert.deepEqual(await readdir(path.join(dir, 'exports')), []);
});

test('transcription refuses URLs, traversal, escaped junctions, missing assets and flag-like language', async t => {
  const { dir, project } = await fixture(); configured(t);
  for (const assetPath of ['../private.wav', 'https://example.com/private.wav']) {
    const p = structuredClone(project); p.assets[0].path = assetPath;
    await assert.rejects(transcribe(dir, p, 'voice'), /path|relative|URL|project/i);
  }
  await assert.rejects(transcribe(dir, project, 'missing'), /asset/i);
  await assert.rejects(transcribe(dir, project, 'voice', { language: '--output-file' }), /language/i);
  const outside = await fixture(); await symlink(path.join(outside.dir, 'assets'), path.join(dir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  project.assets[0].path = 'escape/voice.wav';
  await assert.rejects(transcribe(dir, project, 'voice'), /outside|contain|project/i);
});

test('transcription cancellation kills the active speech process and discards its partial output', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); const { started } = await whisperFixture(t, dir, 'hang');
  const controller = new AbortController(); const pending = transcribe(dir, project, 'voice', { signal: controller.signal });
  const rejected = assert.rejects(pending, /cancel|abort/i);
  await started; controller.abort(); await rejected;
  assert.deepEqual(await readdir(path.join(dir, 'exports')), []);
});

test('failed speech executable reports failure and leaves no false successful transcript', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir, 'failure');
  await assert.rejects(transcribe(dir, project, 'voice'), /dependency failed \(44\)/);
  assert.deepEqual(await readdir(path.join(dir, 'exports')), []);
});
