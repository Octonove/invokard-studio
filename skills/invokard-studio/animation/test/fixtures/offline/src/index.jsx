// Test project for local-only builds: a bundled family loads with no network; any other family fails with a clear error.
import React, {useState} from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'invokard-studio';
import {loadFont as outfit} from 'invokard-studio/google-fonts/Outfit';
import {loadFont as lobster} from 'invokard-studio/google-fonts/Lobster';

const {fontFamily} = outfit('normal', {weights: ['800'], subsets: ['latin']});

// Green when the bundled font was already loaded at mount.
const Bundled = () => {
  const [loaded] = useState(() => document.fonts.check(`800 60px "${fontFamily}"`));
  return <AbsoluteFill style={{background: loaded ? '#00FF00' : '#FF0000'}} />;
};

// Lobster is not bundled: in a local-only build the render must stop with an error that names it.
const NotBundled = () => {
  const [font] = useState(() => lobster('normal', {weights: ['400']}).fontFamily);
  return <AbsoluteFill style={{background: '#1E3A5F', fontFamily: font}} />;
};

registerRoot(() => (
  <>
    <Composition id="Bundled" component={Bundled} width={100} height={100} fps={30} durationInFrames={1} />
    <Composition id="NotBundled" component={NotBundled} width={100} height={100} fps={30} durationInFrames={1} />
  </>
));
