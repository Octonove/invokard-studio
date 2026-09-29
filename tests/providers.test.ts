import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createProviderClient, getProviderStatus, providerSetup } from '../plugins/invokard-studio/src/providers.js';

const remoteId = 'd7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff';
const env = { HIGGSFIELD_API_KEY: 'test-key-private', HIGGSFIELD_API_SECRET: 'test-secret-private', MAGNIFIC_API_KEY: 'test-magnific-private' };
const request = { model: 'higgsfield-ai/soul/v2/standard', input: { prompt: 'Editorial portrait in soft daylight' }, requestKey: 'scene-1-image-v1', budgetApproved: true };
const queued = { status: 'queued', request_id: remoteId, status_url: `https://api.higgsfield.ai/requests/${remoteId}/status`, cancel_url: `https://api.higgsfield.ai/requests/${remoteId}/cancel` };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
async function project(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'invokard-providers-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('status reports configuration without claiming an authenticated connection or exposing credentials', () => {
  const client = createProviderClient({ env });
  const status = client.getProviderStatus();
  assert.equal(status.higgsfield.credentialsConfigured, true);
  assert.equal(status.higgsfield.connectionVerified, false);
  assert.equal(status.magnific.connectionVerified, false);
  assert.equal(status.magnific.musicApiKeyConfigured, true);
  assert.equal(createProviderClient({ env: {} }).getProviderStatus().higgsfield.credentialsConfigured, false);
  for (const secret of Object.values(env)) assert.ok(!JSON.stringify(status).includes(secret));
  assert.equal(providerSetup('magnific').mcpConfig?.mcpServers.magnific.url, 'https://mcp.magnific.com');
  assert.equal(typeof getProviderStatus, 'function');
});

test('submission persists intent before POST and a repeated key cannot create another paid job', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async (url, options) => {
    calls++;
    const prior = await client.listProviderJobs(dir);
    assert.equal(prior.length, 1);
    assert.equal(prior[0].status, 'submission_unknown');
    assert.equal(String(url), 'https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Key test-key-private:test-secret-private');
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(JSON.parse(String(options?.body)), request.input);
    return json(queued);
  }});
  const first = await client.submitHiggsfield(dir, request);
  assert.equal(first.status, 'submitted');
  assert.equal(first.remoteId, remoteId);
  assert.deepEqual(await client.submitHiggsfield(dir, request), first);
  assert.equal(calls, 1);
  await assert.rejects(client.submitHiggsfield(dir, { ...request, input: { prompt: 'Different' } }), /different request/i);
  const stored = await readFile(join(dir, 'provider-jobs', `${first.id}.json`), 'utf8');
  for (const secret of Object.values(env)) assert.ok(!stored.includes(secret));
  assert.ok(!stored.includes(request.input.prompt));
});

test('concurrent clients with the same request key send at most one POST', async t => {
  const dir = await project(t);
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => { calls++; return json(queued); };
  const clients = [createProviderClient({ env, fetch }), createProviderClient({ env, fetch })];
  const jobs = await Promise.all(clients.map(c => c.submitHiggsfield(dir, request)));
  assert.equal(jobs[0].id, jobs[1].id);
  assert.equal(calls, 1);
});

test('an ambiguous network error remains unknown after restart and never retries POST', async t => {
  const dir = await project(t);
  const client = createProviderClient({ env, fetch: async () => { throw new Error(env.HIGGSFIELD_API_SECRET); } });
  const job = await client.submitHiggsfield(dir, request);
  assert.equal(job.status, 'submission_unknown');
  assert.ok(!JSON.stringify(job).includes(env.HIGGSFIELD_API_SECRET));
  const restarted = createProviderClient({ env, fetch: async () => { assert.fail('No automatic paid retry'); } });
  assert.deepEqual(await restarted.submitHiggsfield(dir, request), job);
  assert.equal((await restarted.pollHiggsfield(dir, job.id)).status, 'submission_unknown');
});

test('known rejected requests fail but ambiguous HTTP and malformed responses stay unknown', async t => {
  const dir = await project(t);
  for (const [status, body, expected] of [
    [401, { detail: env.HIGGSFIELD_API_SECRET }, 'failed'],
    [503, { detail: env.HIGGSFIELD_API_SECRET }, 'submission_unknown'],
    [200, { status: 'queued' }, 'submission_unknown']
  ] as const) {
    const client = createProviderClient({ env, fetch: async () => json(body, status) });
    const job = await client.submitHiggsfield(dir, { ...request, requestKey: `http-${status}` });
    assert.equal(job.status, expected);
    assert.ok(!JSON.stringify(job).includes(env.HIGGSFIELD_API_SECRET));
  }
});

