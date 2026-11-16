// La escena completa: decorado, rótulo, zorro, pila y efectos, en su orden de capas.
import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame} from 'invokard-studio';
import {calcular, camaraEn, prepararLibros, viajeroEn, PIE_CAMARA, T} from './guion.mjs';
import {FPS, W, H, mezcla} from './util.mjs';
import {Alfombra, Fondo, PrimerPlano} from './Fondo.jsx';
import {Rotulo, Pie, titular, texto} from './Rotulo.jsx';
import {ZorroDetras, ZorroDelante} from './Zorro.jsx';
import {Pila, Viajero} from './Libros.jsx';
import {Efectos, Sombras} from './Efectos.jsx';

// Dónde cae en pantalla el origen del esqueleto (el punto del suelo donde frena) y a qué tamaño se dibuja el zorro.
// y = 1380 es el borde inferior de la zona segura de Instagram: de ahí para abajo solo hay suelo.
const ORIGEN = {x: 530, y: 1380};
const ESCALA = 1.1;

// Cada capa sigue a la cámara en distinta medida: el fondo menos que el zorro y el primer plano más. Eso da profundidad.
const capa = (cam, k) => {
  const z = 1 + (cam.z - 1) * k, cx = 540 + (cam.cx - 540) * k;
  return `translate(${(540 - cx * z).toFixed(2)} ${(PIE_CAMARA * (1 - z) + cam.dy * k).toFixed(2)}) scale(${z.toFixed(4)})`;
};

// De los seis colores de la paleta salen todos los demás tonos (sombras, madera, suelo...): así al cambiar la paleta todo acompaña.
const tonos = (p) => ({
  ...p,
  blanco: mezcla(p.claro, '#ffffff', 0.6),
  zorroSombra: mezcla(p.zorro, p.oscuro, 0.24),       // extremidades del lado lejano
  zorroBrazo: mezcla(p.zorro, p.oscuro, 0.07),        // brazo cercano: un punto más oscuro para que se lea sobre el cuerpo
  pata: mezcla(p.zorro, p.oscuro, 0.76),              // calcetines, manos, cejas, interior de las orejas
  delantal: mezcla(p.oscuro, p.claro, 0.12),
  bolsillo: mezcla(p.oscuro, p.claro, 0.3),
  bocaDentro: mezcla(p.oscuro, p.acento, 0.3),
  pared: p.fondo,
  paredLuz: mezcla(p.fondo, '#ffffff', 0.55),
  suelo: mezcla(p.fondo, p.cartel, 0.3),
  suelo2: mezcla(mezcla(p.fondo, p.cartel, 0.3), p.oscuro, 0.14),
  zocalo: mezcla(p.fondo, p.oscuro, 0.22),
  mueble: mezcla(p.fondo, p.oscuro, 0.2),
  muebleFondo: mezcla(p.fondo, p.oscuro, 0.09),
  alfombra: mezcla(p.acento, p.fondo, 0.6),
  alfombraBorde: mezcla(p.acento, p.fondo, 0.42),
  madera: mezcla(p.oscuro, p.zorro, 0.35),
  cuerda: mezcla(p.fondo, p.oscuro, 0.45),
  cartelSombra: mezcla(p.cartel, p.oscuro, 0.22),
  tintaSuave: mezcla(p.oscuro, p.cartel, 0.14),
  hoja: mezcla(mezcla(p.oscuro, p.cartel, 0.3), p.fondo, 0.5),
  hoja2: mezcla(mezcla(p.oscuro, p.cartel, 0.15), p.fondo, 0.42),
  maceta: mezcla(p.zorro, p.fondo, 0.55),
  maceta2: mezcla(p.zorro, p.fondo, 0.42),
  hojaCerca: mezcla(p.oscuro, p.cartel, 0.12),
  hojaCerca2: mezcla(p.oscuro, p.cartel, 0.28),
  polvo: mezcla(p.fondo, p.oscuro, 0.16),
  gota: mezcla(p.oscuro, p.claro, 0.55),
});

