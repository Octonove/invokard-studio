// 3D scenes with three.js:  import {ThreeCanvas} from 'invokard-studio/three';
// The scene is drawn once per video frame (never on its own clock), and the frame is not captured until it is drawn.
// Needs `three` and `@react-three/fiber` (both are dependencies of the animation engine).
import React, {useContext, useLayoutEffect} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {continueRender, delayRender, __invokard} from 'invokard-studio';

const waits = new Map();                            // frame -> wait open until the scene has been drawn for it

// Placed after the scene: when it runs, every object has been updated for this frame, so it is time to draw.
const Draw = ({frame}) => {
  const advance = useThree((state) => state.advance);
  useLayoutEffect(() => {
    advance(performance.now());
    const handle = waits.get(frame);
    if (handle !== undefined) { waits.delete(frame); continueRender(handle); }
  }, [frame, advance]);
  return null;
};

export const ThreeCanvas = ({width, height, style, gl, children, ...rest}) => {
  const value = useContext(__invokard.FrameContext);
  useLayoutEffect(() => {
    if (!waits.has(value.frame)) waits.set(value.frame, delayRender(`3D scene, frame ${value.frame}`));
  }, [value.frame]);
  return (
    <Canvas frameloop="never" style={{width, height, ...style}} gl={{preserveDrawingBuffer: true, antialias: true, ...gl}} {...rest}>
      <__invokard.FrameContext.Provider value={value}>
        {children}
        <Draw frame={value.frame} />
      </__invokard.FrameContext.Provider>
    </Canvas>
  );
};
