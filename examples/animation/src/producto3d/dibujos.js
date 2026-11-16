// Dibujos planos hechos con código (lienzo 2D): cítricos y hojas.
// Se usan dos veces: como ilustración de la etiqueta y como textura de las rodajas y hojas 3D.
import {aclara, conAlfa, generador, mezcla, oscurece} from './util.js';

// Paleta de cada cítrico. «citrico» en datos.js elige una.
export const CITRICOS = {
  limon: {corteza: '#FFD21F', cortezaOscura: '#F0B400', pulpa: '#FFE44D', pulpaClara: '#FFF5A8', pulpaOscura: '#F7C81A', albedo: '#FFFBE6'},
  naranja: {corteza: '#FF8A1F', cortezaOscura: '#EC6A05', pulpa: '#FFA833', pulpaClara: '#FFD08A', pulpaOscura: '#F5841A', albedo: '#FFF3DC'},
  lima: {corteza: '#5DB83F', cortezaOscura: '#3F9A2B', pulpa: '#C6E468', pulpaClara: '#E6F6AC', pulpaOscura: '#A5D046', albedo: '#F8FCE2'},
};

const TAU = Math.PI * 2;

// Contorno de un gajo: cuña entre dos ángulos, metida hacia dentro «margen» píxeles por cada lado
// (así las membranas entre gajos tienen grosor constante, como en una rodaja de verdad).
const trazoGajo = (g, a0, a1, rExt, margen) => {
  const medio = (a0 + a1) / 2;
  const semi = (a1 - a0) / 2;
  const dApice = margen / Math.sin(semi); // distancia del vértice de la cuña al centro
  const delta = Math.asin(Math.min(0.99, margen / rExt)); // lo que se come el margen en el arco exterior
  g.beginPath();
  g.moveTo(Math.cos(medio) * dApice, Math.sin(medio) * dApice);
  g.lineTo(Math.cos(a0 + delta) * rExt, Math.sin(a0 + delta) * rExt);
  g.arc(0, 0, rExt, a0 + delta, a1 - delta);
  g.closePath();
};

// Rodaja plana, de ilustración: corteza, albedo y gajos de un solo tono con un brillo.
export const rodajaPlana = (g, cx, cy, r, pal, {gajos = 9, giro = 0, brillo = true} = {}) => {
  g.save();
  g.translate(cx, cy);
  g.rotate(giro);
  g.fillStyle = pal.corteza;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.fillStyle = pal.albedo;
  g.beginPath();
  g.arc(0, 0, r * 0.875, 0, TAU);
  g.fill();
  const redondeo = r * 0.05;
  for (let i = 0; i < gajos; i++) {
    const a0 = (i / gajos) * TAU, a1 = ((i + 1) / gajos) * TAU;
    trazoGajo(g, a0, a1, r * 0.79 - redondeo / 2, r * 0.034 + redondeo / 2);
    g.fillStyle = pal.pulpa;
    g.strokeStyle = pal.pulpa;
    g.lineWidth = redondeo;
    g.lineJoin = 'round';
    g.fill();
    g.stroke();
    if (brillo) {
      const m = (a0 + a1) / 2;
      g.strokeStyle = pal.pulpaClara;
      g.lineWidth = r * 0.04;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(Math.cos(m) * r * 0.44, Math.sin(m) * r * 0.44);
      g.lineTo(Math.cos(m) * r * 0.62, Math.sin(m) * r * 0.62);
      g.stroke();
    }
  }
  g.restore();
};

// Hoja plana, de ilustración: nace en (x, y) y apunta hacia «angulo».
export const hojaPlana = (g, x, y, largo, angulo, color, colorNervio) => {
  const a = largo * 0.3;
  g.save();
  g.translate(x, y);
  g.rotate(angulo);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(largo * 0.22, -a * 1.3, largo * 0.7, -a * 1.05, largo, 0);
  g.bezierCurveTo(largo * 0.7, a * 1.05, largo * 0.22, a * 1.3, 0, 0);
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = colorNervio;
  g.lineCap = 'round';
  g.lineWidth = largo * 0.03;
  g.beginPath();
  g.moveTo(largo * 0.07, 0);
  g.lineTo(largo * 0.9, 0);
  g.stroke();
  g.lineWidth = largo * 0.022;
  [0.26, 0.44, 0.62].forEach((k, i) => {
    for (const lado of [-1, 1]) {
      g.beginPath();
      g.moveTo(largo * k, 0);
      g.lineTo(largo * (k + 0.13), lado * a * (0.6 - i * 0.12));
      g.stroke();
    }
  });
  g.restore();
};

// ---------------------------------------------------------------------------
// Texturas para las piezas 3D
// ---------------------------------------------------------------------------

