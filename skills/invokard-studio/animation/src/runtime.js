// Invokard Studio animation runtime: everything an animation imports from 'invokard-studio'.
// A video is a React component that draws one frame from a frame number. The renderer sets the frame, waits until
// every image, font and pending task is ready, takes a screenshot, and moves on. Nothing here reads a clock.
import React, {createContext, forwardRef, useContext} from 'react';

const FrameContext = createContext(null);          // {frame, config}: config = the composition's metadata and props
const compositions = new Map();                    // id -> props of <Composition> / <Still>
const pending = new Map();                         // delayRender handle -> label
let root = null;
let nextHandle = 1;
let fatal = null;

// ---------------------------------------------------------------- registration
export const registerRoot = (Component) => { root = Component; };
export const Composition = (props) => { compositions.set(props.id, {...props, still: false}); return null; };
export const Still = (props) => {
  compositions.set(props.id, {fps: 30, ...props, durationInFrames: 1, still: true});
  return null;
};
export const Folder = ({children}) => React.createElement(React.Fragment, null, children);

// ---------------------------------------------------------------- frame and config
const useFrameContext = () => {
  const value = useContext(FrameContext);
  if (!value) throw new Error('useCurrentFrame() and useVideoConfig() only work inside a composition.');
  return value;
};
export const useCurrentFrame = () => useFrameContext().frame;
export const useVideoConfig = () => useFrameContext().config;
export const getInputProps = () => (typeof window !== 'undefined' && window.__invokardInputProps) || {};

const FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%',
  display: 'flex', flexDirection: 'column'};
export const AbsoluteFill = forwardRef(function AbsoluteFill({style, ...rest}, ref) {
  return React.createElement('div', {ref, ...rest, style: {...FILL, ...style}});
});

const withFrame = (ctx, frame, children) => React.createElement(FrameContext.Provider, {value: {...ctx, frame}}, children);
const wrap = (layout, style, rest, inner) =>
  layout === 'none' ? inner : React.createElement(AbsoluteFill, {style, ...rest}, inner);

// Shows its children from `from` for `durationInFrames` frames; inside, the frame counts from 0.
export const Sequence = ({from = 0, durationInFrames = Infinity, layout = 'absolute-fill', style, name, children, ...rest}) => {
  const ctx = useFrameContext();
  const local = ctx.frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  return wrap(layout, style, rest, withFrame(ctx, local, children));
};

// Children of <Series> are <Series.Sequence durationInFrames={n} offset={k}> played one after another.
const SeriesSequence = () => null;
export const Series = ({children}) => {
  let at = 0;
  const out = [];
  React.Children.forEach(children, (child, i) => {
    if (!child) return;
    const {durationInFrames = Infinity, offset = 0, children: inner, ...rest} = child.props;
    at += offset;
    out.push(React.createElement(Sequence, {key: i, from: at, durationInFrames, ...rest}, inner));
    at += durationInFrames;
  });
  return React.createElement(React.Fragment, null, out);
};
Series.Sequence = SeriesSequence;

// Repeats its children every `durationInFrames` frames, `times` times.
export const Loop = ({durationInFrames, times = Infinity, layout = 'absolute-fill', style, children, ...rest}) => {
  const ctx = useFrameContext();
  if (!(durationInFrames > 0)) throw new Error('<Loop> needs durationInFrames > 0');
  if (Math.floor(ctx.frame / durationInFrames) >= times) return null;
  return wrap(layout, style, rest, withFrame(ctx, ctx.frame % durationInFrames, children));
};

// Holds its children on one frame (useful to show a single frame of a clip).
export const Freeze = ({frame, active = true, children}) => {
  const ctx = useFrameContext();
  const on = typeof active === 'function' ? active(ctx.frame) : active;
  return on ? withFrame(ctx, frame, children) : children;
};

// ---------------------------------------------------------------- waiting for assets
// A frame is captured only when no wait is open. Open one for anything asynchronous: data, measurements, images.
export const delayRender = (label) => {
  const handle = nextHandle++;
  pending.set(handle, label ? String(label) : `delayRender() #${handle}`);
  return handle;
};
export const continueRender = (handle) => { pending.delete(handle); };
export const cancelRender = (error) => {
  const e = error instanceof Error ? error : new Error(String(error));
  fatal = e.message;
  throw e;
};

