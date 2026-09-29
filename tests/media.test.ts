import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, stat, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { doctorMedia, inspectMedia, renderCarousel, renderVideo } from '../plugins/invokard-studio/src/media.js';
import type { Project } from '../plugins/invokard-studio/src/types.js';

function project(): Project {
  return { schemaVersion: 1, id: 'fixture', title: "Invokard — café d'été", createdAt: '', updatedAt: '',
    format: { width: 320, height: 480, fps: 24 }, assets: [],
    scenes: [{ id: 'one', duration: 0.5, text: "Café d'été: 50% {hola} \\ ruta", background: '#102030' }],
    captions: [{ start: 0.1, end: 0.4, text: "Subtítulo: d'été, 100%" }],
    brand: { background: '#102030', color: '#ffffff', accent: '#ec9e45', fontFamily: 'Arial' },
    audio: { musicVolume: 0.15, voiceVolume: 1 }, copy: { caption: 'Un café ☕', hashtags: ['#café'] } };
}
async function fixtureDir() { return mkdtemp(path.join(os.tmpdir(), "invokard café d'été ")); }
async function run(exe: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(exe, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { shell: false, windowsHide: true });
    let errors = ''; child.stderr.on('data', data => errors += data);
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(errors)));
  });
}
async function audioSamples(exe: string, file: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], { shell: false, windowsHide: true });
    const chunks: Buffer[] = []; let errors = '';
    child.stdout.on('data', data => chunks.push(data)); child.stderr.on('data', data => errors += data);
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(errors)));
  });
}
function rms(samples: Buffer, start: number, end: number) {
  const from = Math.round(start * 16000), to = Math.min(Math.round(end * 16000), samples.length / 4);
  let total = 0; for (let i = from; i < to; i++) total += samples.readFloatLE(i * 4) ** 2;
  return Math.sqrt(total / (to - from));
}
async function frameRgb(exe: string, file: string, time: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(time), '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { shell: false, windowsHide: true });
    const chunks: Buffer[] = []; let errors = '';
    child.stdout.on('data', data => chunks.push(data)); child.stderr.on('data', data => errors += data);
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(errors)));
  });
}
function coloredText(pixels: Buffer, width: number) {
  let yellow = 0, white = 0, sumX = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    const [r, g, b] = pixels.subarray(i, i + 3);
    if (r > 170 && g > 110 && b < 100 && r - b > 100) { yellow++; sumX += (i / 3) % width; }
    if (r > 190 && g > 190 && b > 190) white++;
  }
  return { yellow, white, x: sumX / yellow };
}

test('real ASS rendering moves active color between words, clears it in pauses and exports the styled cover', { timeout: 60000 }, async () => {
  const doctor: any = await doctorMedia(), dir = await fixtureDir(), p = project();
  assert.equal(doctor.captions.available, true); assert.equal(doctor.captions.renderer, 'libass');
  p.format = { width: 540, height: 960, fps: 30 }; p.scenes = [{ id: 'black', duration: 2, background: '#000000' }];
  p.brand.accent = '#F1B553';
  p.captions = [{ start: 0, end: 2, text: 'Hola mundo', words: [{ start: 0, end: .6, text: 'Hola' }, { start: 1, end: 1.7, text: 'mundo' }] }];
  const result = await renderVideo(dir, p);
  const [first, pause, second, cover] = await Promise.all([.2, .8, 1.3, 0].map((time, i) => frameRgb(doctor.ffmpeg.path, i === 3 ? result.poster : result.video, time)));
  const a = coloredText(first, 540), b = coloredText(pause, 540), c = coloredText(second, 540);
  assert.ok(a.yellow > 200 && c.yellow > 200, `Active word fill must be visible: ${JSON.stringify({ a, b, c })}`);
  assert.ok(a.x + 50 < c.x, `Highlight must move from the first word to the second: ${JSON.stringify({ a, b, c })}`);
  assert.ok(b.yellow < 10 && b.white > 300, 'Pause must keep the phrase visible with no active word');
  assert.ok(coloredText(cover, 540).yellow > 200, 'Cover must match the styled first video frame');
  assert.ok(result.styledSubtitles); assert.match(await readFile(result.styledSubtitles, 'utf8'), /\[V4\+ Styles\]/);
  assert.equal(await readFile(result.subtitles, 'utf8'), '1\n00:00:00,000 --> 00:00:02,000\nHola mundo\n');
  assert.equal(result.captionTiming?.wordTimedCaptions, 1);
});

test('rejects asset traversal, URLs, invalid timing and already-cancelled renders before starting tools', async () => {
  const dir = await fixtureDir();
  for (const assetPath of ['../outside.png', 'https://example.com/image.png']) {
    const p = project(); p.assets.push({ id: 'bad', kind: 'image', path: assetPath }); p.scenes[0].assetId = 'bad';
    await assert.rejects(renderVideo(dir, p), /outside|relative|URL|contain|path/i);
  }
  const p = project(); p.captions[0].end = 12;
  await assert.rejects(renderVideo(dir, p), /caption|duration|timeline/i);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(renderVideo(dir, project(), { signal: controller.signal }), /cancel|abort/i);
  assert.deepEqual(await readdir(dir), [], 'invalid renders must not create partial exports');
});

