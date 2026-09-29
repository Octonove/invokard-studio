import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, realpath, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Asset } from './types.js';

const MAX_BYTES = 2 * 1024 ** 3;
const MAX_REDIRECTS = 3;
type Kind = Asset['kind'];
export interface DownloadDependencies {
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  request?: typeof httpsRequest;
  maxBytes?: number;
  timeoutMs?: number;
}
const blocked4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) blocked4.addSubnet(address, prefix, 'ipv4');
const global6 = new BlockList(); global6.addSubnet('2000::', 3, 'ipv6');
const blocked6 = new BlockList();
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked6.addSubnet(address, prefix, 'ipv6');

class DownloadError extends Error {}
function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, 'ipv4');
  if (family === 6) return global6.check(address, 'ipv6') && !blocked6.check(address, 'ipv6');
  return false;
}
function parseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new DownloadError('A valid HTTPS media URL is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new DownloadError('Only HTTPS media URLs on port 443 without embedded credentials are allowed.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || /(^|\.)(localhost|local|internal|lan|home)$/.test(hostname.toLowerCase()) || (isIP(hostname) && !publicAddress(hostname))) {
    throw new DownloadError('Media downloads must use public internet addresses.');
  }
  url.hash = '';
  return url;
}
function extension(url: URL, headers: IncomingMessage['headers'], kind: Kind): string {
  const mime = (headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
  const byMime: Record<Kind, Record<string, string>> = {
    image: { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' },
    video: { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv', 'video/webm': '.webm' },
    audio: { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/ogg': '.ogg' }
  };
  if (byMime[kind]?.[mime]) return byMime[kind][mime];
  if (mime && mime !== 'application/octet-stream') throw new DownloadError('Response media type does not match the requested asset kind.');
  const extensions: Record<Kind, string[]> = { image: ['.png', '.jpg', '.jpeg', '.webp'], video: ['.mp4', '.mov', '.mkv', '.webm'], audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'] };
  const ext = extname(url.pathname).toLowerCase();
  if (!extensions[kind]?.includes(ext)) throw new DownloadError('Response has no supported media type or filename extension.');
  return ext;
}
async function tempDirectory(projectDir: string): Promise<string> {
  const root = await realpath(resolve(projectDir)), directory = join(root, '.downloads');
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) throw new DownloadError('Download directory cannot be a symlink or junction.');
  return directory;
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DownloadError('Media download timed out.');
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      abort = () => reject(new DownloadError('Media download timed out.'));
      signal.addEventListener('abort', abort, { once: true });
    })]);
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}

export function createDownloader(dependencies: DownloadDependencies = {}) {
  const maxBytes = dependencies.maxBytes ?? MAX_BYTES;
  const timeoutMs = dependencies.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new DownloadError('Invalid download size or timeout limit.');
  }
  const lookup = dependencies.lookup ?? ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const request = dependencies.request ?? httpsRequest;
  async function responseAt(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const literalFamily = isIP(hostname);
    const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await abortable(lookup(hostname), signal);
    if (!addresses.length || addresses.some(item => !publicAddress(item.address) || isIP(item.address) !== item.family)) throw new DownloadError('Media downloads must resolve only to public internet addresses.');
    const chosen = addresses[0];
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: chosen.address, family: chosen.family }]);
      else callback(null, chosen.address, chosen.family);
    };
    return abortable(new Promise<IncomingMessage>((resolveResponse, reject) => {
      const options: RequestOptions = { method: 'GET', agent: false, lookup: pinnedLookup, signal,
        headers: { Accept: 'image/*,video/*,audio/*,application/octet-stream', 'Accept-Encoding': 'identity', 'User-Agent': 'Invokard-Studio/0.1' } };
      const req = request(url, options, resolveResponse);
      req.once('error', () => reject(new DownloadError('Media download failed or timed out.')));
      req.end();
    }), signal);
  }
  return async function downloadToTemp(projectDir: string, sourceUrl: string, kind: Kind): Promise<string> {
    if (!['image', 'video', 'audio'].includes(kind)) throw new DownloadError('Unsupported asset kind.');
    let url = parseUrl(sourceUrl);
    const directory = await tempDirectory(projectDir);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let path: string | undefined;
    let response: IncomingMessage | undefined;
    try {
      for (let redirects = 0; ; redirects++) {
        response = await responseAt(url, controller.signal);
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          if (redirects >= MAX_REDIRECTS) throw new DownloadError('Media download exceeded the redirect limit.');
          const location = response.headers.location;
          if (!location) throw new DownloadError('Media redirect has no destination.');
          try { url = parseUrl(new URL(location, url).href); }
          catch (error) { if (error instanceof DownloadError) throw error; throw new DownloadError('Media redirect has an invalid destination.'); }
          continue;
        }
        if (status < 200 || status >= 300 || status === 204 || status === 206) throw new DownloadError(`Media download was rejected (HTTP ${status}).`);
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw new DownloadError('Encoded media responses are unsupported.');
        const ext = extension(url, response.headers, kind);
        const declared = response.headers['content-length'];
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new DownloadError('Media response exceeds the download size limit.');
        path = join(directory, `${randomUUID()}${ext}`);
        let received = 0;
        const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          callback(received > maxBytes ? new DownloadError('Media response exceeds the download size limit.') : null, chunk);
        } });
        await pipeline(response, meter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
        if (received === 0 || (declared && received !== Number(declared))) throw new DownloadError('Media response was empty or incomplete.');
        return path;
      }
    } catch (error) {
      response?.destroy();
      if (path) await unlink(path).catch(() => {});
      if (error instanceof DownloadError) throw error;
      throw new DownloadError('Media download failed or timed out.');
    } finally { clearTimeout(timer); }
  };
}

export const downloadToTemp = createDownloader();
