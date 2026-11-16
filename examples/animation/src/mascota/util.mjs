// Utilidades de animación de la mascota (copiadas y ampliadas de comun/lib.js: la carpeta es autosuficiente).
// No dependen del motor ni de React, así el guion se puede comprobar también con Node (ver comprobar.mjs).

export const FPS = 30;
export const W = 1080;
export const H = 1920;
const RAD = Math.PI / 180;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;

// ───── Curvas de aceleración (entrada 0..1, salida 0..1) ─────
export const lineal = (x) => x;
export const entra = (x) => x * x * x;                              // arranca lento y acelera (caídas, cargas)
export const sale = (x) => 1 - (1 - x) ** 3;                        // sale rápido y frena (llegadas)
export const entraSale = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2); // de A a B
export const seno = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);       // de A a B, más blando
export const rebasa = (x) => {                                      // se pasa de largo y vuelve
  const c = 1.70158;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

// Interpolación por tramos: ks = [[t0, v0], [t1, v1, curva], ...]. La curva de cada clave gobierna el tramo que llega a ella.
export const claves = (t, ks) => {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [ta, va] = ks[i - 1];
      const [tb, vb, curva = entraSale] = ks[i];
      return lerp(va, vb, curva((t - ta) / (tb - ta)));
    }
  }
  return ks[ks.length - 1][1];
};

// Oscilación amortiguada que nace en t0 (antes vale 0): amp · e^(−amort·x) · sin(2π·frec·x)
export const vibra = (t, t0, amp, frec, amort) => {
  const x = t - t0;
  return x <= 0 ? 0 : amp * Math.exp(-amort * x) * Math.sin(2 * Math.PI * frec * x);
};

// Muelle 0→1 con rebote que arranca en t0 (solución exacta de un muelle poco amortiguado)
export const muelle = (t, t0, frec = 3, amort = 7) => {
  const x = t - t0;
  if (x <= 0) return 0;
  const w = 2 * Math.PI * frec;
  return 1 - Math.exp(-amort * x) * (Math.cos(w * x) + (amort / w) * Math.sin(w * x));
};

// Pulso 0→1→0 entre a y b (seno): útil para parpadeos y gestos breves
export const pulso = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));

// Azar estable por semilla: nunca Math.random (cada fotograma se renderiza por separado y tiene que salir igual)
export const azar = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ───── Color ─────
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
// mezcla de dos colores #RRGGBB (devuelve otro #RRGGBB, así se puede volver a mezclar)
export const mezcla = (c1, c2, k) => {
  const a = hex(c1), b = hex(c2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(k))).toString(16).padStart(2, '0')).join('');
};
// color con transparencia a partir de #RRGGBB
export const alfa = (c, a) => `rgba(${hex(c).join(',')},${a})`;

// ───── Vectores (grados en sentido horario, como rotate() de SVG) ─────
export const suma = (a, b) => ({x: a.x + b.x, y: a.y + b.y});
export const gira = (p, grados) => {
  const c = Math.cos(grados * RAD), s = Math.sin(grados * RAD);
  return {x: p.x * c - p.y * s, y: p.x * s + p.y * c};
};
export const mezclaP = (a, b, k) => ({x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k)});
export const cosG = (g) => Math.cos(g * RAD);
export const sinG = (g) => Math.sin(g * RAD);

// Cinemática inversa de dos huesos: devuelve la articulación intermedia (rodilla o codo).
// lado +1 dobla hacia un lado de la línea origen→fin y −1 hacia el otro; los valores intermedios aplanan el doblez
// (se lee como un codo que apunta a cámara). Si el objetivo queda más lejos que la extremidad estirada,
// los huesos se alargan lo justo (extremidad de goma) para que nada se despegue; "estira" dice cuánto.
export const dosHuesos = (o, f, l1, l2, lado = 1) => {
  const dx = f.x - o.x, dy = f.y - o.y;
  const dReal = Math.hypot(dx, dy) || 0.001;
  const d = clamp(dReal, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5);
  const ux = dx / dReal, uy = dy / dReal;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const k = dReal / d;
  return {x: o.x + ux * a * k + uy * h * lado, y: o.y + uy * a * k - ux * h * lado, estira: k};
};

// Curva suave que pasa por una lista de puntos (Catmull-Rom convertida a curvas Bézier de SVG)
export const caminoSuave = (pts, cerrado = false) => {
  const n = pts.length;
  if (n < 2) return '';
  const p = (i) => (cerrado ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  const fin = cerrado ? n : n - 1;
  for (let i = 0; i < fin; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const c1 = {x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6};
    const c2 = {x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6};
    d += `C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return cerrado ? d + 'Z' : d;
};
