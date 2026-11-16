// Local server for the render page: the bundle, the project's public/ folder, Google Fonts (downloaded once and kept
// in the project's .invokard/fonts, so later renders work offline) and frames of video files extracted with ffmpeg.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 20);

const inside = (base, rel) => {
  const full = resolve(base, rel);
  return full === resolve(base) || full.startsWith(resolve(base) + sep) ? full : null;
};
const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {'content-type': type, 'cache-control': 'no-store'});
  res.end(body);
};
const sendFile = (res, file) => {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, `Not found: ${file || ''}`);
  res.writeHead(200, {'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*'});
  createReadStream(file).pipe(res);
};

// ---------------------------------------------------------------- fonts
async function fontCss(res, search, fontsDir) {
  const query = new URLSearchParams(search);
  const wanted = new Set([...(query.get('subsets') || 'latin').split(','), 'latin', 'latin-ext']);
  query.delete('subsets');
  const cssFile = join(fontsDir, 'css', `${sha(query.toString())}.css`);
  if (existsSync(cssFile)) return send(res, 200, readFileSync(cssFile), MIME['.css']);
  let css;
  try {
    const r = await fetch(`https://fonts.googleapis.com/css2?${query.toString()}`, {headers: {'user-agent': CHROME_UA}});
    if (!r.ok) return send(res, r.status, `Google Fonts answered ${r.status} for ${query.get('family')}: check the family name and weights`);
    css = await r.text();
  } catch (e) {
    return send(res, 503, `Font ${query.get('family')} is not cached and Google Fonts cannot be reached (${e.message})`);
  }
  // Keep the blocks of the requested subsets plus latin and latin-ext (every European language), stored locally.
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)];
  const kept = [];
  mkdirSync(join(fontsDir, 'files'), {recursive: true});
  for (const [, subset, block] of blocks.length ? blocks : [...css.matchAll(/()(@font-face\s*{[^}]*})/g)]) {
    if (subset && !wanted.has(subset)) continue;
    let local = block;
    for (const [, url] of block.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
      const name = `${sha(url)}${extname(new URL(url).pathname) || '.woff2'}`;
      const target = join(fontsDir, 'files', name);
      if (!existsSync(target)) {
        const r = await fetch(url, {headers: {'user-agent': CHROME_UA}});
        if (!r.ok) return send(res, 502, `Could not download ${url} (${r.status})`);
        writeFileSync(target, Buffer.from(await r.arrayBuffer()));
      }
      local = local.replace(url, `/__fonts/file/files/${name}`);
    }
    kept.push(`/* ${subset || 'all'} */\n${local}`);
  }
  mkdirSync(join(fontsDir, 'css'), {recursive: true});
  writeFileSync(cssFile, kept.join('\n'));
  send(res, 200, kept.join('\n'), MIME['.css']);
}

// ---------------------------------------------------------------- video frames
// Each video is decoded once per render at the composition's frame rate into JPEG frames (best quality), shared by
// every tab. The frame for time t is frame floor(t * fps).
function videoFrames(ffmpeg, source, fps, videoDir, cache) {
  const key = `${source}|${fps}`;
  if (!cache.has(key)) {
    const dir = join(videoDir, sha(key));
    mkdirSync(dir, {recursive: true});
    cache.set(key, new Promise((resolveFrames, reject) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-i', source, '-an', '-vf', `fps=${fps}`, '-q:v', '2', join(dir, '%06d.jpg')]);
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('close', (code) => {
        const count = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jpg')).length : 0;
        if (code !== 0 || !count) reject(new Error(`ffmpeg could not read the video ${source}: ${err.trim().split('\n').pop()}`));
        else resolveFrames({dir, count});
      });
    }));
  }
  return cache.get(key);
}

export async function startServer({bundleDir, publicDir, fontsDir, videoDir, ffmpeg}) {
  const videos = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (path === '/' || path === '/index.html') return sendFile(res, join(bundleDir, 'index.html'));
      if (path.startsWith('/public/')) return sendFile(res, inside(publicDir, path.slice('/public/'.length)));
      if (path === '/__fonts/css2') return await fontCss(res, url.search, fontsDir);
      if (path.startsWith('/__fonts/file/')) return sendFile(res, inside(fontsDir, path.slice('/__fonts/file/'.length)));
      if (path === '/__video') {
        if (!ffmpeg) return send(res, 500, 'ffmpeg is needed to show video files');
        const src = url.searchParams.get('src') || '';
        const fps = Number(url.searchParams.get('fps')) || 30;
        const t = Math.max(0, Number(url.searchParams.get('t')) || 0);
        const local = src.startsWith('/public/') ? inside(publicDir, decodeURIComponent(src.slice('/public/'.length))) : null;
        const source = local || (/^https?:\/\//.test(src) ? src : null);
        if (!source || (local && !existsSync(local))) return send(res, 404, `Video not found: ${src}`);
        const {dir, count} = await videoFrames(ffmpeg, source, fps, videoDir, videos);
        const k = Math.min(count, Math.max(1, Math.floor(t * fps + 1e-6) + 1));
        return sendFile(res, join(dir, `${String(k).padStart(6, '0')}.jpg`));
      }
      return sendFile(res, inside(bundleDir, path.slice(1)));
    } catch (e) {
      send(res, 500, String((e && e.message) || e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(() => r()))};
}