// A file in the project's public/ folder. Each part of the path is encoded, so spaces, accents, # and ? work.
export const staticFile = (path) => {
  if (typeof path !== 'string' || !path) throw new TypeError('staticFile() needs the name of a file inside public/');
  if (/^https?:\/\//.test(path)) throw new TypeError(`staticFile() is for files in public/, not URLs: use "${path}" directly`);
  if (path.startsWith('./') || path.startsWith('../')) throw new TypeError(`staticFile() takes a path inside public/, without ./ or ../ (got "${path}")`);
  return '/public/' + path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
};

// <img> that holds the frame until the picture is loaded and decoded.
const loadedImages = new Set();
const imageWaits = new Map();                      // src -> handle
const waitForImage = (src) => {
  if (!src || loadedImages.has(src) || imageWaits.has(src)) return;
  imageWaits.set(src, delayRender(`image ${src}`));
};
const imageDone = (src) => {
  loadedImages.add(src);
  const handle = imageWaits.get(src);
  if (handle !== undefined) { imageWaits.delete(src); continueRender(handle); }
};
export const Img = forwardRef(function Img({src, onLoad, onError, ...rest}, ref) {
  waitForImage(src);
  return React.createElement('img', {
    ref, src, ...rest,
    onLoad: (e) => {
      const img = e.currentTarget;
      (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => imageDone(src));
      if (onLoad) onLoad(e);
    },
    onError: (e) => {
      if (onError) { imageDone(src); onError(e); return; }
      fatal = `Could not load the image ${src}. Check that the file exists (inside public/ when you use staticFile).`;
    },
  });
});

// A frame of a video file, extracted by the renderer with ffmpeg (exact, no browser decoding). No sound: audio is
// mixed by the montage engine. startFrom / trimBefore are in frames of the composition; playbackRate speeds it up.
export const OffthreadVideo = forwardRef(function OffthreadVideo(
  {src, startFrom, trimBefore, playbackRate = 1, style, className, muted, volume, endAt, trimAfter, ...rest}, ref) {
  const {frame, config} = useFrameContext();
  const start = trimBefore ?? startFrom ?? 0;
  const seconds = Math.max(0, (start + frame * playbackRate) / config.fps);
  const url = `/__video?src=${encodeURIComponent(src)}&t=${seconds.toFixed(6)}&fps=${config.fps}`;
  return React.createElement(Img, {ref, src: url, style: {objectFit: 'cover', ...style}, className, ...rest});
});
export const Video = OffthreadVideo;

// ---------------------------------------------------------------- curves
// Cubic Bézier with ends at (0,0) and (1,1): find the parameter u whose x is t and return its y.
const bezier = (x1, y1, x2, y2) => {
  const axis = (a, b) => (u) => { const v = 1 - u; return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u; };
  const X = axis(x1, x2), Y = axis(y1, y2);
  const dX = (u) => { const v = 1 - u; return 3 * v * v * x1 + 6 * v * u * (x2 - x1) + 3 * u * u * (1 - x2); };
  return (t) => {
    if (t === 0 || t === 1) return t;
    if (t < 0 || t > 1) {                                   // outside [0,1] the cubic is extended (interpolate 'extend')
      let u = t;
      for (let i = 0; i < 8; i++) { const d = dX(u); if (Math.abs(d) < 1e-7) break; u -= (X(u) - t) / d; }
      return Y(u);
    }
    let u = t;
    for (let i = 0; i < 8; i++) {                           // Newton
      const d = dX(u);
      if (Math.abs(d) < 1e-7) break;
      const e = X(u) - t;
      if (Math.abs(e) < 1e-7) return Y(u);
      u -= e / d;
    }
    let a = 0, b = 1;                                       // and bisection when Newton does not converge
    u = Math.min(1, Math.max(0, u));
    for (let i = 0; i < 50 && Math.abs(X(u) - t) > 1e-7; i++) { if (X(u) < t) a = u; else b = u; u = (a + b) / 2; }
    return Y(u);
  };
};
const bounce = (t) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
  if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
  const u = t - 2.625 / 2.75; return 7.5625 * u * u + 0.984375;
};
export const Easing = {
  step0: (t) => (t > 0 ? 1 : 0),
  step1: (t) => (t >= 1 ? 1 : 0),
  linear: (t) => t,
  ease: bezier(0.42, 0, 1, 1),
  quad: (t) => t * t,
  cubic: (t) => t * t * t,
  poly: (n) => (t) => Math.pow(t, n),
  sin: (t) => 1 - Math.cos((t * Math.PI) / 2),
  circle: (t) => 1 - Math.sqrt(1 - t * t),
  exp: (t) => Math.pow(2, 10 * (t - 1)),
  elastic: (bounciness = 1) => (t) => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * bounciness * Math.PI),
  back: (s = 1.70158) => (t) => t * t * ((s + 1) * t - s),
  bounce,
  bezier,
  in: (easing) => easing,
  out: (easing) => (t) => 1 - easing(1 - t),
  inOut: (easing) => (t) => (t < 0.5 ? easing(t * 2) / 2 : 1 - easing((1 - t) * 2) / 2),
};

