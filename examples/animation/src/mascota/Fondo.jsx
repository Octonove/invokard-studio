// El decorado: pared, lámparas, estanterías al fondo, suelo y alfombra. Sitúa la escena sin competir con el zorro:
// todo lo del fondo va en tonos de la pared (poco contraste) y lo único que se mueve son las lámparas y la planta.
import React from 'react';
import {azar, mezcla, alfa} from './util.mjs';

export const LINEA_SUELO = 1262;       // donde la pared se encuentra con el suelo (px de pantalla)
const TABLA = 12, FILA = 160, FILAS = 3, ANCHO_MUEBLE = 250;
const Y_MUEBLE = LINEA_SUELO - TABLA - FILAS * (FILA + TABLA);

// Libros de una estantería, repartidos con azar de semilla (siempre los mismos)
const lomos = (x0, semilla, tonos) => {
  const out = [];
  for (let f = 0; f < FILAS; f++) {
    const base = Y_MUEBLE + TABLA + f * (FILA + TABLA) + FILA;
    let x = x0 + TABLA + 5, k = 0;
    while (x < x0 + ANCHO_MUEBLE - TABLA - 26) {
      const r = azar(semilla + f * 31.7 + k * 7.3);
      const w = 17 + azar(semilla + f * 17.1 + k * 3.9 + 1) * 19;
      const h = 88 + azar(semilla + f * 13.3 + k * 5.1 + 2) * 56;
      if (r > 0.88) {
        // un hueco con un par de libros tumbados
        out.push({x, y: base - 20, w: 52, h: 20, tono: tonos[k % tonos.length], giro: 0});
        out.push({x: x + 4, y: base - 38, w: 44, h: 18, tono: tonos[(k + 2) % tonos.length], giro: 0});
        x += 58;
      } else {
        out.push({x, y: base - h, w, h, tono: tonos[Math.floor(azar(semilla + f * 5.3 + k * 11.9 + 3) * tonos.length)], giro: r < 0.07 ? -8 : 0});
        x += w + (r < 0.07 ? 12 : 3);
      }
      k++;
    }
  }
  return out;
};

const Mueble = ({x0, semilla, c, tonos}) => (
  <g>
    <rect x={x0} y={Y_MUEBLE} width={ANCHO_MUEBLE} height={LINEA_SUELO - Y_MUEBLE} rx={6} fill={c.muebleFondo} />
    {lomos(x0, semilla, tonos).map((l, i) => (
      <rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} rx={3} fill={l.tono} transform={l.giro ? `rotate(${l.giro} ${l.x + l.w} ${l.y + l.h})` : undefined} />
    ))}
    {/* armazón: costados y baldas */}
    <rect x={x0} y={Y_MUEBLE} width={TABLA} height={LINEA_SUELO - Y_MUEBLE} fill={c.mueble} />
    <rect x={x0 + ANCHO_MUEBLE - TABLA} y={Y_MUEBLE} width={TABLA} height={LINEA_SUELO - Y_MUEBLE} fill={c.mueble} />
    {Array.from({length: FILAS + 1}, (_, f) => (
      <rect key={f} x={x0 - 6} y={Y_MUEBLE + f * (FILA + TABLA)} width={ANCHO_MUEBLE + 12} height={TABLA} rx={3} fill={c.mueble} />
    ))}
  </g>
);

// Lámpara colgante con su cono de luz; se mece muy poco
const Lampara = ({x, largo, c, t, fase}) => {
  const ang = 1.1 * Math.sin(2 * Math.PI * 0.19 * t + fase);
  return (
    <g transform={`rotate(${ang.toFixed(3)} ${x} 0)`}>
      <path d={`M${x - 46},${largo + 40}L${x + 46},${largo + 40}L${x + 330},1250L${x - 330},1250Z`} fill="url(#conoLuz)" />
      <rect x={x - 2.5} y={-10} width={5} height={largo + 12} fill={c.mueble} />
      <path d={`M${x - 62},${largo + 44}Q${x - 58},${largo - 6} ${x},${largo - 8}Q${x + 58},${largo - 6} ${x + 62},${largo + 44}Z`} fill={c.cartel} />
      <path d={`M${x - 62},${largo + 44}Q${x - 60},${largo + 22} ${x - 50},${largo + 12}L${x + 50},${largo + 12}Q${x + 60},${largo + 22} ${x + 62},${largo + 44}Z`} fill={alfa(c.oscuro, 0.14)} />
      <ellipse cx={x} cy={largo + 44} rx={30} ry={11} fill={c.blanco} />
    </g>
  );
};

