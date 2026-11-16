// Utilidades pequeñas y sin dependencias: números, azar con semilla, curvas y color.
// Nada de aquí guarda estado entre fotogramas.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;

// Azar estable a partir de un número (nunca Math.random: cada fotograma se pinta por separado).
export const azar = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Generador con semilla (mulberry32): devuelve una función que da números 0..1 siempre en el mismo orden.
export const generador = (semilla) => {
  let a = (semilla * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Curvas de 0 a 1
export const frena = (k) => 1 - Math.pow(1 - clamp(k), 3);                 // sale rápido y frena
export const entraSale = (k) => {                                           // acelera y frena
  const x = clamp(k);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const suaviza = (k) => {                                             // escalón suave
  const x = clamp(k);
  return x * x * (3 - 2 * x);
};

// ---------- Color ----------
const aRgb = (hex) => {
  const h = hex.replace('#', '');
  const c = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
};
const aHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

// mezcla de dos colores #RRGGBB (k=0 da el primero, k=1 el segundo)
export const mezcla = (c1, c2, k) => {
  const a = aRgb(c1), b = aRgb(c2);
  return aHex(a.map((v, i) => lerp(v, b[i], clamp(k))));
};
export const aclara = (c, k) => mezcla(c, '#ffffff', k);
export const oscurece = (c, k) => mezcla(c, '#000000', k);
export const conAlfa = (c, alfa) => {
  const [r, g, b] = aRgb(c);
  return `rgba(${r},${g},${b},${alfa})`;
};
// luminosidad percibida 0..1 (para decidir si encima va texto claro u oscuro)
export const luz = (c) => {
  const [r, g, b] = aRgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const aHsl = (hex) => {
  const [r, g, b] = aRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};
const deHsl = (h, s, l) => {
  const hh = (((h % 360) + 360) % 360) / 360;
  const f = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) return aHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return aHex([f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255]);
};
// mueve tono (grados), saturación y luz de un color
export const ajusta = (hex, {h = 0, s = 0, l = 0}) => {
  const [hh, ss, ll] = aHsl(hex);
  return deHsl(hh + h, clamp(ss + s), clamp(ll + l));
};

// Tres tonos para dar volumen a una fruta a partir de su color: la luz tira a amarillo, la sombra a rojo.
export const tonos = (base) => {
  const [h] = aHsl(base);
  const calido = h < 70 || h > 300;            // rojos, naranjas y amarillos
  return {
    claro: ajusta(base, {h: calido ? 9 : -8, s: 0.02, l: 0.13}),
    base,
    oscuro: ajusta(base, {h: calido ? -11 : 9, s: 0.03, l: -0.15}),
    hondo: ajusta(base, {h: calido ? -16 : 12, s: 0.02, l: -0.27}),
  };
};
