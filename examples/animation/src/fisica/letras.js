// El rótulo: coloca las letras y saca de cada una su silueta EXACTA para que la física choque con lo que se ve.
// Cada carácter se pinta en un lienzo oculto con la tipografía real, se leen sus píxeles y se sigue el borde.
// Funciona con cualquier letra de la fuente (Ñ, tildes, cifras…), sin tablas hechas a mano.
import {ANCHO, ETIQUETA, MARGEN, ROTULO} from './ajustes.js';

let lienzo = null;
const pincel = () => {
  if (!lienzo) lienzo = document.createElement('canvas');
  return lienzo.getContext('2d', {willReadFrequently: true});
};

// Ancho de un texto con una fuente CSS dada (p. ej. '600 58px "Barlow Condensed"')
export const anchoTexto = (texto, css) => {
  const g = pincel();
  g.font = css;
  return g.measureText(texto).width;
};

// ---------- Seguir el borde de una mancha de píxeles ----------
// Recorre las «grietas» entre píxeles dejando la mancha a la derecha; devuelve un polígono cerrado.
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];                      // este, sur, oeste, norte
const seguirBorde = (dentro, sx, sy) => {
  const pts = [];
  // Se empieza en la esquina de arriba a la izquierda del primer píxel, «llegando» hacia el norte:
  // el recorrido termina cuando se vuelve a esa esquina subiendo por el lado izquierdo del mismo píxel.
  let x = sx, y = sy, d = 3, pasos = 0;
  do {
    // píxeles de delante según la dirección: R = el de la derecha (lado de la mancha), L = el de la izquierda
    let R, L;
    if (d === 0) { R = dentro(x, y); L = dentro(x, y - 1); }
    else if (d === 1) { R = dentro(x - 1, y); L = dentro(x, y); }
    else if (d === 2) { R = dentro(x - 1, y - 1); L = dentro(x - 1, y); }
    else { R = dentro(x, y - 1); L = dentro(x - 1, y - 1); }
    const antes = d;
    if (!R) d = (d + 1) % 4;                                          // se acaba la mancha: gira a la derecha
    else if (L) d = (d + 3) % 4;                                      // hay mancha también a la izquierda: gira a la izquierda
    if (d !== antes) pts.push([x, y]);                                // solo se apuntan las esquinas
    x += DIR[d][0];
    y += DIR[d][1];
  } while (!(x === sx && y === sy && d === 3) && ++pasos < 400000);
  return pts;
};

// Simplificación de Douglas-Peucker (quita el escalonado de los píxeles)
const simplificarTramo = (p, a, b, tol, sal) => {
  let lejos = -1, max = tol;
  const [ax, ay] = p[a], [bx, by] = p[b];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  for (let i = a + 1; i < b; i++) {
    const d = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L;
    if (d > max) {
      max = d;
      lejos = i;
    }
  }
  if (lejos >= 0) {
    simplificarTramo(p, a, lejos, tol, sal);
    sal.push(p[lejos]);
    simplificarTramo(p, lejos, b, tol, sal);
  }
};
const simplificar = (p, tol) => {
  if (p.length < 5) return p;
  // se parte el anillo por sus dos puntos más alejados entre sí en x
  let i0 = 0, i1 = 0;
  p.forEach((q, i) => {
    if (q[0] < p[i0][0] || (q[0] === p[i0][0] && q[1] < p[i0][1])) i0 = i;
    if (q[0] > p[i1][0] || (q[0] === p[i1][0] && q[1] > p[i1][1])) i1 = i;
  });
  const giro = p.slice(i0).concat(p.slice(0, i0));
  const medio = (i1 - i0 + p.length) % p.length;
  const anillo = giro.concat([giro[0]]);
  const sal = [anillo[0]];
  simplificarTramo(anillo, 0, medio, tol, sal);
  sal.push(anillo[medio]);
  simplificarTramo(anillo, medio, anillo.length - 1, tol, sal);
  // fuera puntos pegados entre sí
  return sal.filter((q, i) => {
    const r = sal[(i + 1) % sal.length];
    return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.7;
  });
};

// Siluetas de un carácter pintado en (x, base). Devuelve polígonos en coordenadas de pantalla.
const siluetas = (car, fuente, tam, x, base) => {
  const g = pincel();
  g.font = `${tam}px "${fuente}"`;
  const ancho = Math.ceil(g.measureText(car).width + tam * 0.3) + 8;
  const alto = Math.ceil(tam * 1.7);
  const ox = Math.ceil(tam * 0.15) + 4, oy = Math.ceil(tam * 1.3);   // dónde cae el origen del carácter dentro del lienzo
  lienzo.width = ancho;
  lienzo.height = alto;
  g.font = `${tam}px "${fuente}"`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillText(car, ox, oy);
  const datos = g.getImageData(0, 0, ancho, alto).data;
  const visto = new Uint8Array(ancho * alto);
  const dentro = (px, py) => px >= 0 && py >= 0 && px < ancho && py < alto && datos[(py * ancho + px) * 4 + 3] > 127;
  const sal = [];
  for (let py = 0; py < alto; py++) {
    for (let px = 0; px < ancho; px++) {
      if (!dentro(px, py) || visto[py * ancho + px]) continue;
      // mancha nueva: se marca entera (vecindad de 4) y se sigue su borde exterior
      let n = 0;
      const pila = [px, py];
      visto[py * ancho + px] = 1;
      while (pila.length) {
        const qy = pila.pop(), qx = pila.pop();
        n++;
        for (const [dx, dy] of DIR) {
          const rx = qx + dx, ry = qy + dy;
          if (dentro(rx, ry) && !visto[ry * ancho + rx]) {
            visto[ry * ancho + rx] = 1;
            pila.push(rx, ry);
          }
        }
      }
      if (n < 40) continue;                                           // motas sueltas
      const borde = simplificar(seguirBorde(dentro, px, py), 0.8);
      if (borde.length >= 3) sal.push(borde.map(([bx, by]) => [bx - ox + x, by - oy + base]));
    }
  }
  return sal;
};

