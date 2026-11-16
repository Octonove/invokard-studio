// Bundles an animation (its entry file and everything it imports) into one script for the render page, with esbuild.
// 'invokard-studio' resolves to the runtime of this engine. React, three and @react-three/fiber are always taken from
// one place (the project's node_modules if it has them, else the engine's): two copies of React break every hook.
//
// Sandboxed agents (Codex on Windows, for one) may forbid listing the folders above the project. esbuild lists every
// ancestor folder while resolving and stops on "Access is denied" there, so when that happens the bundle is built again
// in a safe mode: every import is resolved and every file is read by this module (Node's resolution rules), and esbuild
// never lists a folder.
import {build} from 'esbuild';
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, extname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
export const ENGINE = resolve(SRC, '..');
const SHARED = /^(react|react-dom|scheduler|three|@react-three\/fiber)(\/.*)?$/;
const ASSETS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.mp4', '.webm', '.mov', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.glb', '.gltf', '.hdr'];
const LOADERS = {'.js': 'jsx', '.jsx': 'jsx', '.mjs': 'jsx', '.cjs': 'js', '.ts': 'ts', '.tsx': 'tsx', '.mts': 'ts',
  '.cts': 'ts', '.json': 'json', '.css': 'css', '.txt': 'text'};
const CODE_EXTS = ['.jsx', '.js', '.mjs', '.cjs', '.tsx', '.ts', '.json'];

// Family name from a module name: Inter -> Inter, BarlowSemiCondensed -> Barlow Semi Condensed, NotoSansJP -> Noto Sans JP.
export const familyName = (module) => module.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

// The project is the nearest folder above the entry with a package.json (its public/ and node_modules live there).
export function projectRoot(entry) {
  const start = dirname(resolve(entry));
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    if (dirname(dir) === dir) return start;
  }
}

const page = (css) => '<!doctype html><html><head><meta charset="utf-8">' +
  '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
  '#invokard-root{position:relative;overflow:hidden;background:#fff}' +
  'html.transparent #invokard-root{background:transparent}</style>' +
  (css ? '<link rel="stylesheet" href="/bundle.css">' : '') + '</head>' +
  '<body><div id="invokard-root"></div><script src="/bundle.js"></script></body></html>';

const fontModule = (name) => name
  ? `import {createFont} from ${JSON.stringify(join(SRC, 'fonts.js'))};\n` +
    `export const fontFamily = ${JSON.stringify(familyName(name))};\nexport const loadFont = createFont(fontFamily);\n`
  : `export {loadGoogleFont, createFont} from ${JSON.stringify(join(SRC, 'fonts.js'))};\n`;

// The engine's own modules: the entry, the API, 3D and fonts. `ns` is the namespace real files are put in.
const engineModules = (b, file, ns) => {
  b.onResolve({filter: /^@invokard-entry$/}, () => ({path: file, namespace: ns}));
  // The API. `remotion` maps here too, so code written for that API's subset builds unchanged.
  b.onResolve({filter: /^(invokard-studio|remotion)$/}, () => ({path: join(SRC, 'runtime.js'), namespace: ns}));
  b.onResolve({filter: /^(invokard-studio\/three|@remotion\/three)$/}, () => ({path: join(SRC, 'three.jsx'), namespace: ns}));
  b.onResolve({filter: /^(invokard-studio|@remotion)\/google-fonts(\/[^/]+)?$/}, (a) =>
    ({path: a.path.split('/').slice(2).join('/'), namespace: 'invokard-font'}));
  b.onLoad({filter: /.*/, namespace: 'invokard-font'}, (a) => ({resolveDir: SRC, loader: 'js', contents: fontModule(a.path)}));
};

// Normal mode: esbuild resolves and reads files itself; only the shared libraries are pinned to one copy.
const normalPlugin = (file, root) => ({
  name: 'invokard-studio',
  setup(b) {
    engineModules(b, file, 'file');
    b.onResolve({filter: SHARED}, async (a) => {
      if (a.pluginData === 'invokard-shared') return undefined;
      for (const dir of [root, ENGINE]) {
        const r = await b.resolve(a.path, {resolveDir: dir, kind: a.kind, pluginData: 'invokard-shared'});
        if (!r.errors.length) return r;
      }
      return undefined;
    });
  },
});

