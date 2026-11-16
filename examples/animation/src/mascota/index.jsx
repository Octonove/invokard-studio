// Mascota: el zorro librero. Dos composiciones verticales de 8 s: "Mascota" (datos principales) y "MascotaAlt" (alternativos).
//   node ../../skills/invokard-studio/animation/cli.mjs render src/mascota/index.jsx Mascota out/mascota.mp4   (desde examples/animation)
import React from 'react';
import {Composition, registerRoot} from 'invokard-studio';
import {Escena} from './Escena.jsx';
import {DATOS, ALTERNATIVO} from './datos.js';

const comun = {component: Escena, width: 1080, height: 1920, fps: 30, durationInFrames: 240};

registerRoot(() => (
  <>
    <Composition id="Mascota" {...comun} defaultProps={{datos: DATOS}} />
    <Composition id="MascotaAlt" {...comun} defaultProps={{datos: ALTERNATIVO}} />
  </>
));
