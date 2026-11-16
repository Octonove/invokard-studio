// La pila de libros y el libro viajero. Cada libro es un rectángulo redondeado con un detalle (tejuelo, franjas o canto de páginas).
import React from 'react';
import {mezcla, alfa} from './util.mjs';

const r1 = (n) => Math.round(n * 10) / 10;

// Un libro tumbado, dibujado con el origen en el centro de su base (o en su centro si centrado = true).
const Libro = ({l, color, c, centrado = false}) => {
  const w = l.ancho, h = l.alto;
  const sombra = mezcla(color, c.oscuro, 0.26), luz = mezcla(color, c.claro, 0.38);
  const papel = mezcla(c.claro, c.fondo, 0.35), raya = mezcla(papel, c.oscuro, 0.16);
  return (
    <g transform={`translate(0 ${centrado ? h / 2 : 0}) scale(${l.espejo ? -1 : 1} 1)`}>
      {/* tapa con una franja de sombra abajo: da volumen sin degradados */}
      <rect x={-w / 2} y={-h} width={w} height={h} rx={6} fill={sombra} />
      <rect x={-w / 2} y={-h} width={w} height={h * 0.78} rx={6} fill={color} />
      {l.estilo === 0 && (
        <g>
          <rect x={-w * 0.17} y={-h * 0.8} width={w * 0.34} height={h * 0.46} rx={4} fill={alfa(c.claro, 0.9)} />
          <rect x={-w / 2 + 15} y={-h} width={5} height={h} fill={luz} />
          <rect x={-w / 2 + 25} y={-h} width={5} height={h} fill={luz} />
          <rect x={w / 2 - 20} y={-h} width={5} height={h} fill={luz} />
        </g>
      )}
      {l.estilo === 1 && (
        <g>
          <rect x={-w * 0.32} y={-h} width={11} height={h} fill={luz} />
          <rect x={w * 0.32 - 11} y={-h} width={11} height={h} fill={luz} />
          <circle cx={0} cy={-h * 0.56} r={h * 0.17} fill={luz} />
        </g>
      )}
      {l.estilo === 2 && (
        <g>
          <rect x={-w / 2 + 13} y={-h + 6} width={w - 15} height={h - 12} rx={2} fill={papel} />
          <rect x={-w / 2 + 13} y={-h + 6 + (h - 12) * 0.36} width={w - 15} height={2} fill={raya} />
          <rect x={-w / 2 + 13} y={-h + 6 + (h - 12) * 0.68} width={w - 15} height={2} fill={raya} />
        </g>
      )}
    </g>
  );
};

// color de cada libro: la lista se recorre de abajo arriba y se repite; el de arriba usa el acento
export const colorLibro = (i, libros, datos) => (libros[i].cima ? datos.paleta.acento : datos.pila.colores[i % datos.pila.colores.length]);

// Pila sin el libro de arriba (ese va aparte porque sale volando)
export const Pila = ({pila, libros, datos, c}) => (
  <g>
    {pila.libros.slice(0, -1).map((b, i) => (
      <g key={i} transform={`translate(${r1(b.x)} ${r1(b.y)}) rotate(${r1(b.ang)}) scale(${b.escX.toFixed(3)} ${b.escY.toFixed(3)})`}>
        <Libro l={libros[i]} color={colorLibro(i, libros, datos)} c={c} />
      </g>
    ))}
  </g>
);

// El libro viajero: su pose da el centro, el ángulo y el aplastamiento
export const Viajero = ({v, libros, datos, c}) => {
  const i = libros.length - 1;
  return (
    <g transform={`translate(${r1(v.x)} ${r1(v.y)}) rotate(${r1(v.ang)}) scale(${v.escX.toFixed(3)} ${v.escY.toFixed(3)})`}>
      <Libro l={libros[i]} color={colorLibro(i, libros, datos)} c={c} centrado />
    </g>
  );
};