const cajaDe = (contornos) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  contornos.forEach((c) => c.forEach(([x, y]) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }));
  return {x0, y0, x1, y1};
};

// Coloca una línea de texto letra a letra (con el interletrado de la fuente) y traza cada silueta.
const linea = (texto, fuente, tam, xTinta, base) => {
  const g = pincel();
  g.font = `${tam}px "${fuente}"`;
  const x0 = xTinta + g.measureText(texto).actualBoundingBoxLeft;     // para que la TINTA empiece justo en xTinta
  const letras = [];
  [...texto].forEach((car, i) => {
    if (car === ' ') return;
    g.font = `${tam}px "${fuente}"`;
    const x = Math.round(x0 + g.measureText(texto.slice(0, i + 1)).width - g.measureText(car).width);
    const contornos = siluetas(car, fuente, tam, x, base);
    if (!contornos.length) return;
    const caja = cajaDe(contornos);
    letras.push({car, x, base, tam, contornos, caja, cx: (caja.x0 + caja.x1) / 2, cy: (caja.y0 + caja.y1) / 2});
  });
  return letras;
};

// Compone el rótulo entero. Devuelve las letras (pequeñas y gigantes) y las medidas que usa el resto de la escena.
export const componerRotulo = (datos, fuente) => {
  const g = pincel();
  const nombre = String(datos.nombre || 'TIENDA').trim().toUpperCase();
  const ante = String(datos.antetitulo || '').trim().toUpperCase();
  // tamaño del nombre: que la tinta ocupe todo el ancho útil, con tope de altura para nombres cortos
  g.font = `100px "${fuente}"`;
  const mm = g.measureText(nombre);
  const tinta100 = mm.actualBoundingBoxLeft + mm.actualBoundingBoxRight;
  const cap100 = g.measureText('H').actualBoundingBoxAscent;
  const util = ANCHO - 2 * MARGEN;
  let tam = Math.floor(Math.min((util / tinta100) * 100, (ROTULO.capMax / cap100) * 100));
  const cap = Math.round((cap100 * tam) / 100);
  const alto = ante ? ROTULO.altoNombre : ROTULO.altoNombreSolo;
  const base = alto + cap;
  let grandes = linea(nombre, fuente, tam, MARGEN, base);
  let cajaNombre = cajaDe(grandes.flatMap((l) => l.contornos));
  if (cajaNombre.y0 < alto - 3) {
    // hay tildes o una Ñ que suben por encima de las mayúsculas: se encoge el nombre lo justo para que quepan
    tam = Math.floor((tam * (base - alto)) / (base - cajaNombre.y0));
    grandes = linea(nombre, fuente, tam, MARGEN, base);
    cajaNombre = cajaDe(grandes.flatMap((l) => l.contornos));
  }
  // la palabra pequeña, a su cuerpo normal salvo que no quepa a lo ancho
  g.font = `${ROTULO.tamAnte}px "${fuente}"`;
  const tamAnte = ante ? Math.floor(Math.min(ROTULO.tamAnte, (ROTULO.tamAnte * util) / Math.max(1, g.measureText(ante).width))) : 0;
  const chicas = ante ? linea(ante, fuente, tamAnte, MARGEN, ROTULO.baseAnte) : [];
  const letras = [...grandes, ...chicas];
  // La cuerda de la etiqueta cuelga por el hueco entre dos letras (el más cercano al sitio deseado donde quepa),
  // para no partir ninguna. Si no hay ningún hueco válido, cuelga del sitio deseado.
  const min = MARGEN + ETIQUETA.ancho / 2 + 12, max = ANCHO - MARGEN - ETIQUETA.ancho / 2 - 12;
  let xEtiqueta = Math.min(max, Math.max(min, ETIQUETA.x));
  let mejor = Infinity;
  for (let i = 0; i + 1 < grandes.length; i++) {
    const a = grandes[i].caja.x1, b = grandes[i + 1].caja.x0, hueco = (a + b) / 2;
    if (b - a >= 9 && hueco >= min && hueco <= max && Math.abs(hueco - ETIQUETA.x) < mejor) {
      mejor = Math.abs(hueco - ETIQUETA.x);
      xEtiqueta = Math.round(hueco);
    }
  }
  // Las piezas que se quedan posadas solo caen sobre el nombre gigante, a la derecha de la palabra pequeña
  const xLibre = chicas.length ? Math.max(cajaNombre.x0, cajaDe(chicas.flatMap((l) => l.contornos)).x1 + 10) : cajaNombre.x0;
  return {
    xEtiqueta,
    letras,
    nGrandes: grandes.length,
    tam, cap, base,
    franja: {x0: xLibre, x1: cajaNombre.x1, y: cajaNombre.y0},          // el «estante» de arriba del nombre donde se posa la fruta
    cajaNombre,
  };
};
