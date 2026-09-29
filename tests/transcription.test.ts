import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addWhisperWordTimings, transcribe, transcriptionStatus } from '../plugins/invokard-studio/src/transcription.js';
import type { Project } from '../plugins/invokard-studio/src/types.js';
import { doctorMedia } from '../plugins/invokard-studio/src/media.js';

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
  const oldPython = process.env.FASTER_WHISPER_PYTHON_PATH, oldFasterModel = process.env.FASTER_WHISPER_MODEL_PATH;
  delete process.env.FASTER_WHISPER_PYTHON_PATH; delete process.env.FASTER_WHISPER_MODEL_PATH;
  if (exe) process.env.WHISPER_CPP_PATH = exe; else delete process.env.WHISPER_CPP_PATH;
  if (model) process.env.WHISPER_MODEL_PATH = model; else delete process.env.WHISPER_MODEL_PATH;
  t.after(() => {
    if (oldExe === undefined) delete process.env.WHISPER_CPP_PATH; else process.env.WHISPER_CPP_PATH = oldExe;
    if (oldModel === undefined) delete process.env.WHISPER_MODEL_PATH; else process.env.WHISPER_MODEL_PATH = oldModel;
    if (oldPython === undefined) delete process.env.FASTER_WHISPER_PYTHON_PATH; else process.env.FASTER_WHISPER_PYTHON_PATH = oldPython;
    if (oldFasterModel === undefined) delete process.env.FASTER_WHISPER_MODEL_PATH; else process.env.FASTER_WHISPER_MODEL_PATH = oldFasterModel;
  });
}
const timedJson = {
  model: { type: 'base', multilingual: true }, result: { language: 'es' },
  transcription: [
    { text: " Café d'été: una voz.", offsets: { from: 100, to: 600 }, tokens: [
      { text: '[_BEG_]', offsets: { from: 0, to: 0 }, id: 50364, p: 1, t_dtw: -1 },
      { text: ' Caf', offsets: { from: 100, to: 160 } }, { text: 'é', offsets: { from: 160, to: 200 } },
      { text: ' d', offsets: { from: 200, to: 240 } }, { text: "'", offsets: { from: 240, to: 240 } },
      { text: 'été', offsets: { from: 240, to: 340 } }, { text: ':', offsets: { from: -10, to: -10 } },
      { text: ' una', offsets: { from: 340, to: 430 } }, { text: ' voz', offsets: { from: 430, to: 600 } },
      { text: '.', offsets: { from: 600, to: 600 } }, { text: '[_TT_30]', offsets: { from: 600, to: 600 } },
    ] },
    { text: ' Segunda frase.', offsets: { from: 650, to: 950 }, tokens: [
      { text: ' Seg', offsets: { from: 650, to: 700 } }, { text: 'unda', offsets: { from: 700, to: 790 } },
      { text: ' frase', offsets: { from: 790, to: 950 } }, { text: '.', offsets: { from: 950, to: 950 } },
      { text: '<|endoftext|>', id: 50257 },
    ] },
  ],
};
async function whisperFixture(t: any, dir: string, mode = 'success', json: unknown = timedJson) {
  const executable = path.join(dir, 'whisper-cli.exe'), model = path.join(dir, 'ggml-test.bin'), script = path.join(dir, 'fake-whisper.cjs');
  await writeFile(executable, 'Deterministic executable stand-in; never run directly'); await writeFile(model, 'No actual speech model used by this test');
  await writeFile(script, `const fs = require('node:fs');
let args = process.argv.slice(2);
const responseFile = args.length === 1 && args[0].startsWith('@');
if (responseFile) args = fs.readFileSync(args[0].slice(1), 'utf8').split(/\\r?\\n/).filter(Boolean);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('-osrt') || !args.includes('-ojf') || !args.includes('-sow') || Number(value('-ml')) <= 0 || !args.includes('-m') || !args.includes('-f') || !args.includes('-l') || !args.includes('-of')) process.exit(41);
if (!fs.existsSync(value('-m')) || !['es', 'auto'].includes(value('-l'))) process.exit(42);
// Official Windows binary 1.9.4 crashes on the accented absolute model path.
if (process.platform === 'win32' && /[^\\x00-\\x7f]/.test(value('-m'))) process.exit(45);
if (${JSON.stringify(mode)} === 'context' && (value('-dtw') !== 'small' || !args.includes('-nfa') || value('--prompt') !== "Maemuki: Café d'été. $(not-a-command)" || (process.platform === 'win32' && !responseFile))) process.exit(46);
const audio = fs.readFileSync(value('-f')), fmt = audio.indexOf('fmt ');
if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt16LE(fmt + 10) !== 1 || audio.readUInt32LE(fmt + 12) !== 16000 || audio.readUInt16LE(fmt + 22) !== 16) process.exit(43);
if (${JSON.stringify(mode)} === 'failure') process.exit(44);
fs.writeFileSync(value('-of') + '.srt', ${JSON.stringify(mode === 'malformed' ? 'bad transcript' : "1\n00:00:00,100 --> 00:00:00,600\nCafé d'été: una voz.\n\n2\n00:00:00,650 --> 00:00:00,950\nSegunda frase.\n")});
if (${JSON.stringify(mode)} !== 'missing-json') fs.writeFileSync(value('-of') + '.json', ${JSON.stringify(mode === 'bad-json' ? 'not json' : JSON.stringify(json))});
if (${JSON.stringify(mode)} === 'hang') setInterval(() => {}, 1000);`);
  configured(t, executable, model);
  const canonicalExecutable = await realpath(executable);
  const realSpawn = childProcess.spawn;
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const spy = mock.method(childProcess, 'spawn', ((exe: any, args: any, options: any) => {
    if (mode === 'no-libass' && args.includes('-filters')) return realSpawn(process.execPath, ['-e', 'console.log("Filters: anull A->A")'], options);
    if (exe !== canonicalExecutable) return realSpawn(exe, args, options);
    const child = realSpawn(process.execPath, [script, ...args], options); child.once('spawn', began); return child;
  }) as typeof childProcess.spawn);
  syncBuiltinESMExports();
  t.after(() => { spy.mock.restore(); syncBuiltinESMExports(); });
  return { started };
}

