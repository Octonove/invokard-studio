// FORMAS: de un texto a miles de puntos.
// 1. El texto se dibuja en un lienzo oculto, con cada línea ajustada al ancho (bloque justificado de cartel).
// 2. Se leen sus píxeles: los de dentro dan el «relleno» y los del contorno dan las «paredes» (la letra con grosor).
// 3. Los puntos del relleno se eligen con separación mínima entre ellos (disco de Poisson), para que las letras
//    queden densas y parejas, sin los grumos y calvas que deja el azar puro.
// Todas las coordenadas que devuelve este archivo están en «mundo»: píxeles con el origen en el centro de la escena.
import {H, TAU, W} from './util.js';

const CUERPO_REF = 200;      // cuerpo de letra con el que se mide antes de ajustar
const INTERLINEA = 0.16;     // hueco entre líneas, en proporción a la altura media de las líneas
const UMBRAL = 128;          // alfa a partir del cual un píxel cuenta como «dentro de la letra»

// Dibuja las líneas centradas en el lienzo y devuelve su canal alfa.
// caja = {ancho, alto, cuerpoMax, espaciado}: tamaño máximo del bloque, cuerpo máximo y espaciado entre letras (en em).
const componerTexto = (lineas, familia, caja) => {
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const g = lienzo.getContext('2d', {willReadFrequently: true});
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const conEspaciado = 'letterSpacing' in g;
  const medidas = lineas.map((txt) => {
    g.font = `${CUERPO_REF}px "${familia}"`;
    if (conEspaciado) g.letterSpacing = `${caja.espaciado * CUERPO_REF}px`;
    const m = g.measureText(txt);
    const ancho = Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    // Cada línea se estira hasta el ancho de la caja (sin pasar del cuerpo máximo).
    const k = Math.min(caja.ancho / ancho, caja.cuerpoMax / CUERPO_REF);
    return {txt, k, izq: m.actualBoundingBoxLeft, ancho, sube: m.actualBoundingBoxAscent, baja: m.actualBoundingBoxDescent};
  });
  const altos = medidas.map((m) => (m.sube + m.baja) * m.k);
  const hueco = (INTERLINEA * altos.reduce((a, b) => a + b, 0)) / altos.length;
  const total = altos.reduce((a, b) => a + b, 0) + hueco * (altos.length - 1);
  const f = Math.min(1, caja.alto / total);       // si el bloque no cabe de alto, se encoge entero
  let y = H / 2 - (total * f) / 2;
  g.fillStyle = '#fff';
  medidas.forEach((m, i) => {
    const k = m.k * f;
    g.font = `${CUERPO_REF * k}px "${familia}"`;
    if (conEspaciado) g.letterSpacing = `${caja.espaciado * CUERPO_REF * k}px`;
    g.fillText(m.txt, W / 2 - (m.ancho * k) / 2 + m.izq * k, y + m.sube * k);
    y += altos[i] * f + hueco * f;
  });
  const rgba = g.getImageData(0, 0, W, H).data;
  const alfa = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alfa[i] = rgba[i * 4 + 3];
  return alfa;
};

// Baraja una lista de pares (x, y) con el azar con semilla.
const barajarPares = (v, azar) => {
  for (let i = v.length / 2 - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    const ax = v[i * 2], ay = v[i * 2 + 1];
    v[i * 2] = v[j * 2];
    v[i * 2 + 1] = v[j * 2 + 1];
    v[j * 2] = ax;
    v[j * 2 + 1] = ay;
  }
};

// Lanza «dardos»: recorre los candidatos y acepta los que no tengan otro punto aceptado a menos de d píxeles.
// Devuelve cuántos ha aceptado (y los deja en `salida`). Una rejilla hace que comprobar los vecinos sea inmediato.
const dardos = (cand, d, tope, salida) => {
  const celda = d / Math.SQRT2;
  const gw = Math.ceil(W / celda) + 1;
  const gh = Math.ceil(H / celda) + 1;
  const rejilla = new Int32Array(gw * gh).fill(-1);
  const d2 = d * d;
  let n = 0;
  for (let k = 0; k < cand.length && n < tope; k += 2) {
    const x = cand[k], y = cand[k + 1];
    const gx = (x / celda) | 0, gy = (y / celda) | 0;
    let libre = true;
    for (let j = Math.max(0, gy - 2); j <= gy + 2 && j < gh && libre; j++) {
      for (let i = Math.max(0, gx - 2); i <= gx + 2 && i < gw; i++) {
        const q = rejilla[j * gw + i];
        if (q < 0) continue;
        const dx = salida[q * 2] - x, dy = salida[q * 2 + 1] - y;
        if (dx * dx + dy * dy < d2) {
          libre = false;
          break;
        }
      }
    }
    if (libre) {
      rejilla[gy * gw + gx] = n;
      salida[n * 2] = x;
      salida[n * 2 + 1] = y;
      n++;
    }
  }
  return n;
};