// ---------------------------------------------------------------- interpolation
const extrapolate = (x, min, max, mode, side) => {
  if (side < 0 ? x >= min : x <= max) return {x};
  if (mode === 'identity') return {identity: true};
  if (mode === 'clamp') return {x: side < 0 ? min : max};
  if (mode === 'wrap') { const r = max - min; return {x: ((((x - min) % r) + r) % r) + min}; }
  return {x};                                            // 'extend': the easing is applied outside the range too
};
const segment = (input, [a, b], [c, d], {easing, extrapolateLeft, extrapolateRight}) => {
  let left = extrapolate(input, a, b, extrapolateLeft, -1);
  if (left.identity) return input;
  let right = extrapolate(left.x, a, b, extrapolateRight, 1);
  if (right.identity) return input;
  if (c === d) return c;
  return c + easing((right.x - a) / (b - a)) * (d - c);
};
export const interpolate = (input, inputRange, outputRange, options = {}) => {
  if (inputRange.length !== outputRange.length) throw new Error('interpolate(): inputRange and outputRange must have the same length');
  if (inputRange.length < 2) throw new Error('interpolate(): inputRange needs at least two values');
  for (let i = 1; i < inputRange.length; i++) {
    if (!(inputRange[i] > inputRange[i - 1])) throw new Error(`interpolate(): inputRange must be strictly increasing, got [${inputRange.join(', ')}]`);
  }
  if (typeof input !== 'number' || Number.isNaN(input)) throw new Error(`interpolate(): the input must be a number, got ${input}`);
  const opts = {easing: options.easing || ((t) => t), extrapolateLeft: options.extrapolateLeft || 'extend',
    extrapolateRight: options.extrapolateRight || 'extend'};
  let i = 1;
  while (i < inputRange.length - 1 && inputRange[i] < input) i++;
  return segment(input, [inputRange[i - 1], inputRange[i]], [outputRange[i - 1], outputRange[i]], opts);
};

// Colours are parsed by the browser itself (any CSS colour: names, hex, rgb(), hsl()...) and mixed channel by channel.
let colorCanvas = null;
const parseColor = (color) => {
  if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', color)) throw new Error(`interpolateColors(): "${color}" is not a colour`);
  colorCanvas = colorCanvas || document.createElement('canvas').getContext('2d');
  colorCanvas.fillStyle = '#000';
  colorCanvas.fillStyle = color;
  const s = colorCanvas.fillStyle;
  if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  const m = s.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
  return [r, g, b, a];
};
export const interpolateColors = (input, inputRange, outputRange, options = {}) => {
  if (inputRange.length !== outputRange.length) throw new Error('interpolateColors(): inputRange and outputRange must have the same length');
  const colors = outputRange.map(parseColor);
  const channel = (k) => interpolate(input, inputRange, colors.map((c) => c[k]),
    {easing: options.easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const [r, g, b] = [0, 1, 2].map((k) => Math.round(channel(k)));
  return `rgba(${r}, ${g}, ${b}, ${Number(channel(3).toFixed(3))})`;
};

// ---------------------------------------------------------------- springs
// Damped spring from 0 to 1, started at rest, solved in closed form at time frame / fps. With damping at or above
// the critical value the critical curve is used (as React Native springs do): animations are tuned to that motion.
const springValue = (frame, fps, {damping = 10, mass = 1, stiffness = 100} = {}) => {
  if (!(damping > 0)) throw new Error('spring(): damping must be greater than 0');
  const t = Math.max(0, frame) / fps;
  if (t === 0) return 0;
  const w0 = Math.sqrt(stiffness / mass), z = damping / (2 * Math.sqrt(stiffness * mass));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};
// Frames until the spring settles within `threshold` of its target and stays there for 20 frames.
export const measureSpring = ({fps, config = {}, threshold = 0.005}) => {
  if (threshold === 0) return Infinity;
  if (threshold >= 1) return 0;
  let frame = 0;
  while (Math.abs(1 - springValue(frame, fps, config)) >= threshold) frame++;
  let finished = frame;
  for (let calm = 0; calm < 20; calm++) {
    frame++;
    if (Math.abs(1 - springValue(frame, fps, config)) >= threshold) { calm = 0; finished = frame + 1; }
  }
  return finished;
};
export const spring = ({frame, fps, config = {}, from = 0, to = 1, durationInFrames, durationRestThreshold, delay = 0,
  reverse = false}) => {
  if (typeof frame !== 'number' || Number.isNaN(frame)) throw new Error(`spring(): frame must be a number, got ${frame}`);
  if (!(fps > 0)) throw new Error('spring(): fps must be a positive number');
  const natural = reverse || durationInFrames !== undefined ? measureSpring({fps, config, threshold: durationRestThreshold}) : 0;
  let f = reverse ? (durationInFrames ?? natural) - frame : frame;
  f += reverse ? delay : -delay;
  if (durationInFrames && f > durationInFrames) return to;
  if (durationInFrames !== undefined) f = f / (durationInFrames / natural);
  let v = springValue(f, fps, config);
  if (config.overshootClamping) v = Math.min(v, 1);
  return from + (to - from) * v;
};

// ---------------------------------------------------------------- deterministic randomness
// Same seed, same number, on every frame and every machine (mulberry32 over a 32-bit string hash).
const mulberry32 = (a) => {
  let t = a + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; };
export const random = (seed) => {
  if (seed === null) return Math.random();
  if (typeof seed === 'string') return mulberry32(hash(seed));
  if (typeof seed === 'number') return mulberry32(seed * 10000000000);
  throw new Error('random() takes a number or a string as seed');
};

// ---------------------------------------------------------------- for the renderer only (not part of the API)
export const __invokard = {FrameContext, compositions, pending, root: () => root, fatal: () => fatal,
  setFatal: (m) => { fatal = m; }};