test('inspector rejects remote URLs and disguised playlists without opening referenced inputs', async () => {
  await assert.rejects(inspectMedia('https://example.com/test.mp4'), /local|URL|path/i);
  const dir = await fixtureDir(); const file = path.join(dir, 'fake.mp4');
  await writeFile(file, '#EXTM3U\nhttps://example.com/secret.ts\n');
  await assert.rejects(inspectMedia(file), /unsupported|playlist|invalid|media/i);
});

test('renders real mixed media, timed captions, audio, poster, preview and preserved output versions', { timeout: 120000 }, async () => {
  const doctor: any = await doctorMedia();
  assert.equal(doctor.ready, true, 'Install FFmpeg/ffprobe before running the real media suite');
  const dir = await fixtureDir(); await mkdir(path.join(dir, 'assets'));
  await run(doctor.ffmpeg.path, ['-f', 'lavfi', '-i', 'color=c=0x223344:s=360x240', '-frames:v', '1', path.join(dir, 'assets', "l'été.png")]);
  await run(doctor.ffmpeg.path, ['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'assets', 'clip.mp4')]);
  await run(doctor.ffmpeg.path, ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.8', path.join(dir, 'assets', 'voice.wav')]);
  const p = project();
  p.assets = [ { id: 'still', kind: 'image', path: "assets/l'été.png" }, { id: 'clip', kind: 'video', path: 'assets/clip.mp4' }, { id: 'voice', kind: 'audio', path: 'assets/voice.wav' } ];
  p.scenes.push({ id: 'two', duration: 0.5, assetId: 'still', motion: 'zoom' });
  p.scenes.push({ id: 'three', duration: 0.5, trimStart: 0.25, assetId: 'clip' });
  p.audio.voiceAssetId = 'voice'; p.audio.musicAssetId = 'voice';
  p.captions.push({ start: 1.0, end: 1.4, text: 'Segunda escena — año' });
  const result = await renderVideo(dir, p);
  const info: any = await inspectMedia(result.video);
  const video = info.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(video.width, 320); assert.equal(video.height, 480);
  assert.ok(Math.abs(Number(info.format.duration) - 1.5) < 0.08);
  assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'));
  assert.ok((await stat(result.poster)).size > 100);
  assert.match(await readFile(result.subtitles, 'utf8'), /00:00:01,000 --> 00:00:01,400/);
  assert.match(await readFile(result.copy, 'utf8'), /Un café ☕/);
  const preview = await readFile(path.join(path.dirname(result.video), 'preview.html'), 'utf8');
  assert.match(preview, /video/); assert.doesNotMatch(preview, /https?:\/\//);
  const first = await readFile(result.video); const second = await renderVideo(dir, project());
  assert.notEqual(path.dirname(result.video), path.dirname(second.video));
  assert.deepEqual(await readFile(result.video), first);

  const short = structuredClone(p); short.scenes = [{ id: 'bad', assetId: 'clip', trimStart: 0.75, duration: 0.5 }]; short.captions = [];
  await assert.rejects(renderVideo(dir, short), /short|available|duration/i);
  await writeFile(path.join(dir, 'assets', 'corrupt.mp4'), 'not a video');
  short.assets[1].path = 'assets/corrupt.mp4';
  await assert.rejects(renderVideo(dir, short), /invalid|media|format/i);
});

test('carousel exports numbered real images and a local preview with safely escaped text', { timeout: 60000 }, async () => {
  const dir = await fixtureDir();
  const result = await renderCarousel(dir, project(), [
    { title: "Café d'été", body: 'Un mensaje claro.\n50% más sencillo.' },
    { title: '<script>alert(1)</script>', body: 'Otra idea', background: '#27384a' }
  ]);
  assert.equal(result.images.length, 2);
  for (const file of result.images) {
    const info: any = await inspectMedia(file); assert.equal(info.streams[0].width, 320); assert.equal(info.streams[0].height, 480);
  }
  const preview = await readFile(result.preview, 'utf8');
  assert.ok(preview.includes('&lt;script&gt;')); assert.ok(!preview.includes('<script>'));
});

test('fractional scene durations do not accumulate a frame of rounding error per scene', { timeout: 60000 }, async () => {
  const dir = await fixtureDir(); const p = project();
  p.scenes = Array.from({ length: 10 }, (_, index) => ({ id: String(index), duration: 0.07 }));
  p.captions = [{ start: 0.5, end: 0.7, text: 'Fin' }];
  const result = await renderVideo(dir, p); const info: any = await inspectMedia(result.video);
  assert.ok(Math.abs(Number(info.format.duration) - 0.7) < 1 / 24, `Expected 0.7s timeline, received ${info.format.duration}s`);
});

test('rejects project assets through directory junctions that resolve outside the project', async () => {
  const dir = await fixtureDir(); const outside = await fixtureDir();
  await writeFile(path.join(outside, 'private.png'), 'outside project');
  await symlink(outside, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const p = project(); p.assets = [{ id: 'escape', kind: 'image', path: 'linked/private.png' }]; p.scenes[0].assetId = 'escape';
  await assert.rejects(renderVideo(dir, p), /outside|contain/i);
});

test('cancellation stops an active render and removes only its incomplete export', { timeout: 60000 }, async () => {
  const dir = await fixtureDir(); const first = await renderVideo(dir, project());
  const original = await readFile(first.video); const p = project();
  p.format = { width: 1080, height: 1920, fps: 30 }; p.scenes[0].duration = 30;
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  await assert.rejects(renderVideo(dir, p, { signal: controller.signal, onProgress: message => {
    if (message.startsWith('Rendering scene')) timer = setTimeout(() => controller.abort(), 100);
  } }), /cancel|abort/i);
  if (timer) clearTimeout(timer);
  assert.ok(Date.now() - started < 15000, 'Cancellation must terminate FFmpeg promptly');
  assert.deepEqual(await readFile(first.video), original);
  assert.equal((await readdir(path.join(dir, 'exports'))).length, 1, 'Incomplete render should be removed');
});

test('carousel cancellation interrupts rendering and preserves previous carousel exports', { timeout: 60000 }, async () => {
  const dir = await fixtureDir(); const first = await renderCarousel(dir, project(), [{ title: 'Saved slide' }]);
  const original = await readFile(first.images[0]); const p = project(); p.format = { width: 1080, height: 1920, fps: 30 };
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 100);
  try {
    await assert.rejects(renderCarousel(dir, p, Array.from({ length: 10 }, (_, index) => ({ title: `Slide ${index + 1}` })), { signal: controller.signal }), /cancel|abort/i);
  } finally { clearTimeout(timer); }
  assert.deepEqual(await readFile(first.images[0]), original);
  assert.equal((await readdir(path.join(dir, 'exports'))).length, 1);
});

test('native video audio follows scene timing, defaults to audible and honors volume and mute', { timeout: 60000 }, async () => {
  const doctor: any = await doctorMedia(); const dir = await fixtureDir(); await mkdir(path.join(dir, 'assets'));
  await run(doctor.ffmpeg.path, ['-f', 'lavfi', '-i', 'color=c=0x334455:s=320x480:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-shortest', path.join(dir, 'assets', 'native.mp4')]);
  const p = project(); p.assets = [{ id: 'clip', kind: 'video', path: 'assets/native.mp4' }]; p.captions = [];
  p.scenes = [{ id: 'silent', duration: 0.5 }, { id: 'clip', assetId: 'clip', duration: 0.5, trimStart: 0.25 }];
  const full = await renderVideo(dir, p); const info: any = await inspectMedia(full.video);
  assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'), 'Source video audio should be preserved by default');
  assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.05);
  const samples = await audioSamples(doctor.ffmpeg.path, full.video);
  assert.ok(rms(samples, 0.1, 0.4) < 0.0001, `Native audio must not start during the preceding silent scene: rms=${rms(samples, 0.1, 0.4)}, samples=${samples.length / 4}, file=${full.video}`);
  const fullRms = rms(samples, 0.65, 0.9); assert.ok(fullRms > 0.02);
  p.scenes[1].audioVolume = 0.25;
  const quiet = await renderVideo(dir, p); const quieter = await audioSamples(doctor.ffmpeg.path, quiet.video);
  assert.ok(Math.abs(rms(quieter, 0.65, 0.9) / fullRms - 0.25) < 0.04);
  p.scenes[1].audioVolume = 0;
  const muted = await renderVideo(dir, p); const mutedInfo: any = await inspectMedia(muted.video);
  assert.ok(!mutedInfo.streams.some((s: any) => s.codec_type === 'audio'), 'Explicitly muted native audio should not add a silent stream');
  await run(doctor.ffmpeg.path, ['-i', path.join(dir, 'assets', 'native.mp4'), '-vn', path.join(dir, 'assets', 'voice.wav')]);
  p.assets.push({ id: 'voice', kind: 'audio', path: 'assets/voice.wav' }); p.scenes[1].audioVolume = 1;
  p.audio = { voiceAssetId: 'voice', musicAssetId: 'voice', voiceVolume: 0.2, musicVolume: 0.1 };
  const mixed = await renderVideo(dir, p); const mixedSamples = await audioSamples(doctor.ffmpeg.path, mixed.video);
  const earlyRms = rms(mixedSamples, 0.1, 0.4), lateRms = rms(mixedSamples, 0.65, 0.9);
  assert.ok(earlyRms > 0.01, 'Voice and music should mix before the native clip begins');
  assert.ok(lateRms > earlyRms * 2, 'Native scene audio should join both global audio tracks at its scene offset');
});

test('hundreds of timed captions render without exceeding the Windows command-line length', { timeout: 60000 }, async () => {
  const dir = await fixtureDir(); const p = project();
  p.captions = Array.from({ length: 400 }, (_, index) => ({ start: index / 800, end: (index + 1) / 800, text: `Caption ${index + 1}` }));
  const result = await renderVideo(dir, p);
  assert.ok((await stat(result.video)).size > 100);
  assert.match(await readFile(result.subtitles, 'utf8'), /Caption 400/);
});
