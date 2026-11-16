// LUZ: el «revelado» de cada fotograma.
// En vez de pintar puntos de color sobre el lienzo, aquí se SUMA luz en una memoria de números decimales
// (como el sensor de una cámara): donde se juntan muchas partículas la luz pasa de 1 y, al revelar, se quema
// hacia el blanco; alrededor queda un halo de color. Pasos de cada fotograma:
//   1. posiciones de cada partícula en varios instantes (el actual y los anteriores: la estela)
//   2. cada partícula deja su punto de luz y, si corre, su trazo
//   3. halo: copias reducidas y desenfocadas de la imagen, más unos rayos que salen del centro, sumados encima
//   4. revelado: curva de exposición, viñeta, grano y paso a 8 bits
// Todo se recalcula desde cero en cada fotograma: no queda nada acumulado del anterior.
import {FPS, H, W, clamp, crearAzar, hexALineal} from './util.js';
import {camara, destello, FOCAL, posiciones, T_ESTALLA, T_TEXTO} from './mundo.js';

// ───────────── ENCUADRE ─────────────
export const CX = W / 2;       // centro de la escena en pantalla…
export const CY = 840;         // …a la altura del centro de la zona segura de Instagram (300–1380)

// ───────────── ESTELAS ─────────────
const MUESTRAS = 9;            // instantes por partícula: el actual y 8 anteriores
const ESTELA_S = 0.085;        // segundos que abarca la estela
const ESTELA_LUZ = 0.38;       // brillo del trazo junto a la partícula (se apaga hacia la cola)

// ───────────── PUNTOS DE LUZ ─────────────
const RADIO = 3.1;             // radio de un punto enfocado, en píxeles
const PICO = 0.78;             // luz en el centro de un punto (1 ≈ blanco quemado al solaparse dos)
const FOCO_MARGEN = 150;       // hasta esta distancia del plano de las letras todo sale nítido
const FOCO_K = 0.0115;         // px de desenfoque por cada px de distancia de más
const RADIO_NITIDO = 3.4;      // por encima de este radio el punto se considera desenfocado y pierde brillo…
const BOKEH_EXP = 1.7;         // …con esta fuerza (2 = física real; menos = bolas de desenfoque más visibles)
const VEDA_ALTO = 72;          // media altura de la franja del texto pequeño en la que el polvo se apaga (px)
const VEDA_ANCHO = 500;        // media anchura de esa franja (px)

// ───────────── HALO Y REVELADO ─────────────
const HALO_CORTO = 0.65;       // halo pegado a las letras
const HALO_ANCHO = 0.5;        // neblina amplia de color
const HALO_RAYOS = 0.2;        // rayos de luz que salen del centro de la escena
const RAYOS_LARGO = 0.22;      // largo de los rayos, como parte de la distancia al centro
const RAYOS_PASOS = 18;        // muestras por rayo
const RAYOS_FLASH = 5;         // cuánto se refuerzan los rayos durante el destello de un estallido
const EXPOSICION = 1.0;        // brillo general
const DERRAME = 0.055;         // cuánto se contagian los canales entre sí: hace que lo muy brillante vire a blanco
const GAMMA = 2.2;             // paso de luz lineal a niveles de pantalla
const CONTRASTE = 0.3;         // 0 = curva neutra; más = negros más hondos
const VINETA = 0.42;           // oscurecimiento de las esquinas
const GRANO = 1.4;             // grano de película, en niveles de 8 bits (también evita el bandeado de los halos)
const FLASH = 0.55;            // resplandor del centro en cada estallido
const RAYA = 0.5;              // raya horizontal de luz que cruza el centro en el instante del estallido (destello de lente)
const ONDA = 0.17;             // brillo del aro de luz (onda expansiva) que sale de cada estallido

const W4 = W / 4, H4 = H / 4;                     // halo corto: a 1/4 de resolución
const W16 = Math.ceil(W4 / 4), H16 = H4 / 4;      // halo ancho: a 1/16
const LUT_K = 1024, LUT_N = 4096;                 // tabla de la curva de revelado (indexada por la raíz de la luz)

