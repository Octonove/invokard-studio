// Efectos pequeños que venden la acción: sombras en el suelo, polvo, rayitas de golpe y gotas de susto.
// Cada uno es función del tiempo transcurrido desde su suceso (nunca de un estado que se acumule).
import React from 'react';
import {T} from './guion.mjs';
import {clamp, lerp, sale, alfa, azar} from './util.mjs';

const r1 = (n) => Math.round(n * 10) / 10;

// Sombras planas en el suelo (unidades de esqueleto, y = 0 es el suelo)
export const Sombras = ({p, c}) => {
  const b = p.pila.base;
  const alto = clamp(-b.y / 240);                              // 0 en el suelo, 1 en brazos
  const cu = p.cuerpo;
  const pies = (p.piernas[0].pie.x + p.piernas[1].pie.x) / 2;
  return (
    <g>
      <ellipse cx={r1(lerp(cu.x, pies, 0.5) - 26 * cu.giro)} cy={4} rx={lerp(132, 150, cu.giro)} ry={17} fill={alfa(c.oscuro, 0.16)} />
      <ellipse cx={r1(b.x)} cy={5} rx={lerp(112, 132, alto)} ry={lerp(15, 18, alto)} fill={alfa(c.oscuro, lerp(0.17, 0.07, alto))} />
    </g>
  );
};

// Nube de polvo: bolitas que salen hacia fuera, crecen y se apagan
const Polvo = ({t, t0, x, y, dir = 0, n = 5, c, tam = 1, dur = 0.55}) => {
  const u = (t - t0) / dur;
  if (u <= 0 || u >= 1) return null;
  return (
    <g>
      {Array.from({length: n}, (_, i) => {
        const a = dir === 0 ? lerp(-1, 1, i / (n - 1)) : dir * lerp(0.25, 1, i / (n - 1));
        const d = sale(u) * (46 + 34 * azar(i + t0)) * tam;
        const r = (9 + 9 * azar(i * 3 + t0)) * tam * (0.5 + 0.9 * sale(u)) * (1 - u * u);
        return <circle key={i} cx={r1(x + a * d)} cy={r1(y - 8 * tam - d * 0.42 * (1 - Math.abs(a) * 0.6))} r={r1(Math.max(0, r))} fill={alfa(c.polvo, 0.85)} />;
      })}
    </g>
  );
};

// Rayitas que salen de un punto: marcan un golpe
const Golpe = ({t, t0, x, y, c, n = 5, desde = 200, hasta = 340, radio = 40, dur = 0.3}) => {
  const u = (t - t0) / dur;
  if (u <= 0 || u >= 1) return null;
  const r0 = radio + 34 * sale(u), largo = 26 * Math.sin(Math.PI * Math.min(1, u * 1.15));
  return (
    <g stroke={c.oscuro} strokeWidth={6} strokeLinecap="round">
      {Array.from({length: n}, (_, i) => {
        const a = (lerp(desde, hasta, i / (n - 1)) * Math.PI) / 180;
        return <path key={i} d={`M${r1(x + Math.cos(a) * r0)},${r1(y + Math.sin(a) * r0)}L${r1(x + Math.cos(a) * (r0 + largo))},${r1(y + Math.sin(a) * (r0 + largo))}`} />;
      })}
    </g>
  );
};

// Gotas de susto que saltan de la cabeza
const Gotas = ({t, t0, x, y, c}) => {
  const u = (t - t0) / 0.5;
  if (u <= 0 || u >= 1) return null;
  return (
    <g fill={c.gota}>
      {[-150, -118, -64].map((grados, i) => {
        const a = (grados * Math.PI) / 180;
        const d = 126 + sale(u) * (78 + i * 14);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 60 * u * u;
        const e = (1 - u) ** 0.6;
        return <path key={i} transform={`translate(${r1(px)} ${r1(py)}) rotate(${r1(grados + 90)}) scale(${(e * 1.3).toFixed(3)})`} d="M0,-16C8,-4 10,2 10,7A10,10 0 0 1 -10,7C-10,2 -8,-4 0,-16Z" />;
      })}
    </g>
  );
};

// Todos los efectos del guion. "hitos" son poses ya calculadas en los instantes clave (para saber dónde ocurre cada cosa).
export const Efectos = ({t, c, hitos}) => (
  <g>
    {/* derrape al frenar: polvo delante del pie que clava */}
    <Polvo t={t} t0={T.frena + 0.06} x={hitos.para.piernas[1].pie.x + 44} y={0} dir={1} n={4} c={c} />
    <Polvo t={t} t0={T.para + 0.44} x={hitos.pisa.piernas[0].pie.x - 20} y={0} dir={-1} n={3} c={c} tam={0.8} dur={0.4} />
    {/* susto */}
    <Gotas t={t} t0={T.para + 0.04} x={hitos.susto.cabeza.centro.x} y={hitos.susto.cabeza.centro.y} c={c} />
    {/* la cola caza el libro */}
    <Golpe t={t} t0={T.atrapa} x={hitos.atrapa.viajero.x} y={hitos.atrapa.viajero.y + 6} c={c} desde={200} hasta={340} radio={96} n={5} />
    {/* el libro vuelve a la pila */}
    <Golpe t={t} t0={T.aterriza} x={hitos.aterriza.viajero.x} y={hitos.aterriza.viajero.y} c={c} desde={205} hasta={335} radio={92} n={5} />
    {/* la pila toca el suelo */}
    <Polvo t={t} t0={T.posa} x={hitos.posa.pila.base.x - 96} y={0} dir={-1} n={4} c={c} />
    <Polvo t={t} t0={T.posa} x={hitos.posa.pila.base.x + 96} y={0} dir={1} n={4} c={c} />
  </g>
);
