import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCaptionTrack } from '../plugins/invokard-studio/src/captions.js';
import type { Project } from '../plugins/invokard-studio/src/types.js';

function fixture(): Project {
  return { schemaVersion: 1, id: 'captions', title: 'Caption fixture', createdAt: '', updatedAt: '',
    format: { width: 1080, height: 1920, fps: 30 }, assets: [], scenes: [{ id: 'solid', duration: 12 }],
    captions: [{ start: 0, end: 2, text: 'Hola mundo', words: [{ start: 0.2, end: 0.7, text: 'Hola' }, { start: 1.1, end: 1.6, text: 'mundo' }] }],
    brand: { background: '#000000', color: '#123456', accent: '#F1B553', fontFamily: 'Arial' },
    audio: { musicVolume: 0.1, voiceVolume: 1 }, copy: { caption: '', hashtags: [] } };
}

test('active word events follow supplied boundaries and leave pauses neutral', () => {
  const result = buildCaptionTrack(fixture());
  assert.deepEqual(result.events.map(e => [e.start, e.end, e.activeWord]), [[0, .2, null], [.2, .7, 0], [.7, 1.1, null], [1.1, 1.6, 1], [1.6, 2, null]]);
  assert.equal(result.events[0].fontSize, 92);
  assert.match(result.ass, /Style: Reels,Arial,92,&H00FFFFFF,&H0053B5F1,&H00000000/);
  assert.match(result.ass, /,5,0,2,86,86,422,1/);
  assert.match(result.ass, /0:00:00.20,0:00:00.70/);
  assert.deepEqual(result.captionTiming, { wordTimedCaptions: 1, totalCaptions: 1, warnings: [] });
});

test('auto never invents word times, plain suppresses highlights, explicit word mode requires timings', () => {
  const p = fixture(); delete p.captions[0].words;
  const plain = buildCaptionTrack(p);
  assert.equal(plain.events.length, 1); assert.equal(plain.events[0].activeWord, null);
  assert.deepEqual([plain.events[0].start, plain.events[0].end], [0, 2]);
  assert.equal(plain.captionTiming.wordTimedCaptions, 0); assert.match(plain.captionTiming.warnings.join(' '), /word.*tim|phrase/i);
  p.captionStyle = { mode: 'word' }; assert.throws(() => buildCaptionTrack(p), /word.*tim|words/i);
  const timed = fixture(); timed.captionStyle = { mode: 'plain' };
  assert.equal(buildCaptionTrack(timed).events.length, 1); assert.equal(buildCaptionTrack(timed).events[0].activeWord, null);
});

test('splits timed text by word count and measured silence without moving the word boundaries', () => {
  const p = fixture(); const words = 'uno dos tres cuatro cinco seis siete ocho nueve'.split(' ').map((text, i) => ({ text, start: i * .3 + (i >= 7 ? .7 : 0), end: i * .3 + .2 + (i >= 7 ? .7 : 0) }));
  p.captions = [{ start: 0, end: 4, text: words.map(w => w.text).join(' '), words }];
  const result = buildCaptionTrack(p);
  for (const event of result.events) {
    assert.ok(event.lines.length <= 2); assert.ok(event.lines.every(line => line.length <= 3));
  }
  assert.deepEqual(result.events.filter(e => e.activeWord !== null).map(e => [e.start, e.end]), words.map(w => [w.start, w.end]));
  assert.ok(result.events.some(e => e.lines.flat().join(' ') === 'siete'));
  assert.ok(result.events.some(e => e.lines.flat().join(' ') === 'ocho nueve'));
});

test('shrinks long words, preserves Unicode, and prevents ASS style or event injection', () => {
  const p = fixture(); p.brand.fontFamily = 'Arial,1\n[Events]\nDialogue: evil';
  p.captions = [{ start: 0, end: 2, text: "Café {\\pos(0,0)} \\N 100% d'été" }];
  const safe = buildCaptionTrack(p);
  assert.equal(safe.ass.split('\n').filter(line => line.startsWith('[Events]')).length, 1);
  assert.equal(safe.ass.split('\n').filter(line => line.startsWith('Dialogue:')).length, 1);
  assert.doesNotMatch(safe.ass, /\{\\pos\(0,0\)\}/);
  assert.match(safe.ass, /Café/); assert.match(safe.ass, /d'été/);
  p.brand.fontFamily = 'Arial';
  const text = 'Supercalifragilisticexpialidocious';
  p.captions = [{ start: 0, end: 2, text, words: [{ start: .1, end: 1.8, text }] }];
  assert.ok(buildCaptionTrack(p).events[0].fontSize < 92);
});

test('rejects overlapping, out-of-caption and invalid word times even on the direct render path', () => {
  for (const change of [ (p: Project) => { p.captions[0].words![1].start = .5; }, (p: Project) => { p.captions[0].words![0].start = -.1; }, (p: Project) => { p.captions[0].words![0].end = NaN; } ]) {
    const p = fixture(); change(p); assert.throws(() => buildCaptionTrack(p), /word|tim/i);
  }
});
