// El anuncio completo: lienzo 3D (fondo incluido) y, encima, los titulares en HTML y un grano fino.
import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'invokard-studio';
import {ThreeCanvas} from 'invokard-studio/three';
import * as THREE from 'three';
import {ALTERNATIVO, DATOS} from './datos.js';
import {CAMPO_VISION, Escena} from './Escena.jsx';
import {fuentesListas} from './fuentes.js';
import {Textos} from './Textos.jsx';
import {azar, FPS, generador} from './util.js';

// Píxeles que se calculan por cada píxel del vídeo. 2 = el doble de resolución interna, que al
// reducirse deja los bordes y los brillos pequeños sin dientes de sierra ni chispas.
const SOBREMUESTREO = 2;
// Grano de película por encima de todo (0 = sin grano). Quita el aire «de ordenador» y evita
// que los degradados del fondo hagan bandas al comprimir.
const GRANO = 0.04;

// Mosaico de ruido gris, generado con semilla. Se desplaza a saltos en cada fotograma
// (posición sacada del número de fotograma), así el grano vibra pero cada fotograma sale siempre igual.
const LADO_GRANO = 256;
const crearGrano = () => {
  const c = document.createElement('canvas');
  c.width = LADO_GRANO;
  c.height = LADO_GRANO;
  const g = c.getContext('2d');
  const img = g.createImageData(LADO_GRANO, LADO_GRANO);
  const rnd = generador(1234);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() + rnd() - 1) * 110;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
};

const Grano = ({frame}) => {
  const url = useMemo(crearGrano, []);
  const x = Math.floor(azar(frame * 1.7 + 3) * LADO_GRANO);
  const y = Math.floor(azar(frame * 2.3 + 11) * LADO_GRANO);
  return <AbsoluteFill style={{backgroundImage: `url(${url})`, backgroundSize: `${LADO_GRANO * 2}px ${LADO_GRANO * 2}px`, backgroundPosition: `${x * 2}px ${y * 2}px`, mixBlendMode: 'overlay', opacity: GRANO, pointerEvents: 'none'}} />;
};

// variante: 'principal' (DATOS) o 'alternativo' (ALTERNATIVO). «datosDePrueba» solo lo usa dev.jsx para ensayar otros datos.
export const Anuncio = ({variante, datosDePrueba}) => {
  const datos = datosDePrueba || (variante === 'alternativo' ? ALTERNATIVO : DATOS);
  const {width, height} = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // La etiqueta se pinta en un lienzo con las tipografías: hasta que no están cargadas no se monta nada.
  const [espera] = useState(() => delayRender('Tipografías de la etiqueta y los titulares'));
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    fuentesListas().then(() => vivo && setListo(true));
    return () => {
      vivo = false;
    };
  }, []);
  // se libera la espera cuando el lienzo 3D ya está montado (él pide la suya propia)
  useEffect(() => {
    if (listo) continueRender(espera);
  }, [listo, espera]);

  return (
    <AbsoluteFill style={{background: datos.colores.fondo}}>
      {listo ? (
        <>
          <ThreeCanvas
            width={width}
            height={height}
            dpr={SOBREMUESTREO}
            gl={{antialias: true, alpha: false, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1}}
            camera={{fov: CAMPO_VISION, near: 1, far: 200, position: [0, 3, 20]}}
          >
            <Escena datos={datos} />
          </ThreeCanvas>
          <Textos datos={datos} t={t} />
          {GRANO > 0 ? <Grano frame={frame} /> : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
