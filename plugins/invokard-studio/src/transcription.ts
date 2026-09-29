import childProcess from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { doctorMedia, inspectMedia } from './media.js';
import { captionsSchema, parseSrt } from './project.js';
import type { Caption, Project } from './types.js';

export const dtwModels = ['tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en', 'medium', 'medium.en', 'large.v1', 'large.v2', 'large.v3', 'large.v3.turbo'] as const;
export interface TranscriptionOptions { engine?: 'auto' | 'faster-whisper' | 'whisper.cpp'; language?: string; prompt?: string; dtwModel?: typeof dtwModels[number]; signal?: AbortSignal; }
export interface TranscriptionTiming {
  basis: 'source_asset_seconds';
  engine: 'faster-whisper' | 'whisper.cpp';
  source: 'whisper.cpp-token-offsets' | 'faster-whisper-word-timestamps';
  method: 'heuristic-token-offsets' | 'cross-attention-dtw-silero-vad';
  wordTiming: 'complete' | 'partial' | 'unavailable';
  timedCaptions: number;
  totalCaptions: number;
  limitations: string[];
}
export interface TranscriptionResult { captions: Caption[]; srt: string; json?: string; timing: TranscriptionTiming; }
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const normalizedText = (text: string) => text.replace(/\s+/gu, ' ').trim();
const lexical = (text: string) => /[\p{L}\p{N}\p{M}]/u.test(text);

/** Presence of configuration only; intentionally does not launch a speech runtime. */
export function transcriptionStatus() {
  const faster = Boolean(process.env.FASTER_WHISPER_PYTHON_PATH && process.env.FASTER_WHISPER_MODEL_PATH);
  const cpp = Boolean(process.env.WHISPER_CPP_PATH && process.env.WHISPER_MODEL_PATH);
  return {
    configured: faster || cpp,
    preferredEngine: faster ? 'faster-whisper' as const : cpp ? 'whisper.cpp' as const : null,
    verified: false as const,
    backends: {
      'faster-whisper': { configured: faster, requiredEnv: ['FASTER_WHISPER_PYTHON_PATH', 'FASTER_WHISPER_MODEL_PATH'] },
      'whisper.cpp': { configured: cpp, requiredEnv: ['WHISPER_CPP_PATH', 'WHISPER_MODEL_PATH'] },
    },
    note: 'Configuration presence only; dependencies and model are verified when transcription runs.',
  };
}

function offsets(value: unknown): { start: number; end: number } | undefined {
  if (!object(value) || !object(value.offsets)) return;
  const { from, to } = value.offsets;
  if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)) return;
  return { start: from / 1000, end: to / 1000 };
}

function segmentWords(segment: unknown, caption: Caption, duration: number): NonNullable<Caption['words']> {
  if (!object(segment) || typeof segment.text !== 'string') throw new Error('Missing JSON segment text');
  const span = offsets(segment);
  if (!span || Math.abs(span.start - caption.start) > .001 || Math.abs(span.end - caption.end) > .001 || normalizedText(segment.text) !== normalizedText(caption.text)) throw new Error('JSON segment does not match the SRT phrase');
  if (!Array.isArray(segment.tokens) || !segment.tokens.length || segment.tokens.length > 10000) throw new Error('No supported token timing data');
  let text = '';
  const tokens: { text: string; from: number; to: number; timing?: { start: number; end: number } }[] = [];
  for (const token of segment.tokens) {
    if (!object(token) || typeof token.text !== 'string') throw new Error('Invalid token text');
    // whisper.cpp uses [_BEG_], [_TT_...] etc; other releases expose <|...|>.
    if (/^\s*(?:\[_[^\]]+\]|<\|[^|]+\|>)\s*$/u.test(token.text)) continue;
    const from = text.length; text += token.text;
    tokens.push({ text: token.text, from, to: text.length, timing: offsets(token) });
  }
  if (normalizedText(text) !== normalizedText(caption.text)) throw new Error('Tokens do not reconstruct the phrase text');
  const groups = [...text.matchAll(/\S+/gu)];
  if (!groups.length) throw new Error('No lexical words');
  const words: NonNullable<Caption['words']> = [];
  let previousEnd = caption.start;
  for (const group of groups) {
    const wordText = group[0], from = group.index!, to = from + wordText.length;
    if (!lexical(wordText)) throw new Error('Standalone punctuation has no spoken word interval');
    const parts = tokens.filter(token => token.from < to && token.to > from && lexical(token.text));
    if (!parts.length) throw new Error('Word has no lexical token timing');
    let start: number | undefined, end: number | undefined;
    for (const token of parts) {
      if (token.text.trim().split(/\s+/u).filter(lexical).length > 1) throw new Error('One token spans multiple words; independent times are unavailable');
      const timing = token.timing;
      if (!timing || timing.start < 0 || timing.end < timing.start || timing.start < caption.start - .001 || timing.end > caption.end + .001 || timing.end > duration + .001) throw new Error('Lexical token timing is missing, reversed or outside the phrase/source range');
      if (end !== undefined && timing.start < end - .001) throw new Error('Lexical token times overlap or run backwards');
      start ??= timing.start; end = timing.end;
    }
    if (end! <= start!) throw new Error('Word interval is empty; no independent duration is available');
    if (start! < previousEnd - .001) throw new Error('Word times overlap or run backwards');
    // Punctuation stays attached to the word but never extends spoken timing.
    words.push({ start: start!, end: end!, text: wordText }); previousEnd = end!;
  }
  return words;
}

