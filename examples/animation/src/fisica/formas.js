// Geometría de cada fruta: el contorno que se dibuja y la forma que choca salen de los MISMOS puntos,
// así lo que se ve y lo que rebota coinciden. Todo está en «unidades de fruta»: se multiplica por R (px).
// Este archivo no toca el navegador: lo usan la simulación y el dibujo.

// ---------- Herramientas de polígonos ----------
// Curva cerrada y suave (Catmull-Rom) que pasa por los puntos dados; n = puntos por tramo.
export const curvaCerrada = (p, n = 6) => {
  const sal = [];
  const N = p.length;
  for (let i = 0; i < N; i++) {
    const p0 = p[(i - 1 + N) % N], p1 = p[i], p2 = p[(i + 1) % N], p3 = p[(i + 2) % N];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      sal.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return sal;
};

export const area = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
};

export const centroide = (p) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    const k = p[i][0] * q[1] - q[0] * p[i][1];
    a += k;
    cx += (p[i][0] + q[0]) * k;
    cy += (p[i][1] + q[1]) * k;
  }
  return [cx / (3 * a), cy / (3 * a)];
};

// Envolvente convexa (cadena monótona)
export const envolvente = (pts) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baja = [];
  for (const q of p) {
    while (baja.length >= 2 && cruz(baja[baja.length - 2], baja[baja.length - 1], q) <= 0) baja.pop();
    baja.push(q);
  }
  const alta = [];
  for (const q of [...p].reverse()) {
    while (alta.length >= 2 && cruz(alta[alta.length - 2], alta[alta.length - 1], q) <= 0) alta.pop();
    alta.push(q);
  }
  return baja.slice(0, -1).concat(alta.slice(0, -1));
};

// Deja un polígono convexo en `max` vértices como mucho quitando cada vez el que menos área aporta.
// (El motor de física admite 12 vértices por polígono.)
export const reducir = (pts, max = 12) => {
  const p = envolvente(pts);
  while (p.length > max) {
    let mejor = 0, menor = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const tri = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
      if (tri < menor) {
        menor = tri;
        mejor = i;
      }
    }
    p.splice(mejor, 1);
  }
  return p;
};

const mover = (pts, [dx, dy]) => pts.map(([x, y]) => [x - dx, y - dy]);
const camino = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join('L') + 'Z';

// ---------- Contornos ----------
// Limón: superelipse con pezón a la derecha y remate corto a la izquierda.
const contornoLimon = () => {
  const n = 60, pts = [], e = 2 / 2.3;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    let x = 0.9 * Math.sign(c) * Math.pow(Math.abs(c), e);
    const y = 0.7 * Math.sign(s) * Math.pow(Math.abs(s), e);
    const d0 = Math.min(th, Math.PI * 2 - th), d1 = Math.abs(th - Math.PI);
    x += 0.2 * Math.exp(-Math.pow(d0 / 0.27, 2));
    x -= 0.11 * Math.exp(-Math.pow(d1 / 0.3, 2));
    pts.push([x, y]);
  }
  return pts;
};

// Fresa: corazón redondeado, ancho arriba y en punta abajo.
const contornoFresa = () =>
  curvaCerrada(
    [[0, -0.8], [0.4, -0.86], [0.74, -0.62], [0.86, -0.18], [0.68, 0.34], [0.34, 0.8], [0, 1], [-0.34, 0.8], [-0.68, 0.34], [-0.86, -0.18], [-0.74, -0.62], [-0.4, -0.86]],
    5,
  );

// Manzana: casi redonda, con hoyuelo arriba y dos lóbulos abajo. Choca como un círculo.
const contornoManzana = () =>
  curvaCerrada(
    [[0, -0.8], [0.3, -0.96], [0.7, -0.8], [0.98, -0.3], [0.96, 0.25], [0.7, 0.75], [0.34, 0.97], [0, 0.9], [-0.34, 0.97], [-0.7, 0.75], [-0.96, 0.25], [-0.98, -0.3], [-0.7, -0.8], [-0.3, -0.96]],
    5,
  );

// Media luna (tajada de sandía o media rodaja): borde recto arriba, arco abajo.
const contornoMediaLuna = (n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI;
    pts.push([Math.cos(th), Math.sin(th)]);
  }
  return pts;
};

