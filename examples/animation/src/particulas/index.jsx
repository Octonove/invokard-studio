// PARTÍCULAS QUE ESCRIBEN — cartel luminoso hecho con miles de puntos de luz, en lienzo 2D.
// Un enjambre vuela como una bandada, escribe dos formaciones de palabras, estalla entre una y otra y termina
// formando el nombre del negocio. Vertical para Instagram: 1080 × 1920, 30 fps, 8 segundos.
//
//   Un fotograma:  node ../../skills/invokard-studio/animation/cli.mjs still src/particulas/index.jsx Particulas out/particulas-f090.png --frame 90
//   Vídeo final:   node ../../skills/invokard-studio/animation/cli.mjs render src/particulas/index.jsx Particulas out/particulas.mp4
//   Alternativo:   lo mismo con ParticulasAlt en lugar de Particulas.
//
// Reparto del código:
//   datos.js    → lo único que se toca para adaptarla (textos, colores, cantidad de partículas)
//   formas.js   → convierte los textos en puntos (lee los píxeles del texto dibujado)
//   mundo.js    → reparte las partículas y contiene la línea de tiempo, las fórmulas de movimiento y la cámara
//   luz.js      → pinta cada fotograma: estelas, halo y revelado
//   Escena.jsx  → el componente: fuentes, lienzo y texto pequeño en HTML
//   index.jsx   → este archivo: registra las dos composiciones
import React from 'react';
import {Composition, registerRoot} from 'invokard-studio';
import {ALTERNATIVO, DATOS} from './datos.js';
import {Escena} from './Escena.jsx';
import {FPS, H, W} from './util.js';

const DURACION = 240;   // fotogramas: 8 s a 30 fps (la línea de tiempo de mundo.js está pensada para esta duración)

const Principal = () => <Escena datos={DATOS} />;
const Alternativa = () => <Escena datos={ALTERNATIVO} />;

registerRoot(() => (
  <>
    <Composition id="Particulas" component={Principal} width={W} height={H} fps={FPS} durationInFrames={DURACION} />
    <Composition id="ParticulasAlt" component={Alternativa} width={W} height={H} fps={FPS} durationInFrames={DURACION} />
  </>
));