/** Enrich phrases only from complete, matching, usable model token offsets. Never interpolate. */
export function addWhisperWordTimings(captions: Caption[], json: unknown, duration: number, unavailableReason?: string): { captions: Caption[]; timing: TranscriptionTiming } {
  const timing: TranscriptionTiming = { basis: 'source_asset_seconds', engine: 'whisper.cpp', source: 'whisper.cpp-token-offsets', method: 'heuristic-token-offsets', wordTiming: 'unavailable', timedCaptions: 0, totalCaptions: captions.length, limitations: ['whisper.cpp token offsets are heuristic estimates; enabling DTW does not replace them. Complete word coverage does not establish acoustic synchronization: listen and review before word highlighting.'] };
  const segments = object(json) && Array.isArray(json.transcription) ? json.transcription : undefined;
  if (unavailableReason || !segments || segments.length !== captions.length) {
    timing.limitations.push(unavailableReason || 'Whisper JSON segment count does not match the SRT; word timing is unavailable.');
    return { captions, timing };
  }
  const result = captions.map((caption, index) => {
    try { const words = segmentWords(segments[index], caption, duration); timing.timedCaptions++; return { ...caption, words }; }
    catch (error) { timing.limitations.push(`Caption ${index + 1}: ${error instanceof Error ? error.message : String(error)}. Phrase retained without word times.`); return caption; }
  });
  timing.wordTiming = timing.timedCaptions === captions.length && captions.length > 0 ? 'complete' : timing.timedCaptions > 0 ? 'partial' : 'unavailable';
  if (!captions.length) timing.limitations.push('No recognized speech; there are no word times.');
  return { captions: result, timing };
}

