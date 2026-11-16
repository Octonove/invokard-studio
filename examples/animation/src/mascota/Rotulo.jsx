// El rótulo de la tienda (cuelga de un clavo y se mece) y el cartel de la oferta, que cuelga del rótulo
// enrollado y se desenrolla cuando el zorro se gira a cámara. También los destellos y el pie con la dirección.
import React from 'react';
import {loadFont as cargarTitular} from 'invokard-studio/google-fonts/Fraunces';
import {loadFont as cargarTexto} from 'invokard-studio/google-fonts/Figtree';
import {T} from './guion.mjs';
import {clamp, lerp, claves, vibra, sale, alfa} from './util.mjs';

// Las dos únicas familias: una con carácter para el nombre y el titular, y una limpia para lo pequeño.
export const titular = cargarTitular('normal', {weights: ['700', '900'], subsets: ['latin']});
export const texto = cargarTexto('normal', {weights: ['700', '800'], subsets: ['latin']});

// ───── Medidas en pantalla (px) ─────
const CX = 540;                                        // eje de todo lo que cuelga
const CLAVO_Y = 256;                                   // el clavo del que cuelga el rótulo (por encima de la zona segura: solo ambiente)
const ROT = {x: 170, y: 296, w: 740, h: 174};          // tablero del rótulo
const PAPEL = {x: 156, y: 504, w: 768, h: 256};        // cartel de la oferta ya desenrollado
const ANCHO_ROTULO = ROT.w - 44;                       // ancho útil para el texto del rótulo
const ANCHO_CARTEL = PAPEL.w - 68;                     // ancho útil para el texto del cartel
const MINIMO = 40;                                     // ningún texto baja de 40 px: por debajo no se lee en un móvil

// Ancho de un texto a un tamaño dado. "medir" da el ancho real a 100 px con la fuente ya cargada; sin él se estima.
const anchoDe = (medir, txt, familia, peso, tam) => ((medir ? medir(txt, familia, peso) : txt.length * 54) * tam) / 100;
// Tamaño de letra que hace caber un texto en un ancho, entre un mínimo y un máximo.
const ajusta = (medir, txt, familia, peso, max, min, anchoMax) => clamp((anchoMax / anchoDe(medir, txt, familia, peso, 100)) * 100, min, max);
// Mayúsculas espaciadas: si el texto es largo cede primero el espaciado (de max a 2 px) y el tamaño no se toca.
const espaciado = (medir, txt, familia, peso, tam, anchoMax, max) => clamp((anchoMax - anchoDe(medir, txt, familia, peso, tam)) / txt.length, 2, max);

