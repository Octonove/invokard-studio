// Renders compositions: opens the page in several browser tabs at once, sets each frame, captures it and hands the
// frames to ffmpeg in order. Output: MP4 (H.264), MOV (ProRes 4444 with transparency), or a folder of PNG frames.
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {cpus, tmpdir} from 'node:os';
import {dirname, extname, join, resolve} from 'node:path';
import {bundle} from './bundle.mjs';
import {startServer} from './server.mjs';
import {findFfmpeg, launchBrowser} from './tools.mjs';

export const defaultConcurrency = () => Math.max(1, Math.min(8, Math.floor(cpus().length / 2)));
const clean = (e) => String((e && e.message) || e).replace(/^(page\.evaluate|Error): (Error: )?/i, '').split('\n    at ')[0];

export async function openSession({entry, browser = {}, log = () => {}}) {
  const built = await bundle(entry);
  const work = mkdtempSync(join(tmpdir(), 'invokard-render-'));
  const ffmpeg = findFfmpeg();
  const server = await startServer({bundleDir: built.dir, publicDir: built.publicDir,
    fontsDir: join(built.root, '.invokard', 'fonts'), videoDir: join(work, 'video'), ffmpeg});
  let launched;
  try { launched = await launchBrowser(browser); } catch (e) { await server.close(); throw e; }
  log(`browser: ${launched.name} ${launched.version}`);
  return {
    built, server, ffmpeg, browser: launched.browser, browserName: `${launched.name} ${launched.version}`,
    async close() {
      await launched.browser.close().catch(() => {});
      await server.close();
      for (const dir of [work, built.dir]) rmSync(dir, {recursive: true, force: true});
    },
  };
}

export async function openPage(session, composition, {props = {}, transparent = false, timeoutMs = 30000} = {}) {
  const page = await session.browser.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
  const problems = [];
  page.on('pageerror', (e) => problems.push(clean(e)));
  await page.goto(`${session.server.url}/index.html`);
  if (transparent) await page.evaluate(() => document.documentElement.classList.add('transparent'));
  let meta;
  try {
    meta = await page.evaluate(([id, p, ms]) => window.__invokard.init(id, p, ms), [composition, props, timeoutMs]);
  } catch (e) {
    throw new Error(problems[0] || clean(e));
  }
  await page.setViewportSize({width: meta.width, height: meta.height});
  const cdp = await page.context().newCDPSession(page);
  if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', {color: {r: 0, g: 0, b: 0, a: 0}});
  const clip = {x: 0, y: 0, width: meta.width, height: meta.height, scale: 1};
  return {
    meta,
    async frame(n, format = 'png', quality = 90) {
      try {
        await page.evaluate((f) => window.__invokard.seek(f), n);
      } catch (e) {
        throw new Error(`Frame ${n}: ${problems[0] || clean(e)}`);
      }
      if (problems.length) throw new Error(`Frame ${n}: ${problems[0]}`);
      const shot = await cdp.send('Page.captureScreenshot',
        {format, ...(format === 'jpeg' ? {quality} : {}), clip, optimizeForSpeed: true, captureBeyondViewport: false});
      return Buffer.from(shot.data, 'base64');
    },
  };
}

export async function listCompositions({entry, browser, log}) {
  const session = await openSession({entry, browser, log});
  try {
    const page = await session.browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(clean(e)));
    await page.goto(`${session.server.url}/index.html`);
    try { return await page.evaluate(() => window.__invokard.compositions()); } catch (e) { throw new Error(errors[0] || clean(e)); }
  } finally {
    await session.close();
  }
}

const parseRange = (range, total) => {
  if (range === undefined || range === null || range === '') return [0, total - 1];
  const [a, b] = String(range).split('-').map((x) => (x === '' ? undefined : Number(x)));
  const start = Number.isInteger(a) ? a : 0, end = Number.isInteger(b) ? b : String(range).includes('-') ? total - 1 : start;
  if (start < 0 || end >= total || start > end) throw new Error(`Frames ${range} are outside 0-${total - 1}`);
  return [start, end];
};

const codecFor = (output, codec, transparent) => {
  const c = codec || (extname(output).toLowerCase() === '.mov' ? 'prores' : extname(output) ? 'h264' : 'png');
  if (!['h264', 'prores', 'png'].includes(c)) throw new Error(`Unknown codec "${c}": use h264 (.mp4), prores (.mov) or png (a folder)`);
  if (transparent && c === 'h264') throw new Error('H.264 cannot keep transparency: render to a .mov (ProRes 4444) or to a folder of PNG frames');
  return c;
};