/** Preserve faster-whisper's native restored source times, without interpolation or clamping. */
export function parseFasterWhisper(json: unknown, duration: number): { captions: Caption[]; timing: TranscriptionTiming } {
  if (!object(json) || json.engine !== 'faster-whisper' || !Array.isArray(json.segments)) throw new Error('Invalid faster-whisper JSON: missing engine or segments');
  const segments = json.segments;
  const captions = captionsSchema.parse(segments.map(segment => {
    if (!object(segment) || typeof segment.text !== 'string') throw new Error('Invalid faster-whisper JSON segment');
    return { start: segment.start, end: segment.end, text: segment.text.trim() };
  })) as Caption[];
  if (captions.some(caption => caption.end > duration + .001)) throw new Error('faster-whisper phrase times exceed the source audio duration');
  const timing: TranscriptionTiming = { basis: 'source_asset_seconds', engine: 'faster-whisper', source: 'faster-whisper-word-timestamps', method: 'cross-attention-dtw-silero-vad', wordTiming: 'unavailable', timedCaptions: 0, totalCaptions: captions.length, limitations: ['Word times use cross-attention DTW, native postprocessing and Silero VAD. They are model estimates; review synchronization by listening before final export.'] };
  const result = captions.map((caption, index) => {
    try {
      const raw = (segments[index] as JsonObject).words;
      if (!Array.isArray(raw) || !raw.length || raw.length > 10000) throw new Error('Missing supported word timing data');
      let lastEnd = caption.start;
      const words = raw.map(word => {
        if (!object(word) || typeof word.word !== 'string' || !word.word.trim() || /\s/u.test(word.word.trim())) throw new Error('Invalid individual word text');
        const { start, end } = word;
        if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || start < lastEnd - .001 || end > caption.end + .001) throw new Error('Missing, overlapping or out-of-range word timing');
        lastEnd = end;
        return { start, end, text: word.word.trim() };
      });
      if (normalizedText(words.map(word => word.text).join(' ')) !== normalizedText(caption.text)) throw new Error('Word text does not reconstruct the phrase');
      timing.timedCaptions++; return { ...caption, words };
    } catch (error) {
      timing.limitations.push(`Caption ${index + 1}: ${error instanceof Error ? error.message : String(error)}. Phrase retained without word times.`);
      return caption;
    }
  });
  timing.wordTiming = timing.timedCaptions === captions.length && captions.length > 0 ? 'complete' : timing.timedCaptions > 0 ? 'partial' : 'unavailable';
  if (!captions.length) timing.limitations.push('No recognized speech; there are no word times.');
  return { captions: result, timing };
}

function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
const cancelled = () => Object.assign(new Error('Transcription cancelled'), { name: 'AbortError' });
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw cancelled(); }
function inside(root: string, file: string) { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); }

async function run(executable: string, args: string[], cwd: string, signal?: AbortSignal, timeout = 7_200_000): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', timedOut = false, settled = false;
    const kill = () => child.kill('SIGKILL');
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', kill); };
    signal?.addEventListener('abort', kill, { once: true }); if (signal?.aborted) kill();
    child.stderr?.on('data', data => { stderr = (stderr + data).slice(-8000); });
    child.once('error', error => { if (!settled) { settled = true; clean(); reject(new Error(`Cannot launch transcription dependency: ${error.message}`)); } });
    child.once('close', code => {
      if (settled) return; settled = true; clean();
      if (signal?.aborted) reject(cancelled());
      else if (timedOut) reject(new Error('Transcription process timed out'));
      else if (code !== 0) reject(new Error(`Transcription dependency failed (${code}): ${stderr.trim()}`));
      else resolve();
    });
  });
}

async function dependency(file: string, variable: string) {
  if (!path.isAbsolute(file) || /^https?:/i.test(file) || file.startsWith('\\\\') || file.startsWith('//')) throw new Error(`${variable} must point to an absolute local file path`);
  try { const canonical = await realpath(file); const info = await stat(canonical); if (!info.isFile() || info.size === 0) throw new Error('empty'); return canonical; }
  catch { throw new Error(`${variable} does not identify a readable, non-empty local file. Configure the optional transcription runtime and compatible model.`); }
}

async function modelDirectory(file: string) {
  if (!path.isAbsolute(file) || /^https?:/i.test(file) || file.startsWith('\\\\') || file.startsWith('//')) throw new Error('FASTER_WHISPER_MODEL_PATH must identify an absolute local model directory; model names and URLs cannot trigger downloads');
  try {
    const canonical = await realpath(file);
    if (!(await stat(canonical)).isDirectory()) throw new Error('not a directory');
    await Promise.all(['model.bin', 'config.json', 'tokenizer.json'].map(name => dependency(path.join(canonical, name), `FASTER_WHISPER_MODEL_PATH/${name}`)));
    return canonical;
  } catch { throw new Error('FASTER_WHISPER_MODEL_PATH must identify a readable local CTranslate2 model directory containing model.bin, config.json and tokenizer.json'); }
}

