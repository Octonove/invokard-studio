#!/usr/bin/env node
// invokard-animation — draws videos with code, frame by frame (React, SVG, canvas, three.js) and encodes them.
//
//   node cli.mjs render <entry> <composition> [out.mp4]   MP4 (H.264). out.mov = ProRes 4444 with transparency,
//                                                          out/ (no extension) = one PNG per frame
//   node cli.mjs still  <entry> <composition> [out.png] [--frame N]
//   node cli.mjs frames <entry> <composition> <prefix> --frames 0,34,68     -> <prefix>-f000.png, <prefix>-f034.png...
//   node cli.mjs list   <entry>                            compositions in the entry file
//   node cli.mjs doctor                                    node, browser and ffmpeg found
//   node cli.mjs browser                                   download a browser (only if there is no Chrome or Edge)
//
// Options: --props '{"title":"Hi"}' or --props props.json · --concurrency N · --frames 0-59 · --crf 18
//          --transparent · --gl angle|swangle|swiftshader|egl · --browser <path|chrome|msedge> · --timeout <seconds>
import {existsSync, readFileSync} from 'node:fs';
import {basename, extname} from 'node:path';
import {defaultConcurrency, findFfmpeg, installBrowser, launchBrowser, listCompositions, renderMedia, renderStills}
  from './src/index.mjs';

const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { args.push(a); continue; }
  const [k, v] = a.slice(2).split(/=(.*)/s);
  if (v !== undefined) flags[k] = v;
  else if (['transparent', 'help'].includes(k)) flags[k] = true;
  else flags[k] = argv[++i];
}
const [command, entry, composition, out] = args;
const fail = (message) => { console.error(message); process.exit(1); };
const props = () => {
  if (!flags.props) return {};
  const text = existsSync(flags.props) ? readFileSync(flags.props, 'utf8') : flags.props;
  try { return JSON.parse(text); } catch (e) { return fail(`--props is not valid JSON: ${e.message}`); }
};
const browser = () => {
  const b = flags.browser;
  return {gl: flags.gl, ...(b ? (['chrome', 'msedge', 'chromium'].includes(b) ? {channel: b} : {executablePath: b}) : {})};
};
const common = () => ({entry, composition, props: props(), browser: browser(), transparent: Boolean(flags.transparent),
  timeoutMs: (Number(flags.timeout) || 30) * 1000, log: (m) => console.log(m)});
const usage = readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n');

try {
  if (!command || flags.help) { console.log(usage); process.exit(0); }
  if (command === 'doctor') {
    console.log(`node ${process.version}`);
    console.log(`ffmpeg: ${findFfmpeg() || 'NOT FOUND (install it, or run npm install here)'}`);
    try {
      const b = await launchBrowser(browser());
      console.log(`browser: ${b.name} ${b.version}`);
      await b.browser.close();
    } catch (e) { console.log(`browser: NOT FOUND\n${e.message}`); process.exitCode = 1; }
    console.log(`tabs per render: ${defaultConcurrency()}`);
  } else if (command === 'browser') {
    process.exit(installBrowser());
  } else if (command === 'list') {
    if (!entry) fail('Usage: node cli.mjs list <entry>');
    for (const c of await listCompositions({entry, browser: browser()})) {
      console.log(`${c.id.padEnd(24)} ${c.width}x${c.height} ${c.fps} fps ${c.durationInFrames} frames${c.still ? ' (still)' : ''}`);
    }
  } else if (command === 'render') {
    if (!entry || !composition) fail('Usage: node cli.mjs render <entry> <composition> [out.mp4]');
    const output = out || `out/${composition}${flags.transparent ? '.mov' : '.mp4'}`;
    let shown = -1;
    const r = await renderMedia({...common(), output, codec: flags.codec, crf: Number(flags.crf) || 18,
      frames: flags.frames, concurrency: Number(flags.concurrency) || undefined,
      onProgress: ({done, total}) => {
        const step = Math.floor((done / total) * 10);
        if (step !== shown) { shown = step; process.stdout.write(`  ${done}/${total} frames\n`); }
      }});
    console.log(`${r.output}  (${r.frames} frames in ${r.seconds.toFixed(1)} s, ${r.tabs} tabs, ${r.codec})`);
  } else if (command === 'still') {
    if (!entry || !composition) fail('Usage: node cli.mjs still <entry> <composition> [out.png] [--frame N]');
    const frame = Number(flags.frame) || 0;
    const r = await renderStills({...common(), frames: [frame], output: out || `out/${composition}-f${String(frame).padStart(3, '0')}.png`});
    console.log(r.files[0]);
  } else if (command === 'frames') {
    if (!entry || !composition || !out || !flags.frames) fail('Usage: node cli.mjs frames <entry> <composition> <prefix> --frames 0,34,68');
    const list = String(flags.frames).split(',').map((x) => Number(x.trim()));
    const ext = extname(out) || '.png';
    const prefix = extname(out) ? out.slice(0, -ext.length) : out;
    const r = await renderStills({...common(), frames: list, output: (n) => `${prefix}-f${String(n).padStart(3, '0')}${ext}`});
    for (const f of r.files) console.log(f);
  } else {
    fail(`Unknown command "${command}".\n\n${usage}`);
  }
} catch (e) {
  fail(`${basename(process.argv[1])}: ${e.message}`);
}