// Cara de una rodaja 3D: más rica que la plana (degradados y vesículas de zumo).
// Devuelve un lienzo cuadrado; el círculo inscrito es la rodaja.
export const lienzoRodaja = (pal, semilla = 7, lado = 1024) => {
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = lado;
  const g = c.getContext('2d');
  const r = lado / 2;
  const rnd = generador(semilla);
  g.fillStyle = pal.corteza; // fuera del círculo no se ve, pero evita halos al filtrar
  g.fillRect(0, 0, lado, lado);
  g.translate(r, r);
  // corteza: aro exterior con un borde algo más oscuro
  let grad = g.createRadialGradient(0, 0, r * 0.86, 0, 0, r);
  grad.addColorStop(0, pal.corteza);
  grad.addColorStop(1, pal.cortezaOscura);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  // albedo (la parte blanca)
  grad = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 0.9);
  grad.addColorStop(0, pal.albedo);
  grad.addColorStop(1, mezcla(pal.albedo, pal.corteza, 0.22));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r * 0.9, 0, TAU);
  g.fill();
  // gajos
  const gajos = 10;
  const redondeo = r * 0.05;
  for (let i = 0; i < gajos; i++) {
    const a0 = (i / gajos) * TAU, a1 = ((i + 1) / gajos) * TAU;
    const medio = (a0 + a1) / 2;
    g.save();
    trazoGajo(g, a0, a1, r * 0.815 - redondeo / 2, r * 0.026 + redondeo / 2);
    grad = g.createRadialGradient(0, 0, r * 0.08, 0, 0, r * 0.82);
    grad.addColorStop(0, mezcla(pal.pulpa, pal.pulpaClara, 0.35));
    grad.addColorStop(0.4, pal.pulpa);
    grad.addColorStop(1, pal.pulpaOscura);
    g.fillStyle = grad;
    g.strokeStyle = pal.pulpa;
    g.lineWidth = redondeo;
    g.lineJoin = 'round';
    g.stroke();
    g.fill();
    g.clip();
    // vesículas: trazos cortos casi radiales, claros y oscuros
    g.lineCap = 'round';
    for (let k = 0; k < 90; k++) {
      const a = a0 + (a1 - a0) * rnd();
      const d = r * (0.14 + 0.66 * Math.sqrt(rnd()));
      const largo = r * (0.03 + 0.07 * rnd());
      const desvio = (rnd() - 0.5) * 0.5 + (a - medio) * 0.6;
      g.strokeStyle = rnd() < 0.55 ? conAlfa(pal.pulpaClara, 0.5) : conAlfa(pal.pulpaOscura, 0.45);
      g.lineWidth = r * (0.006 + 0.012 * rnd());
      g.beginPath();
      g.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      g.lineTo(Math.cos(a + desvio * 0.1) * (d + largo), Math.sin(a + desvio * 0.1) * (d + largo));
      g.stroke();
    }
    g.restore();
  }
  // corazón blanco
  g.fillStyle = pal.albedo;
  g.beginPath();
  g.arc(0, 0, r * 0.055, 0, TAU);
  g.fill();
  return c;
};

// Relieve de la rodaja: el mismo dibujo en grises (claro = alto). Con la misma semilla, las vesículas
// caen en el mismo sitio que en la textura de color, y la luz las hace brillar como pulpa mojada.
const RELIEVE = {corteza: '#8a8a8a', cortezaOscura: '#4a4a4a', pulpa: '#6a6a6a', pulpaClara: '#e6e6e6', pulpaOscura: '#2e2e2e', albedo: '#a6a6a6'};
export const lienzoRelieveRodaja = (semilla = 7, lado = 1024) => lienzoRodaja(RELIEVE, semilla, lado);

// Textura de una hoja 3D: el contorno lo pone la geometría, aquí van el verde y los nervios.
// u (ancho del lienzo) cruza la hoja; v (alto) va del pecíolo (abajo) a la punta (arriba).
export const lienzoHoja = (color, w = 256, h = 512) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, oscurece(color, 0.18));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, aclara(color, 0.12));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // sombreado suave hacia los bordes
  const lat = g.createLinearGradient(0, 0, w, 0);
  lat.addColorStop(0, conAlfa(oscurece(color, 0.35), 0.35));
  lat.addColorStop(0.5, conAlfa(color, 0));
  lat.addColorStop(1, conAlfa(oscurece(color, 0.35), 0.35));
  g.fillStyle = lat;
  g.fillRect(0, 0, w, h);
  // nervios
  const nervio = aclara(color, 0.42);
  g.strokeStyle = nervio;
  g.lineCap = 'round';
  g.lineWidth = w * 0.035;
  g.beginPath();
  g.moveTo(w / 2, h);
  g.lineTo(w / 2, h * 0.04);
  g.stroke();
  g.lineWidth = w * 0.02;
  for (let i = 0; i < 7; i++) {
    const y = h * (0.9 - i * 0.115);
    for (const lado of [-1, 1]) {
      g.beginPath();
      g.moveTo(w / 2, y);
      g.quadraticCurveTo(w / 2 + lado * w * 0.25, y - h * 0.05, w / 2 + lado * w * 0.48, y - h * 0.13);
      g.stroke();
    }
  }
  return c;
};