/** Transcribe the complete source asset. Times are relative to that asset, not a trimmed scene. */
export async function transcribe(projectDir: string, project: Project, assetId: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
  checkAbort(options.signal);
  if (options.engine !== undefined && !['auto', 'faster-whisper', 'whisper.cpp'].includes(options.engine)) throw new Error('Transcription engine must be auto, faster-whisper, or whisper.cpp');
  const engine = options.engine && options.engine !== 'auto' ? options.engine : transcriptionStatus().preferredEngine || 'whisper.cpp';
  const language = options.language || 'auto';
  if (!/^(?:auto|[a-z]{2,3})$/.test(language)) throw new Error('Transcription language must be a lowercase language code such as es, en, or auto');
  if (options.dtwModel !== undefined && !dtwModels.includes(options.dtwModel)) throw new Error('DTW alignment must use a supported whisper.cpp model preset matching the installed model');
  if (options.prompt !== undefined && (typeof options.prompt !== 'string' || options.prompt.length > 2000 || options.prompt.includes('\0'))) throw new Error('Transcription prompt context must be text of at most 2000 characters without NUL');
  const prompt = options.prompt?.replace(/\s+/gu, ' ').trim();
  const root = await realpath(projectDir), asset = project.assets.find(item => item.id === assetId);
  if (!asset || !['audio', 'video'].includes(asset.kind)) throw new Error('Transcription requires an imported audio or video asset');
  if (!asset.path || asset.path.includes('\0') || asset.path.includes(':') || path.isAbsolute(asset.path) || path.win32.isAbsolute(asset.path) || asset.path.split(/[\\/]/).includes('..')) throw new Error('Asset path must be local, relative and inside the project; URLs are not allowed');
  const input = await realpath(path.resolve(root, asset.path));
  if (!inside(root, input)) throw new Error('Asset path resolves outside the project');
  let executable: string, model: string;
  if (engine === 'faster-whisper') {
    if (!process.env.FASTER_WHISPER_PYTHON_PATH || !process.env.FASTER_WHISPER_MODEL_PATH) throw new Error('Local faster-whisper is not configured. Set FASTER_WHISPER_PYTHON_PATH to a Python environment with the pinned transcription requirements and FASTER_WHISPER_MODEL_PATH to an already downloaded local CTranslate2 model directory.');
    [executable, model] = await Promise.all([dependency(process.env.FASTER_WHISPER_PYTHON_PATH, 'FASTER_WHISPER_PYTHON_PATH'), modelDirectory(process.env.FASTER_WHISPER_MODEL_PATH)]);
  } else {
    if (!process.env.WHISPER_CPP_PATH || !process.env.WHISPER_MODEL_PATH) throw new Error('Optional local transcription is not configured. Set FASTER_WHISPER_PYTHON_PATH and FASTER_WHISPER_MODEL_PATH for faster-whisper, or WHISPER_CPP_PATH and WHISPER_MODEL_PATH for whisper.cpp.');
    [executable, model] = await Promise.all([dependency(process.env.WHISPER_CPP_PATH, 'WHISPER_CPP_PATH'), dependency(process.env.WHISPER_MODEL_PATH, 'WHISPER_MODEL_PATH')]);
  }
  const info = await inspectMedia(input) as { streams: { codec_type?: string }[]; format: { duration?: string } };
  if (!info.streams.some(stream => stream.codec_type === 'audio')) throw new Error('Selected asset contains no audio stream to transcribe');
  const duration = Number(info.format.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Transcription requires an audio duration between zero and two hours');
  const media = await doctorMedia() as { ffmpeg: { available: boolean; path?: string; error?: string }; ffprobe: { available: boolean; path?: string; error?: string } };
  if (!media.ffmpeg.available || !media.ffmpeg.path || !media.ffprobe.available || !media.ffprobe.path) throw new Error(media.ffmpeg.error || media.ffprobe.error || 'FFmpeg and ffprobe are required for audio decoding and transcription');
  checkAbort(options.signal);
  const exportsRoot = path.join(root, 'exports'); await mkdir(exportsRoot, { recursive: true });
  if (!inside(root, await realpath(exportsRoot))) throw new Error('Exports path resolves outside the project');
  const staging = await mkdtemp(path.join(exportsRoot, '.transcription-'));
  const final = path.join(exportsRoot, `transcription-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  try {
    await run(media.ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,wav,mp3,aac,ogg,flac', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', 'audio.wav'], staging, options.signal, 600000);
    if (engine === 'faster-whisper') {
      const runner = fileURLToPath(new URL('../runtime/faster-whisper.py', import.meta.url));
      await writeFile(path.join(staging, 'request.json'), JSON.stringify({ input: 'audio.wav', output: 'transcript.json', model, language, prompt: prompt || null }), 'utf8');
      await run(executable, [runner, '--config', 'request.json'], staging, options.signal);
      const jsonPath = path.join(staging, 'transcript.json');
      if ((await stat(jsonPath)).size > 30_000_000) throw new Error('faster-whisper JSON output exceeds the supported size');
      let json: unknown;
      try { json = JSON.parse(await readFile(jsonPath, 'utf8')); } catch { throw new Error('Invalid JSON returned by faster-whisper'); }
      const result = parseFasterWhisper(json, duration);
      await writeFile(path.join(staging, 'transcript.srt'), result.captions.map((caption, index) => `${index + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.text}\n`).join('\n'), 'utf8');
      checkAbort(options.signal);
      await unlink(path.join(staging, 'audio.wav')); await unlink(path.join(staging, 'request.json'));
      await rename(staging, final);
      return { ...result, srt: path.join(final, 'transcript.srt'), json: path.join(final, 'transcript.json') };
    }
    let modelArgument = model;
    // The official Windows CLI currently misdecodes non-ASCII argv paths.
    // Node sets the Unicode cwd correctly; a relative ASCII model name avoids it.
    if (process.platform === 'win32') {
      const localModel = path.join(staging, 'model.bin');
      try { await link(model, localModel); }
      catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
        await copyFile(model, localModel, constants.COPYFILE_EXCL);
      }
      modelArgument = 'model.bin';
      checkAbort(options.signal);
    }
    // These are whisper.cpp whisper-cli flags, not the unrelated Python whisper CLI.
    const args = ['-m', modelArgument, '-f', 'audio.wav', '-l', language, '-osrt', '-ojf', '-ml', '60', '-sow', '-of', 'transcript'];
    if (options.dtwModel) args.push('-dtw', options.dtwModel, '-nfa');
    if (prompt) args.push('--prompt', prompt);
    // The CLI's @response-file reader accepts UTF-8 independently of Windows argv's code page.
    const responseFile = process.platform === 'win32' && args.some(arg => /[^\x00-\x7f]/u.test(arg));
    if (responseFile) await writeFile(path.join(staging, 'arguments.txt'), args.join('\n') + '\n', 'utf8');
    await run(executable, responseFile ? ['@arguments.txt'] : args, staging, options.signal);
    const srtPath = path.join(staging, 'transcript.srt');
    if ((await stat(srtPath)).size > 10_000_000) throw new Error('Transcription SRT output exceeds the supported size');
    const contents = await readFile(srtPath, 'utf8');
    let captions: Caption[];
    try { captions = parseSrt(contents); } catch (error) { throw new Error(`Invalid SRT returned by whisper.cpp: ${error instanceof Error ? error.message : String(error)}`); }
    if (captions.some(caption => caption.end > duration + 0.25)) throw new Error('Transcription caption times exceed the source audio duration');
    const jsonPath = path.join(staging, 'transcript.json');
    let json: unknown, jsonExists = false, unavailableReason: string | undefined;
    try {
      const jsonInfo = await stat(jsonPath); jsonExists = true;
      if (jsonInfo.size > 30_000_000) unavailableReason = 'Whisper JSON exceeds 30 MB; word timing is unavailable.';
      else {
        try { json = JSON.parse(await readFile(jsonPath, 'utf8')); }
        catch { unavailableReason = 'Whisper JSON is malformed or unreadable; word timing is unavailable.'; }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      unavailableReason = 'Whisper JSON was not produced; use a whisper.cpp version supporting -ojf. Word timing is unavailable.';
    }
    const enriched = addWhisperWordTimings(captions, json, duration, unavailableReason);
    checkAbort(options.signal); await unlink(path.join(staging, 'audio.wav'));
    if (modelArgument === 'model.bin') await unlink(path.join(staging, 'model.bin'));
    if (responseFile) await unlink(path.join(staging, 'arguments.txt'));
    await rename(staging, final);
    return { ...enriched, srt: path.join(final, 'transcript.srt'), ...(jsonExists ? { json: path.join(final, 'transcript.json') } : {}) };
  } catch (error) { await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}