test('missing optional whisper.cpp setup gives actionable errors and creates no export', async t => {
  const { dir, project } = await fixture(); configured(t);
  await assert.rejects(transcribe(dir, project, 'voice'), /WHISPER_CPP_PATH.*WHISPER_MODEL_PATH/s);
  assert.deepEqual(await readdir(dir), ['assets']);
});

const fasterJson = { engine: 'faster-whisper', version: '1.2.1', segments: [
  { start: .1, end: .6, text: ' ¡Maemuki, adelante!', words: [
    { start: .1, end: .29, word: ' ¡Maemuki,', probability: .9 },
    { start: .37, end: .6, word: ' adelante!', probability: .95 },
  ] },
] };
async function fasterFixture(t: any, dir: string, mode = 'success', json: unknown = fasterJson) {
  configured(t);
  const python = path.join(dir, 'python.exe'), model = path.join(dir, 'modelo café'), script = path.join(dir, 'fake-python.cjs');
  await writeFile(python, 'Deterministic Python stand-in; never run directly'); await mkdir(model);
  await writeFile(path.join(model, 'model.bin'), 'fixture'); await writeFile(path.join(model, 'config.json'), '{}');
  await writeFile(path.join(model, 'tokenizer.json'), '{}');
  await writeFile(script, `const fs = require('node:fs'), path = require('node:path');
const [runner, flag, request] = process.argv.slice(2);
if (!fs.existsSync(runner) || path.basename(runner) !== 'faster-whisper.py' || flag !== '--config') process.exit(51);
const config = JSON.parse(fs.readFileSync(request, 'utf8'));
if (config.input !== 'audio.wav' || config.output !== 'transcript.json' || !fs.existsSync(path.join(config.model, 'model.bin')) || !['auto', 'es'].includes(config.language)) process.exit(52);
if (${JSON.stringify(mode)} === 'context' && config.prompt !== "Maemuki: Café d'été. $(literal)") process.exit(53);
if (${JSON.stringify(mode)} === 'failure') { console.error('faster_whisper missing or model incompatible'); process.exit(54); }
const audio = fs.readFileSync(config.input), fmt = audio.indexOf('fmt ');
if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt16LE(fmt + 10) !== 1 || audio.readUInt32LE(fmt + 12) !== 16000) process.exit(55);
fs.writeFileSync(config.output, ${JSON.stringify(mode === 'malformed' ? 'not JSON' : JSON.stringify(json))});
if (${JSON.stringify(mode)} === 'hang') setInterval(() => {}, 1000);`);
  process.env.FASTER_WHISPER_PYTHON_PATH = python; process.env.FASTER_WHISPER_MODEL_PATH = model;
  const canonical = await realpath(python), realSpawn = childProcess.spawn;
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const spy = mock.method(childProcess, 'spawn', ((exe: any, args: any, options: any) => {
    if (exe !== canonical) return realSpawn(exe, args, options);
    const child = realSpawn(process.execPath, [script, ...args], options); child.once('spawn', began); return child;
  }) as typeof childProcess.spawn);
  syncBuiltinESMExports(); t.after(() => { spy.mock.restore(); syncBuiltinESMExports(); });
  return { python, model, started };
}

