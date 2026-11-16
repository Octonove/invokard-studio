// Bundles an animation (its entry file and everything it imports) into one script for the render page, with esbuild.
// 'invokard-studio' resolves to the runtime of this engine. React, three and @react-three/fiber are always taken from
// one place (the project's node_modules if it has them, else the engine's): two copies of React break every hook.
import {build} from 'esbuild';
import {existsSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
export const ENGINE = resolve(SRC, '..');
const SHARED = /^(react|react-dom|scheduler|three|@react-three\/fiber)(\/.*)?$/;
const ASSETS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.mp4', '.webm', '.mov', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.glb', '.gltf', '.hdr'];

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

const PAGE = '<!doctype html><html><head><meta charset="utf-8">' +
  '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
  '#invokard-root{position:relative;overflow:hidden;background:#fff}' +
  'html.transparent #invokard-root{background:transparent}</style></head>' +
  '<body><div id="invokard-root"></div><script src="/bundle.js"></script></body></html>';

export async function bundle(entry, {outDir} = {}) {
  const file = resolve(entry);
  if (!existsSync(file)) throw new Error(`The entry file does not exist: ${file}`);
  const root = projectRoot(file);
  const out = outDir || mkdtempSync(join(tmpdir(), 'invokard-bundle-'));
  const plugin = {
    name: 'invokard-studio',
    setup(b) {
      b.onResolve({filter: /^@invokard-entry$/}, () => ({path: file}));
      // The API. `remotion` maps here too, so code written for that API's subset builds unchanged.
      b.onResolve({filter: /^(invokard-studio|remotion)$/}, () => ({path: join(SRC, 'runtime.js')}));
      b.onResolve({filter: /^(invokard-studio\/three|@remotion\/three)$/}, () => ({path: join(SRC, 'three.jsx')}));
      b.onResolve({filter: /^(invokard-studio|@remotion)\/google-fonts(\/[^/]+)?$/}, (a) =>
        ({path: a.path.split('/').slice(2).join('/'), namespace: 'invokard-font'}));
      b.onLoad({filter: /.*/, namespace: 'invokard-font'}, (a) => ({
        resolveDir: SRC, loader: 'js',
        contents: a.path
          ? `import {createFont} from ${JSON.stringify(join(SRC, 'fonts.js'))};\n` +
            `export const fontFamily = ${JSON.stringify(familyName(a.path))};\n` +
            `export const loadFont = createFont(fontFamily);\n`
          : `export {loadGoogleFont, createFont} from ${JSON.stringify(join(SRC, 'fonts.js'))};\n`,
      }));
      b.onResolve({filter: SHARED}, async (a) => {
        if (a.pluginData === 'invokard-shared') return undefined;
        for (const dir of [root, ENGINE]) {
          const r = await b.resolve(a.path, {resolveDir: dir, kind: a.kind, pluginData: 'invokard-shared'});
          if (!r.errors.length) return r;
        }
        return undefined;
      });
    },
  };
  try {
    await build({
      entryPoints: [join(SRC, 'page.jsx')], bundle: true, format: 'iife', platform: 'browser', target: 'chrome110',
      outfile: join(out, 'bundle.js'), jsx: 'automatic', logLevel: 'silent', publicPath: '/',
      assetNames: 'assets/[name]-[hash]', define: {'process.env.NODE_ENV': '"production"'},
      loader: {'.js': 'jsx', ...Object.fromEntries(ASSETS.map((e) => [e, 'file']))},
      nodePaths: [join(root, 'node_modules'), join(ENGINE, 'node_modules')], plugins: [plugin],
    });
  } catch (e) {
    const lines = (e.errors || []).map((x) => `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}`);
    throw new Error(`The animation does not build:\n${lines.join('\n') || e.message}`);
  }
  writeFileSync(join(out, 'index.html'), PAGE);
  return {dir: out, root, publicDir: join(root, 'public')};
}