// Espera a las fuentes y devuelve un medidor de texto (ancho a 100 px), para ajustar los textos al cartel sea cual sea su largo.
const useMedidor = () => {
  const [listo, setListo] = useState(false);
  const [espera] = useState(() => delayRender('fuentes de la mascota'));
  useEffect(() => {
    let vivo = true;
    Promise.all([titular.waitUntilDone(), texto.waitUntilDone()]).then(() => vivo && setListo(true));
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    if (listo) continueRender(espera);       // el fotograma solo sigue cuando ya se ha redibujado con las medidas buenas
  }, [listo, espera]);
  return useMemo(() => {
    if (!listo) return null;
    const g = document.createElement('canvas').getContext('2d');
    return (txt, familia, peso) => {
      g.font = `${peso} 100px "${familia}"`;
      return g.measureText(txt).width;
    };
  }, [listo]);
};

export const Escena = ({datos}) => {
  const t = useCurrentFrame() / FPS;
  const c = useMemo(() => tonos(datos.paleta), [datos]);
  const libros = useMemo(() => prepararLibros(datos.pila.libros), [datos]);
  const medir = useMedidor();
  const p = calcular(t, libros);
  const cam = camaraEn(t);
  // poses en los instantes clave: dicen a los efectos dónde ocurre cada cosa
  const hitos = useMemo(() => ({
    para: calcular(T.para, libros),
    pisa: calcular(T.para + 0.46, libros),
    susto: calcular(T.para + 0.1, libros),
    atrapa: calcular(T.atrapa, libros),
    aterriza: calcular(T.aterriza, libros),
    posa: calcular(T.posa, libros),
  }), [libros]);
  // El libro viajero se dibuja con la pila (detrás de la cabeza) salvo durante su aventura. El cambio de capa se hace
  // cuando está lejos de la cabeza (resbalando hacia delante y ya asentado arriba), para que no se note el salto.
  const enPila = t < T.para + 0.3 || t > T.aterriza + 0.3;
  const conf = {gafas: true, delantal: true, ...datos.zorro};
  return (
    <AbsoluteFill style={{background: c.pared}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <filter id="desenfoque" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          {/* grano de papel: ruido fijo (misma semilla siempre) convertido en motas oscuras muy tenues */}
          <filter id="grano" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.16  0 0 0 0 0.18  0.8 0 0 0 -0.46" />
          </filter>
          <filter id="granoClaro" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="29" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0.9 0 0 -0.45" />
          </filter>
          <radialGradient id="vineta" cx={W / 2} cy={880} r={1180} gradientUnits="userSpaceOnUse">
            <stop offset="0.52" stopColor={c.oscuro} stopOpacity="0" />
            <stop offset="1" stopColor={c.oscuro} stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <g transform={capa(cam, 0.55)}>
          <Fondo c={c} t={t} />
          <Rotulo datos={datos} c={c} t={t} medir={medir} />
        </g>
        <g transform={capa(cam, 1)}>
          <Alfombra c={c} />
          {/* a partir de aquí, unidades de esqueleto: el origen es el punto del suelo donde frena */}
          <g transform={`translate(${ORIGEN.x} ${ORIGEN.y}) scale(${ESCALA})`}>
            <Sombras p={p} c={c} />
            <ZorroDetras p={p} c={c} conf={conf} />
            <Pila pila={p.pila} libros={libros} datos={datos} c={c} />
            {enPila && <Viajero v={p.viajero} libros={libros} datos={datos} c={c} />}
            <ZorroDelante p={p} c={c} conf={conf} />
            {/* estela: dos copias tenues de donde estaba el libro hace un instante, solo mientras vuela */}
            {p.viajero.donde === 'aire' && [0.07, 0.035].map((dt, i) => {
              const v = viajeroEn(t - dt, libros);
              return v.donde === 'aire' ? <g key={i} opacity={0.14 + i * 0.14}><Viajero v={v} libros={libros} datos={datos} c={c} /></g> : null;
            })}
            {!enPila && <Viajero v={p.viajero} libros={libros} datos={datos} c={c} />}
            <Efectos t={t} c={c} hitos={hitos} />
          </g>
        </g>
        <Pie datos={datos} c={c} t={t} medir={medir} />
        <g transform={capa(cam, 1.8)}>
          <PrimerPlano c={c} t={t} />
        </g>
        {/* acabado: viñeta suave y grano */}
        <rect width={W} height={H} fill="url(#vineta)" />
        <rect width={W} height={H} filter="url(#grano)" opacity={0.4} />
        <rect width={W} height={H} filter="url(#granoClaro)" opacity={0.55} />
      </svg>
    </AbsoluteFill>
  );
};