test('auto prefers configured faster-whisper, preserves native VAD word intervals and writes auditable JSON/SRT', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await fasterFixture(t, dir, 'context');
  process.env.WHISPER_CPP_PATH = process.execPath; process.env.WHISPER_MODEL_PATH = path.join(dir, 'assets/voice.wav');
  const result = await transcribe(dir, project, 'voice', { language: 'es', prompt: "Maemuki: Café d'été. $(literal)" });
  assert.equal(result.timing.engine, 'faster-whisper');
  assert.equal(result.timing.source, 'faster-whisper-word-timestamps');
  assert.equal(result.timing.method, 'cross-attention-dtw-silero-vad');
  assert.equal(result.timing.wordTiming, 'complete');
  assert.match(result.timing.limitations.join(' '), /review|estimate/i);
  assert.deepEqual(result.captions, [{ start: .1, end: .6, text: '¡Maemuki, adelante!', words: [
    { start: .1, end: .29, text: '¡Maemuki,' }, { start: .37, end: .6, text: 'adelante!' },
  ] }]);
  assert.match(await readFile(result.srt, 'utf8'), /00:00:00,100 --> 00:00:00,600\n¡Maemuki, adelante!/);
  assert.deepEqual(JSON.parse(await readFile(result.json!, 'utf8')), fasterJson);
  assert.deepEqual(await readdir(path.dirname(result.srt)), ['transcript.json', 'transcript.srt']);
});

test('explicit whisper.cpp remains available when faster-whisper is configured', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir);
  process.env.FASTER_WHISPER_PYTHON_PATH = process.execPath; process.env.FASTER_WHISPER_MODEL_PATH = dir;
  const result = await transcribe(dir, project, 'voice', { engine: 'whisper.cpp' });
  assert.equal(result.timing.engine, 'whisper.cpp');
  assert.equal(result.timing.method, 'heuristic-token-offsets');
});

test('engine selection and local faster-whisper dependencies fail clearly without silently changing engines', async t => {
  const { dir, project } = await fixture(); configured(t);
  await assert.rejects(transcribe(dir, project, 'voice', { engine: 'remote' as any }), /engine/i);
  await assert.rejects(transcribe(dir, project, 'voice', { engine: 'faster-whisper' }), /FASTER_WHISPER_PYTHON_PATH.*FASTER_WHISPER_MODEL_PATH/s);
  process.env.FASTER_WHISPER_PYTHON_PATH = process.execPath;
  for (const model of ['https://example.com/model', 'relative-model', path.join(dir, 'assets/voice.wav')]) {
    process.env.FASTER_WHISPER_MODEL_PATH = model;
    await assert.rejects(transcribe(dir, project, 'voice'), /FASTER_WHISPER_MODEL_PATH|local.*directory/i);
  }
  const incomplete = path.join(dir, 'incomplete-model'); await mkdir(incomplete); await writeFile(path.join(incomplete, 'model.bin'), 'model');
  process.env.FASTER_WHISPER_MODEL_PATH = incomplete;
  await assert.rejects(transcribe(dir, project, 'voice'), /config.json|tokenizer.json/);
  assert.equal((await readdir(dir)).includes('exports'), false);
});

test('transcription doctor reports configured separately from verified without loading a runtime', t => {
  configured(t); assert.equal(transcriptionStatus().configured, false);
  process.env.WHISPER_CPP_PATH = '/not-verified/whisper'; process.env.WHISPER_MODEL_PATH = '/not-verified/model';
  assert.equal(transcriptionStatus().preferredEngine, 'whisper.cpp');
  process.env.FASTER_WHISPER_PYTHON_PATH = '/not-verified/python'; process.env.FASTER_WHISPER_MODEL_PATH = '/not-verified/directory';
  assert.equal(transcriptionStatus().preferredEngine, 'faster-whisper');
  assert.equal(transcriptionStatus().verified, false);
});