test('polling reads the documented status endpoint and persists output URLs', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async (url, options) => {
    if (calls++ === 0) return json(queued);
    assert.equal(String(url), queued.status_url);
    assert.equal(options?.method, 'GET');
    return json({ status: 'completed', request_id: remoteId, images: [{ url: 'https://cdn.higgsfield.ai/result.png' }], video: { url: 'https://cdn.higgsfield.ai/result.mp4' }, audio: { url: 'https://cdn.higgsfield.ai/result.mp3' }, audios: [{ url: 'https://cdn.higgsfield.ai/result.mp3' }] });
  }});
  const started = await client.submitHiggsfield(dir, request);
  const done = await client.pollHiggsfield(dir, started.id);
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.outputUrls, ['https://cdn.higgsfield.ai/result.png', 'https://cdn.higgsfield.ai/result.mp4', 'https://cdn.higgsfield.ai/result.mp3']);
  assert.deepEqual((await client.listProviderJobs(dir))[0], done);
  await client.pollHiggsfield(dir, started.id);
  assert.equal(calls, 2);
});

test('poll errors preserve the accepted remote ID for later recovery', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async () => {
    if (calls++ === 0) return json(queued);
    if (calls === 2) throw new Error(env.HIGGSFIELD_API_SECRET);
    return json({ status: 'failed', request_id: remoteId, error: env.HIGGSFIELD_API_SECRET });
  }});
  const started = await client.submitHiggsfield(dir, request);
  const interrupted = await client.pollHiggsfield(dir, started.id);
  assert.equal(interrupted.status, 'submitted');
  assert.equal(interrupted.remoteId, remoteId);
  const failed = await client.pollHiggsfield(dir, started.id);
  assert.equal(failed.status, 'failed');
  assert.ok(!JSON.stringify([interrupted, failed]).includes(env.HIGGSFIELD_API_SECRET));
});

test('reordered input properties deduplicate and a partial acknowledgement retains its request ID', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async () => {
    calls++;
    return json({ request_id: remoteId });
  }});
  const first = await client.submitHiggsfield(dir, { ...request, input: { prompt: 'A portrait', seed: 1 } });
  assert.equal(first.remoteId, remoteId);
  assert.equal(first.status, 'submitted');
  assert.deepEqual(await client.submitHiggsfield(dir, { ...request, input: { seed: 1, prompt: 'A portrait' } }), first);
  assert.equal(calls, 1);
});

test('a mismatched status ID cannot replace a saved generation or mark it completed', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async () => calls++ === 0 ? json(queued) : json({
    status: 'completed', request_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', images: [{ url: 'https://cdn.example/wrong.png' }]
  }) });
  const first = await client.submitHiggsfield(dir, request);
  const job = await client.pollHiggsfield(dir, first.id);
  assert.equal(job.remoteId, remoteId);
  assert.equal(job.status, 'submitted');
  assert.equal(job.outputUrls, undefined);
});

test('provider output cannot include credential URLs or non-HTTPS media', async t => {
  const dir = await project(t);
  const client = createProviderClient({ env, fetch: async () => json({ status: 'completed', request_id: remoteId, images: [
    { url: 'https://user:password@cdn.example/result.png' },
    { url: 'http://cdn.example/result.png' },
    { url: `https://cdn.example/${env.HIGGSFIELD_API_SECRET}/result.png` },
    { url: 'https://cdn.example/valid.png' }
  ] }) });
  const result = await client.submitHiggsfield(dir, request);
  assert.deepEqual(result.outputUrls, ['https://cdn.example/valid.png']);
});

test('untrusted status URLs cannot receive credentials and a known remote ID remains recoverable', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async (url) => {
    if (calls++ === 0) return json({ ...queued, status_url: 'https://evil.example/steal' });
    assert.equal(String(url), queued.status_url);
    return json({ status: 'completed', request_id: remoteId, images: [{ url: 'https://cdn.example/result.png' }] });
  }});
  const started = await client.submitHiggsfield(dir, request);
  assert.equal(started.remoteId, remoteId);
  assert.equal((await client.pollHiggsfield(dir, started.id)).status, 'completed');
});

test('invalid routes, absent credentials, unapproved spending and secret fields fail before networking', async t => {
  const dir = await project(t);
  const client = createProviderClient({ env, fetch: async () => { assert.fail('Network must not be called'); } });
  for (const model of ['https://evil.example/x', '../admin', 'foo/../admin', 'foo/%2e%2e/admin', '//evil.example/a', 'foo/bar?x=1', 'foo\\bar']) {
    await assert.rejects(client.submitHiggsfield(dir, { ...request, model }));
  }
  await assert.rejects(client.submitHiggsfield(dir, { ...request, budgetApproved: false }), /budget/i);
  await assert.rejects(client.submitHiggsfield(dir, { ...request, input: { api_key: 'do-not-store' } }), /credential|secret/i);
  await assert.rejects(createProviderClient({ env: {} }).submitHiggsfield(dir, request), /credential/i);
  assert.deepEqual(await client.listProviderJobs(dir), []);
});