// Elige n puntos parejos entre los candidatos: busca por bisección la separación que da justo esa cantidad.
const puntosParejos = (cand, n, azar) => {
  const salida = new Float32Array(n * 2);
  const total = cand.length / 2;
  if (total === 0) return salida;
  let corta = 0.5 * Math.sqrt((0.7 * total) / n);   // separación con la que seguro sobran puntos
  let larga = 1.6 * Math.sqrt((0.7 * total) / n);   // separación con la que seguro faltan
  for (let it = 0; it < 9; it++) {
    const media = (corta + larga) / 2;
    if (dardos(cand, media, n, salida) >= n) corta = media;
    else larga = media;
  }
  let hay = dardos(cand, corta, n, salida);
  // Si el texto es tan pequeño que no caben, se repiten puntos con una pizca de desplazamiento.
  for (; hay < n; hay++) {
    const j = Math.floor(azar() * total);
    salida[hay * 2] = cand[j * 2] + azar() - 0.5;
    salida[hay * 2 + 1] = cand[j * 2 + 1] + azar() - 0.5;
  }
  return salida;
};

// Convierte unas líneas de texto en puntos. Reparte nTotal puntos en tres grupos:
//   contorno → sobre el borde de las letras, a distancia constante: es el «tubo de neón» que las deja nítidas
//   pared    → también sobre el borde, pero hundidos hacia el fondo (z de 0 a -fondo): el grosor de la letra
//   relleno  → el resto, repartidos de forma pareja por la cara de las letras
// reparto = {contorno: parte máxima para el contorno, separa: px entre puntos del contorno, pared: parte para las paredes}
// Devuelve {relleno: [x, y]*, contorno: [x, y]*, pared: [x, y, z, hondura 0..1]*, caja, area}, centrado en (0, caja.cy).
export const puntosDeTexto = (lineas, familia, caja, nTotal, reparto, fondo, azar) => {
  const alfa = componerTexto(lineas, familia, caja);
  const dentro = [];
  const borde = [];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (alfa[p] <= UMBRAL) continue;
      dentro.push(x, y);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (alfa[p - 1] <= UMBRAL || alfa[p + 1] <= UMBRAL || alfa[p - W] <= UMBRAL || alfa[p + W] <= UMBRAL) borde.push(x, y);
    }
  }
  const area = dentro.length / 2;
  // Centro real de la tinta: así el bloque queda centrado al píxel aunque la fuente tenga márgenes raros.
  const dx = -(x0 + x1) / 2;
  const dy = caja.cy - (y0 + y1) / 2;
  const mover = (v, paso) => {
    for (let i = 0; i < v.length; i += paso) {
      v[i] += dx;
      v[i + 1] += dy;
    }
    return v;
  };

  // Contorno: puntos del borde separados `separa` píxeles; si no hay partículas para tanto, se separan más.
  const bordes = Float32Array.from(borde);
  barajarPares(bordes, azar);
  const nBorde = Math.max(1, bordes.length / 2);
  const topeContorno = Math.round(nTotal * reparto.contorno);
  let contorno = new Float32Array(nBorde * 2);
  let nContorno = dardos(bordes, reparto.separa, nBorde, contorno);
  if (nContorno > topeContorno) {
    let corta = reparto.separa, larga = reparto.separa * 8;
    for (let it = 0; it < 9; it++) {
      const media = (corta + larga) / 2;
      if (dardos(bordes, media, topeContorno, contorno) >= topeContorno) corta = media;
      else larga = media;
    }
    nContorno = dardos(bordes, corta, topeContorno, contorno);
  }
  contorno = mover(contorno.slice(0, nContorno * 2), 2);

  // Paredes: puntos del borde, cada uno a una hondura distinta.
  const nPared = Math.round(nTotal * reparto.pared);
  const pared = new Float32Array(nPared * 4);
  for (let i = 0; i < nPared; i++) {
    const j = i % nBorde;
    const hondura = 0.06 + 0.94 * Math.pow(azar(), 1.4);   // más puntos cerca de la cara que al fondo
    pared[i * 4] = bordes[j * 2] + azar() - 0.5;
    pared[i * 4 + 1] = bordes[j * 2 + 1] + azar() - 0.5;
    pared[i * 4 + 2] = -fondo * hondura;
    pared[i * 4 + 3] = hondura;
  }
  mover(pared, 4);

  // Relleno: lo que queda, bien repartido por dentro.
  const nRelleno = nTotal - nContorno - nPared;
  const candidatos = new Float32Array(dentro.length);
  for (let i = 0; i < dentro.length; i++) candidatos[i] = dentro[i] + azar() - 0.5;
  barajarPares(candidatos, azar);
  const relleno = mover(puntosParejos(candidatos, nRelleno, azar), 2);
  return {relleno, contorno, pared, area, caja: {x0: x0 + dx, x1: x1 + dx, y0: y0 + dy, y1: y1 + dy}};
};