const testPython = process.env.INVOKARD_TEST_PYTHON;
test('packaged Python runner applies offline VAD options and safely serializes unbounded metadata', { skip: !testPython, timeout: 30000 }, async () => {
  const { dir } = await fixture(); const script = path.join(dir, 'python-smoke.py');
  await mkdir(path.join(dir, 'model')); await writeFile(path.join(dir, 'model/model.bin'), 'fixture');
  await writeFile(path.join(dir, 'request.json'), JSON.stringify({model:path.join(dir,'model'),input:'assets/voice.wav',output:'result.json',language:'es',prompt:'Raíces Maemuki'}));
  await writeFile(script, `import dataclasses, importlib.metadata, os, runpy, sys, types
Word = dataclasses.make_dataclass('Word', [('word',str),('start',float),('end',float)])
Segment = dataclasses.make_dataclass('Segment', [('text',str),('start',float),('end',float),('words',list)])
Info = dataclasses.make_dataclass('Info', [('vad_options',dict)])
class Model:
 def __init__(self, path, **kw):
  assert kw['local_files_only'] and kw['device']=='cpu' and kw['compute_type']=='int8'
  assert os.environ['HF_HUB_OFFLINE']=='1' and os.environ['TRANSFORMERS_OFFLINE']=='1'
 def transcribe(self, path, **kw):
  assert kw['word_timestamps'] and kw['vad_filter'] and not kw['condition_on_previous_text']
  assert kw['vad_parameters']=={'min_silence_duration_ms':200,'speech_pad_ms':30}
  assert kw['language']=='es' and kw['initial_prompt']=='Raíces Maemuki'
  return iter([Segment(' Hola.',.1,.7,[Word(' Hola.',.1,.7)])]), Info({'max_speech_duration_s':float('inf')})
module=types.ModuleType('faster_whisper'); module.WhisperModel=Model; sys.modules['faster_whisper']=module
importlib.metadata.version=lambda name:'test-version'
runner=sys.argv[1]; sys.argv=[runner,'--config','request.json']; runpy.run_path(runner,run_name='__main__')
`);
  const runner = path.resolve('plugins/invokard-studio/runtime/faster-whisper.py');
  await new Promise<void>((resolve, reject) => { const child = childProcess.spawn(testPython!, [script, runner], { cwd: dir, shell: false, windowsHide: true }); let stderr=''; child.stderr.on('data', data=>stderr+=data); child.on('error', reject); child.on('close', code=>code===0?resolve():reject(new Error(stderr))); });
  const output = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
  assert.equal(output.info.vad_options.max_speech_duration_s, null);
  assert.deepEqual(output.segments[0].words, [{ word: ' Hola.', start: .1, end: .7 }]);
});

test('faster-whisper failures and malformed results clean staging instead of falling back to heuristic captions', { timeout: 30000 }, async t => {
  for (const mode of ['failure', 'malformed']) await t.test(mode, async t => {
    const { dir, project } = await fixture(); await fasterFixture(t, dir, mode);
    await assert.rejects(transcribe(dir, project, 'voice'), /54|JSON|faster.whisper/i);
    assert.deepEqual(await readdir(path.join(dir, 'exports')), []);
  });
});

test('faster-whisper rejects invalid phrase ranges and retains phrases without fabricated missing word intervals', { timeout: 60000 }, async t => {
  for (const mode of ['zero word', 'missing words', 'text mismatch', 'outside source', 'overlap']) await t.test(mode, async t => {
    const json: any = structuredClone(fasterJson);
    if (mode === 'zero word') json.segments[0].words[0].end = .1;
    if (mode === 'missing words') json.segments[0].words = null;
    if (mode === 'text mismatch') json.segments[0].words[0].word = ' Otra';
    if (mode === 'outside source') json.segments[0].end = 3;
    if (mode === 'overlap') json.segments[0].words[1].start = .2;
    const { dir, project } = await fixture(); await fasterFixture(t, dir, 'success', json);
    if (mode === 'outside source') await assert.rejects(transcribe(dir, project, 'voice'), /duration|source|range/i);
    else {
      const result = await transcribe(dir, project, 'voice');
      assert.equal(result.captions[0].words, undefined);
      assert.equal(result.timing.wordTiming, 'unavailable');
      assert.match(result.timing.limitations.join(' '), /Caption 1/i);
    }
  });
});