// Safe mode: this module resolves every import (Node's rules) and reads every file, so esbuild lists no folder.
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const findFile = (base) => {
  if (isFile(base)) return base;
  for (const e of CODE_EXTS) if (isFile(base + e)) return base + e;
  for (const e of CODE_EXTS) if (isFile(join(base, 'index' + e))) return join(base, 'index' + e);
  return null;
};
// Package resolution the way a browser bundler does it: `exports` with the conditions browser / import / module /
// default (first matching key in the package's own order), else the `browser`, `module` or `main` field. Packages are
// looked for in node_modules folders from the importer up to the project (or engine) root, never above it.
const ACTIVE = new Set(['browser', 'import', 'module', 'default']);
const pickTarget = (t) => {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) { for (const x of t) { const r = pickTarget(x); if (r) return r; } return null; }
  if (t && typeof t === 'object') for (const [k, v] of Object.entries(t)) if (ACTIVE.has(k)) { const r = pickTarget(v); if (r) return r; }
  return null;
};
const exportsTarget = (exp, sub) => {
  if (typeof exp === 'string' || Array.isArray(exp)) return sub === '.' ? pickTarget(exp) : null;
  const keys = Object.keys(exp || {});
  if (!keys.length) return null;
  if (!keys[0].startsWith('.')) return sub === '.' ? pickTarget(exp) : null;     // conditions straight at the top level
  if (exp[sub] !== undefined) return pickTarget(exp[sub]);
  let best = null;
  for (const k of keys) {
    const i = k.indexOf('*');
    if (i < 0) continue;
    const pre = k.slice(0, i), post = k.slice(i + 1);
    if (sub.startsWith(pre) && sub.endsWith(post) && sub.length >= pre.length + post.length && (!best || pre.length > best.pre.length)) {
      best = {pre, k, star: sub.slice(pre.length, sub.length - post.length)};
    }
  }
  const t = best && pickTarget(exp[best.k]);
  return t ? t.replace(/\*/g, best.star) : null;
};
const packageFile = (spec, bases) => {
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  const sub = '.' + spec.slice(name.length);
  for (const base of bases) {
    const dir = join(base, 'node_modules', name);
    if (!isFile(join(dir, 'package.json'))) continue;
    let meta;
    try { meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { continue; }
    if (meta.exports !== undefined) {
      const t = exportsTarget(meta.exports, sub);
      const f = t && findFile(join(dir, t));
      if (f) return f;
      continue;
    }
    const entry = sub !== '.' ? sub : (typeof meta.browser === 'string' && meta.browser) || meta.module || meta.main || 'index.js';
    const f = findFile(join(dir, entry));
    if (f) return f;
  }
  return null;
};
// Folders from `start` up to the first of `stops` that contains it (inclusive).
const upTo = (start, stops) => {
  const stop = stops.find((s) => start === s || start.startsWith(s + '\\') || start.startsWith(s + '/'));
  const dirs = [];
  for (let d = start; ; d = dirname(d)) {
    dirs.push(d);
    if (!stop || d === stop || dirname(d) === d) break;
  }
  return stop ? dirs : [start];
};
const safePlugin = (file, root) => ({
  name: 'invokard-studio-safe',
  setup(b) {
    const NS = 'invokard-fs';
    engineModules(b, file, NS);
    b.onResolve({filter: /.*/}, (a) => {
      if (a.path.startsWith('.') || isAbsolute(a.path)) {
        const found = findFile(isAbsolute(a.path) ? a.path : resolve(a.resolveDir, a.path));
        return found ? {path: found, namespace: NS} : {errors: [{text: `Cannot find "${a.path}" imported from ${a.importer}`}]};
      }
      // Shared libraries: always the project's copy first, then the engine's. Others: next to the importer first.
      const near = !SHARED.test(a.path) && a.importer && isAbsolute(a.importer) ? upTo(dirname(a.importer), [root, ENGINE]) : [];
      const found = packageFile(a.path, [...near, root, ENGINE]);
      return found ? {path: found, namespace: NS}
        : {errors: [{text: `Cannot find the package "${a.path}". Install it in the project: npm install ${a.path}`}]};
    });
    b.onLoad({filter: /.*/, namespace: NS}, (a) => {
      const ext = extname(a.path).toLowerCase();
      if (ASSETS.includes(ext)) return {contents: readFileSync(a.path), loader: 'file'};
      return {contents: readFileSync(a.path), loader: LOADERS[ext] || 'js', resolveDir: dirname(a.path)};
    });
  },
});

const options = (out, root, plugin) => ({
  entryPoints: ['@invokard-entry-page'], bundle: true, format: 'iife', platform: 'browser', target: 'chrome110',
  outfile: join(out, 'bundle.js'), jsx: 'automatic', logLevel: 'silent', publicPath: '/', absWorkingDir: root,
  assetNames: 'assets/[name]-[hash]', define: {'process.env.NODE_ENV': '"production"'},
  loader: {'.js': 'jsx', ...Object.fromEntries(ASSETS.map((e) => [e, 'file']))},
  nodePaths: [join(root, 'node_modules'), join(ENGINE, 'node_modules')],
  plugins: [{
    name: 'invokard-page',
    setup(b) {
      b.onResolve({filter: /^@invokard-entry-page$/}, () => ({path: join(SRC, 'page.jsx'),
        namespace: plugin.name === 'invokard-studio-safe' ? 'invokard-fs' : 'file'}));
    },
  }, plugin],
});

const message = (e) => (e.errors || []).map((x) => `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}`).join('\n') || e.message;

export async function bundle(entry, {outDir} = {}) {
  const file = resolve(entry);
  if (!existsSync(file)) throw new Error(`The entry file does not exist: ${file}`);
  const root = projectRoot(file);
  const out = outDir || mkdtempSync(join(tmpdir(), 'invokard-bundle-'));
  // INVOKARD_BUNDLE=safe goes straight to the safe mode (tests, or a sandbox that blocks something else).
  let safe = process.env.INVOKARD_BUNDLE === 'safe';
  try {
    if (safe) throw new Error('safe mode requested');
    await build(options(out, root, normalPlugin(file, root)));
  } catch (e) {
    if (!safe && !/Cannot read directory|Access is denied|EACCES|EPERM/i.test(message(e))) throw new Error(`The animation does not build:\n${message(e)}`);
    safe = true;
    for (const f of ['bundle.js', 'bundle.css']) rmSync(join(out, f), {force: true});
    try {
      await build(options(out, root, safePlugin(file, root)));
    } catch (e2) {
      throw new Error(`The animation does not build:\n${message(e2)}`);
    }
  }
  writeFileSync(join(out, 'index.html'), page(existsSync(join(out, 'bundle.css'))));
  return {dir: out, root, publicDir: join(root, 'public'), safe};
}