// Adorno «latido»: una línea de electrocardiograma (onda P, pico QRS y onda T) centrada en x = 0, con la base en y = 0.
// Devuelve n puntos [x, y, lam] repartidos a distancia constante; lam (0..1) es por dónde va el trazo.
export const puntosDeLatido = (n, ancho, pico, azar) => {
  const m = ancho / 2;
  const traza = [[-m, 0], [-0.39 * m, 0]];
  for (let k = 1; k <= 12; k++) traza.push([(-0.39 + 0.16 * (k / 12)) * m, -0.16 * pico * Math.sin((Math.PI * k) / 12)]);   // onda P
  traza.push([-0.13 * m, 0], [-0.085 * m, 0.14 * pico], [-0.03 * m, -pico], [0.035 * m, 0.36 * pico], [0.08 * m, 0], [0.15 * m, 0]);   // Q, R, S
  for (let k = 1; k <= 14; k++) traza.push([(0.15 + 0.23 * (k / 14)) * m, -0.27 * pico * Math.sin((Math.PI * k) / 14)]);   // onda T
  traza.push([m, 0]);
  const largos = [0];
  for (let i = 1; i < traza.length; i++) largos.push(largos[i - 1] + Math.hypot(traza[i][0] - traza[i - 1][0], traza[i][1] - traza[i - 1][1]));
  const total = largos[largos.length - 1];
  const puntos = new Float32Array(n * 3);
  let tramo = 1;
  let lamPico = 0.5;
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * total;
    while (largos[tramo] < s) tramo++;
    const k = (s - largos[tramo - 1]) / (largos[tramo] - largos[tramo - 1]);
    puntos[i * 3] = traza[tramo - 1][0] + (traza[tramo][0] - traza[tramo - 1][0]) * k + (azar() - 0.5) * 2.4;
    puntos[i * 3 + 1] = traza[tramo - 1][1] + (traza[tramo][1] - traza[tramo - 1][1]) * k + (azar() - 0.5) * 2.4;
    puntos[i * 3 + 2] = s / total;
  }
  // En qué punto del recorrido está la cima del pico R (ahí «late» el nombre).
  for (let i = 1; i < traza.length; i++) if (traza[i][1] === -pico) lamPico = largos[i] / total;
  return {puntos, lamPico};
};

// Adorno «anillo»: n puntos [lam, radio relativo, altura] de una órbita; la posición se calcula después, al girar.
export const puntosDeAnillo = (n, azar) => {
  const puntos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // La densidad no es uniforme: tres «cometas» más poblados que el resto de la órbita.
    let lam = azar();
    lam += 0.045 * Math.sin(TAU * 3 * lam);
    const g = (azar() + azar() + azar() - 1.5) / 1.5;
    puntos[i * 3] = lam;
    puntos[i * 3 + 1] = 1 + g * 0.02;
    puntos[i * 3 + 2] = (azar() + azar() - 1) * 5;
  }
  return puntos;
};