test('faster-whisper cancellation kills the Python process and removes its partial result', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); const { started } = await fasterFixture(t, dir, 'hang');
  const controller = new AbortController(); const pending = transcribe(dir, project, 'voice', { signal: controller.signal });
  const rejected = assert.rejects(pending, /cancel|abort/i); await started; controller.abort(); await rejected;
  assert.deepEqual(await readdir(path.join(dir, 'exports')), []);
});

test('transcription aggregates real token offsets into words while preserving phrase text, SRT and previous runs', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir);
  const original = structuredClone(project);
  const result = await transcribe(dir, project, 'voice', { language: 'es' });
  assert.deepEqual(result.captions, [
    { start: 0.1, end: 0.6, text: "Café d'été: una voz.", words: [
      { start: 0.1, end: 0.2, text: 'Café' }, { start: 0.2, end: 0.34, text: "d'été:" },
      { start: 0.34, end: 0.43, text: 'una' }, { start: 0.43, end: 0.6, text: 'voz.' },
    ] },
    { start: 0.65, end: 0.95, text: 'Segunda frase.', words: [
      { start: 0.65, end: 0.79, text: 'Segunda' }, { start: 0.79, end: 0.95, text: 'frase.' },
    ] },
  ]);
  assert.equal(result.timing.wordTiming, 'complete');
  assert.equal(result.timing.basis, 'source_asset_seconds');
  assert.equal(result.timing.source, 'whisper.cpp-token-offsets');
  assert.match(result.timing.limitations.join(' '), /heuristic.*DTW.*acoustic/i);
  assert.match(await readFile(result.srt, 'utf8'), /00:00:00,100 --> 00:00:00,600/);
  assert.deepEqual(project, original, 'Transcription must not silently update project captions');
  const originalSrt = await readFile(result.srt); const second = await transcribe(dir, project, 'voice');
  assert.notEqual(second.srt, result.srt); assert.deepEqual(await readFile(result.srt), originalSrt);
  assert.deepEqual(JSON.parse(await readFile(result.json!, 'utf8')), timedJson, 'Keep original model output for review');
  assert.deepEqual(await readdir(path.dirname(result.srt)), ['transcript.json', 'transcript.srt'], 'Intermediate audio should be removed');
});

test('audio transcription works when FFmpeg lacks the unrelated libass subtitle filter', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir, 'no-libass');
  const diagnostic = await doctorMedia() as any;
  assert.equal(diagnostic.ready, false);
  assert.equal(diagnostic.ffmpeg.available, true);
  assert.equal(diagnostic.ffprobe.available, true);
  assert.equal(diagnostic.captions.available, false);
  const result = await transcribe(dir, project, 'voice');
  assert.equal(result.captions.length, 2);
});

test('missing or malformed word JSON preserves phrases and reports unavailable timing without inventing words', { timeout: 30000 }, async t => {
  for (const mode of ['missing-json', 'bad-json']) await t.test(mode, async t => {
    const { dir, project } = await fixture(); await whisperFixture(t, dir, mode);
    const result = await transcribe(dir, project, 'voice');
    assert.equal(result.captions.length, 2);
    assert.ok(result.captions.every(caption => !caption.words));
    assert.equal(result.timing.wordTiming, 'unavailable');
    assert.match(result.timing.limitations.join(' '), /JSON/i);
  });
});

test('optional DTW and Unicode context reach whisper literally through its documented response-file interface', { timeout: 30000 }, async t => {
  const { dir, project } = await fixture(); await whisperFixture(t, dir, 'context');
  const result = await transcribe(dir, project, 'voice', { language: 'es', dtwModel: 'small', prompt: "Maemuki: Café d'été. $(not-a-command)" });
  assert.equal(result.timing.wordTiming, 'complete');
  assert.deepEqual(await readdir(path.dirname(result.srt)), ['transcript.json', 'transcript.srt']);
});

test('transcription validates model alignment presets and bounded context before spawning processes', async t => {
  const { dir, project } = await fixture(); configured(t);
  for (const options of [{ dtwModel: '--output-file' }, { prompt: 'x'.repeat(2001) }, { prompt: 'bad\0context' }]) {
    await assert.rejects(transcribe(dir, project, 'voice', options as any), /DTW|prompt|context/i);
  }
  assert.deepEqual(await readdir(dir), ['assets']);
});

