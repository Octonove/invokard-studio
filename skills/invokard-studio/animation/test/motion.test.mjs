// The motion functions must give the numbers animations were tuned with (reference values in reference-motion.json).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Easing, interpolate, measureSpring, random, spring, staticFile} from '../src/runtime.js';

const ref = JSON.parse(readFileSync(new URL('./reference-motion.json', import.meta.url), 'utf8'));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ${b}`);

test('spring matches the reference curves, including critical and over-damped settings', () => {
  for (const [config, frame, expected] of ref.spring) {
    let got;
    if (config === 'duration40') got = spring({frame, fps: 30, config: {damping: 14}, durationInFrames: 40});
    else if (config === 'reverse') got = spring({frame, fps: 30, config: {damping: 14}, reverse: true});
    else if (frame === 7 && config.damping === 10 && Object.keys(config).length === 1) got = spring({frame, fps: 30, config, from: 100, to: -50, delay: 2});
    else got = spring({frame, fps: 30, config});
    close(got, expected, 1e-6, `spring ${JSON.stringify(config)} at ${frame}`);
  }
});

test('measureSpring finds the same settle frame', () => {
  for (const [config, expected] of ref.measure) assert.equal(measureSpring({fps: 30, config}), expected, JSON.stringify(config));
});

test('interpolate: easing applies when extending, clamp, wrap, identity and several segments', () => {
  const easing = Easing.out(Easing.cubic);
  for (const [mode, x, expected] of ref.interp) {
    let got;
    if (mode === 'ext') got = interpolate(x, [0, 10], [0, 100], {easing});
    if (mode === 'clamp') got = interpolate(x, [0, 10, 20], [0, 50, 40], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    if (mode === 'wrap') got = interpolate(x, [0, 10], [0, 100], {extrapolateLeft: 'wrap', extrapolateRight: 'wrap'});
    if (mode === 'identity') got = interpolate(x, [0, 10], [0, 100], {extrapolateRight: 'identity'});
    if (mode === 'multi') got = interpolate(x, [0, 10, 20], [0, 50, 40], {easing: Easing.inOut(Easing.quad)});
    close(got, expected, 1e-9, `interpolate ${mode} ${x}`);
  }
  assert.throws(() => interpolate(1, [0, 0], [0, 1]), /strictly increasing/);
});

test('Easing.bezier and random', () => {
  const b = Easing.bezier(0.22, 1, 0.36, 1);
  for (const [x, expected] of ref.bez) close(b(x), expected, 1e-5, `bezier ${x}`);
  for (const [seed, expected] of ref.rand) assert.equal(random(seed), expected, `random(${seed})`);
});

test('staticFile encodes every part of the path', () => {
  assert.equal(staticFile('foto de prueba ñ.png'), '/public/foto%20de%20prueba%20%C3%B1.png');
  assert.equal(staticFile('clips/#1 ok?.mp4'), '/public/clips/%231%20ok%3F.mp4');
  assert.throws(() => staticFile('https://example.com/a.png'), /not URLs/);
});
