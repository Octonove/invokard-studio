// The page the renderer opens: it mounts one composition and draws whichever frame it is asked for.
// '@invokard-entry' is the animation's entry file (the one that calls registerRoot), set by the bundler.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {__invokard} from 'invokard-studio';
import '@invokard-entry';

const {FrameContext, compositions, pending} = __invokard;
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const errors = [];
window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => errors.push(String((e.reason && e.reason.message) || e.reason)));

let mount = null, Component = null, config = null, props = {}, timeoutMs = 30000;

const collect = () => {
  const Root = __invokard.root();
  if (!Root) throw new Error('The entry file did not call registerRoot(). It must register a component that renders <Composition> elements.');
  compositions.clear();
  const probe = createRoot(document.createElement('div'));
  flushSync(() => probe.render(React.createElement(Root)));
  probe.unmount();
  return [...compositions.values()].map(({id, width, height, fps, durationInFrames, still}) =>
    ({id, width, height, fps, durationInFrames, still: Boolean(still)}));
};

const ready = async () => {
  const start = performance.now();
  for (;;) {
    const problem = __invokard.fatal() || errors[0];
    if (problem) throw new Error(problem);
    if (pending.size === 0) {
      await document.fonts.ready;
      await nextPaint();
      await nextPaint();
      if (pending.size === 0 && !__invokard.fatal() && !errors.length) return;
    }
    if (performance.now() - start > timeoutMs) {
      throw new Error(`The frame was not ready after ${Math.round(timeoutMs / 1000)} s. Still waiting for: ${[...pending.values()].join(', ')}`);
    }
    await nextPaint();
  }
};

window.__invokard = {
  compositions: () => collect(),
  async init(id, inputProps = {}, waitMs = 30000) {
    timeoutMs = waitMs;
    const list = collect();
    const comp = compositions.get(id);
    if (!comp) throw new Error(`There is no composition "${id}". This entry has: ${list.map((c) => c.id).join(', ') || 'none'}`);
    Component = comp.component || (comp.lazyComponent && (await comp.lazyComponent()).default);
    if (!Component) throw new Error(`The composition "${id}" has no component`);
    props = {...(comp.defaultProps || {}), ...inputProps};
    let meta = {width: comp.width, height: comp.height, fps: comp.fps, durationInFrames: comp.durationInFrames};
    if (comp.calculateMetadata) {
      const extra = (await comp.calculateMetadata({defaultProps: comp.defaultProps || {}, props})) || {};
      if (extra.props) props = extra.props;
      meta = {...meta, ...Object.fromEntries(Object.entries(extra).filter(([k, v]) => k !== 'props' && v !== undefined))};
    }
    for (const k of ['width', 'height', 'fps', 'durationInFrames']) {
      if (!(meta[k] > 0)) throw new Error(`The composition "${id}" needs a positive ${k}`);
    }
    window.__invokardInputProps = inputProps;
    config = {id, ...meta, defaultProps: comp.defaultProps || {}, props};
    // Fonts and anything else loaded when the animation's files were evaluated must be ready BEFORE its components
    // mount: a component that measures text on mount would otherwise measure the fallback font and keep that width.
    await ready();
    const box = document.getElementById('invokard-root');
    Object.assign(box.style, {width: meta.width + 'px', height: meta.height + 'px'});
    mount = createRoot(box);
    return {id, ...meta, still: Boolean(comp.still)};
  },
  async seek(frame) {
    flushSync(() => mount.render(React.createElement(FrameContext.Provider, {value: {frame, config}},
      React.createElement(Component, props))));
    await ready();
    return true;
  },
};
