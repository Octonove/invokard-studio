import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { ProviderJob } from './types.js';

const HIGGSFIELD = 'https://api.higgsfield.ai';
const MUSIC = 'https://api.magnific.com/v1/ai/music-generation/lyria-3';
const REMOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_ID = /^[0-9a-f]{64}$/;
const UNKNOWN_MESSAGE = 'Submission may have reached the provider. Do not resubmit. Check provider history/support and reconcile the existing request ID.';
type Provider = 'higgsfield' | 'magnific';
type Environment = Record<string, string | undefined>;
export interface HiggsfieldOptions { model: string; input: Record<string, unknown>; requestKey: string; budgetApproved: boolean; }
export interface MagnificMusicOptions { prompt: string; model?: 'clip' | 'pro'; requestKey: string; budgetApproved: boolean; }
export interface ProviderDependencies { fetch?: typeof globalThis.fetch; env?: Environment; }
const jobSchema = z.object({
  id: z.string().regex(JOB_ID), provider: z.enum(['higgsfield', 'magnific']), remoteId: z.string().regex(REMOTE_ID).optional(),
  model: z.string().max(240), status: z.enum(['pending', 'submitted', 'completed', 'failed', 'submission_unknown']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), outputUrls: z.array(z.string().max(8192)).max(100).optional(), error: z.string().max(1000).optional()
});
const storedSchema = z.object({ version: z.literal(1), fingerprint: z.string().regex(JOB_ID), job: jobSchema });
type Stored = z.infer<typeof storedSchema>;

export function providerCatalog() {
  return [
    { id: 'magnific', name: 'Magnific', integration: 'remote_mcp_oauth', endpoint: 'https://mcp.magnific.com',
      capabilities: ['image_generation', 'video_generation', 'text_to_speech', 'upscale'], capabilityStatus: 'available_through_host_after_oauth',
      music: { integration: 'local_api_adapter', model: 'lyria-3', variants: ['clip', 'pro'], credentialEnvironment: 'MAGNIFIC_API_KEY', capabilityStatus: 'implemented_mock_tested' },
      accountAccessVerified: false, documentation: 'https://docs.magnific.com/modelcontextprotocol' },
    { id: 'higgsfield', name: 'Higgsfield', integration: 'local_api_adapter', endpoint: HIGGSFIELD,
      capabilities: ['image_generation', 'video_generation', 'audio_outputs_when_supported_by_model'], capabilityStatus: 'implemented_mock_tested',
      modelDiscovery: 'https://console.higgsfield.ai', examples: ['higgsfield-ai/soul/v2/standard', 'higgsfield/genjutsu/motion-transfer/v1.0'],
      accountAccessVerified: false, documentation: 'https://docs.higgsfield.ai/docs' }
  ];
}

export function providerSetup(provider: Provider) {
  if (provider === 'magnific') return {
    provider, instructions: [
      'Add the official remote MCP server to your host and complete its browser OAuth sign-in.',
      'The host owns the OAuth session; use the Magnific tools exposed by the host for images, video and voices.',
      'For the optional Lyria 3 music API adapter, set MAGNIFIC_API_KEY in the server environment. Never paste credentials into tool arguments.',
      'Configuration alone does not verify account access, available credits or successful generation.'
    ],
    mcpConfig: { mcpServers: { magnific: { type: 'http', url: 'https://mcp.magnific.com' } } },
    urls: { documentation: 'https://docs.magnific.com/modelcontextprotocol', apiKeys: 'https://www.magnific.com/user/organization/api-keys', music: 'https://docs.magnific.com/api-reference/music-generation/lyria-3/generate' }
  };
  if (provider === 'higgsfield') return {
    provider, instructions: [
      'Create API credentials in Higgsfield Console and set HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET in the server environment.',
      'Select a model in the Console and use its current model-specific input schema. The adapter sends input directly as JSON.',
      'Use one stable requestKey per intended generation and set budgetApproved only after approving that generation expense.',
      'Poll the persisted local job ID. For submission_unknown, inspect provider history/support and reconcile its existing request ID before considering a new generation.'
    ], mcpConfig: undefined,
    urls: { console: 'https://console.higgsfield.ai', documentation: 'https://docs.higgsfield.ai/docs', lifecycle: 'https://docs.higgsfield.ai/docs/concepts/requests' }
  };
  throw new Error('Unsupported provider.');
}

