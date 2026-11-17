// Local-only builds (INVOKARD_OFFLINE=1, or a LOCAL_ONLY file next to package.json) never use the network: the bundled
// font families still load, and any other family stops the render with an error that names it.
// Its own file, because the engine reads the setting when it is first imported.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.INVOKARD_OFFLINE = '1';
const {findFfmpeg, launchBrowser, renderStills} = await import('../src/index.mjs');
const {OFFLINE, bundledFonts} = await import('../src/server.mjs');

const entry = fileURLToPath(new URL('./fixtures/offline/src/index.jsx', import.meta.url));
const ffmpeg = findFfmpeg();
let browserOk = false;
try { const b = await launchBrowser(); await b.browser.close(); browserOk = true; } catch { /* no browser */ }
const skip = !ffmpeg ? 'ffmpeg not found' : !browserOk ? 'no browser' : false;
const keep = process.env.INVOKARD_TEST_OUT;
if (keep) mkdirSync(keep, {recursive: true});
const out = keep || mkdtempSync(join(tmpdir(), 'invokard-offline-'));
const pixel = (file, x, y) => {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `format=rgba,crop=1:1:${x}:${y}`, '-frames:v', '1',
    '-f', 'rawvideo', '-'], {encoding: 'buffer'});
  return [...r.stdout.subarray(0, 4)];
};

test('the local-only switch is on and the font library ships fifteen families', () => {
  assert.equal(OFFLINE, true);
  assert.equal(bundledFonts().length, 15);
  for (const f of ['Inter', 'Outfit', 'Anton', 'Barlow Condensed', 'Fraunces']) assert.ok(bundledFonts().includes(f), f);
});

test('a bundled family loads with no network, before the components mount', {skip}, async () => {
  const r = await renderStills({entry, composition: 'Bundled', frames: [0], output: join(out, 'offline-bundled.png')});
  assert.deepEqual(pixel(r.files[0], 50, 50), [0, 255, 0, 255]);
});

test('a family that is not bundled stops the render and names the font', {skip}, async () => {
  await assert.rejects(renderStills({entry, composition: 'NotBundled', frames: [0], output: join(out, 'offline-missing.png')}),
    /Could not load the font "Lobster"/);
});
