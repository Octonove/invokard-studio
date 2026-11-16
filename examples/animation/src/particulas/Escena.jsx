// ESCENA: el componente de React. Carga las fuentes, monta el lienzo donde se pinta la luz y pone encima,
// en HTML nítido, el texto pequeño del final. Todo lo que se ve depende solo del número de fotograma.
import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame} from 'invokard-studio';
import {loadFont as cargarAnton} from 'invokard-studio/google-fonts/Anton';
import {loadFont as cargarBarlow} from 'invokard-studio/google-fonts/Barlow';
import {crearMundo, T_TEXTO} from './mundo.js';
import {crearRevelador, CY, pintar} from './luz.js';
import {clamp, FPS, H, lerp, W} from './util.js';

const CUERPO_TEXTO = 48;              // cuerpo del texto pequeño, en píxeles (si no cabe se encoge, pero nunca baja de 40)
const ANCHO_TEXTO = 900;              // ancho máximo del texto pequeño
const ESPACIADO_TEXTO = 0.045;        // espaciado entre letras del texto pequeño, en em
const ENTRADA_TEXTO = 0.75;           // segundos que tarda en entrar

// Dos familias: Anton para las palabras de partículas y Barlow para el texto pequeño.
const anton = cargarAnton('normal', {weights: ['400'], subsets: ['latin']});
const barlow = cargarBarlow('normal', {weights: ['500'], subsets: ['latin']});

// El reparto de partículas y la memoria de trabajo se calculan una vez por pestaña y por juego de datos.
const memoria = new Map();
const preparar = (datos) => {
  const clave = JSON.stringify(datos);
  if (!memoria.has(clave)) {
    const mundo = crearMundo(datos, anton.fontFamily);
    // Si el texto pequeño es largo, se encoge hasta que quepa (sin bajar de 40 px).
    const texto = datos.textoPequeno || '';
    const g = document.createElement('canvas').getContext('2d');
    g.font = `500 ${CUERPO_TEXTO}px "${barlow.fontFamily}"`;
    const ancho = g.measureText(texto).width + texto.length * ESPACIADO_TEXTO * CUERPO_TEXTO;
    const cuerpo = Math.max(40, Math.min(CUERPO_TEXTO, (CUERPO_TEXTO * ANCHO_TEXTO) / Math.max(1, ancho)));
    memoria.set(clave, {mundo, revelador: crearRevelador(mundo, datos.colores), cuerpo});
  }
  return memoria.get(clave);
};

export const Escena = ({datos}) => {
  const fotograma = useCurrentFrame();
  const t = fotograma / FPS;
  const lienzo = useRef(null);
  const avisado = useRef(false);
  const [listo, setListo] = useState(null);
  const [espera] = useState(() => delayRender('Fuentes y reparto de partículas'));

  // 1. Esperar a las fuentes: el texto se dibuja en un lienzo y sin la fuente cargada saldría con otra letra.
  useLayoutEffect(() => {
    let vivo = true;
    Promise.all([anton.waitUntilDone(), barlow.waitUntilDone()])
      .then(() => document.fonts.ready)
      .then(() => vivo && setListo(preparar(datos)));
    return () => {
      vivo = false;
    };
  }, [datos]);

  // 2. Pintar el fotograma en el lienzo antes de que el navegador lo capture.
  useLayoutEffect(() => {
    if (!listo) return;
    pintar(lienzo.current.getContext('2d'), listo.mundo, listo.revelador, fotograma);
    if (!avisado.current) {
      avisado.current = true;
      continueRender(espera);
    }
  }, [listo, fotograma, espera]);

  // 3. Texto pequeño: entra subiendo, enfocándose y cerrando el espaciado entre letras.
  const k = clamp((t - T_TEXTO) / ENTRADA_TEXTO);
  const e = 1 - Math.pow(1 - k, 3);
  const neon = datos.colores.neon;
  const halo = neon[Math.floor(neon.length / 2)];

  return (
    <AbsoluteFill style={{backgroundColor: datos.colores.fondo}}>
      <canvas ref={lienzo} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: W, height: H}} />
      {listo && datos.textoPequeno ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: W,
            top: CY + listo.mundo.F[2].yPie - listo.cuerpo * 0.62,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            fontFamily: barlow.fontFamily,
            fontWeight: 500,
            fontSize: listo.cuerpo,
            lineHeight: 1.24,
            letterSpacing: `${lerp(0.16, ESPACIADO_TEXTO, e)}em`,
            color: datos.colores.texto,
            textShadow: `0 0 26px ${halo}aa, 0 0 8px ${halo}55`,
            opacity: e,
            transform: `translateY(${(1 - e) * 26}px)`,
            filter: `blur(${(1 - e) * 7}px)`,
          }}
        >
          {datos.textoPequeno}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
