// End to end: renders the test project in a real browser and checks pixels of the stills and of the encoded video.
// Needs ffmpeg and Chrome, Edge or a downloaded Chromium (skipped otherwise); the first run downloads one Google font.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findFfmpeg, launchBrowser, listCompositions, renderMedia, renderStills} from '../src/index.mjs';

const entry = fileURLToPath(new URL('./fixtures/basic/src/index.jsx', import.meta.url));
const ffmpeg = findFfmpeg();
let browserOk = false;
try { const b = await launchBrowser(); await b.browser.close(); browserOk = true; } catch { /* no browser */ }
const skip = !ffmpeg ? 'ffmpeg not found' : !browserOk ? 'no browser' : false;
const out = mkdtempSync(join(tmpdir(), 'invokard-test-'));

// RGBA of one pixel; videos are decoded as BT.709 limited range, the way players do.
const pixel = (file, x, y, video = false) => {
  const filters = `${video ? 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,' : ''}format=rgba,crop=1:1:${x}:${y}`;
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', filters, '-frames:v', '1', '-f', 'rawvideo', '-'], {encoding: 'buffer'});
  return [...r.stdout.subarray(0, 4)];
};
const near = (got, want, tol, what) => {
  for (let i = 0; i < want.length; i++) assert.ok(Math.abs(got[i] - want[i]) <= tol, `${what}: got rgba(${got}), expected ~${want}`);
};
const probe = (file, entries) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', `stream=${entries}`, '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim();

test('lists the compositions of an entry', {skip}, async () => {
  const list = await listCompositions({entry});
  assert.deepEqual(list.map((c) => c.id), ['Basic', 'Transparent', 'Cover', 'FontOnMount']);
  assert.equal(list[2].still, true);
  assert.equal(list[0].durationInFrames, 30);
});

test('stills: colours, sequences, series, loops, images with odd names and frames of a video', {skip}, async () => {
  const r = await renderStills({entry, composition: 'Basic', frames: [0, 7, 15, 29], output: (n) => join(out, `basic-${n}.png`)});
  const f = (n) => join(out, `basic-${n}.png`);
  assert.equal(r.files.length, 4);
  near(pixel(f(0), 50, 50), [0x1e, 0x3a, 0x5f, 255], 0, 'navy square');
  near(pixel(f(0), 320, 900), [0xce, 0x6e, 0x61, 255], 0, 'background');
  near(pixel(f(0), 25, 225), [255, 255, 255, 255], 0, 'box at x=0 on frame 0');
  near(pixel(f(29), 225, 225), [255, 255, 255, 255], 0, 'box at x=200 on frame 29');
  near(pixel(f(15), 350, 50), [0, 255, 0, 255], 0, 'sequence shown on frame 15');
  near(pixel(f(0), 350, 50), [0xce, 0x6e, 0x61, 255], 0, 'sequence hidden on frame 0');
  near(pixel(f(0), 470, 50), [255, 255, 0, 255], 0, 'first series item on frame 0');
  near(pixel(f(7), 470, 50), [255, 0, 255, 255], 0, 'second series item on frame 7');
  near(pixel(f(7), 590, 50), [180, 0, 0, 255], 0, 'loop of 4: frame 7 shows loop frame 3');
  near(pixel(f(0), 100, 450), [255, 0, 0, 255], 3, 'image top half (PNG colour management may shift 1-2 levels)');
  near(pixel(f(0), 100, 550), [0, 0, 255, 255], 3, 'image bottom half');
  near(pixel(f(29), 480, 445), [255, 0, 0, 255], 12, 'frozen video frame 15 (red second)');
  near(pixel(f(0), 480, 565), [0, 0, 255, 255], 12, 'video started at frame 30 (blue second)');
  assert.ok(readdirSync(join(entry, '..', '..', '.invokard', 'fonts', 'css')).length >= 1, 'font cached in the project');
});

test('video: H.264, every frame, BT.709 colours that decode to the right RGB', {skip}, async () => {
  const file = join(out, 'basic.mp4');
  const r = await renderMedia({entry, composition: 'Basic', output: file, concurrency: 3, props: {title: 'Adiós'}});
  assert.equal(r.frames, 30);
  assert.equal(probe(file, 'width,height,pix_fmt,color_space,nb_read_frames'), '640,960,yuv420p,bt709,30');
  near(pixel(file, 50, 50, true), [0x1e, 0x3a, 0x5f, 255], 3, 'navy after H.264');
  near(pixel(file, 320, 900, true), [0xce, 0x6e, 0x61, 255], 3, 'coral after H.264');
});

test('transparency: PNG still with alpha and ProRes 4444', {skip}, async () => {
  const png = join(out, 'transparent.png');
  await renderStills({entry, composition: 'Transparent', frames: [0], output: png, transparent: true});
  assert.equal(pixel(png, 5, 5)[3], 0, 'corner is transparent');
  near(pixel(png, 150, 150), [0x1e, 0x3a, 0x5f, 255], 0, 'square is opaque');
  const mov = join(out, 'transparent.mov');
  await renderMedia({entry, composition: 'Transparent', output: mov, transparent: true, concurrency: 2});
  assert.match(probe(mov, 'codec_name,pix_fmt'), /^prores,yuva444p/);
  await assert.rejects(renderMedia({entry, composition: 'Transparent', output: join(out, 'x.mp4'), transparent: true}), /transparency/);
});

test('fonts loaded by the animation are ready before its components mount', {skip}, async () => {
  rmSync(join(entry, '..', '..', '.invokard'), {recursive: true, force: true});      // from an empty font cache
  const r = await renderStills({entry, composition: 'FontOnMount', frames: [0], output: join(out, 'font-on-mount.png')});
  near(pixel(r.files[0], 50, 50), [0, 255, 0, 255], 0, 'font loaded when the component mounted');
});

test('errors are clear: unknown composition and frames out of range', {skip}, async () => {
  await assert.rejects(renderStills({entry, composition: 'Nope', frames: [0], output: join(out, 'n.png')}), /no composition "Nope".*Basic/);
  await assert.rejects(renderStills({entry, composition: 'Basic', frames: [99], output: join(out, 'n.png')}), /outside 0-29/);
});

test.after(() => { if (existsSync(out)) rmSync(out, {recursive: true, force: true}); });
