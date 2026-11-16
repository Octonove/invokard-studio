// Utilidades pequeñas de la animación de partículas. Copiadas aquí para que la carpeta sea autosuficiente.

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const TAU = Math.PI * 2;

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, k) => a + (b - a) * k;

// Generador de azar con semilla (mulberry32). Nunca Math.random: cada fotograma debe salir igual siempre.
export const crearAzar = (semilla) => {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Color #RRGGBB (o #RGB) → [r, g, b] en luz lineal (0..1). La luz se suma en lineal y se pasa a pantalla al final.
export const hexALineal = (hex) => {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => Math.pow((parseInt(h.slice(i, i + 2), 16) || 0) / 255, 2.2));
};

// Respuesta de un muelle poco amortiguado, de 0 a 1: arranca suave, llega rápido (cruza el 1 hacia k = 0,3),
// se pasa un 5 % y se asienta. Es lo que da el «exceso y asentamiento» de cada partícula al llegar a su sitio.
const M_FRENO = 7.0;
const M_VAIVEN = 7.5;
const muelleCrudo = (k) => 1 - Math.exp(-M_FRENO * k) * (Math.cos(M_VAIVEN * k) + (M_FRENO / M_VAIVEN) * Math.sin(M_VAIVEN * k));
const MUELLE_FIN = muelleCrudo(1);
export const muelle = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : muelleCrudo(k) / MUELLE_FIN);
// Fracción de la duración en la que el muelle cruza el 1 por primera vez (la «llegada» visible).
export const MUELLE_LLEGADA = (Math.PI - Math.atan(M_VAIVEN / M_FRENO)) / M_VAIVEN;

// Curva suave que pasa por unos puntos clave [[t, valor], ...] (Catmull-Rom con tiempos desiguales).
export const curva = (claves, t) => {
  const n = claves.length;
  if (t <= claves[0][0]) return claves[0][1];
  if (t >= claves[n - 1][0]) return claves[n - 1][1];
  let i = 0;
  while (t > claves[i + 1][0]) i++;
  const [t1, p1] = claves[i];
  const [t2, p2] = claves[i + 1];
  const [t0, p0] = claves[Math.max(0, i - 1)];
  const [t3, p3] = claves[Math.min(n - 1, i + 2)];
  const m1 = i === 0 ? (p2 - p1) / (t2 - t1) : (p2 - p0) / (t2 - t0);
  const m2 = i + 2 > n - 1 ? (p2 - p1) / (t2 - t1) : (p3 - p1) / (t3 - t1);
  const d = t2 - t1;
  const k = (t - t1) / d;
  const k2 = k * k;
  const k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * p1 + (k3 - 2 * k2 + k) * d * m1 + (-2 * k3 + 3 * k2) * p2 + (k3 - k2) * d * m2;
};
