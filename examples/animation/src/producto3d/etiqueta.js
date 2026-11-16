// La etiqueta de la lata, dibujada entera con código en un lienzo 2D que luego se usa como textura.
//
// Da la vuelta completa a la lata (los 4096 px de ancho son los 360°), así que todo lo que cruza
// la costura (x = 0) se dibuja dos veces y los motivos continuos (olas) encajan consigo mismos.
//
//   x = 1024 y x = 3072 → las dos caras: logotipo, sabor y fruta (la lata se lee por delante y por detrás)
//   x = 2048            → sello redondo con la frase
//   x = 0 (costura)     → letra pequeña y código de barras
//
// Se dibuja en «píxeles lógicos»: 4096 de ancho y el alto que le toca para que un círculo
// dibujado aquí siga siendo un círculo sobre la lata (el lienzo real es de 4096 x 2048).
import {aclara, conAlfa, generador, lerp, mezcla} from './util.js';
import {CITRICOS, hojaPlana, rodajaPlana} from './dibujos.js';
import {FUENTE_TEXTO, FUENTE_TITULAR} from './fuentes.js';

export const ETQ_ANCHO = 4096;
export const ETQ_ALTO = 2048;
const N_OLAS = 6; // olas que caben en una vuelta (entero, para que la costura no se note)
const TAU = Math.PI * 2;

