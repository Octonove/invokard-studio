# Animation reference — videos drawn with code

The montage engine (`reelkit`) cuts photos, clips, voice, captions and music. The animation engine (`animation/`)
**draws**: kinetic type, shapes, charts, product shots in 3D, physics, particles, a product photo turned into an ad. A
video is a React component that returns one frame for a frame number; the engine opens it in a headless browser
(Chrome or Edge already on the machine), sets each frame, captures it and encodes the result with ffmpeg. The two
engines combine in one reel through `scripts/animation.py` (§ 6).

## 1. Set up (once)

```bash
node --version                                  # 18 or newer (the LTS from nodejs.org)
cd <skill>/animation && npm install             # ~120 MB: React, three.js, esbuild, playwright-core, an ffmpeg build
node <skill>/animation/cli.mjs doctor           # node, ffmpeg and the browser it found
```

No browser is downloaded when Chrome or Edge is installed (Edge always is on Windows). On a machine with neither,
`node cli.mjs browser` downloads a headless Chromium once (~100 MB). ffmpeg on PATH is used first; otherwise the copy
installed by npm.

## 2. A project

```
my-ad/
  package.json          {"private": true, "type": "module"} — plus any extra library the animation imports
  src/index.jsx         registerRoot(...) with one <Composition> per video
  src/<Name>.jsx        the components
  public/               files used with staticFile('name.png'): photos, logos, clips, sounds
  out/                  renders (never commit)
```

React, three.js and @react-three/fiber come from the engine: a project needs its own `node_modules` only for other
libraries (`npm install planck` for physics, `d3` for charts…). Fifteen open-licensed families ship with the engine
(`animation/fonts`, listed by `node cli.mjs doctor`) and never touch the network: Inter, Outfit, Figtree, Poppins,
Montserrat, Space Grotesk, Barlow, Barlow Condensed, Oswald, Anton, Bebas Neue, Playfair Display, Fraunces, Shrikhand
and Caveat. Any other Google Fonts family is downloaded on its first render and kept in `.invokard/fonts/`, so later
renders work offline (ship that folder with a template to make it work offline from the first render).
`INVOKARD_OFFLINE=1` turns every download off.

```jsx
import React from 'react';
import {AbsoluteFill, Composition, registerRoot, spring, interpolate, useCurrentFrame, useVideoConfig} from 'invokard-studio';
import {loadFont} from 'invokard-studio/google-fonts/Outfit';

const {fontFamily} = loadFont('normal', {weights: ['800'], subsets: ['latin']});

const Title = ({text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{background: '#1E3A5F', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontFamily, fontWeight: 800, fontSize: 140, color: '#fff', transform: `scale(${s})`,
        opacity: interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'})}}>{text}</div>
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <Composition id="Title" component={Title} width={1080} height={1920} fps={30} durationInFrames={90}
    defaultProps={{text: 'Hello'}} />
));
```

## 3. Commands

```bash
node <skill>/animation/cli.mjs list   src/index.jsx                         # compositions: id, size, fps, frames
node <skill>/animation/cli.mjs still  src/index.jsx Title out/title.png --frame 45
node <skill>/animation/cli.mjs frames src/index.jsx Title out/title --frames 0,30,60,89   # out/title-f000.png …
node <skill>/animation/cli.mjs render src/index.jsx Title out/title.mp4                 # H.264, all frames
node <skill>/animation/cli.mjs render src/index.jsx Title out/title.mov --transparent   # ProRes 4444 with alpha
node <skill>/animation/cli.mjs render src/index.jsx Title out/title --transparent       # a folder of PNG frames
```

Options: `--props '{"text":"Hi"}'` or `--props data.json` (merged over `defaultProps`) · `--frames 30-59` ·
`--concurrency N` (browser tabs; default half the CPU threads, max 8) · `--crf 18` · `--gl angle|swangle` (3D on a
machine without a working GPU) · `--browser chrome|msedge|<path>` · `--timeout 60` (seconds a frame may wait).
From Node: `import {renderMedia, renderStill, renderStills, listCompositions} from '<skill>/animation/src/index.mjs'`.

The MP4 is 4:2:0 H.264 with BT.709 colours tagged and converted correctly, `+faststart`, no audio track. Sound is mixed
by the montage engine (§ 6) or added later.

## 4. The API (`import {...} from 'invokard-studio'`)