// Memoria de trabajo: se crea una vez por pestaña y se reutiliza (se limpia al empezar cada fotograma).
export const crearRevelador = (m, colores) => {
  const N = m.N;
  const f32 = (n) => new Float32Array(n);
  const R = {
    acc: f32(W * H * 3),                                        // la luz sumada, RGB lineal
    P: f32(N * 3), L: f32(N), T: f32(N), G: f32(N),
    SX: Array.from({length: MUESTRAS}, () => f32(N)), SY: Array.from({length: MUESTRAS}, () => f32(N)),
    SS: f32(N), SZ: f32(N),
    a4: f32(W4 * H4 * 3), b4: f32(W4 * H4 * 3), r4: f32(W4 * H4 * 3), a16: f32(W16 * H16 * 3), b16: f32(W16 * H16 * 3),
    fondo4: f32(W4 * H4 * 3), fila: f32(W4 * 3),
    ix0: new Int32Array(W), ix1: new Int32Array(W), iwx: f32(W), vx: f32(W), vy: f32(H),
    lut: f32(LUT_N), grano: f32(65536),
    imagen: new ImageData(W, H),
    cam: {},
  };
  // Colores de los destellos: los tonos de neón aclarados (el central para el resplandor, los extremos para el aro).
  const tonos = [].concat(colores.neon);
  const claro = (hex) => hexALineal(hex).map((c) => 0.5 + 0.5 * c);
  R.flash = claro(tonos[Math.floor(tonos.length / 2)]);
  R.aroIzq = claro(tonos[0]);
  R.aroDer = claro(tonos[tonos.length - 1]);
  // Fondo: casi negro, con un resplandor muy leve detrás de la escena.
  const fondo = hexALineal(colores.fondo), hondo = hexALineal(colores.profundo);
  for (let y = 0; y < H4; y++) {
    for (let x = 0; x < W4; x++) {
      const dx = (x + 0.5) * 4 - CX, dy = (y + 0.5) * 4 - CY;
      const g = Math.exp(-(dx * dx + dy * dy * 0.55) / (2 * 520 * 520));
      for (let c = 0; c < 3; c++) R.fondo4[(y * W4 + x) * 3 + c] = fondo[c] * (0.5 + 1.25 * g) + hondo[c] * 0.02 * g;
    }
  }
  // Tablas para ampliar el halo de 1/4 a tamaño completo con interpolación.
  for (let x = 0; x < W; x++) {
    const fx = (x + 0.5) / 4 - 0.5, x0 = Math.floor(fx);
    R.ix0[x] = clamp(x0, 0, W4 - 1) * 3;
    R.ix1[x] = clamp(x0 + 1, 0, W4 - 1) * 3;
    R.iwx[x] = fx - x0;
    R.vx[x] = Math.pow((x - CX) / (W * 0.72), 2);
  }
  for (let y = 0; y < H; y++) R.vy[y] = Math.pow((y - H / 2) / (H * 0.72), 2);
  // Curva de revelado: luz lineal → nivel de pantalla (0..255).
  for (let i = 0; i < LUT_N; i++) {
    const x = Math.pow(i / LUT_K, 2);
    let v = Math.pow(1 - Math.exp(-x), 1 / GAMMA);
    v += (v * v * (3 - 2 * v) - v) * CONTRASTE;
    R.lut[i] = v * 255;
  }
  // Grano: una baldosa de ruido fijo que se desplaza en cada fotograma.
  const azar = crearAzar(90210);
  for (let i = 0; i < 65536; i++) R.grano[i] = (azar() + azar() - 1) * GRANO;
  for (let i = 3; i < R.imagen.data.length; i += 4) R.imagen.data[i] = 255;
  return R;
};

