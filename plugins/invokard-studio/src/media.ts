import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, open, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Asset, CarouselSlide, Project, RenderOptions, RenderResult } from './types.js';
import { buildCaptionTrack } from './captions.js';

interface Probe { streams: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>; format: { duration?: string; format_name?: string }; }
interface ToolStatus { available: boolean; path?: string; version?: string; error?: string; }
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.heic', '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.opus']);
// Excludes playlist, concat, image sequence, and network demuxers, even when a file is renamed.
const demuxers = 'mov,matroska,webm,avi,wav,mp3,aac,ogg,flac,png_pipe,jpeg_pipe,webp_pipe,gif,bmp_pipe,tiff_pipe';
const inputSafety = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', demuxers];
const abortError = () => Object.assign(new Error('Media render cancelled'), { name: 'AbortError' });
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }

async function execute(executable: string, args: string[], options: { cwd?: string; signal?: AbortSignal; timeout?: number } = {}): Promise<string> {
  checkAbort(options.signal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false, timedOut = false;
    const cancel = () => child.kill('SIGKILL');
    const timer = options.timeout ? setTimeout(() => { timedOut = true; cancel(); }, options.timeout) : undefined;
    const cleanup = () => { if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-8_000_000); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-12000); });
    child.once('error', error => { if (!settled) { settled = true; cleanup(); reject(error); } });
    child.once('close', code => {
      if (settled) return; settled = true; cleanup();
      if (options.signal?.aborted) reject(abortError());
      else if (timedOut) reject(new Error('Media process timed out'));
      else if (code !== 0) reject(new Error(`Invalid media or media processing failed (${code}): ${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}

async function findTool(name: 'ffmpeg' | 'ffprobe'): Promise<ToolStatus> {
  const explicit = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  const candidates = explicit ? [explicit] : [];
  if (!explicit) {
    for (const source of [path.join(process.env.INVOKARD_TOOLS_DIR || path.join(homedir(), '.invokard-studio', 'tools'), 'package.json'), import.meta.url]) {
      try {
        const require = createRequire(source);
        const loaded = require(name === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static');
        const candidate = name === 'ffmpeg' ? loaded : loaded.path;
        if (typeof candidate === 'string') candidates.push(candidate);
      } catch { /* Optional locally installed tools. */ }
    }
  }
  if (!explicit) candidates.push(name);
  for (const candidate of [...new Set(candidates)]) {
    try {
      const output = await execute(candidate, ['-version'], { timeout: 10000 });
      return { available: true, path: candidate, version: output.split(/\r?\n/)[0] };
    } catch { /* Try the next installed candidate without exposing environment secrets. */ }
  }
  return { available: false, error: `${name} is unavailable. Run the plugin tools installer or set ${name.toUpperCase()}_PATH to its executable.` };
}

export async function doctorMedia(): Promise<object> {
  const [ffmpeg, ffprobe] = await Promise.all([findTool('ffmpeg'), findTool('ffprobe')]);
  const captions = await captionCapability(ffmpeg.path);
  return { ready: ffmpeg.available && ffprobe.available && captions.available, ffmpeg, ffprobe, captions };
}
async function captionCapability(executable?: string) {
  let available = false;
  if (executable) try { available = /\bass\s+V->V\b/.test(await execute(executable, ['-hide_banner', '-filters'], { timeout: 10000 })); } catch { /* Report a useful dependency error below. */ }
  return { available, renderer: 'libass', ...(available ? {} : { error: 'Styled captions require the FFmpeg ass/libass filter. Run the plugin scripts/setup.mjs --install-tools command, or select a full FFmpeg build with libass using FFMPEG_PATH.' }) };
}
async function requireTool(name: 'ffmpeg' | 'ffprobe') {
  const found = await findTool(name); if (!found.path) throw new Error(found.error); return found.path;
}

function localPath(file: string) {
  if (!file || file.includes('\0') || /^[a-z][a-z\d+.-]*:\/\//i.test(file) || /^(?:https?|ftp|file|concat|pipe|data|crypto|subfile):/i.test(file) || file.startsWith('\\\\') || file.startsWith('//')) throw new Error('Media must be a local file path; URLs and network paths are not allowed');
  if (!allowedExtensions.has(path.extname(file).toLowerCase())) throw new Error('Unsupported media format; playlists and executable inputs are not allowed');
}
async function safeFile(file: string) {
  localPath(file);
  const canonical = await realpath(file);
  const details = await stat(canonical);
  if (!details.isFile() || details.size === 0) throw new Error('Invalid media: expected a non-empty regular file');
  const handle = await open(canonical, 'r');
  try {
    const prefix = Buffer.alloc(1024); const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    const text = prefix.subarray(0, bytesRead).toString('utf8').trimStart();
    if (/^(?:#EXTM3U|ffconcat|<\?xml|<MPD|\[playlist\])/i.test(text)) throw new Error('Unsupported media playlist or manifest');
  } finally { await handle.close(); }
  return canonical;
}
async function probe(file: string, executable: string, signal?: AbortSignal): Promise<Probe> {
  const canonical = await safeFile(file);
  const output = await execute(executable, ['-v', 'error', ...inputSafety, '-show_streams', '-show_format', '-of', 'json', canonical], { signal, timeout: 60000 });
  const parsed = JSON.parse(output) as Probe;
  if (!parsed.streams?.length) throw new Error('Invalid media: no streams found');
  return parsed;
}
export async function inspectMedia(file: string): Promise<object> {
  await safeFile(file); return probe(file, await requireTool('ffprobe'));
}

function inside(root: string, file: string) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function assetFile(root: string, relative: string) {
  localPath(relative);
  if (path.isAbsolute(relative) || path.win32.isAbsolute(relative) || !inside(root, path.resolve(root, relative))) throw new Error('Asset path must be relative and contained inside the project');
  const canonical = await safeFile(path.resolve(root, relative));
  if (!inside(root, canonical)) throw new Error('Asset path resolves outside the project');
  return canonical;
}
function color(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Colors must use #RRGGBB');
  return `0x${value.slice(1)}`;
}
function validateProject(project: Project, timeline: boolean) {
  const { width, height, fps } = project.format;
  if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0) || !Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('Invalid media dimensions or frame rate');
  color(project.brand.background); color(project.brand.color); color(project.brand.accent);
  for (const asset of project.assets) {
    localPath(asset.path);
    if (path.isAbsolute(asset.path) || path.win32.isAbsolute(asset.path) || asset.path.split(/[\\/]/).includes('..')) throw new Error('Asset path must be relative and contained inside the project');
  }
  if (new Set(project.assets.map(a => a.id)).size !== project.assets.length) throw new Error('Duplicate asset ID');
  if (!timeline) return;
  if (!project.scenes.length || project.scenes.length > 200) throw new Error('A video needs between 1 and 200 scenes');
  for (const scene of project.scenes) {
    if (!Number.isFinite(scene.duration) || scene.duration < 1 / fps || scene.duration > 600 || !Number.isFinite(scene.trimStart ?? 0) || (scene.trimStart ?? 0) < 0) throw new Error('Invalid scene duration or trim');
    if (!Number.isFinite(scene.audioVolume ?? 1) || (scene.audioVolume ?? 1) < 0 || (scene.audioVolume ?? 1) > 4) throw new Error('Scene audio volume must be between 0 and 4');
    if (scene.background) color(scene.background);
  }
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (duration > 3600) throw new Error('Video timeline must be at most one hour');
  if (project.captions.length > 500) throw new Error('At most 500 caption segments are supported');
  for (const caption of project.captions) if (!Number.isFinite(caption.start) || !Number.isFinite(caption.end) || caption.start < 0 || caption.end <= caption.start || caption.end > duration + 0.001) throw new Error('Caption times must fit inside the video timeline');
  for (const value of [project.audio.musicVolume, project.audio.voiceVolume]) if (!Number.isFinite(value) || value < 0 || value > 4) throw new Error('Audio volume must be between 0 and 4');
}

async function resolveAssets(root: string, project: Project, ids: string[], ffprobe: string, signal?: AbortSignal) {
  const result = new Map<string, { asset: Asset; file: string; info: Probe }>();
  for (const id of new Set(ids)) {
    checkAbort(signal);
    const asset = project.assets.find(item => item.id === id);
    if (!asset) throw new Error(`Unknown media asset: ${id}`);
    const file = await assetFile(root, asset.path); const info = await probe(file, ffprobe, signal);
    const neededStream = asset.kind === 'audio' ? 'audio' : 'video';
    if (!info.streams.some(stream => stream.codec_type === neededStream)) throw new Error(`Asset ${id} has no ${neededStream} stream`);
    result.set(id, { asset, file, info });
  }
  return result;
}
async function prepareExport(root: string) {
  const exportsRoot = path.join(root, 'exports'); await mkdir(exportsRoot, { recursive: true });
  if (!inside(root, await realpath(exportsRoot))) throw new Error('Exports path resolves outside the project');
  const staging = await mkdtemp(path.join(exportsRoot, '.render-'));
  const final = path.join(exportsRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(path.join(staging, 'work'));
  return { staging, final, work: path.join(staging, 'work') };
}
async function prepareFont(root: string, work: string, project: Project): Promise<string> {
  const candidates: string[] = [];
  if (project.brand.fontFile) {
    const requested = project.brand.fontFile;
    if (path.isAbsolute(requested) || path.win32.isAbsolute(requested) || !inside(root, path.resolve(root, requested))) throw new Error('Font path must be relative and contained in the project');
    const canonical = await realpath(path.resolve(root, requested));
    if (!inside(root, canonical) || !/\.(ttf|otf|ttc)$/i.test(canonical)) throw new Error('Font must be a local TTF, OTF or TTC inside the project');
    candidates.push(canonical);
  } else {
    const family = project.brand.fontFamily.toLowerCase();
    const windowsFont = family.includes('georgia') ? 'georgia.ttf' : family.includes('times') ? 'times.ttf' : family.includes('verdana') ? 'verdana.ttf' : 'arial.ttf';
    candidates.push(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', windowsFont), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf');
  }
  for (const candidate of candidates) {
    try { await access(candidate); await copyFile(candidate, path.join(work, 'font.ttf')); return 'fontfile=font.ttf'; } catch { /* Next platform font. */ }
  }
  if (project.brand.fontFile) throw new Error('Cannot read the selected font file');
  return 'font=Sans';
}
function wrapped(text: string, columns: number) {
  // Text stays in UTF-8 files: drawtext never interprets apostrophes, percent escapes or filter syntax.
  return text.replace(/\r/g, '').split('\n').flatMap(paragraph => {
    const result: string[] = []; let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && [...line, ...word].length + 1 > columns) { result.push(line); line = ''; }
      let rest = [...word];
      while (rest.length > columns) { if (line) { result.push(line); line = ''; } result.push(rest.slice(0, columns).join('')); rest = rest.slice(columns); }
      line += (line ? ' ' : '') + rest.join('');
    }
    result.push(line); return result;
  }).join('\n');
}
async function textFilter(work: string, name: string, content: string, config: { font: string; size: number; color: string; x: string; y: string; width: number; box?: boolean; enable?: string }) {
  await writeFile(path.join(work, `${name}.txt`), wrapped(content, Math.max(8, Math.floor(config.width / (config.size * 0.59)))), 'utf8');
  const pieces = [`drawtext=${config.font}`, `textfile=${name}.txt`, 'expansion=none', `fontsize=${config.size}`, `fontcolor=${color(config.color)}`, `line_spacing=${Math.round(config.size * 0.25)}`, `x=${config.x}`, `y=${config.y}`];
  if (config.box) pieces.push('box=1', 'boxcolor=black@0.6', `boxborderw=${Math.round(config.size * 0.35)}`);
  if (config.enable) pieces.push(`enable='${config.enable}'`);
  return pieces.join(':');
}
function srtTime(time: number) { const ms = Math.round(time * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; }
function html(text: string) { return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
async function writeCopy(directory: string, project: Project) { await writeFile(path.join(directory, 'caption.md'), [project.copy.caption, project.copy.hashtags.join(' ')].filter(Boolean).join('\n\n') + '\n', 'utf8'); }
async function preview(directory: string, project: Project, images?: Array<{ file: string; title: string }>) {
  const body = images ? images.map((item, i) => `<figure><img src="${html(item.file)}" alt="${html(item.title)}"><figcaption>${i + 1}. ${html(item.title)}</figcaption></figure>`).join('') : '<video controls playsinline preload="metadata" poster="cover.png" src="reel.mp4"></video>';
  await writeFile(path.join(directory, 'preview.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(project.title)}</title><style>body{margin:0;background:#10131a;color:#f5f5f5;font:16px system-ui,sans-serif;padding:clamp(20px,5vw,64px)}main{max-width:1100px;margin:auto}header{border-bottom:1px solid #ffffff22;margin-bottom:32px}h1{font-size:clamp(28px,5vw,52px);letter-spacing:-.04em}small{letter-spacing:.2em;color:#c2b18b}section{display:flex;gap:24px;overflow:auto;align-items:start}video{max-height:75vh;max-width:100%;border-radius:18px}figure{margin:0;min-width:min(80vw,360px)}img{width:100%;border-radius:16px}figcaption{padding:16px 0;color:#bbb}pre{white-space:pre-wrap;line-height:1.65;color:#ddd}a{color:#ddbb77}</style><main><header><small>INVOKARD STUDIO</small><h1>${html(project.title)}</h1></header><section>${body}</section><h2>Caption</h2><pre>${html(project.copy.caption)}\n\n${html(project.copy.hashtags.join(' '))}</pre><a href="caption.md" download>Download caption</a></main></html>`, 'utf8');
}
async function ffmpeg(executable: string, args: string[], cwd: string, signal?: AbortSignal) { await execute(executable, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { cwd, signal }); }
function frameFit(project: Project) { return `scale=${project.format.width}:${project.format.height}:force_original_aspect_ratio=increase,crop=${project.format.width}:${project.format.height},setsar=1,fps=${project.format.fps}`; }

export async function renderVideo(projectDir: string, project: Project, options: RenderOptions = {}): Promise<RenderResult> {
  checkAbort(options.signal); validateProject(project, true);
  const captionTrack = buildCaptionTrack(project);
  const root = await realpath(projectDir); const probePath = await requireTool('ffprobe');
  const needed = [...project.scenes.map(s => s.assetId), project.audio.voiceAssetId, project.audio.musicAssetId].filter((id): id is string => Boolean(id));
  const assets = await resolveAssets(root, project, needed, probePath, options.signal);
  for (const scene of project.scenes) {
    const media = scene.assetId ? assets.get(scene.assetId)! : undefined;
    if (media?.asset.kind === 'audio') throw new Error('Scene asset must be image or video');
    if (media?.asset.kind === 'video') {
      const duration = Number(media.info.streams.find(s => s.codec_type === 'video')?.duration || media.info.format.duration);
      if (!Number.isFinite(duration) || duration + 0.01 < (scene.trimStart ?? 0) + scene.duration) throw new Error(`Video asset ${media.asset.id} is too short for the requested trim and duration`);
    }
  }
  for (const id of [project.audio.voiceAssetId, project.audio.musicAssetId]) if (id && !assets.get(id)!.info.streams.some(s => s.codec_type === 'audio')) throw new Error(`Audio asset ${id} has no audio stream`);
  const executable = await requireTool('ffmpeg'); checkAbort(options.signal);
  if (project.captions.length) { const captions = await captionCapability(executable); if (!captions.available) throw new Error(captions.error); }
  const output = await prepareExport(root);
  try {
    const font = await prepareFont(root, output.work, project);
    const { width, height, fps } = project.format;
    let cumulativeSeconds = 0, previousEndFrame = 0;
    const sceneFrames = project.scenes.map(scene => {
      cumulativeSeconds += scene.duration;
      const endFrame = Math.round(cumulativeSeconds * fps), frames = endFrame - previousEndFrame;
      previousEndFrame = endFrame; return frames;
    });
    const duration = previousEndFrame / fps;
    const clips: string[] = [];
    for (let i = 0; i < project.scenes.length; i++) {
      checkAbort(options.signal); options.onProgress?.(`Rendering scene ${i + 1} of ${project.scenes.length}`);
      const scene = project.scenes[i], frames = sceneFrames[i];
      const media = scene.assetId ? assets.get(scene.assetId)! : undefined;
      const inputs = media ? [...inputSafety, ...(media.asset.kind === 'image' ? ['-loop', '1', '-framerate', String(fps)] : ['-ss', String(scene.trimStart ?? 0)]), '-i', media.file] : ['-f', 'lavfi', '-i', `color=c=${color(scene.background || project.brand.background)}:s=${width}x${height}:r=${fps}`];
      const filters = [frameFit(project)];
      if (media?.asset.kind === 'video') filters.push(`tpad=stop_mode=clone:stop_duration=${1 / fps}`);
      if (media?.asset.kind === 'image' && scene.motion === 'zoom') filters.push(`zoompan=z='min(1.08,1+on*0.08/${Math.max(frames - 1, 1)})':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=${fps}`);
      if (scene.text) filters.push(await textFilter(output.work, `scene-${i}`, scene.text, { font, size: Math.round(width * 0.072), color: project.brand.color, x: '(w-text_w)/2', y: '(h-text_h)/2', width: width * 0.82, box: true }));
      const clip = `scene-${String(i).padStart(4, '0')}.mp4`; clips.push(clip);
      await ffmpeg(executable, [...inputs, '-vf', filters.join(','), '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', clip], output.work, options.signal);
    }
    await writeFile(path.join(output.work, 'scenes.txt'), clips.map(clip => `file '${clip}'`).join('\n') + '\n');
    await ffmpeg(executable, ['-f', 'concat', '-safe', '1', '-i', 'scenes.txt', '-c', 'copy', 'timeline.mp4'], output.work, options.signal);
    const inputs = ['-i', 'timeline.mp4']; const audioFilters: string[] = [], audioLabels: string[] = [];
    let nextInputIndex = 1, sceneStartFrame = 0;
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i], media = scene.assetId ? assets.get(scene.assetId) : undefined;
      const sceneDuration = sceneFrames[i] / fps, volume = scene.audioVolume ?? 1;
      if (media?.asset.kind === 'video' && volume > 0 && media.info.streams.some(stream => stream.codec_type === 'audio')) {
        const index = nextInputIndex++;
        // Relative, previously confined input paths keep long Windows project roots out of argv.
        inputs.push(...inputSafety, '-ss', String(scene.trimStart ?? 0), '-t', String(sceneDuration), '-i', path.relative(output.work, media.file));
        const delaySamples = Math.round(sceneStartFrame * 48000 / fps);
        audioFilters.push(`[${index}:a:0]aresample=48000,atrim=duration=${sceneDuration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delaySamples}S:all=1,asetpts=N/SR/TB,apad,atrim=duration=${duration}[a${index}]`);
        audioLabels.push(`[a${index}]`);
      }
      sceneStartFrame += sceneFrames[i];
    }
    for (const [id, volume, loop] of [[project.audio.voiceAssetId, project.audio.voiceVolume, false], [project.audio.musicAssetId, project.audio.musicVolume, true]] as const) {
      if (!id) continue;
      const index = nextInputIndex++;
      inputs.push(...inputSafety, ...(loop ? ['-stream_loop', '-1'] : []), '-i', path.relative(output.work, assets.get(id)!.file));
      audioFilters.push(`[${index}:a]aresample=48000,volume=${volume},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`); audioLabels.push(`[a${index}]`);
    }
    await writeFile(path.join(output.staging, 'captions.ass'), captionTrack.ass, 'utf8');
    // Fixed relative filenames avoid filtergraph escaping and Windows command-line limits.
    const encode = ['-map', '0:v:0', ...(project.captions.length ? ['-vf', 'ass=filename=../captions.ass:fontsdir=.', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'])];
    if (audioLabels.length) {
      audioFilters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=false[audio]`);
      await writeFile(path.join(output.work, 'audio.ffgraph'), audioFilters.join(';'));
      encode.push('-filter_complex_script', 'audio.ffgraph', '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k');
    } else encode.push('-an');
    options.onProgress?.('Combining audio, subtitles and video');
    await ffmpeg(executable, [...inputs, ...encode, '-t', String(duration), '-movflags', '+faststart', '../reel.mp4'], output.work, options.signal);
    await ffmpeg(executable, ['-i', '../reel.mp4', '-frames:v', '1', '-update', '1', '../cover.png'], output.work, options.signal);
    await writeFile(path.join(output.staging, 'captions.srt'), project.captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.replace(/\r/g, '')}\n`).join('\n'), 'utf8');
    await writeCopy(output.staging, project);
    if (options.preview !== false) await preview(output.staging, project);
    checkAbort(options.signal); await rm(output.work, { recursive: true, force: true }); await rename(output.staging, output.final);
    return { video: path.join(output.final, 'reel.mp4'), subtitles: path.join(output.final, 'captions.srt'), styledSubtitles: path.join(output.final, 'captions.ass'), captionTiming: captionTrack.captionTiming, poster: path.join(output.final, 'cover.png'), copy: path.join(output.final, 'caption.md') };
  } catch (error) { await rm(output.staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}

export async function renderCarousel(projectDir: string, project: Project, slides: CarouselSlide[], options: RenderOptions = {}): Promise<{ images: string[]; preview: string }> {
  checkAbort(options.signal); validateProject(project, false);
  if (!slides.length || slides.length > 20) throw new Error('A carousel needs between 1 and 20 slides');
  for (const slide of slides) { if (!slide.title.trim()) throw new Error('Every slide requires a title'); if (slide.background) color(slide.background); }
  const root = await realpath(projectDir); const probePath = await requireTool('ffprobe');
  const assets = await resolveAssets(root, project, slides.map(s => s.assetId).filter((id): id is string => Boolean(id)), probePath, options.signal);
  for (const item of assets.values()) if (item.asset.kind !== 'image') throw new Error('Carousel assets must be images');
  const executable = await requireTool('ffmpeg'); checkAbort(options.signal); const output = await prepareExport(root);
  try {
    const font = await prepareFont(root, output.work, project);
    const { width, height } = project.format; const margin = Math.round(width * 0.09); const images: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      checkAbort(options.signal); options.onProgress?.(`Rendering slide ${i + 1} of ${slides.length}`);
      const slide = slides[i], media = slide.assetId ? assets.get(slide.assetId)! : undefined;
      const inputs = media ? [...inputSafety, '-i', media.file] : ['-f', 'lavfi', '-i', `color=c=${color(slide.background || project.brand.background)}:s=${width}x${height}`];
      const filters = [frameFit(project)];
      if (media) filters.push('drawbox=x=0:y=0:w=iw:h=ih:color=black@0.62:t=fill');
      filters.push(`drawbox=x=${margin}:y=${Math.round(height * 0.10)}:w=${Math.round(width * 0.15)}:h=${Math.max(3, Math.round(height * 0.006))}:color=${color(project.brand.accent)}:t=fill`);
      filters.push(await textFilter(output.work, `title-${i}`, slide.title, { font, size: Math.round(width * 0.09), color: project.brand.color, x: String(margin), y: 'h*0.20', width: width * 0.8 }));
      if (slide.body) filters.push(await textFilter(output.work, `body-${i}`, slide.body, { font, size: Math.round(width * 0.047), color: project.brand.color, x: String(margin), y: 'h*0.52', width: width * 0.8 }));
      filters.push(await textFilter(output.work, `footer-${i}`, `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`, { font, size: Math.round(width * 0.03), color: project.brand.accent, x: String(margin), y: 'h*0.91', width: width * 0.8 }));
      const name = `slide-${String(i + 1).padStart(2, '0')}.png`; images.push(name);
      await ffmpeg(executable, [...inputs, '-vf', filters.join(','), '-frames:v', '1', '-update', '1', `../${name}`], output.work, options.signal);
    }
    await writeCopy(output.staging, project); await preview(output.staging, project, images.map((file, i) => ({ file, title: slides[i].title })));
    checkAbort(options.signal); await rm(output.work, { recursive: true, force: true }); await rename(output.staging, output.final);
    return { images: images.map(file => path.join(output.final, file)), preview: path.join(output.final, 'preview.html') };
  } catch (error) { await rm(output.staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}