| Piece | What it does |
|---|---|
| `registerRoot(Root)` · `<Composition id component width height fps durationInFrames defaultProps calculateMetadata?>` · `<Still>` · `<Folder>` | declare videos (and single images) |
| `useCurrentFrame()` · `useVideoConfig()` | the frame being drawn; `{width, height, fps, durationInFrames, id, props}` |
| `<AbsoluteFill>` | a full-size absolutely positioned flex column |
| `<Sequence from durationInFrames layout="none"?>` | shows its children for a stretch; inside, frames count from 0 |
| `<Series><Series.Sequence durationInFrames offset?>` | sequences one after another |
| `<Loop durationInFrames times?>` · `<Freeze frame active?>` | repeat a stretch · hold one frame |
| `spring({frame, fps, config: {damping, stiffness, mass, overshootClamping}, from, to, delay, durationInFrames, reverse})` | physical easing, 0 → 1 (or from → to); `measureSpring()` gives its length |
| `interpolate(x, [in…], [out…], {easing, extrapolateLeft, extrapolateRight})` | 'extend' (default), 'clamp', 'wrap', 'identity'; several segments allowed |
| `interpolateColors(x, [in…], ['#fff', 'rgb(…)', 'tomato'])` | any CSS colours |
| `Easing.linear/ease/quad/cubic/poly(n)/sin/circle/exp/elastic(b)/back(s)/bounce/bezier(x1,y1,x2,y2)/in/out/inOut` | curves |
| `random(seed)` | the same number for the same seed, on every frame and machine |
| `staticFile('name.png')` · `<Img src>` | a file from `public/` (any name: spaces, accents, `#`) · an image that holds the frame until it is decoded |
| `<OffthreadVideo src startFrom? playbackRate?>` (alias `<Video>`) | a frame of a video file, extracted with ffmpeg: exact, no browser decoding, no sound |
| `delayRender(label)` · `continueRender(handle)` · `cancelRender(error)` | hold the frame until something asynchronous is ready; stop with an error |
| `getInputProps()` | the `--props` of the render |
| `import {loadFont} from 'invokard-studio/google-fonts/<Family>'` | `loadFont('normal'\|'italic', {weights: ['400','700'], subsets: ['latin']})` → `{fontFamily}`; any Google family, the module name without spaces (`PlayfairDisplay`); `loadGoogleFont('Family Name', style, options)` from `'invokard-studio/google-fonts'` for names that do not split cleanly |
| `import {ThreeCanvas} from 'invokard-studio/three'` | a @react-three/fiber canvas drawn once per frame |

Code written for the same subset of the `remotion` API (imports from `remotion`, `@remotion/google-fonts/*`,
`@remotion/three`) builds unchanged: the bundler maps those imports to this runtime. Only the pieces in this table exist;
anything else fails at build time with the name that is missing.

## 5. Rules (each one comes from a real render)

- **Every frame is computed from its number.** Frames are drawn out of order and in several tabs at once: no
  `Math.random()`, no `Date.now()`, no state that accumulates between frames, no CSS animations or transitions, no
  `requestAnimationFrame` loops. Randomness with `random('seed')`; physics re-simulated from frame 0 inside the frame
  (or pre-computed once in a module-level cache).
- **Wait for what you load.** `<Img>` and `loadFont` wait by themselves; anything else asynchronous (fetching JSON,
  measuring text, decoding a canvas) goes between `delayRender()` and `continueRender()`.
- **Files go through `staticFile()`** from `public/`. Keep the user's original file names: they work as they are.
- **Text is real text.** Sizes from 40 px, headlines 90 px or more; on 9:16, the important things between y=300 and
  y=1380 with 60 px side margins (Instagram covers the rest).
- **Design a still before animating.** `still` of the key frame until it looks right, then `frames` at 6-8 points to
  check the motion, then `render`. Look at every image you render.
- **Motion like a motion designer:** springs and ease-out for entries, anticipation before a big move, staggered
  entries, nothing at constant speed except rotations, the first frame already attractive and the last one at rest.
- **3D** is `ThreeCanvas` + three.js meshes. If a render comes out black or WebGL fails, `--gl angle`, then
  `--gl swangle` (software, slower, works everywhere).
- **Physics and chaotic simulations** can settle differently with another browser version (floating point): the
  result is just as valid, but render the final video on the machine where it was approved.

## 6. Montage + animation in one reel

`scripts/animation.py` connects the engines. A transparent animation is drawn **over** the montage; an opaque one is
a **shot** of its own:

```python
import animation as an
an.render('anim/src/index.jsx', 'Headline', rk.P('anim/headline'), transparent=True)        # a folder of PNG frames
reel.ov(t0, t1, an.layer(rk.P('anim/headline')))                                              # over shots + captions
reel.ov(t2, t3, an.layer(rk.P('anim/counters')))                                              # props from Python:
#   an.render(ENTRY, 'Counters', rk.P('anim/counters'), transparent=True, props={'items': [...]})
reel.shot(t4, t5, an.clip('anim/src/index.jsx', 'EndCard', 'endcard'))                        # renders vid/endcard.mp4 + frames
```

`layer(folder, x=0, y=0, scale=1.0, hold=True, loop=False)` holds the last frame when the layer outlasts the
animation. The voice, captions, music and effects stay in the montage. A complete, self-contained reel that does all
of this: `examples/animated-reel/reel.py` in the repository.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `No browser could be started` | Install Chrome or Edge, or `node cli.mjs browser`; `INVOKARD_BROWSER=<path>` to force one |
| `ffmpeg was not found` | `npm install` in `animation/` (installs one), or put ffmpeg on PATH |
| `The animation does not build: … No matching export … for import "X"` | that piece of API does not exist (§ 4): write it with what does |
| `Two copies of React` / `Cannot read properties of null (reading 'useState')` | the engine forces one React; if you see it, delete the project's `node_modules/react*` duplicates and report it |
| `The frame was not ready after 30 s. Still waiting for: …` | a `delayRender` without its `continueRender`, an image that never loads, or a slow font: the label says which |
| `Could not load the font …` | not a bundled family, and it could not be downloaded: check the name and the connection (after the first download it is cached in `.invokard/fonts`) |
| Text in another font in the video | the font name: the module is the family without spaces (`BarlowSemiCondensed`); check with a `still` |
| 3D frame black | `--gl angle`, then `--gl swangle` |