// Planta en maceta encima de un mueble
const Planta = ({x, y, c, t}) => (
  <g>
    {[-38, -14, 12, 36].map((g, i) => (
      <path key={i} transform={`translate(${x} ${y - 46}) rotate(${g + 2.2 * Math.sin(2 * Math.PI * 0.23 * t + i * 1.3)})`} d="M0,0C-22,-30 -18,-74 0,-104C18,-74 22,-30 0,0Z" fill={i % 2 ? c.hoja : c.hoja2} />
    ))}
    <path d={`M${x - 34},${y - 50}L${x + 34},${y - 50}L${x + 26},${y}L${x - 26},${y}Z`} fill={c.maceta} />
    <rect x={x - 38} y={y - 56} width={76} height={14} rx={5} fill={c.maceta2} />
  </g>
);

export const Fondo = ({c, t}) => {
  const tonos = [c.oscuro, c.cartel, c.acento, c.zorro, mezcla(c.oscuro, c.claro, 0.45)].map((x) => mezcla(x, c.fondo, 0.66));
  return (
    <g>
      <defs>
        <radialGradient id="luzPared" cx={540} cy={620} r={820} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.paredLuz} stopOpacity="0.95" />
          <stop offset="1" stopColor={c.paredLuz} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="conoLuz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.blanco} stopOpacity="0.5" />
          <stop offset="1" stopColor={c.blanco} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sueloHondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.suelo} />
          <stop offset="1" stopColor={c.suelo2} />
        </linearGradient>
      </defs>
      {/* pared */}
      <rect x={-300} y={-300} width={1680} height={LINEA_SUELO + 300} fill={c.pared} />
      <rect x={-300} y={-300} width={1680} height={LINEA_SUELO + 300} fill="url(#luzPared)" />
      {/* estanterías y lo que tienen encima */}
      <Mueble x0={26} semilla={3} c={c} tonos={tonos} />
      <Mueble x0={804} semilla={41} c={c} tonos={tonos} />
      <Planta x={92} y={Y_MUEBLE} c={c} t={t} />
      <g>
        <rect x={938} y={Y_MUEBLE - 22} width={92} height={22} rx={4} fill={tonos[0]} />
        <rect x={946} y={Y_MUEBLE - 42} width={76} height={20} rx={4} fill={tonos[1]} />
        <rect x={942} y={Y_MUEBLE - 60} width={84} height={18} rx={4} fill={tonos[2]} />
      </g>
      {/* lámparas (zona de arriba: solo ambiente) */}
      <Lampara x={150} largo={178} c={c} t={t} fase={0.4} />
      <Lampara x={930} largo={150} c={c} t={t} fase={2.1} />
      {/* suelo, zócalo y tablas */}
      <rect x={-300} y={LINEA_SUELO} width={1680} height={800} fill="url(#sueloHondo)" />
      <rect x={-300} y={LINEA_SUELO - 16} width={1680} height={16} fill={c.zocalo} />
      {[58, 136, 240, 380, 560].map((d, i) => (
        <rect key={i} x={-300} y={LINEA_SUELO + d} width={1680} height={3} fill={alfa(c.oscuro, 0.07 - i * 0.008)} />
      ))}
    </g>
  );
};

// Alfombra: va en la capa del zorro (pisa sobre ella), no en la del fondo
export const Alfombra = ({c}) => (
  <g>
    <ellipse cx={540} cy={1400} rx={470} ry={88} fill={c.alfombraBorde} />
    <ellipse cx={540} cy={1398} rx={452} ry={77} fill={c.alfombra} />
    <ellipse cx={540} cy={1398} rx={424} ry={63} fill="none" stroke={alfa(c.claro, 0.7)} strokeWidth={4} />
    <ellipse cx={540} cy={1398} rx={402} ry={52} fill="none" stroke={alfa(c.claro, 0.7)} strokeWidth={3} strokeDasharray="2 14" strokeLinecap="round" />
  </g>
);

// Primer plano desenfocado (zona de abajo: solo ambiente): hojas grandes que asoman por la esquina
export const PrimerPlano = ({c, t}) => (
  <g filter="url(#desenfoque)">
    {[[-20, 2030, -14, 0.8], [70, 2060, 10, 0.9], [-50, 1980, -40, 0.7]].map(([x, y, g, e], i) => (
      <path key={i} transform={`translate(${x} ${y}) rotate(${g + 1.6 * Math.sin(2 * Math.PI * 0.17 * t + i * 1.7)}) scale(${e})`} d="M0,0C-90,-120 -80,-300 0,-430C80,-300 90,-120 0,0Z" fill={i % 2 ? c.hojaCerca2 : c.hojaCerca} />
    ))}
    {[[1100, 2030, 14, 0.8], [1015, 2070, -8, 0.85], [1140, 1980, 42, 0.7]].map(([x, y, g, e], i) => (
      <path key={i} transform={`translate(${x} ${y}) rotate(${g + 1.6 * Math.sin(2 * Math.PI * 0.15 * t + 2 + i * 1.9)}) scale(${e})`} d="M0,0C-90,-120 -80,-300 0,-430C80,-300 90,-120 0,0Z" fill={i % 2 ? c.hojaCerca : c.hojaCerca2} />
    ))}
  </g>
);
