import childProcess from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { doctorMedia, inspectMedia } from './media.js';
import { parseSrt } from './project.js';
import type { Caption, Project } from './types.js';

export interface TranscriptionOptions { language?: string; signal?: AbortSignal; }
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
  catch { throw new Error(`${variable} does not identify a readable, non-empty file. Install whisper.cpp and its compatible GGML model, then configure the optional transcription dependencies.`); }
}

/** Transcribe the complete source asset. Times are relative to that asset, not a trimmed scene. */
export async function transcribe(projectDir: string, project: Project, assetId: string, options: TranscriptionOptions = {}): Promise<{ captions: Caption[]; srt: string }> {
  checkAbort(options.signal);
  const language = options.language || 'auto';
  if (!/^(?:auto|[a-z]{2,3})$/.test(language)) throw new Error('Transcription language must be a lowercase language code such as es, en, or auto');
  const root = await realpath(projectDir), asset = project.assets.find(item => item.id === assetId);
  if (!asset || !['audio', 'video'].includes(asset.kind)) throw new Error('Transcription requires an imported audio or video asset');
  if (!asset.path || asset.path.includes('\0') || asset.path.includes(':') || path.isAbsolute(asset.path) || path.win32.isAbsolute(asset.path) || asset.path.split(/[\\/]/).includes('..')) throw new Error('Asset path must be local, relative and inside the project; URLs are not allowed');
  const input = await realpath(path.resolve(root, asset.path));
  if (!inside(root, input)) throw new Error('Asset path resolves outside the project');
  if (!process.env.WHISPER_CPP_PATH || !process.env.WHISPER_MODEL_PATH) throw new Error('Optional local transcription is not configured. Install whisper.cpp, download a compatible GGML speech model, then set WHISPER_CPP_PATH to whisper-cli and WHISPER_MODEL_PATH to the model file.');
  const [executable, model] = await Promise.all([dependency(process.env.WHISPER_CPP_PATH, 'WHISPER_CPP_PATH'), dependency(process.env.WHISPER_MODEL_PATH, 'WHISPER_MODEL_PATH')]);
  const info = await inspectMedia(input) as { streams: { codec_type?: string }[]; format: { duration?: string } };
  if (!info.streams.some(stream => stream.codec_type === 'audio')) throw new Error('Selected asset contains no audio stream to transcribe');
  const duration = Number(info.format.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Transcription requires an audio duration between zero and two hours');
  const media = await doctorMedia() as { ready: boolean; ffmpeg: { path?: string; error?: string } };
  if (!media.ready || !media.ffmpeg.path) throw new Error(media.ffmpeg.error || 'FFmpeg and ffprobe are required for transcription');
  checkAbort(options.signal);
  const exportsRoot = path.join(root, 'exports'); await mkdir(exportsRoot, { recursive: true });
  if (!inside(root, await realpath(exportsRoot))) throw new Error('Exports path resolves outside the project');
  const staging = await mkdtemp(path.join(exportsRoot, '.transcription-'));
  const final = path.join(exportsRoot, `transcription-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  try {
    await run(media.ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,wav,mp3,aac,ogg,flac', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', 'audio.wav'], staging, options.signal, 600000);
    // These are whisper.cpp whisper-cli flags, not the unrelated Python whisper CLI.
    await run(executable, ['-m', model, '-f', 'audio.wav', '-l', language, '-osrt', '-of', 'transcript'], staging, options.signal);
    const srtPath = path.join(staging, 'transcript.srt');
    if ((await stat(srtPath)).size > 10_000_000) throw new Error('Transcription SRT output exceeds the supported size');
    const contents = await readFile(srtPath, 'utf8');
    let captions: Caption[];
    try { captions = parseSrt(contents); } catch (error) { throw new Error(`Invalid SRT returned by whisper.cpp: ${error instanceof Error ? error.message : String(error)}`); }
    if (captions.some(caption => caption.end > duration + 0.25)) throw new Error('Transcription caption times exceed the source audio duration');
    checkAbort(options.signal); await unlink(path.join(staging, 'audio.wav')); await rename(staging, final);
    return { captions, srt: path.join(final, 'transcript.srt') };
  } catch (error) { await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}
