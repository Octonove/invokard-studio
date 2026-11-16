// Utilidades de animación y de color. Copiadas y ampliadas a partir de comun/lib.js
// (cada animación es autosuficiente: no se importa nada de fuera de esta carpeta).
import {Easing, spring} from 'invokard-studio';

export const FPS = 30;
export const ANCHO = 1080;
export const ALTO = 1920;
export const FOTOGRAMAS = 240; // 8 s

// ---------- números ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
// transición suave 0→1 entre a y b (smoothstep)
export const escalon = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// ---------- curvas ----------
export const suave = Easing.bezier(0.22, 1, 0.36, 1); // sale rápido y frena (entradas)
export const entraSale = Easing.bezier(0.65, 0, 0.35, 1); // acelera y frena (de A a B)
// progreso 0→1 desde t0 durante dur segundos, con curva
export const prog = (t, t0, dur, curva = suave) => curva(clamp((t - t0) / dur));
// muelle 0→1 que arranca en t0 (rebota según damping)
export const muelle = (t, t0, cfg = {}) =>
  spring({frame: Math.max(0, (t - t0) * FPS), fps: FPS, config: {damping: 13, stiffness: 150, mass: 0.9, ...cfg}});
// oscilación amortiguada que arranca en t0: vale 0 antes, da un golpe y se apaga sola
export const golpe = (t, t0, frecuencia = 38, apagado = 16) => {
  const x = t - t0;
  return x <= 0 ? 0 : Math.exp(-apagado * x) * Math.sin(frecuencia * x);
};

// ---------- azar con semilla (nunca Math.random: cada fotograma debe salir siempre igual) ----------
export const azar = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// generador de una secuencia estable a partir de una semilla entera
export const generador = (semilla) => {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- color ----------
const aRGB = (c) => {
  const h = c.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const aHex = (v) => '#' + v.map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
// mezcla de dos colores #RRGGBB (k=0 → c1, k=1 → c2); devuelve #RRGGBB
export const mezcla = (c1, c2, k) => {
  const a = aRGB(c1), b = aRGB(c2);
  return aHex(a.map((v, i) => lerp(v, b[i], clamp(k))));
};
export const aclara = (c, k) => mezcla(c, '#ffffff', k);
export const oscurece = (c, k) => mezcla(c, '#000000', k);
// el mismo color con transparencia, para lienzos y CSS
export const conAlfa = (c, alfa) => {
  const [r, g, b] = aRGB(c);
  return `rgba(${r},${g},${b},${alfa})`;
};