function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }
function code(error: unknown) { return (error as NodeJS.ErrnoException)?.code; }
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function canonical(value: unknown, ancestors = new Set<unknown>()): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Input must contain finite, acyclic JSON values.');
  ancestors.add(value);
  let result: string;
  if (Array.isArray(value)) result = '[' + value.map(v => canonical(v, ancestors)).join(',') + ']';
  else result = '{' + Object.keys(value as object).sort().map(k => {
    if (/^(authorization|api[_-]?key|api[_-]?secret|access[_-]?token|secret|password|credentials|headers)$/i.test(k)) {
      throw new Error('Credentials and secret fields belong in the server environment, not generation input.');
    }
    return JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k], ancestors);
  }).join(',') + '}';
  ancestors.delete(value);
  return result;
}
function validateModel(model: string) {
  if (typeof model !== 'string' || model.length > 240 || !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*){1,7}$/.test(model)
    || model.split('/').some(s => s === '.' || s === '..') || /^(requests|agents|organizations|billing|auth)\//.test(model)) {
    throw new Error('Model must be a model path from Higgsfield Console, not a URL or API management route.');
  }
}
function safeOutput(value: unknown, env: Environment): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  if (Object.values(env).some(secret => secret && secret.length >= 6 && value.includes(secret))) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

