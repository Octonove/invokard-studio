// Anuncio de producto en 3D: una lata de refresco con gotas de condensación, hecha entera con código.
// Three.js dentro del motor de animación (invokard-studio/three + React Three Fiber). Si en un equipo sale en negro, --gl angle.
//
//   node ../../skills/invokard-studio/animation/cli.mjs render src/producto3d/index.jsx Producto3d out/producto3d.mp4
//
// Para adaptarlo solo hay que tocar datos.js. El resto está explicado en NOTAS.md.
import React from 'react';
import {Composition, registerRoot} from 'invokard-studio';
import {Anuncio} from './Anuncio.jsx';
import {ALTO, ANCHO, FOTOGRAMAS, FPS} from './util.js';

const Raiz = () => (
  <>
    {/* datos principales (DATOS) */}
    <Composition id="Producto3d" component={Anuncio} defaultProps={{variante: 'principal'}} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FOTOGRAMAS} />
    {/* datos alternativos (ALTERNATIVO) */}
    <Composition id="Producto3dAlt" component={Anuncio} defaultProps={{variante: 'alternativo'}} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FOTOGRAMAS} />
  </>
);

registerRoot(Raiz);