// Plátano: banda curva que se afina hacia las puntas. Devuelve borde de dentro y de fuera.
const ALFA_PLATANO = (50 * Math.PI) / 180;
const grosorPlatano = (k) => 0.2 * (1 - 0.6 * k * k);            // k = -1..1 a lo largo del plátano
const bordesPlatano = (n) => {
  const dentro = [], fuera = [];
  for (let i = 0; i <= n; i++) {
    const k = -1 + (2 * i) / n, fi = k * ALFA_PLATANO, h = grosorPlatano(k);
    dentro.push([(1 - h) * Math.sin(fi), (1 - h) * Math.cos(fi)]);
    fuera.push([(1 + h) * Math.sin(fi), (1 + h) * Math.cos(fi)]);
  }
  return {dentro, fuera};
};

// ---------- Catálogo ----------
// R: tamaño base en px · rebote: cuánto devuelve · color: piel por defecto
// fisica: lista de piezas convexas ({c: radio} o {p: puntos}) · contorno: polígono fino para dibujar · area: en unidades²
const crear = () => {
  const cat = {};

  cat.naranja = {R: 42, rebote: 0.3, color: '#F68A1E', fisica: [{c: 1}], area: Math.PI, sombra: [1, 1]};
  cat.arandano = {R: 14.5, rebote: 0.36, color: '#4553B5', fisica: [{c: 1}], area: Math.PI, sombra: [1, 1]};

  const man = contornoManzana();
  cat.manzana = {R: 40, rebote: 0.3, color: '#DC2F36', fisica: [{c: 0.965}], contorno: man, area: area(man), sombra: [1, 1]};

  const lim = contornoLimon();
  cat.limon = {R: 44, rebote: 0.3, color: '#FFD62B', fisica: [{p: reducir(lim, 12)}], contorno: lim, area: area(lim), sombra: [1.05, 0.72]};

  const fre0 = contornoFresa();
  const fre = mover(fre0, centroide(fre0));
  cat.fresa = {R: 30, rebote: 0.22, color: '#E8283F', fisica: [{p: reducir(fre, 10)}], contorno: fre, area: area(fre), sombra: [0.86, 0.92], desfase: centroide(fre0)};

  // media luna centrada en su centro de masas (a 4/(3π) del borde recto)
  const C_LUNA = 4 / (3 * Math.PI);
  const luna = (R, color, rebote) => {
    const fino = mover(contornoMediaLuna(40), [0, C_LUNA]);
    return {R, rebote, color, fisica: [{p: mover(contornoMediaLuna(10), [0, C_LUNA])}], contorno: fino, area: Math.PI / 2, sombra: [1, 0.55], cLuna: C_LUNA};
  };
  cat.sandia = luna(78, '#F2415A', 0.16);
  cat.rodaja = luna(58, '#F68A1E', 0.2);

  // plátano: cinco trozos convexos pegados
  const TROZOS = 5;
  const b = bordesPlatano(TROZOS);
  const fino = bordesPlatano(28);
  const contPlat0 = fino.fuera.concat([...fino.dentro].reverse());
  const cPlat = centroide(contPlat0);
  const piezas = [];
  for (let i = 0; i < TROZOS; i++) piezas.push({p: mover([b.dentro[i], b.dentro[i + 1], b.fuera[i + 1], b.fuera[i]], cPlat)});
  cat.platano = {
    R: 92, rebote: 0.12, color: '#FFD23A', fisica: piezas, contorno: mover(contPlat0, cPlat), area: area(contPlat0), sombra: [0.9, 0.36],
    centro: cPlat, alfa: ALFA_PLATANO, grosor: grosorPlatano,
  };

  for (const k of Object.keys(cat)) {
    cat[k].nombre = k;
    cat[k].radio = 1;                                       // radio del círculo que envuelve la pieza
    if (cat[k].contorno) {
      cat[k].camino = camino(cat[k].contorno);
      cat[k].radio = Math.max(...cat[k].contorno.map(([x, y]) => Math.hypot(x, y)));
    }
  }
  return cat;
};

export const FORMAS = crear();
export const FRUTAS_VALIDAS = Object.keys(FORMAS);