test('unusable lexical token times are explicit per-phrase limitations, never interpolated or clamped', { timeout: 60000 }, async t => {
  const cases = [
    ['missing offsets', undefined], ['negative', { from: -10, to: 200 }],
    ['zero duration', { from: 340, to: 340 }], ['outside phrase', { from: 100, to: 640 }],
    ['outside audio', { from: 100, to: 5000 }], ['non-numeric', { from: '100', to: 200 }],
  ] as const;
  for (const [name, offsets] of cases) await t.test(name, async t => {
    const json: any = structuredClone(timedJson); json.transcription[0].tokens[name === 'zero duration' ? 7 : 1].offsets = offsets;
    const { dir, project } = await fixture(); await whisperFixture(t, dir, 'success', json);
    const result = await transcribe(dir, project, 'voice');
    assert.equal(result.captions[0].words, undefined);
    assert.equal(result.captions[1].words?.length, 2);
    assert.equal(result.timing.wordTiming, 'partial');
    assert.match(result.timing.limitations.join(' '), /caption 1/i);
  });
});

test('token text mismatches, multiword tokens and overlaps cannot claim complete word timing', { timeout: 60000 }, async t => {
  const variants: { name: string; modify: (json: any) => void }[] = [
    { name: 'text mismatch', modify: json => { json.transcription[0].tokens[1].text = ' Té'; } },
    { name: 'multiword token', modify: json => { json.transcription[0].tokens.splice(7, 2, { text: ' una voz', offsets: { from: 340, to: 600 } }); } },
    { name: 'word overlap', modify: json => { json.transcription[0].tokens[7].offsets.from = 330; } },
    { name: 'reversed subtokens', modify: json => { json.transcription[0].tokens[2].offsets = { from: 120, to: 150 }; } },
    { name: 'different segment', modify: json => { json.transcription[0].offsets.from = 200; } },
  ];
  for (const { name, modify } of variants) await t.test(name, async t => {
    const json = structuredClone(timedJson); modify(json);
    const { dir, project } = await fixture(); await whisperFixture(t, dir, 'success', json);
    const result = await transcribe(dir, project, 'voice');
    assert.equal(result.captions[0].words, undefined);
    assert.ok(result.timing.limitations.length > 0);
  });
});

test('real whisper.cpp Maemuki tokens aggregate a zero-length subtoken without inventing an interval for a zero-length word', () => {
  // Excerpts of the actual multilingual-small CPU JSON run on Maemuki voice, 2026-09-30.
  const captions = [{ start: 4.8, end: 6.12, text: 'te sostienen,' }, { start: 9.57, end: 11.32, text: 'siempre hacia adelante.' }];
  const result = addWhisperWordTimings(captions, { transcription: [
    { text: ' te sostienen,', offsets: { from: 4800, to: 6120 }, tokens: [
      { text: ' te', offsets: { from: 4800, to: 5000 }, id: 535, p: .996744, t_dtw: -1 },
      { text: ' sost', offsets: { from: 5000, to: 5170 }, id: 41585, p: .993971, t_dtw: -1 },
      { text: 'ienen', offsets: { from: 6000, to: 6000 }, id: 22461, p: .993026, t_dtw: -1 },
      { text: ',', offsets: { from: 6040, to: 6120 }, id: 11, p: .974842, t_dtw: -1 },
    ] },
    { text: ' siempre hacia adelante.', offsets: { from: 9570, to: 11320 }, tokens: [
      { text: ' siempre', offsets: { from: 9570, to: 9800 }, id: 12758, p: .90838, t_dtw: -1 },
      { text: ' hacia', offsets: { from: 10600, to: 10600 }, id: 21365, p: .995864, t_dtw: -1 },
      { text: ' adelante', offsets: { from: 10700, to: 11320 }, id: 40214, p: .642208, t_dtw: -1 },
      { text: '.', offsets: { from: 11320, to: 11320 }, id: 13, p: .944454, t_dtw: -1 },
    ] },
  ] }, 12);
  assert.deepEqual(result.captions[0].words, [{ start: 4.8, end: 5, text: 'te' }, { start: 5, end: 6, text: 'sostienen,' }]);
  assert.equal(result.captions[1].words, undefined);
  assert.equal(result.timing.wordTiming, 'partial');
  assert.match(result.timing.limitations.join(' '), /Caption 2.*empty/i);
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