async function jobDirectory(projectDir: string, create: boolean): Promise<string | undefined> {
  const root = await realpath(resolve(projectDir));
  const path = join(root, 'provider-jobs');
  if (create) {
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if (code(error) !== 'EEXIST') throw error; }
  }
  let stat;
  try { stat = await lstat(path); }
  catch (error) { if (code(error) === 'ENOENT' && !create) return undefined; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new Error('Provider job directory cannot be a symlink or junction.');
  return path;
}
async function readStored(path: string): Promise<Stored> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error('Invalid provider job file.');
  const parsed = storedSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
  if (!parsed.success) throw new Error('Invalid provider job record; preserve it and inspect locally.');
  return parsed.data;
}
async function retryLocalFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 2_000;
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const remaining = deadline - Date.now();
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code(error) ?? '') || remaining <= 0) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(50 * (attempt + 1), 250, remaining)));
    }
  }
}
async function saveStored(directory: string, stored: Stored, exclusive = false): Promise<boolean> {
  const target = join(directory, `${stored.job.id}.json`);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  let temporaryExists = false;
  try {
    const handle = await retryLocalFileOperation(() => open(temporary, 'wx', 0o600));
    temporaryExists = true;
    try { await handle.writeFile(JSON.stringify(stored, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    if (exclusive) {
      try { await retryLocalFileOperation(() => link(temporary, target)); }
      catch (error) { if (code(error) === 'EEXIST') return false; throw error; }
    } else {
      // Windows sharing locks can affect creation, publication and removal.
      // Retry only these local filesystem operations, never a provider request.
      await retryLocalFileOperation(() => rename(temporary, target));
      // Rename consumed the source name. A redundant unlink can receive EPERM
      // while Windows finishes releasing it, despite a durable acknowledgement.
      temporaryExists = false;
    }
    return true;
  } finally {
    if (temporaryExists) await retryLocalFileOperation(() => unlink(temporary)).catch(error => { if (code(error) !== 'ENOENT') throw error; });
  }
}

export function createProviderClient(dependencies: ProviderDependencies = {}) {
  const environment = () => dependencies.env ?? process.env;
  const fetcher: typeof globalThis.fetch = (url, options) => (dependencies.fetch ?? globalThis.fetch)(url, options);
  function getProviderStatus() {
    const env = environment();
    return {
      higgsfield: { apiKeyConfigured: Boolean(env.HIGGSFIELD_API_KEY?.trim()), apiSecretConfigured: Boolean(env.HIGGSFIELD_API_SECRET?.trim()),
        credentialsConfigured: Boolean(env.HIGGSFIELD_API_KEY?.trim() && env.HIGGSFIELD_API_SECRET?.trim()), connectionVerified: false },
      magnific: { musicApiKeyConfigured: Boolean(env.MAGNIFIC_API_KEY?.trim()), oauthManagedByHost: true, connectionVerified: false }
    };
  }
  function headers(provider: Provider): Record<string, string> {
    const env = environment();
    if (provider === 'higgsfield') {
      const key = env.HIGGSFIELD_API_KEY?.trim(), secret = env.HIGGSFIELD_API_SECRET?.trim();
      if (!key || !secret) throw new Error('Higgsfield credentials are missing: set HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET.');
      if (/[:\r\n]/.test(key) || /[\r\n]/.test(secret)) throw new Error('Higgsfield credentials have an invalid format.');
      return { Authorization: `Key ${key}:${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' };
    }
    const key = env.MAGNIFIC_API_KEY?.trim();
    if (!key || /[\r\n]/.test(key)) throw new Error('Magnific music API credential is missing or invalid: set MAGNIFIC_API_KEY.');
    return { 'x-magnific-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' };
  }
  function publicJob(stored: Stored): ProviderJob {
    const job = jobSchema.parse(stored.job);
    if (job.outputUrls) job.outputUrls = job.outputUrls.flatMap(url => safeOutput(url, environment()) ?? []);
    return job;
  }
  function applyResponse(stored: Stored, body: unknown): boolean {
    const raw = object(body), data = stored.job.provider === 'magnific' ? object(raw?.data) : raw;
    const remoteId = data?.[stored.job.provider === 'magnific' ? 'task_id' : 'request_id'];
    if (typeof remoteId !== 'string' || !REMOTE_ID.test(remoteId) || (stored.job.remoteId && remoteId !== stored.job.remoteId)) return false;
    stored.job.remoteId = remoteId;
    stored.job.status = 'submitted';
    delete stored.job.error;
    const state = typeof data?.status === 'string' ? data.status.toLowerCase() : '';
    if (['queued', 'created', 'in_progress'].includes(state)) return true;
    if (['failed', 'error', 'nsfw', 'canceled', 'cancelled'].includes(state)) {
      stored.job.status = 'failed';
      stored.job.error = state === 'nsfw' ? 'Provider rejected this request under its content policy.' : state === 'canceled' || state === 'cancelled' ? 'Provider reports this request was canceled.' : 'Provider reports generation failed. Inspect the request in the provider console.';
      return true;
    }
    if (state !== 'completed') return false;
    stored.job.status = 'completed';
    const media: unknown[] = stored.job.provider === 'magnific' ? (Array.isArray(data?.generated) ? data.generated : [])
      : [ ...(Array.isArray(data?.images) ? data.images : []), data?.video, data?.audio, ...(Array.isArray(data?.audios) ? data.audios : []) ]
        .map(item => object(item)?.url);
    stored.job.outputUrls = [...new Set(media.flatMap(url => safeOutput(url, environment()) ?? []))];
    if (stored.job.outputUrls.length === 0) stored.job.error = 'Provider reports completion without a supported HTTPS media URL; inspect the provider console.';
    return true;
  }
  async function listProviderJobs(projectDir: string): Promise<ProviderJob[]> {
    const directory = await jobDirectory(projectDir, false);
    if (!directory) return [];
    const files = (await readdir(directory)).filter(name => /^[0-9a-f]{64}\.json$/.test(name));
    const jobs = await Promise.all(files.map(async file => publicJob(await readStored(join(directory, file)))));
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  async function submit(projectDir: string, provider: Provider, model: string, input: Record<string, unknown>, requestKey: string, budgetApproved: boolean): Promise<ProviderJob> {
    if (typeof requestKey !== 'string' || requestKey.trim().length < 1 || requestKey.length > 200) throw new Error('requestKey must contain 1–200 characters.');
    if (!object(input)) throw new Error('Generation input must be a JSON object.');
    const body = canonical(input);
    if (body.length > 1_000_000) throw new Error('Generation input is too large; use public media URLs.');
    const env = environment();
    if ([env.HIGGSFIELD_API_KEY, env.HIGGSFIELD_API_SECRET, env.MAGNIFIC_API_KEY].some(secret => secret && secret.length >= 6 && body.includes(secret))) {
      throw new Error('Generation input must not contain provider credentials.');
    }
    const id = sha(`${provider}\0${requestKey}`), fingerprint = sha(`${provider}\0${model}\0${body}`);
    const existingDirectory = await jobDirectory(projectDir, false);
    const existing = async (directory: string) => {
      const stored = await readStored(join(directory, `${id}.json`));
      if (stored.fingerprint !== fingerprint) throw new Error('This requestKey already identifies a different request. Use the existing job or a new key for an intentional new generation.');
      return publicJob(stored);
    };
    if (existingDirectory) {
      try { return await existing(existingDirectory); }
      catch (error) { if (code(error) !== 'ENOENT') throw error; }
    }
    if (budgetApproved !== true) throw new Error('A concrete generation budget must be approved before submission.');
    const auth = headers(provider);
    const directory = (await jobDirectory(projectDir, true))!;
    const now = new Date().toISOString();
    const stored: Stored = { version: 1, fingerprint, job: { id, provider, model, status: 'submission_unknown', createdAt: now, updatedAt: now, error: UNKNOWN_MESSAGE } };
    // The exclusive hard-link publishes a complete, fsynced intent atomically. A crash
    // before or after POST never makes the same request key eligible for resubmission.
    if (!await saveStored(directory, stored, true)) return existing(directory);
    try {
      const response = await fetcher(provider === 'higgsfield' ? `${HIGGSFIELD}/${model}` : MUSIC, {
        method: 'POST', headers: auth, body, redirect: 'error', signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) {
        const rejected = [400, 401, 402, 403, 404, 405, 413, 415, 422, 423, 429].includes(response.status);
        stored.job.status = rejected ? 'failed' : 'submission_unknown';
        stored.job.error = rejected ? `Provider rejected submission (HTTP ${response.status}). Review credentials, credits and model input before creating a new request.` : UNKNOWN_MESSAGE;
      } else {
        try {
          if (!applyResponse(stored, await response.json())) stored.job.error = stored.job.remoteId ? 'Provider response was incomplete; poll the saved request ID.' : UNKNOWN_MESSAGE;
        } catch { stored.job.error = UNKNOWN_MESSAGE; }
      }
    } catch { stored.job.error = UNKNOWN_MESSAGE; }
    stored.job.updatedAt = new Date().toISOString();
    try { await saveStored(directory, stored); }
    catch (error) { throw new Error(`Could not save provider acknowledgement (${code(error) ?? 'IO'}). Preserve local job ${id}${stored.job.remoteId ? ` and remote request ${stored.job.remoteId}` : ''}; do not resubmit.`); }
    return publicJob(stored);
  }
  async function submitHiggsfield(projectDir: string, options: HiggsfieldOptions): Promise<ProviderJob> {
    validateModel(options.model);
    return submit(projectDir, 'higgsfield', options.model, options.input, options.requestKey, options.budgetApproved);
  }
  async function submitMagnificMusic(projectDir: string, options: MagnificMusicOptions): Promise<ProviderJob> {
    if (typeof options.prompt !== 'string' || options.prompt.length < 10 || options.prompt.length > 2000) throw new Error('Music prompt must contain 10–2000 characters.');
    const model = options.model ?? 'clip';
    if (!['clip', 'pro'].includes(model)) throw new Error('Lyria 3 model must be clip or pro.');
    return submit(projectDir, 'magnific', `lyria-3/${model}`, { prompt: options.prompt, model }, options.requestKey, options.budgetApproved);
  }
  async function loadJob(projectDir: string, jobId: string) {
    if (!JOB_ID.test(jobId)) throw new Error('Invalid local provider job ID.');
    const directory = await jobDirectory(projectDir, false);
    if (!directory) throw new Error('Provider job not found.');
    const stored = await readStored(join(directory, `${jobId}.json`));
    if (stored.job.id !== jobId) throw new Error('Provider job identity does not match its filename.');
    return { directory, stored };
  }
  async function poll(projectDir: string, jobId: string, provider?: Provider, reconcileId?: string): Promise<ProviderJob> {
    const { directory, stored } = await loadJob(projectDir, jobId);
    if (provider && stored.job.provider !== provider) throw new Error('Job belongs to another provider.');
    if (reconcileId && (!REMOTE_ID.test(reconcileId) || (stored.job.remoteId && stored.job.remoteId !== reconcileId))) throw new Error('Invalid remote request ID or job already bound to a different request.');
    if (['completed', 'failed'].includes(stored.job.status)) return publicJob(stored);
    const remoteId = reconcileId ?? stored.job.remoteId;
    if (!remoteId) return publicJob(stored);
    const auth = headers(stored.job.provider);
    // Constructing this documented route also permits recovering a request ID found
    // manually. Never follow a status URL or redirect supplied by a provider payload.
    const url = stored.job.provider === 'higgsfield' ? `${HIGGSFIELD}/requests/${remoteId}/status` : `${MUSIC}/${remoteId}`;
    try {
      const response = await fetcher(url, { method: 'GET', headers: auth, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) stored.job.error = `Status check failed (HTTP ${response.status}); the existing generation was not resubmitted. Poll again or inspect the provider console.`;
      else {
        const payload: unknown = await response.json();
        const data = stored.job.provider === 'magnific' ? object(object(payload)?.data) : object(payload);
        if (data?.[stored.job.provider === 'magnific' ? 'task_id' : 'request_id'] !== remoteId || !applyResponse(stored, payload)) {
          stored.job.error = 'Status response was incomplete or did not match the requested ID. Poll again or inspect the provider console.';
        }
      }
    } catch { stored.job.error = 'Status check could not be completed. The existing generation was not resubmitted; poll again.'; }
    stored.job.updatedAt = new Date().toISOString();
    await saveStored(directory, stored);
    return publicJob(stored);
  }
  return {
    getProviderStatus, listProviderJobs, submitHiggsfield, submitMagnificMusic,
    pollHiggsfield: (projectDir: string, jobId: string) => poll(projectDir, jobId, 'higgsfield'),
    pollMagnificMusic: (projectDir: string, jobId: string) => poll(projectDir, jobId, 'magnific'),
    reconcileProviderJob: (projectDir: string, jobId: string, remoteId: string) => poll(projectDir, jobId, undefined, remoteId)
  };
}

const defaultClient = createProviderClient();
export const getProviderStatus = defaultClient.getProviderStatus;
export const listProviderJobs = defaultClient.listProviderJobs;
export const submitHiggsfield = defaultClient.submitHiggsfield;
export const pollHiggsfield = defaultClient.pollHiggsfield;
export const submitMagnificMusic = defaultClient.submitMagnificMusic;
export const pollMagnificMusic = defaultClient.pollMagnificMusic;
export const reconcileProviderJob = defaultClient.reconcileProviderJob;
