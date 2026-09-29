import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import type { IncomingMessage, ClientRequest } from 'node:http';
import type { RequestOptions, request } from 'node:https';
import { createDownloader } from '../plugins/invokard-studio/src/download.js';

type Reply = { status?: number; headers?: Record<string, string>; body?: Buffer | string; error?: string };
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
function transport(replies: Reply[], observe?: (url: URL, options: RequestOptions) => void): typeof request {
  return ((url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const req = new EventEmitter() as ClientRequest;
    req.destroy = () => req;
    req.end = (() => {
      queueMicrotask(() => {
        observe?.(url, options);
        const reply = replies.shift();
        assert.ok(reply, 'unexpected network request');
        if (reply.error) { req.emit('error', new Error(reply.error)); return; }
        const response = Readable.from([reply.body ?? 'media']) as IncomingMessage;
        response.statusCode = reply.status ?? 200;
        response.headers = reply.headers ?? { 'content-type': 'video/mp4' };
        callback(response);
      });
      return req;
    }) as ClientRequest['end'];
    return req;
  }) as typeof request;
}
async function project(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'invokard-download-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('media download pins vetted DNS and saves bytes under a random local filename', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: publicLookup, request: transport([{ body: 'generated-media' }], (url, options) => {
    assert.equal(url.hostname, 'cdn.example');
    assert.equal(options.agent, false);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers && new Headers(options.headers as Record<string, string>).get('authorization'), null);
    assert.ok(options.lookup);
    (options.lookup as Function)('cdn.example', { all: true }, (error: unknown, addresses: unknown) => {
      assert.equal(error, null);
      assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
    });
  }) });
  const file = await download(dir, 'https://cdn.example/render?token=private-signed-url', 'video');
  assert.equal(extname(file), '.mp4');
  assert.equal(await readFile(file, 'utf8'), 'generated-media');
  assert.ok(file.startsWith(join(await realpath(dir), '.downloads')));
  assert.ok(!file.includes('private-signed-url'));
});

test('every DNS answer must be public before a request is opened', async t => {
  const dir = await project(t);
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.0.1', '192.0.2.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::']) {
    const download = createDownloader({ lookup: async () => [...await publicLookup(), { address, family: address.includes(':') ? 6 : 4 }], request: transport([]) });
    await assert.rejects(download(dir, 'https://cdn.example/file.mp4', 'video'), /public/i);
  }
});

test('unsafe URL forms and local literal addresses are rejected before DNS or HTTP', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: async () => { assert.fail('DNS must not run'); }, request: transport([]) });
  for (const url of ['file:///tmp/video.mp4', 'http://cdn.example/video.mp4', 'https://user:secret@cdn.example/video.mp4', 'https://localhost/video.mp4', 'https://127.1/video.mp4', 'https://[::1]/video.mp4', 'https://cdn.example:8443/video.mp4']) {
    await assert.rejects(download(dir, url, 'video'));
  }
});

test('each redirect is independently resolved and cannot reach a private address', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: async host => host === 'cdn.example' ? publicLookup() : [{ address: '10.0.0.2', family: 4 }],
    request: transport([{ status: 302, headers: { location: 'https://internal.example/video.mp4' } }]) });
  await assert.rejects(download(dir, 'https://cdn.example/video.mp4', 'video'), /public/i);
});

test('safe redirects finish successfully but redirect loops stop after three hops', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: publicLookup, request: transport([
    { status: 302, headers: { location: '/ready.mp4' } }, { headers: { 'content-type': 'video/mp4' }, body: 'ready' }
  ]) });
  assert.equal(await readFile(await download(dir, 'https://cdn.example/pending.mp4', 'video'), 'utf8'), 'ready');
  const looping = createDownloader({ lookup: publicLookup, request: transport(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/again.mp4' } }))) });
  await assert.rejects(looping(dir, 'https://cdn.example/again.mp4', 'video'), /redirect/i);
});

test('size limits check headers and streamed bytes and remove partial downloads', async t => {
  const dir = await project(t);
  for (const reply of [
    { headers: { 'content-type': 'video/mp4', 'content-length': '100' }, body: 'data' },
    { headers: { 'content-type': 'video/mp4' }, body: '123456789' }
  ] as Reply[]) {
    const download = createDownloader({ lookup: publicLookup, request: transport([reply]), maxBytes: 8 });
    await assert.rejects(download(dir, 'https://cdn.example/movie.mp4', 'video'), /size|limit/i);
    assert.deepEqual(await readdir(join(dir, '.downloads')), []);
  }
});

test('unsupported MIME, playlists, empty media and HTTP errors are rejected without keeping files', async t => {
  const dir = await project(t);
  for (const [url, reply] of [
    ['https://cdn.example/file.mp4', { headers: { 'content-type': 'text/html' }, body: 'HTML' }],
    ['https://cdn.example/file.m3u8', { headers: { 'content-type': 'application/octet-stream' } }],
    ['https://cdn.example/file.mp4', { body: '' }],
    ['https://cdn.example/file.mp4', { status: 403, body: 'private-signed-url' }]
  ] as [string, Reply][]) {
    const download = createDownloader({ lookup: publicLookup, request: transport([reply]) });
    await assert.rejects(download(dir, url, 'video'));
    assert.deepEqual(await readdir(join(dir, '.downloads')), []);
  }
});

test('errors never include the signed URL or raw networking error text', async t => {
  const dir = await project(t);
  const secret = 'private-access-token';
  const download = createDownloader({ lookup: publicLookup, request: transport([{ error: `failed https://cdn.example/file.mp4?token=${secret}` }]) });
  await assert.rejects(download(dir, `https://cdn.example/file.mp4?token=${secret}`, 'video'), error => !String(error).includes(secret));
});

test('DNS resolution is bounded by the same overall download deadline', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: async () => new Promise(() => {}), request: transport([]), timeoutMs: 20 });
  await assert.rejects(download(dir, 'https://cdn.example/movie.mp4', 'video'), /timed out/i);
  assert.deepEqual(await readdir(join(dir, '.downloads')), []);
});

test('generic binary MIME uses an allowed extension and declared truncation is rejected', async t => {
  const dir = await project(t);
  const download = createDownloader({ lookup: publicLookup, request: transport([
    { headers: { 'content-type': 'application/octet-stream' }, body: 'sound' },
    { headers: { 'content-type': 'video/mp4', 'content-length': '50' }, body: 'too short' }
  ]) });
  assert.equal(extname(await download(dir, 'https://cdn.example/sound.mp3', 'audio')), '.mp3');
  await assert.rejects(download(dir, 'https://cdn.example/movie.mp4', 'video'), /incomplete/i);
  assert.equal((await readdir(join(dir, '.downloads'))).length, 1);
});

test('download directories cannot escape through a junction', async t => {
  const dir = await project(t), outside = await project(t);
  await symlink(outside, join(dir, '.downloads'), process.platform === 'win32' ? 'junction' : 'dir');
  const download = createDownloader({ lookup: publicLookup, request: transport([]) });
  await assert.rejects(download(dir, 'https://cdn.example/file.mp4', 'video'), /directory|junction|symlink/i);
  assert.deepEqual(await readdir(outside), []);
});