test('music generation uses Magnific Lyria 3 and the documented generated array', async t => {
  const dir = await project(t);
  let calls = 0;
  const client = createProviderClient({ env, fetch: async (url, options) => {
    assert.equal(new Headers(options?.headers).get('x-magnific-api-key'), env.MAGNIFIC_API_KEY);
    assert.equal(options?.redirect, 'error');
    if (calls++ === 0) {
      assert.equal(String(url), 'https://api.magnific.com/v1/ai/music-generation/lyria-3');
      assert.deepEqual(JSON.parse(String(options?.body)), { prompt: 'Gentle piano background music', model: 'clip' });
      return json({ data: { task_id: remoteId, status: 'CREATED', generated: [] } });
    }
    assert.equal(String(url), `https://api.magnific.com/v1/ai/music-generation/lyria-3/${remoteId}`);
    return json({ data: { task_id: remoteId, status: 'COMPLETED', generated: ['https://cdn.example/music.mp3'] } });
  }});
  const started = await client.submitMagnificMusic(dir, { prompt: 'Gentle piano background music', requestKey: 'music-v1', budgetApproved: true });
  const done = await client.pollMagnificMusic(dir, started.id);
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.outputUrls, ['https://cdn.example/music.mp3']);
});

test('manual reconciliation binds a verified existing remote job without another paid submission', async t => {
  const dir = await project(t);
  const unknown = await createProviderClient({ env, fetch: async () => { throw new Error('timeout'); } }).submitHiggsfield(dir, request);
  const client = createProviderClient({ env, fetch: async (url, options) => {
    assert.equal(options?.method, 'GET');
    assert.equal(String(url), queued.status_url);
    return json({ status: 'completed', request_id: remoteId, video: { url: 'https://cdn.example/video.mp4' } });
  }});
  const done = await client.reconcileProviderJob(dir, unknown.id, remoteId);
  assert.equal(done.remoteId, remoteId);
  assert.equal(done.status, 'completed');
});

test('job IDs cannot traverse paths and provider-jobs cannot escape through a junction', async t => {
  const dir = await project(t);
  const outside = await project(t);
  const client = createProviderClient({ env });
  await assert.rejects(client.pollHiggsfield(dir, '../project'), /job/i);
  await symlink(outside, join(dir, 'provider-jobs'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(client.submitHiggsfield(dir, request), /symlink|junction|directory/i);
  assert.deepEqual(await readdir(outside), []);
});

test('Windows sharing violations on local publication and cleanup never repeat a paid POST', { skip: process.platform !== 'win32' }, async t => {
  const dir = await project(t);
  const originalOpen = fs.open, originalLink = fs.link, originalRename = fs.rename, originalUnlink = fs.unlink;
  const counts = { open: 0, link: 0, rename: 0, unlink: 0 };
  const locked = () => Object.assign(new Error('Windows sharing violation'), { code: 'EPERM' });
  t.after(() => { Object.assign(fs, { open: originalOpen, link: originalLink, rename: originalRename, unlink: originalUnlink }); syncBuiltinESMExports(); });
  fs.open = async (...args: Parameters<typeof fs.open>) => {
    if (++counts.open <= 1) throw locked();
    return originalOpen(...args);
  };
  fs.link = async (...args: Parameters<typeof fs.link>) => {
    if (++counts.link <= 1) throw locked();
    return originalLink(...args);
  };
  fs.rename = async (...args: Parameters<typeof fs.rename>) => {
    if (++counts.rename <= 7) throw locked();
    return originalRename(...args);
  };
  fs.unlink = async (...args: Parameters<typeof fs.unlink>) => {
    if (++counts.unlink <= 1) throw locked();
    return originalUnlink(...args);
  };
  syncBuiltinESMExports();
  let posts = 0;
  const client = createProviderClient({ env, fetch: async () => { posts++; return json(queued); } });
  const job = await client.submitHiggsfield(dir, request);
  assert.equal(job.status, 'submitted');
  assert.equal(job.remoteId, remoteId);
  assert.equal(posts, 1);
  assert.equal((await client.listProviderJobs(dir))[0].remoteId, remoteId);
  assert.equal((await readdir(join(dir, 'provider-jobs'))).filter(file => file.endsWith('.tmp')).length, 0);
});

test('a successful acknowledgement rename does not delete the moved-away temporary path', async t => {
  const dir = await project(t);
  const originalUnlink = fs.unlink;
  t.after(() => { fs.unlink = originalUnlink; syncBuiltinESMExports(); });
  fs.unlink = async (...args: Parameters<typeof fs.unlink>) => {
    await fs.stat(args[0]).catch(() => { throw Object.assign(new Error('Moved source path is still locked'), { code: 'EPERM' }); });
    return originalUnlink(...args);
  };
  syncBuiltinESMExports();
  let posts = 0;
  const client = createProviderClient({ env, fetch: async () => { posts++; return json(queued); } });
  const job = await client.submitHiggsfield(dir, request);
  assert.equal(job.status, 'submitted');
  assert.equal(posts, 1);
  assert.equal((await client.listProviderJobs(dir))[0].remoteId, remoteId);
});
