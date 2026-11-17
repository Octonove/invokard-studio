// Test project: every piece of the API that has a visible effect, at known positions and colours.
import React, {useState} from 'react';
import {AbsoluteFill, Composition, Freeze, Img, Loop, OffthreadVideo, Sequence, Series, Still, interpolate, registerRoot,
  staticFile, useCurrentFrame, useVideoConfig} from 'invokard-studio';
// Roboto is not one of the bundled families (fonts/index.json): this project covers the download and the cache in
// .invokard/fonts. The bundled families are covered by test/offline.test.mjs.
import {loadFont} from 'invokard-studio/google-fonts/Roboto';

const {fontFamily} = loadFont('normal', {weights: ['700'], subsets: ['latin']});
const box = (left, top, background, size = 100) => ({position: 'absolute', left, top, width: size, height: size, background});

const Basic = ({title}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const x = interpolate(frame, [0, 29], [0, 200], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#CE6E61'}}>
      <div style={box(0, 0, '#1E3A5F')} />
      <div style={box(x, 200, '#FFFFFF', 50)} />
      <Sequence from={10} durationInFrames={10} layout="none"><div style={box(300, 0, '#00FF00')} /></Sequence>
      <Series>
        <Series.Sequence durationInFrames={5} layout="none"><div style={box(420, 0, '#FFFF00')} /></Series.Sequence>
        <Series.Sequence durationInFrames={5} layout="none"><div style={box(420, 0, '#FF00FF')} /></Series.Sequence>
      </Series>
      <Loop durationInFrames={4} layout="none"><Probe /></Loop>
      <Img src={staticFile('foto de prueba ñ.png')} style={{position: 'absolute', left: 0, top: 400, width: 200, height: 200}} />
      <Freeze frame={15}>
        <OffthreadVideo src={staticFile('clip.mp4')} style={{position: 'absolute', left: 400, top: 400, width: 160, height: 90}} />
      </Freeze>
      <Sequence from={0} layout="none">
        <OffthreadVideo src={staticFile('clip.mp4')} startFrom={30} style={{position: 'absolute', left: 400, top: 520, width: 160, height: 90}} />
      </Sequence>
      <div style={{position: 'absolute', left: 0, top: 700, width, fontFamily, fontWeight: 700, fontSize: 60, color: '#fff'}}>
        {title} áéíóú ñ €
      </div>
    </AbsoluteFill>
  );
};

// A square whose shade tells the frame inside the loop (0-3).
const Probe = () => {
  const frame = useCurrentFrame();
  return <div style={box(540, 0, `rgb(${frame * 60}, 0, 0)`)} />;
};

// Green when the font was already loaded at mount: components that measure text on mount depend on it.
const FontOnMount = () => {
  const [loaded] = useState(() => document.fonts.check(`700 60px "${fontFamily}"`));
  return <AbsoluteFill style={{background: loaded ? '#00FF00' : '#FF0000'}} />;
};

const Transparent = () => (
  <AbsoluteFill>
    <div style={box(100, 100, '#1E3A5F')} />
  </AbsoluteFill>
);

registerRoot(() => (
  <>
    <Composition id="Basic" component={Basic} width={640} height={960} fps={30} durationInFrames={30} defaultProps={{title: 'Hola'}} />
    <Composition id="Transparent" component={Transparent} width={320} height={320} fps={30} durationInFrames={10} />
    <Still id="Cover" component={Transparent} width={320} height={320} />
    <Composition id="FontOnMount" component={FontOnMount} width={100} height={100} fps={30} durationInFrames={1} />
  </>
));