// zonas: reparto del largo pintado de la lata {hombro, cuerpo, chaflan} (suman 1)
//        y «aspecto» = perímetro / largo pintado. Lo calcula geometria.js a partir del perfil.
export const dibujarEtiqueta = (d, zonas) => {
  const W = ETQ_ANCHO;
  const HL = W / zonas.aspecto; // alto lógico
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = ETQ_ALTO;
  const g = lienzo.getContext('2d');
  g.scale(1, ETQ_ALTO / HL);

  const col = d.colores;
  const pal = CITRICOS[d.citrico] || CITRICOS.limon;
  const yH = HL * zonas.hombro; // aquí acaba el hombro y empieza el cuerpo recto
  const BH = HL * zonas.cuerpo; // alto del cuerpo recto
  const yC = yH + BH; // aquí empieza el chaflán de abajo
  const Y = (k) => yH + BH * k; // posición vertical relativa al cuerpo recto (0 arriba, 1 abajo)
  const rnd = generador(20241);
  const nervio = mezcla(col.hoja, col.tinta, 0.55);

  // ---------- ayudas ----------
  const circulo = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
  };
  const fuente = (peso, tam, familia = FUENTE_TEXTO) => {
    g.font = `${peso} ${tam}px "${familia}"`;
  };
  // texto centrado con espaciado entre letras; encoge si no cabe en anchoMax
  const texto = (txt, x, y, {peso = 800, tam = 60, espaciado = 0, color = col.tinta, anchoMax = 0, familia = FUENTE_TEXTO} = {}) => {
    let t = tam;
    g.letterSpacing = `${espaciado}px`;
    fuente(peso, t, familia);
    if (anchoMax) {
      const w = g.measureText(txt).width;
      if (w > anchoMax) {
        t *= anchoMax / w;
        g.letterSpacing = `${(espaciado * anchoMax) / w}px`;
        fuente(peso, t, familia);
      }
    }
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText(txt, x + espaciado / 2, y);
    g.letterSpacing = '0px';
    return t;
  };
  // estrella de cuatro puntas
  const destello = (x, y, r, color) => {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.3 : r;
      g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  // trazo de brisa: una onda que nace y muere en punta
  const brisa = (x0, x1, y, grosor, amp, ciclos, fase, color) => {
    const n = 64, arriba = [], abajo = [];
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const x = lerp(x0, x1, p);
      const yc = y + amp * Math.sin(p * TAU * ciclos + fase);
      const gr = grosor * Math.pow(Math.sin(Math.PI * p), 0.7) * 0.5;
      arriba.push([x, yc - gr]);
      abajo.push([x, yc + gr]);
    }
    g.beginPath();
    arriba.forEach(([x, yy], i) => g[i ? 'lineTo' : 'moveTo'](x, yy));
    abajo.reverse().forEach(([x, yy]) => g.lineTo(x, yy));
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  // texto que da la vuelta a un círculo, repartido para que cierre exacto
  const textoEnCirculo = (txt, cx, cy, radio, tam, color) => {
    fuente(800, tam);
    g.letterSpacing = '0px';
    const unidad = txt + '  ·  ';
    const perimetro = TAU * radio;
    const anchoUnidad = g.measureText(unidad).width * 1.12;
    const veces = Math.max(1, Math.round(perimetro / anchoUnidad));
    const letras = unidad.repeat(veces).split('');
    const anchos = letras.map((l) => g.measureText(l).width);
    const total = anchos.reduce((a, b) => a + b, 0);
    let ang = -Math.PI / 2 - ((anchos[0] / total) * TAU) / 2;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    letras.forEach((l, i) => {
      const paso = (anchos[i] / total) * TAU;
      const a = ang + paso / 2;
      g.save();
      g.translate(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio);
      g.rotate(a + Math.PI / 2);
      g.fillText(l, 0, 0);
      g.restore();
      ang += paso;
    });
    g.textBaseline = 'alphabetic';
  };

  // ---------- 1. base ----------
  let grad = g.createLinearGradient(0, 0, 0, HL);
  grad.addColorStop(0, aclara(col.lata, 0.1));
  grad.addColorStop(0.45, col.lata);
  grad.addColorStop(1, mezcla(col.lata, col.tinta, 0.08));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, HL);

  // rayos de sol tono sobre tono detrás de cada logotipo
  for (const cx of [W * 0.25, W * 0.75]) {
    g.save();
    g.translate(cx, Y(0.31));
    g.fillStyle = conAlfa(aclara(col.lata, 0.55), 0.3);
    const rayos = 18;
    for (let i = 0; i < rayos; i++) {
      const a = (i / rayos) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 250, Math.sin(a) * 250);
      g.lineTo(Math.cos(a - 0.085) * 780, Math.sin(a - 0.085) * 780);
      g.lineTo(Math.cos(a + 0.085) * 780, Math.sin(a + 0.085) * 780);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // ---------- 2. el mar: franja de acento con ola y fondo de tinta ----------
  const yOla = Y(0.5);
  const ola1 = (x) => 44 * Math.sin((x / W) * TAU * N_OLAS) + 13 * Math.sin((x / W) * TAU * N_OLAS * 2 + 1.1);
  const ola2 = (x) => 38 * Math.sin((x / W) * TAU * N_OLAS + 1.3) + 11 * Math.sin((x / W) * TAU * N_OLAS * 2 + 2.7);
  const rellenoBajoOla = (f, y0, color) => {
    g.beginPath();
    g.moveTo(0, HL + 4);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + f(x));
    g.lineTo(W, HL + 4);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  const lineaOla = (f, y0, color, grosor) => {
    g.beginPath();
    for (let x = -8; x <= W + 8; x += 8) g[x < 0 ? 'moveTo' : 'lineTo'](x, y0 + f(x));
    g.strokeStyle = color;
    g.lineWidth = grosor;
    g.lineJoin = 'round';
    g.stroke();
  };
  rellenoBajoOla(ola1, yOla, col.acento);
  rellenoBajoOla(ola2, yOla + 108, col.tinta);
  lineaOla(ola1, yOla, col.crema, 20); // espuma
  lineaOla(ola2, yOla + 84, conAlfa(col.crema, 0.75), 7);
  // líneas de agua, muy tenues, dentro de la tinta
  lineaOla((x) => 20 * Math.sin((x / W) * TAU * N_OLAS * 2 + 0.6), Y(0.745), conAlfa(col.acento, 0.5), 6);
  lineaOla((x) => 16 * Math.sin((x / W) * TAU * N_OLAS * 2 + 2.9), Y(0.96), conAlfa(col.acento, 0.5), 6);

  // ---------- 3. filetes del cuello y de la base ----------
  g.fillStyle = col.tinta;
  g.fillRect(0, 0, W, 34); // filete oscuro pegado al aluminio
  g.fillRect(0, 58, W, 9);
  g.fillStyle = col.crema;
  g.fillRect(0, yC + (HL - yC) * 0.3, W, 11);

  // ---------- 4. las dos caras ----------
  const rFruta = BH * 0.122;
  const yFruta = Y(0.866);
  const exclusiones = []; // círculos donde no deben caer burbujas
  for (const cx of [W * 0.25, W * 0.75]) {
    // qué es
    const tTipo = d.tipo.toUpperCase();
    texto(tTipo, cx, Y(0.142), {peso: 800, tam: 70, espaciado: 17, color: col.tinta, anchoMax: 900});
    fuente(800, 70);
    g.letterSpacing = '17px';
    const mitad = Math.min(900, g.measureText(tTipo).width) / 2;
    g.letterSpacing = '0px';
    destello(cx - mitad - 62, Y(0.142) - 25, 26, col.tinta);
    destello(cx + mitad + 62, Y(0.142) - 25, 26, col.tinta);

    // logotipo, con sombra de color desplazada
    const yLogo = Y(0.352);
    let tam = 400;
    fuente(400, tam, FUENTE_TITULAR);
    const ancho = g.measureText(d.marca).width;
    const anchoMax = 1130;
    if (ancho > anchoMax) tam *= anchoMax / ancho;
    fuente(400, tam, FUENTE_TITULAR);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = col.acento;
    g.fillText(d.marca, cx + tam * 0.034, yLogo + tam * 0.034);
    g.fillStyle = col.tinta;
    g.fillText(d.marca, cx, yLogo);

    // trazos de brisa bajo el logotipo
    brisa(cx - 560, cx + 300, yLogo + 78, 30, 14, 1.5, 0.5, col.tinta);
    brisa(cx - 230, cx + 560, yLogo + 128, 20, 11, 1.5, 2.2, col.acento);

    // sabor
    texto(d.sabor.toUpperCase(), cx, Y(0.672), {peso: 800, tam: 82, espaciado: 11, color: col.crema, anchoMax: 1180});

    // fruta: hojas detrás (abiertas hacia los lados, sin subir hasta el texto), una rodaja pequeña y la grande delante
    if (d.hojas) {
      hojaPlana(g, cx - rFruta * 0.55, yFruta - rFruta * 0.42, rFruta * 1.6, -2.86, col.hoja, nervio);
      hojaPlana(g, cx + rFruta * 0.4, yFruta - rFruta * 0.5, rFruta * 1.5, -0.36, aclara(col.hoja, 0.14), nervio);
    }
    rodajaPlana(g, cx + rFruta * 1.33, yFruta + rFruta * 0.4, rFruta * 0.54, pal, {gajos: 8, giro: 0.9});
    g.fillStyle = col.tinta;
    circulo(cx, yFruta, rFruta + 16);
    g.fill();
    rodajaPlana(g, cx, yFruta, rFruta, pal, {gajos: 9, giro: 0.25});
    exclusiones.push([cx, yFruta, rFruta * 2.3], [cx - rFruta * 2.7, yFruta + rFruta * 0.5, 250], [cx, Y(0.66), 620, 90]);

    // contenido
    texto(d.contenido, cx - rFruta * 2.75, yFruta + rFruta * 0.72, {peso: 800, tam: 104, espaciado: 2, color: col.crema, anchoMax: 420});
    g.fillStyle = col.acento;
    g.fillRect(cx - rFruta * 2.75 - 150, yFruta + rFruta * 0.72 + 34, 300, 9);
  }

  // ---------- 5. sello redondo (entre las dos caras) ----------
  {
    const cx = W * 0.5, cy = Y(0.262), r = 196;
    g.strokeStyle = col.tinta;
    g.lineWidth = 9;
    circulo(cx, cy, r);
    g.stroke();
    g.fillStyle = col.tinta;
    circulo(cx, cy, r * 0.56);
    g.fill();
    rodajaPlana(g, cx, cy, r * 0.43, pal, {gajos: 8, giro: 0.4});
    textoEnCirculo(d.frase.join(' ').toUpperCase(), cx, cy, r * 0.79, 49, col.tinta);
    destello(cx - r - 70, cy, 22, col.tinta);
    destello(cx + r + 70, cy, 22, col.tinta);
  }

  // ---------- 6. letra pequeña y código de barras (sobre la costura: se dibuja en x=0 y en x=W) ----------
  for (const cx of [0, W]) {
    texto('INGREDIENTES', cx, Y(0.092), {peso: 800, tam: 36, espaciado: 6, color: col.tinta});
    // párrafo partido en líneas de 400 px
    fuente(500, 31);
    g.letterSpacing = '0px';
    const palabras = d.ingredientes.split(' ');
    const lineas = [];
    let linea = '';
    for (const p of palabras) {
      const prueba = linea ? linea + ' ' + p : p;
      if (g.measureText(prueba).width > 400 && linea) {
        lineas.push(linea);
        linea = p;
      } else linea = prueba;
    }
    if (linea) lineas.push(linea);
    g.fillStyle = col.tinta;
    g.textAlign = 'center';
    lineas.slice(0, 6).forEach((l, i) => g.fillText(l, cx, Y(0.092) + 50 + i * 41));
    // código de barras
    const bx = cx - 165, by = Y(0.275), bw = 330, bh = 190;
    g.fillStyle = col.crema;
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 18);
    g.fill();
    const barras = generador(99);
    g.fillStyle = col.tinta;
    let x = bx + 26;
    while (x < bx + bw - 30) {
      const w = [4, 4, 8, 12][Math.floor(barras() * 4)];
      g.fillRect(x, by + 22, w, bh - 70);
      x += w + [4, 6, 8][Math.floor(barras() * 3)];
    }
    texto('8 412345 678905', cx, by + bh - 16, {peso: 700, tam: 27, espaciado: 3, color: col.tinta});
    texto('ENVASE AL CONTENEDOR AMARILLO', cx, by + bh + 58, {peso: 800, tam: 24, espaciado: 3, color: col.tinta});
    texto('SERVIR MUY FRÍO', cx, by + bh + 98, {peso: 800, tam: 24, espaciado: 3, color: col.tinta});
  }

  // ---------- 7. fruta pequeña bajo el sello y bajo la letra pequeña ----------
  for (const cx of [0, W * 0.5, W]) {
    const y = Y(0.83);
    if (d.hojas) {
      hojaPlana(g, cx + 20, y - 40, 250, -1.15, col.hoja, nervio);
      hojaPlana(g, cx - 30, y + 60, 215, 2.3, aclara(col.hoja, 0.14), nervio);
    }
    rodajaPlana(g, cx + 118, y + 92, 88, pal, {gajos: 8, giro: 1.4});
    g.fillStyle = col.tinta;
    circulo(cx - 82, y - 10, 134 + 14);
    g.fill();
    rodajaPlana(g, cx - 82, y - 10, 134, pal, {gajos: 9, giro: 0.7});
    exclusiones.push([cx, y + 20, 330]);
  }

  // ---------- 8. burbujas en el mar ----------
  let puestas = 0;
  for (let i = 0; i < 4000 && puestas < 150; i++) {
    const x = rnd() * W;
    const y = lerp(yOla + 190, yC + 40, rnd());
    const r = 7 + 19 * Math.pow(rnd(), 2);
    const libre = exclusiones.every(([ex, ey, er, alto]) =>
      alto ? Math.abs(x - ex) > er + r || Math.abs(y - ey) > alto + r : Math.hypot(x - ex, y - ey) > er + r,
    );
    if (!libre) continue;
    puestas++;
    if (rnd() < 0.3) {
      g.fillStyle = conAlfa(col.acento, 0.55);
      circulo(x, y, r * 0.6);
      g.fill();
    } else {
      g.strokeStyle = conAlfa(col.crema, 0.3 + 0.3 * rnd());
      g.lineWidth = 5;
      circulo(x, y, r);
      g.stroke();
    }
  }

  return lienzo;
};