// Suma un punto de luz redondo y suave en (X, Y) de radio R. `plano` > 1 lo convierte en disco de borde blando
// (las bolas del desenfoque). El centro vale (r, g, b).
const mancha = (acc, X, Y, R, r, g, b, plano) => {
  const x0 = Math.max(0, Math.ceil(X - R)), x1 = Math.min(W - 1, Math.floor(X + R));
  const y0 = Math.max(0, Math.ceil(Y - R)), y1 = Math.min(H - 1, Math.floor(Y + R));
  const inv = 1 / (R * R);
  for (let y = y0; y <= y1; y++) {
    const dy = y - Y, dy2 = dy * dy;
    let p = (y * W + x0) * 3;
    for (let x = x0; x <= x1; x++, p += 3) {
      const dx = x - X;
      let q = (1 - (dx * dx + dy2) * inv) * plano;
      if (q <= 0) continue;
      if (q > 1) q = 1;
      q *= q;
      acc[p] += r * q;
      acc[p + 1] += g * q;
      acc[p + 2] += b * q;
    }
  }
};

// Mundo → pantalla: giro de cámara, perspectiva y encuadre. Si se pasan S y Z, guarda la escala y la profundidad.
const proyectar = (P, cam, X, Y, S, Z, N) => {
  for (let i = 0; i < N; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const x1 = x * cam.cg + z * cam.sg, z1 = -x * cam.sg + z * cam.cg;
    const y2 = y * cam.cc - z1 * cam.sc, z2 = y * cam.sc + z1 * cam.cc;
    const lejos = FOCAL - z2;
    if (lejos < 90) {          // detrás de la cámara o pegada a ella: no se dibuja
      X[i] = NaN;
      continue;
    }
    const s = (FOCAL / lejos) * cam.zoom;
    X[i] = CX + cam.dx + x1 * s;
    Y[i] = CY + cam.dy + y2 * s;
    if (S) {
      S[i] = s;
      Z[i] = z2;
    }
  }
};

// Desenfoque de caja en horizontal o vertical (tres pasadas seguidas equivalen a un desenfoque gaussiano).
const caja = (org, dst, w, h, r, vertical) => {
  const largo = vertical ? h : w, otros = vertical ? w : h;
  const paso = (vertical ? w : 1) * 3, salto = (vertical ? 1 : w) * 3;
  const inv = 1 / (2 * r + 1);
  for (let o = 0; o < otros; o++) {
    for (let c = 0; c < 3; c++) {
      const base = o * salto + c;
      let suma = 0;
      for (let k = -r; k <= r; k++) suma += org[base + clamp(k, 0, largo - 1) * paso];
      for (let i = 0; i < largo; i++) {
        dst[base + i * paso] = suma * inv;
        suma += org[base + Math.min(largo - 1, i + r + 1) * paso] - org[base + Math.max(0, i - r) * paso];
      }
    }
  }
};
const desenfocar = (a, b, w, h, r) => {
  for (let k = 0; k < 3; k++) {
    caja(a, b, w, h, r, false);
    caja(b, a, w, h, r, true);
  }
};

// Reduce una imagen a la cuarta parte de ancho y de alto (media de bloques de 4 × 4).
const reducir = (org, w, h, dst, wd, hd) => {
  for (let y = 0; y < hd; y++) {
    for (let x = 0; x < wd; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 4; j++) {
        const yy = Math.min(h - 1, y * 4 + j);
        for (let i = 0; i < 4; i++) {
          const p = (yy * w + Math.min(w - 1, x * 4 + i)) * 3;
          r += org[p]; g += org[p + 1]; b += org[p + 2];
        }
      }
      const q = (y * wd + x) * 3;
      dst[q] = r / 16; dst[q + 1] = g / 16; dst[q + 2] = b / 16;
    }
  }
};