const ffmpegArgs = (codec, fps, crf, output) => {
  const input = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
  if (codec === 'prores') return [...input, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
    '-alpha_bits', '16', '-vendor', 'apl0', '-an', output];
  // RGB frames to BT.709 limited-range YUV 4:2:0, tagged as such: what phones, Instagram and browsers expect.
  return [...input, '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-an', output];
};

export async function renderMedia({entry, composition, output, props = {}, codec, crf = 18, frames, concurrency,
  transparent = false, browser, timeoutMs = 30000, onProgress = () => {}, log = () => {}}) {
  if (!output) throw new Error('renderMedia() needs an output path');
  output = resolve(output);
  const kind = codecFor(output, codec, transparent);
  const session = await openSession({entry, browser, log});
  const started = Date.now();
  let encoder = null;
  try {
    if (kind !== 'png' && !session.ffmpeg) throw new Error('ffmpeg was not found: install it, or run npm install in the animation folder');
    const first = await openPage(session, composition, {props, transparent, timeoutMs});
    const {fps, durationInFrames: total} = first.meta;
    const [start, end] = parseRange(frames, total);
    const count = end - start + 1;
    const tabs = Math.max(1, Math.min(concurrency || defaultConcurrency(), count));
    const pages = [first, ...await Promise.all(Array.from({length: tabs - 1}, () =>
      openPage(session, composition, {props, transparent, timeoutMs})))];
    log(`${composition}: ${first.meta.width}x${first.meta.height}, ${fps} fps, frames ${start}-${end}, ${tabs} tabs`);
    let failure = null, encoderError = '';
    if (kind === 'png') mkdirSync(output, {recursive: true});
    else {
      mkdirSync(dirname(output), {recursive: true});
      encoder = spawn(session.ffmpeg, ffmpegArgs(kind, fps, crf, output), {stdio: ['pipe', 'ignore', 'pipe']});
      encoder.stderr.on('data', (d) => { encoderError += d; });
      encoder.stdin.on('error', () => {});
    }
    const ready = new Map();
    let next = start, written = start, done = 0;
    const write = async (buffer, n) => {
      if (kind === 'png') { writeFileSync(join(output, `${String(n).padStart(6, '0')}.png`), buffer); return; }
      if (!encoder.stdin.write(buffer)) await new Promise((r) => encoder.stdin.once('drain', r));
    };
    const worker = async (page) => {
      while (!failure && next <= end) {
        const n = next++;
        try {
          ready.set(n, await page.frame(n));
        } catch (e) { failure = e; return; }
        while (ready.has(written)) {
          const buffer = ready.get(written);
          ready.delete(written);
          await write(buffer, written);
          written++;
          done++;
          onProgress({done, total: count, frame: written - 1});
        }
      }
    };
    await Promise.all(pages.map(worker));
    if (failure) throw failure;
    if (encoder) {
      encoder.stdin.end();
      const code = await new Promise((r) => encoder.on('close', r));
      if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${encoderError.trim().split('\n').slice(-3).join(' ')}`);
    }
    return {output, frames: count, seconds: (Date.now() - started) / 1000, tabs, browser: session.browserName, codec: kind};
  } catch (e) {
    if (encoder) { encoder.stdin.destroy(); encoder.kill(); }
    if (kind !== 'png' && existsSync(output)) rmSync(output, {force: true});
    throw e;
  } finally {
    await session.close();
  }
}

// Several single frames (PNG, or JPEG when the name ends in .jpg) in one browser session: much faster than one call each.
export async function renderStills({entry, composition, frames, output, props = {}, transparent = false, browser,
  timeoutMs = 30000, log = () => {}}) {
  const session = await openSession({entry, browser, log});
  try {
    const page = await openPage(session, composition, {props, transparent, timeoutMs});
    const total = page.meta.durationInFrames;
    const written = [];
    for (const n of frames) {
      if (!(Number.isInteger(n) && n >= 0 && n < total)) throw new Error(`Frame ${n} is outside 0-${total - 1}`);
      const file = resolve(typeof output === 'function' ? output(n) : output);
      const jpeg = /\.jpe?g$/i.test(file);
      mkdirSync(dirname(file), {recursive: true});
      writeFileSync(file, await page.frame(n, jpeg ? 'jpeg' : 'png', 92));
      written.push(file);
    }
    return {files: written, meta: page.meta, browser: session.browserName};
  } finally {
    await session.close();
  }
}

export const renderStill = async ({frame = 0, output, ...rest}) =>
  (await renderStills({...rest, frames: [frame], output})).files[0];