export const Rotulo = ({datos, c, t, medir}) => {
  // balanceo: una respiración lenta y un respingo con el frenazo y con el golpe de la pila
  const ang = 0.42 * Math.sin(2 * Math.PI * 0.2 * t + 1) + vibra(t, T.para, 0.7, 1.25, 2.2) + vibra(t, T.posa, 1.0, 1.35, 2.4);

  // textos del rótulo
  const tipo = datos.tipo.toUpperCase();
  const espTipo = espaciado(medir, tipo, texto.fontFamily, 800, MINIMO, ANCHO_ROTULO - 40, 9);
  const tamNombre = ajusta(medir, datos.negocio, titular.fontFamily, 700, 90, MINIMO, ANCHO_ROTULO);

  // cartel: se desenrolla con un pequeño rebote al final
  const k = clamp(claves(t, [[T.cartel, 0], [T.cartel + 0.46, 1, sale]]) + vibra(t, T.cartel + 0.4, 0.03, 2.6, 6), 0, 1.04);
  const alto = PAPEL.h * k;
  const rollo = lerp(30, 12, clamp(k));                // el rollo adelgaza según suelta papel
  const l1 = datos.oferta.linea1.toUpperCase();
  const tam1 = 42, tam3 = ajusta(medir, datos.oferta.linea3, texto.fontFamily, 700, 42, MINIMO, ANCHO_CARTEL);
  const esp1 = espaciado(medir, l1, texto.fontFamily, 800, tam1, ANCHO_CARTEL, 7);
  const tam2 = ajusta(medir, datos.oferta.linea2, titular.fontFamily, 900, 106, 72, ANCHO_CARTEL);
  const y1 = PAPEL.y + 34 + tam1 * 0.72;               // líneas de base de los tres renglones
  const y2 = y1 + 20 + tam2 * 0.72;
  const y3 = y2 + 28 + tam3 * 0.72;
  // el titular da un latido cuando termina de desenrollarse, y el cartel se queda meciéndose un momento
  const desde = Math.max(0, t - T.cartel - 0.5);
  const latido = 1 + 0.07 * Math.exp(-7 * desde) * Math.sin(2 * Math.PI * 2.2 * desde);
  const balanceoCartel = vibra(t, T.cartel + 0.3, 1.6, 1.5, 2.6);
  const yLatido = y2 - tam2 * 0.3;

  return (
    <g transform={`rotate(${ang.toFixed(3)} ${CX} ${CLAVO_Y})`}>
      {/* cartel de la oferta (detrás del rótulo, cuelga de él con dos cuerdas) */}
      <g transform={`rotate(${balanceoCartel.toFixed(3)} ${CX} ${PAPEL.y - 20})`}>
        <path d={`M${PAPEL.x + 70},${ROT.y + ROT.h - 6}L${PAPEL.x + 70},${PAPEL.y}M${PAPEL.x + PAPEL.w - 70},${ROT.y + ROT.h - 6}L${PAPEL.x + PAPEL.w - 70},${PAPEL.y}`} stroke={c.cuerda} strokeWidth={5} />
        {/* sombra del papel en la pared */}
        <rect x={PAPEL.x + 12} y={PAPEL.y + 14} width={PAPEL.w} height={alto + rollo} rx={8} fill={alfa(c.oscuro, 0.1)} />
        <clipPath id="recortePapel"><rect x={PAPEL.x} y={PAPEL.y} width={PAPEL.w} height={alto + 1} /></clipPath>
        <rect x={PAPEL.x} y={PAPEL.y} width={PAPEL.w} height={alto + 1} fill={c.cartel} />
        <g clipPath="url(#recortePapel)">
          <rect x={PAPEL.x + 16} y={PAPEL.y + 18} width={PAPEL.w - 32} height={PAPEL.h - 34} rx={10} fill="none" stroke={alfa(c.oscuro, 0.3)} strokeWidth={3} />
          <text x={CX + esp1 / 2} y={y1} textAnchor="middle" fontFamily={texto.fontFamily} fontWeight={800} fontSize={tam1} letterSpacing={esp1} fill={c.oscuro}>{l1}</text>
          <g transform={`translate(${CX} ${yLatido}) scale(${latido.toFixed(4)}) translate(${-CX} ${-yLatido})`}>
            <text x={CX} y={y2} textAnchor="middle" fontFamily={titular.fontFamily} fontWeight={900} fontSize={tam2} fill={c.oscuro}>{datos.oferta.linea2}</text>
          </g>
          <text x={CX} y={y3} textAnchor="middle" fontFamily={texto.fontFamily} fontWeight={700} fontSize={tam3} fill={c.tintaSuave}>{datos.oferta.linea3}</text>
        </g>
        {/* listón de arriba y rollo de abajo */}
        <rect x={PAPEL.x - 14} y={PAPEL.y - 10} width={PAPEL.w + 28} height={20} rx={10} fill={c.madera} />
        <rect x={PAPEL.x - 10} y={PAPEL.y + alto - rollo * 0.3} width={PAPEL.w + 20} height={rollo} rx={rollo / 2} fill={c.cartelSombra} />
        <rect x={PAPEL.x - 10} y={PAPEL.y + alto - rollo * 0.3} width={PAPEL.w + 20} height={rollo * 0.45} rx={rollo * 0.22} fill={c.cartel} />
      </g>
      {/* rótulo de la tienda */}
      <path d={`M${ROT.x + 150},${ROT.y + 6}L${CX},${CLAVO_Y}L${ROT.x + ROT.w - 150},${ROT.y + 6}`} stroke={c.cuerda} strokeWidth={5} fill="none" strokeLinejoin="round" />
      <circle cx={CX} cy={CLAVO_Y} r={9} fill={c.madera} />
      <rect x={ROT.x + 8} y={ROT.y + 12} width={ROT.w} height={ROT.h} rx={24} fill={alfa(c.oscuro, 0.14)} />
      <rect x={ROT.x} y={ROT.y} width={ROT.w} height={ROT.h} rx={24} fill={c.oscuro} />
      <rect x={ROT.x + 11} y={ROT.y + 11} width={ROT.w - 22} height={ROT.h - 22} rx={15} fill="none" stroke={alfa(c.cartel, 0.75)} strokeWidth={3} />
      <text x={CX + espTipo / 2} y={ROT.y + 58} textAnchor="middle" fontFamily={texto.fontFamily} fontWeight={800} fontSize={MINIMO} letterSpacing={espTipo} fill={c.cartel}>{tipo}</text>
      {/* el nombre se centra en el hueco que queda bajo la línea pequeña, sea cual sea su tamaño */}
      <text x={CX} y={ROT.y + 113 + tamNombre * 0.34} textAnchor="middle" fontFamily={titular.fontFamily} fontWeight={700} fontSize={tamNombre} fill={c.claro}>{datos.negocio}</text>
      <Destellos c={c} t={t} />
    </g>
  );
};

// Destellos que saltan alrededor del cartel cuando acaba de desenrollarse: [x, y, tamaño]
const DESTELLOS = [[100, 556, 1.25], [986, 530, 1], [86, 712, 0.85], [996, 672, 1.3], [146, 818, 0.75], [940, 812, 0.9]];
const Destellos = ({c, t}) => (
  <g>
    {DESTELLOS.map(([x, y, e], i) => {
      const u = (t - T.cartel - 0.42 - i * 0.07) / 0.62;      // salen escalonados
      if (u <= 0 || u >= 1) return null;
      const k = Math.sin(Math.PI * u) ** 0.7 * e;
      return (
        <path key={i} transform={`translate(${x} ${y}) rotate(${(u * 70 + i * 20).toFixed(1)}) scale(${k.toFixed(3)})`} d="M0,-30C3,-9 9,-3 30,0C9,3 3,9 0,30C-3,9 -9,3 -30,0C-9,-3 -3,-9 0,-30Z" fill={[c.cartel, c.acento, c.blanco][i % 3]} />
      );
    })}
  </g>
);

// Pie con la dirección: queda por debajo de la zona segura, así que se puede ocultar con pie: false en los datos
export const Pie = ({datos, c, t, medir}) => {
  if (!datos.pie) return null;
  const ancho = Math.min(960, anchoDe(medir, datos.pie, texto.fontFamily, 700, MINIMO) + 84);
  const k = claves(t, [[T.cartel + 0.5, 0], [T.cartel + 0.95, 1, sale]]);
  return (
    <g opacity={k} transform={`translate(0 ${((1 - k) * 36).toFixed(2)})`}>
      <rect x={CX - ancho / 2} y={1548} width={ancho} height={84} rx={42} fill={c.oscuro} />
      <text x={CX} y={1590 + MINIMO * 0.34} textAnchor="middle" fontFamily={texto.fontFamily} fontWeight={700} fontSize={MINIMO} fill={c.claro}>{datos.pie}</text>
    </g>
  );
};