// Rayos: cada punto recoge la luz que hay en el camino entre él y el centro de la escena. El resultado son haces
// que salen de las letras hacia fuera, como luz atravesando niebla.
const rayos = (org, dst, w, h, cxr, cyr) => {
  let total = 0;
  for (let k = 0; k < RAYOS_PASOS; k++) total += 1 - k / RAYOS_PASOS;
  const inv = 1 / total;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = ((cxr - x) * RAYOS_LARGO) / RAYOS_PASOS, dy = ((cyr - y) * RAYOS_LARGO) / RAYOS_PASOS;
      let r = 0, g = 0, b = 0, sx = x + 0.5, sy = y + 0.5;
      for (let k = 0; k < RAYOS_PASOS; k++) {
        const peso = 1 - k / RAYOS_PASOS;
        const p = ((sy | 0) * w + (sx | 0)) * 3;
        r += org[p] * peso; g += org[p + 1] * peso; b += org[p + 2] * peso;
        sx += dx; sy += dy;
      }
      const q = (y * w + x) * 3;
      dst[q] = r * inv; dst[q + 1] = g * inv; dst[q + 2] = b * inv;
    }
  }
};

// Pinta el fotograma entero en el lienzo.
export const pintar = (ctx, m, R, fotograma) => {
  const t = fotograma / FPS;
  const {acc, SX, SY, SS, SZ, L, T, G, cam} = R;
  const N = m.N;
  acc.fill(0);

  // 1. Dónde está cada partícula ahora y en los instantes anteriores (para la estela).
  for (let j = 0; j < MUESTRAS; j++) {
    const tj = t - (j * ESTELA_S) / (MUESTRAS - 1);
    if (j === 0) posiciones(m, tj, R.P, L, T, G);
    else posiciones(m, tj, R.P);
    proyectar(R.P, camara(tj, cam), SX[j], SY[j], j === 0 ? SS : null, j === 0 ? SZ : null, N);
  }

  // 2. Cada partícula deja su punto de luz y su trazo.
  const [hr, hg, hb] = m.profundo;
  const tramos = new Float32Array(MUESTRAS - 1);
  // Franja del texto pequeño: cuando ya está en pantalla, el polvo que pasa por detrás se apaga para no ensuciar la
  // lectura (una mota junto a un punto o una coma parece otro signo).
  const yPie = CY + m.F[2].yPie;
  const veda = m.conTexto ? clamp((t - T_TEXTO) / 0.4) : 0;
  for (let i = 0; i < N; i++) {
    const x = SX[0][i], y = SY[0][i];
    if (x !== x) continue;                                    // NaN: fuera de cámara
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    // tamaño: perspectiva + desenfoque por distancia al plano de las letras
    const radio = RADIO * m.radio[i] * G[i] * SS[i] + Math.max(0, Math.abs(SZ[i]) - FOCO_MARGEN) * FOCO_K;
    const plano = 1 + Math.max(0, radio - 4) * 0.5;
    let pico = PICO * m.luz[i] * L[i];
    if (radio > RADIO_NITIDO) pico *= Math.pow(RADIO_NITIDO / radio, BOKEH_EXP);
    if (veda > 0 && i >= m.nTexto) pico *= 1 - veda * clamp((VEDA_ALTO - Math.abs(y - yPie)) / 30) * clamp((VEDA_ANCHO - Math.abs(x - CX)) / 40);
    // color: el suyo, virado al tono profundo si está al fondo de una letra o a blanco si es del borde
    const ti = T[i], p3 = i * 3;
    let r = m.color[p3], g = m.color[p3 + 1], b = m.color[p3 + 2];
    if (ti >= 0) {
      r += (hr - r) * ti; g += (hg - g) * ti; b += (hb - b) * ti;
    } else {
      r -= (1 - r) * ti; g -= (1 - g) * ti; b -= (1 - b) * ti;
    }
    r *= pico; g *= pico; b *= pico;
    mancha(acc, x, y, radio, r, g, b, plano);
    // estela: une las posiciones anteriores con un trazo que se apaga hacia la cola
    let largo = 0;
    for (let j = 1; j < MUESTRAS; j++) {
      const d = Math.hypot(SX[j][i] - SX[j - 1][i], SY[j][i] - SY[j - 1][i]);
      tramos[j - 1] = d;
      largo += d;
    }
    if (!(largo > 1.5) || largo > 900) continue;              // quieta (es un punto) o dato no válido
    const rt = clamp(radio * 0.6, 1.6, 7);
    for (let j = 1; j < MUESTRAS; j++) {
      const d = tramos[j - 1];
      const n = Math.min(70, Math.ceil(d / (rt * 0.55)));
      if (n < 1) continue;
      const k0 = (ESTELA_LUZ * d) / (n * rt * 1.067);         // reparte la luz para que el trazo brille igual sea cual sea el paso
      const ax = SX[j - 1][i], ay = SY[j - 1][i], bx = SX[j][i] - ax, by = SY[j][i] - ay;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const edad = (j - 1 + f) / (MUESTRAS - 1);
        const w = k0 * Math.pow(1 - edad, 1.5);
        mancha(acc, ax + bx * f, ay + by * f, rt, r * w, g * w, b * w, 1);
      }
    }
  }

  // 3. Halo: imagen reducida y desenfocada a dos escalas, más los rayos.
  const {a4, b4, r4, a16, b16, fondo4} = R;
  reducir(acc, W, H, a4, W4, H4);
  reducir(a4, W4, H4, a16, W16, H16);
  rayos(a4, r4, W4, H4, CX / 4, CY / 4);
  const fl = destello(t);                                   // 0 salvo en los estallidos
  const fr = HALO_RAYOS * (1 + RAYOS_FLASH * fl);             // en el estallido los rayos se disparan
  for (let k = 0; k < a4.length; k++) a4[k] = a4[k] * HALO_CORTO + r4[k] * fr;
  desenfocar(a4, b4, W4, H4, 2);
  desenfocar(a16, b16, W16, H16, 3);
  // resplandor del estallido: una mancha amplia de luz en el centro
  if (fl > 0.002) {
    for (let y = 0; y < H16; y++) {
      for (let x = 0; x < W16; x++) {
        const dx = (x + 0.5) * 16 - CX, dy = (y + 0.5) * 16 - CY;
        const v = FLASH * fl * Math.exp(-(dx * dx + dy * dy) / (2 * 300 * 300));
        const q = (y * W16 + x) * 3;
        a16[q] += R.flash[0] * v; a16[q + 1] += R.flash[1] * v; a16[q + 2] += R.flash[2] * v;
      }
    }
  }
  // destello de lente: una raya horizontal muy fina que cruza el centro y dura lo que el destello
  if (fl > 0.01) {
    for (let y = 0; y < H4; y++) {
      const dy = (y + 0.5) * 4 - CY, fino = Math.exp(-(dy * dy) / (2 * 9 * 9));
      if (fino < 0.01) continue;
      for (let x = 0; x < W4; x++) {
        const v = RAYA * fl * fino * Math.exp(-Math.abs((x + 0.5) * 4 - CX) / 150);
        const q = (y * W4 + x) * 3;
        a4[q] += R.flash[0] * v; a4[q + 1] += R.flash[1] * v; a4[q + 2] += R.flash[2] * v;
      }
    }
  }
  // onda expansiva: un aro fino de luz que sale del centro en cada estallido y se apaga enseguida;
  // lleva el mismo degradado que las palabras (primer tono a la izquierda, último a la derecha)
  const {aroIzq, aroDer} = R;
  for (const tb of T_ESTALLA) {
    const d = t - tb;
    if (d <= 0 || d > 0.8) continue;
    const radio = 50 + 1350 * (1 - Math.exp(-3.2 * d)), ancho = 14 + 130 * d, fuerza = ONDA * Math.exp(-d * 6.5);
    for (let y = 0; y < H4; y++) {
      for (let x = 0; x < W4; x++) {
        const dx = (x + 0.5) * 4 - CX, lejos = Math.hypot(dx, (y + 0.5) * 4 - CY);
        const e = (lejos - radio) / ancho;
        if (e > 3 || e < -3) continue;
        const v = fuerza * Math.exp(-e * e), k = 0.5 + (0.5 * dx) / (lejos + 1);
        const q = (y * W4 + x) * 3;
        a4[q] += (aroIzq[0] + (aroDer[0] - aroIzq[0]) * k) * v;
        a4[q + 1] += (aroIzq[1] + (aroDer[1] - aroIzq[1]) * k) * v;
        a4[q + 2] += (aroIzq[2] + (aroDer[2] - aroIzq[2]) * k) * v;
      }
    }
  }
  // se juntan los halos y el fondo en la imagen de 1/4
  for (let y = 0; y < H4; y++) {
    const fy = (y + 0.5) / 4 - 0.5, y0 = Math.floor(fy), wy = fy - y0;
    const ra = clamp(y0, 0, H16 - 1) * W16 * 3, rb = clamp(y0 + 1, 0, H16 - 1) * W16 * 3;
    for (let x = 0; x < W4; x++) {
      const fx = (x + 0.5) / 4 - 0.5, x0 = Math.floor(fx), wx = fx - x0;
      const i0 = clamp(x0, 0, W16 - 1) * 3, i1 = clamp(x0 + 1, 0, W16 - 1) * 3;
      const q = (y * W4 + x) * 3;
      for (let c = 0; c < 3; c++) {
        const arriba = a16[ra + i0 + c] + (a16[ra + i1 + c] - a16[ra + i0 + c]) * wx;
        const abajo = a16[rb + i0 + c] + (a16[rb + i1 + c] - a16[rb + i0 + c]) * wx;
        a4[q + c] += (arriba + (abajo - arriba) * wy) * HALO_ANCHO + fondo4[q + c];
      }
    }
  }

  // 4. Revelado a 8 bits: luz + halo → derrame a blanco → viñeta → curva → grano.
  const {fila, ix0, ix1, iwx, vx, vy, lut, grano} = R;
  const salida = R.imagen.data;
  const expo = EXPOSICION * (1 + 0.35 * fl);
  const gx = (fotograma * 89) & 255, gy = (fotograma * 151) & 255;   // el grano cambia de sitio en cada fotograma
  const tope = LUT_N - 1;
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / 4 - 0.5, y0 = Math.floor(fy), wy = fy - y0;
    const ra = clamp(y0, 0, H4 - 1) * W4 * 3, rb = clamp(y0 + 1, 0, H4 - 1) * W4 * 3;
    for (let k = 0; k < W4 * 3; k++) fila[k] = a4[ra + k] + (a4[rb + k] - a4[ra + k]) * wy;
    const vfila = vy[y], gfila = ((y + gy) & 255) << 8;
    let p = y * W * 3, q = y * W * 4;
    for (let x = 0; x < W; x++, p += 3, q += 4) {
      const i0 = ix0[x], i1 = ix1[x], wx = iwx[x];
      const r = acc[p] + fila[i0] + (fila[i1] - fila[i0]) * wx;
      const g = acc[p + 1] + fila[i0 + 1] + (fila[i1 + 1] - fila[i0 + 1]) * wx;
      const b = acc[p + 2] + fila[i0 + 2] + (fila[i1 + 2] - fila[i0 + 2]) * wx;
      const v = expo * (1 - VINETA * Math.min(1, vx[x] + vfila));
      const d = (r + g + b) * DERRAME;
      let ir = (Math.sqrt((r + d) * v) * LUT_K) | 0, ig = (Math.sqrt((g + d) * v) * LUT_K) | 0, ib = (Math.sqrt((b + d) * v) * LUT_K) | 0;
      if (ir > tope) ir = tope;
      if (ig > tope) ig = tope;
      if (ib > tope) ib = tope;
      const n = grano[gfila | ((x + gx) & 255)];
      salida[q] = lut[ir] + n;
      salida[q + 1] = lut[ig] + n;
      salida[q + 2] = lut[ib] + n;
    }
  }
  ctx.putImageData(R.imagen, 0, 0);
};
