// El guion del zorro: qué hace cada parte del cuerpo en cada instante.
// Todo son funciones puras del tiempo t (segundos): nada se acumula entre fotogramas, así el motor puede
// renderizar los fotogramas sueltos y en cualquier orden. No hay React aquí: solo números.
//
// Unidades: "unidades de esqueleto". El origen (0,0) es el punto del suelo donde el zorro frena;
// x crece hacia la derecha, y crece hacia abajo (el suelo es y = 0 y la cabeza queda en y negativa).
// La escena coloca ese origen en pantalla y lo escala (ver ESCALA y ORIGEN en Escena.jsx).
import {clamp, lerp, entra, sale, entraSale, seno, claves, vibra, pulso, azar, suma, gira, mezclaP, cosG, sinG, dosHuesos} from './util.mjs';

// ───── Tiempos del guion (segundos) ─────
// Cada tiempo cuelga del anterior: si alargas un tramo, todo lo que viene después se retrasa solo.
export const T = {};
T.frena = 1.84;                   // empieza a frenar
T.para = T.frena + 0.26;          // los pies ya no avanzan
T.cae = T.para + 0.7;             // el libro de arriba se escapa de la pila por detrás
T.atrapa = T.cae + 0.52;          // la cola lo caza al vuelo
T.lanza = T.atrapa + 0.56;        // la cola lo lanza de vuelta
T.aterriza = T.lanza + 0.58;      // el libro cae otra vez sobre la pila
T.agacha = T.aterriza + 0.4;      // empieza a agacharse para dejar la pila
T.suelta = T.agacha + 0.44;       // abre las manos
T.posa = T.suelta + 0.07;         // la pila toca el suelo
T.gira = T.posa + 0.07;           // se incorpora y se gira a cámara (dura medio segundo)
T.cartel = T.gira + 0.36;         // se desenrolla el cartel de la oferta
T.saluda = T.gira + 0.48;         // empieza el saludo
T.presenta = T.saluda + 1.0;      // deja de saludar y se queda presentando

// ───── Medidas del esqueleto ─────
export const M = {
  cadera: 120,                        // altura de la cadera cuando está de pie
  muslo: 66, espinilla: 62, tobillo: 14, // huesos de la pierna y altura del tobillo sobre la suela
  torso: 150,                         // de la cadera al cuello
  cuelloCabeza: 86,                   // del cuello al centro de la cabeza
  brazo: 72, antebrazo: 72,           // huesos del brazo
  colaTramos: 10, colaLargo: 36, colaAncho: 112, // cola: número de tramos, largo de cada uno y grosor máximo
};

// ───── Andar ─────
const PASO = 104;       // distancia entre una pisada y la siguiente (del otro pie)
const APOYO = 0.62;     // parte del ciclo que cada pie pasa en el suelo
const V0 = 190;         // velocidad de crucero (unidades por segundo)
const ALTO_PASO = 42;   // cuánto levanta el pie en el aire
const BOTE = 10;        // cuánto sube y baja la cadera en cada paso
const D_FRENO = T.para - T.frena;
const X_FRENA = (-V0 * D_FRENO) / 2;

// Posición del cuerpo: velocidad constante y frenada suave hasta x = 0.
export const posX = (t) => {
  if (t <= T.frena) return X_FRENA - V0 * (T.frena - t);
  if (t >= T.para) return 0;
  const x = t - T.frena;
  return X_FRENA + V0 * (x - (x * x) / (2 * D_FRENO));
};
// 1 mientras anda, baja a 0 al frenar: apaga los vaivenes del paso cuando se para.
export const marcha = (t) => clamp((T.para - t) / D_FRENO);
// Fase de la zancada medida en DISTANCIA recorrida, no en tiempo: por eso los pies no patinan aunque cambie la velocidad.
// El 20,10 hace que la frenada pille al zorro con el pie lejano recién plantado delante y el cercano a punto de despegar.
const X_REF = -(20 + 0.1) * 2 * PASO;
export const ciclo = (t) => (posX(t) - X_REF) / (2 * PASO);

// Un pie durante la marcha. cc = fase de su zancada; devuelve dónde pisa, cuánto se levanta y el ángulo de la suela.
const pieAndando = (cc, desfase) => {
  const k = Math.floor(cc), f = cc - k;
  const planta = X_REF + 2 * PASO * (k - desfase) + PASO * APOYO;      // donde queda clavado en este apoyo
  if (f < APOYO) {
    const u = f / APOYO;
    // entra de talón (punta arriba), apoya plano y al final despega el talón (punta abajo)
    const ang = u < 0.16 ? lerp(-16, 0, sale(u / 0.16)) : u > 0.7 ? lerp(0, 24, entra((u - 0.7) / 0.3)) : 0;
    return {x: planta, alto: 0, ang};
  }
  const u = (f - APOYO) / (1 - APOYO);
  return {x: planta + 2 * PASO * seno(u), alto: ALTO_PASO * Math.sin(Math.PI * u) ** 0.9, ang: lerp(24, -16, seno(u))};
};

// Un pasito de guion: levanta el pie en t0 y lo planta en x1 tras dur segundos.
const pasito = (t, t0, dur, x0, x1, alto) => {
  const u = clamp((t - t0) / dur);
  return {x: lerp(x0, x1, entraSale(u)), alto: alto * Math.sin(Math.PI * u)};
};

export const X_FINAL = -36;   // dónde queda el cuerpo al final, ya de frente
const MEDIO_PIES = 44;        // separación de cada pie respecto al centro cuando está de frente

// Pie i (0 = cercano a cámara, 1 = lejano) en cualquier instante.
const pieEn = (t, i) => {
  const desfase = i === 0 ? 0.5 : 0;
  if (t < T.para) return pieAndando(ciclo(t) + desfase, desfase);
  const p0 = pieAndando(ciclo(T.para) + desfase, desfase);
  if (i === 1) {
    // Pie lejano: frena delante y aguanta. Levanta la punta al echarse atrás y da un pasito al girarse.
    const p = pasito(t, T.gira + 0.1, 0.2, p0.x, X_FINAL + MEDIO_PIES, 16);
    return {x: p.x, alto: p.alto, ang: -15 * pulso(t, T.cae - 0.2, T.cae + 0.3)};
  }
  // Pie cercano: sale despedido hacia atrás en el frenazo (el zorro se queda a la pata coja), pisa y luego acompaña el giro.
  const xAtras = p0.x + 4;
  const x = claves(t, [[T.para, p0.x], [T.para + 0.16, p0.x - 30, sale], [T.para + 0.46, xAtras]]);
  const alto = claves(t, [[T.para, 0], [T.para + 0.17, 50, sale], [T.para + 0.33, 42], [T.para + 0.46, 0, entra]]);
  const ang = claves(t, [[T.para, p0.ang], [T.para + 0.17, 44], [T.para + 0.34, 30], [T.para + 0.46, 0]]);
  const p = pasito(t, T.gira + 0.28, 0.2, xAtras, X_FINAL - MEDIO_PIES, 14);
  return {x: t < T.gira ? x : p.x, alto: alto + p.alto, ang};
};

// ───── Cuerpo: cadera, inclinación, giro y estiramiento ─────
export const cuerpoEn = (t) => {
  const c = ciclo(t), m = marcha(t);
  const fasePaso = 2 * Math.PI * (2 * c - APOYO);
  const alto = Math.cos(fasePaso) * m;                 // +1 cuando la pierna de apoyo pasa por la vertical (punto alto del paso)
  const balanceo = Math.sin(fasePaso + 0.9) * m;
  const reposo = clamp((t - T.gira - 0.6) / 0.5);      // 1 cuando ya está de frente y tranquilo
  const respira = Math.sin(2 * Math.PI * 0.42 * (t - T.gira)) * reposo;

  // empujones de guion sobre la cadera (x: adelante; y: abajo)
  const dx = claves(t, [
    [T.frena, 0], [T.para + 0.15, 30, sale], [T.cae - 0.02, -16], [T.cae + 0.38, 2], [T.atrapa + 0.2, 4],
    [T.lanza + 0.1, 2], [T.aterriza + 0.3, 0], [T.agacha, 0], [T.suelta, 46, seno], [T.gira, 44], [T.gira + 0.5, X_FINAL, seno],
  ]);
  const dy = claves(t, [
    [T.frena, 0], [T.para + 0.02, 16, sale], [T.para + 0.17, -5, sale], [T.cae - 0.02, 12], [T.cae + 0.36, 0],
    [T.agacha, 0], [T.suelta, 54, seno], [T.posa + 0.06, 56], [T.gira + 0.4, -6, seno], [T.gira + 0.58, 0],
  ])
    + vibra(t, T.atrapa, 7, 2.6, 6)                                   // acusa el peso del libro en la cola
    + 9 * pulso(t, T.lanza - 0.3, T.lanza - 0.02) - 3 * pulso(t, T.lanza - 0.02, T.lanza + 0.26) // se encoge y se estira al lanzar
    + vibra(t, T.aterriza, 12, 2.4, 5.5)                               // acusa el libro al caer en la pila
    + 6 * pulso(t, T.aterriza + 0.12, T.agacha + 0.05);                // suspiro: se le caen los hombros

  const inclina = claves(t, [
    [T.frena, -5], [T.frena + 0.12, -11, sale], [T.para + 0.15, 23, sale], [T.cae - 0.02, -12, seno], [T.cae + 0.36, 1, seno],
    [T.atrapa + 0.15, 4], [T.lanza - 0.1, 5], [T.lanza + 0.12, -4], [T.aterriza + 0.05, 0], [T.agacha, -2],
    [T.suelta, 42, seno], [T.posa + 0.04, 42], [T.gira + 0.46, -3, seno], [T.gira + 0.62, 0],
  ]) + 2.4 * balanceo + vibra(t, T.aterriza, 3, 2.4, 5.5);

  const estira = claves(t, [
    [T.frena, 1], [T.para, 0.93, sale], [T.para + 0.16, 1.05, sale], [T.cae, 0.97], [T.cae + 0.3, 1],
    [T.agacha, 1], [T.suelta, 0.95], [T.gira + 0.4, 1.05, seno], [T.gira + 0.6, 1],
  ]) - vibra(t, T.aterriza, 0.04, 2.4, 5.5) + 0.012 * respira;

  return {
    x: posX(t) + dx,
    y: -M.cadera - BOTE * alto + dy - 1.5 * respira,
    inclina,                                                // grados; positivo = hacia delante
    estira,                                                 // 1 = normal; <1 aplastado, >1 estirado
    giro: 1 - seno(clamp((t - T.gira - 0.08) / 0.4)),      // 1 = de perfil andando a la derecha; 0 = de frente
    balanceo, reposo,
  };
};

// punto del torso (coordenadas locales de la cadera) llevado al mundo
const delTorso = (cu, p) => suma({x: cu.x, y: cu.y}, gira({x: p.x, y: p.y * cu.estira}, cu.inclina));
const cuelloDe = (cu) => delTorso(cu, {x: 0, y: -M.torso});

// ───── Cola: cadena de tramos; cada tramo repite el gesto de la base con retraso (por eso llega tarde) ─────
// Cada pose es [dirección de la base, giro en cada articulación...] en grados. 180 = hacia atrás, 270 = hacia arriba.
const POSES_COLA = {
  andar:   [198, 8, 10, 12, 12, 8, 2, -6, -12, -14],     // detrás y hacia arriba, en S
  frenazo: [208, 10, 12, 12, 10, 6, 3, 1, -2, -4],       // sale despedida hacia arriba, tiesa del susto
  atras:   [174, 2, 4, 6, 8, 10, 10, 8, 6, 4],           // baja para hacer de contrapeso
  atrapar: [152, 8, 12, 12, 8, -2, -6, -2, 18, 40],      // se tiende hacia atrás como una hamaca y riza la punta
  carga:   [144, 10, 14, 14, 8, -2, -8, -6, 10, 30],     // se hunde antes de lanzar
  latigo:  [208, 6, 6, 4, 2, 0, -4, -8, -10, -10],       // latigazo hacia arriba
  reposo:  [192, 6, 9, 12, 13, 11, 6, -2, -10, -14],
  final:   [138, 2, 6, 16, 14, 8, 6, 10, 22, 30],        // de frente: descansa en el suelo hacia un lado y riza la punta
};
// Pista de poses: en t empieza a ir hacia la pose "a" durante dur segundos.
const PISTA_COLA = [
  {t: T.frena + 0.04, a: 'frenazo', dur: 0.34, curva: sale},
  {t: T.para + 0.26, a: 'atras', dur: 0.48, curva: seno},
  {t: T.cae + 0.06, a: 'atrapar', dur: 0.34, curva: sale},
  {t: T.lanza - 0.36, a: 'carga', dur: 0.22, curva: seno},
  {t: T.lanza - 0.12, a: 'latigo', dur: 0.24, curva: seno},      // suelta el libro a mitad del latigazo, cuando más corre
  {t: T.lanza + 0.2, a: 'reposo', dur: 0.55, curva: seno},
  {t: T.gira, a: 'final', dur: 0.56, curva: seno},
];
const RETRASO_COLA = 0.016;     // segundos que tarda cada tramo en enterarse de la nueva pose (la punta llega la última)
const RETRASO_ONDA = 0.045;     // retraso de la onda del paso por tramo

const giroColaEn = (t, i) => {
  let v = POSES_COLA.andar[i];
  for (const k of PISTA_COLA) {
    if (t <= k.t) break;
    v = lerp(v, POSES_COLA[k.a][i], k.curva(clamp((t - k.t) / k.dur)));
  }
  return v;
};

// grosor de la cola a lo largo de su longitud (s de 0 a 1): fina en la base, gorda a dos tercios y punta redonda
export const grosorCola = (s) =>
  M.colaAncho * (s <= 0.62 ? 0.36 + 0.64 * Math.sin((Math.PI / 2) * (s / 0.62)) ** 1.3 : Math.cos((Math.PI / 2) * ((s - 0.62) / 0.38)) ** 0.75);

export const colaEn = (t) => {
  const cu = cuerpoEn(t);
  const base = delTorso(cu, {x: lerp(-26, -56, cu.giro), y: lerp(-20, -34, cu.giro)});
  const n = M.colaTramos;
  const pts = [base], angs = [];
  let ang = 0;
  for (let i = 0; i < n; i++) {
    ang += giroColaEn(t - i * RETRASO_COLA, i);
    const ti = t - i * RETRASO_ONDA, k = i / (n - 1);
    const onda = 13 * Math.sin(2 * Math.PI * 2 * ciclo(ti) + 2.2) * marcha(ti) * (0.3 + 0.7 * k)   // vaivén del paso, viaja hacia la punta
      + 3.5 * Math.sin(2 * Math.PI * 0.45 * (t - i * 0.09)) * k                                    // vida: se mece siempre un poco
      + 11 * cu.reposo * Math.sin(2 * Math.PI * 0.9 * (t - i * 0.07)) * k * k                       // en reposo, menea la punta
      - vibra(t - i * 0.012, T.atrapa, 5.5, 2.6, 5.5) * (0.4 + 0.6 * k)                            // se hunde con el peso del libro
      + vibra(t - i * 0.02, T.lanza + 0.1, 7, 2.2, 4.5) * k                                        // coletazo tras el lanzamiento
      + (cu.inclina + 5) * 0.25;                                                                   // acompaña la inclinación del cuerpo
    const a = ang + onda;
    angs.push(a);
    const p = pts[i];
    pts.push({x: p.x + M.colaLargo * cosG(a), y: p.y + M.colaLargo * sinG(a)});
  }
  // del susto se le eriza (engorda) y luego se le pasa
  const erizo = claves(t, [[T.frena + 0.04, 1], [T.frena + 0.16, 1.2, sale], [T.cae + 0.1, 1.14], [T.atrapa + 0.25, 1, seno]]);
  return {pts, angs, erizo};
};

// "Bandeja" de la cola: el punto de la punta donde descansa el libro mientras lo sujeta.
const NUDO_BANDEJA = 7;
const bandejaEn = (t, altoLibro) => {
  const {pts, erizo} = colaEn(t);
  const antes = pts[NUDO_BANDEJA - 1], despues = pts[NUDO_BANDEJA + 1];
  const a = (Math.atan2(despues.y - antes.y, despues.x - antes.x) * 180) / Math.PI;
  const medio = mezclaP(antes, despues, 0.5);
  const sep = (grosorCola(NUDO_BANDEJA / M.colaTramos) * erizo) / 2 + altoLibro / 2 - 6;   // se hunde un poco en el pelo
  return {x: medio.x - sinG(a) * sep, y: medio.y + cosG(a) * sep, ang: ((a + 360) % 360) - 180};   // ángulo del libro: 0 = tumbado
};

// ───── Pila de libros ─────
const PORTE = {x: 168, y: -106};      // dónde lleva la base de la pila, respecto a la cadera
export const X_PILA = 246;            // dónde queda la pila en el suelo
const ALTO_SUELTA = 40;               // desde qué altura la deja caer
const RETRASO_PILA = 0.22;            // segundos que tarda en enterarse el libro de arriba (se reparte entre todos)
const FLEX_PASO = 15;                 // grados que se cimbrea la pila entera al andar
const BALLESTA = 30;                  // grados que se dobla la pila entera en el frenazo

// Variedad fija de los libros (tamaño, descuadre y estilo), decidida por semilla.
export const prepararLibros = (n) => {
  n = clamp(Math.round(n), 3, 10);
  return Array.from({length: n}, (_, i) => {
    const cima = i === n - 1, base = i === 0;
    return {
      ancho: cima ? 176 : base ? 204 : 162 + azar(i * 3 + 1) * 38,
      alto: cima ? 42 : 36 + azar(i * 3 + 2) * 13,
      desvio: cima || base ? 0 : (azar(i * 3 + 3) - 0.5) * 20,     // descuadre lateral fijo
      estilo: cima ? 0 : Math.floor(azar(i * 7 + 5) * 3),          // 0 lomo con tejuelo, 1 lomo con franjas, 2 canto de páginas
      espejo: azar(i * 5 + 9) > 0.5,
      cima,
    };
  });
};

// cuánto se dobla la pila entera (grados): cimbreo del paso + latigazo del frenazo + temblores de los golpes
const flexEn = (t) =>
  FLEX_PASO * Math.sin(2 * Math.PI * 2 * ciclo(t) + 0.9) * marcha(t)
  + claves(t, [[T.frena, 0], [T.para + 0.14, BALLESTA, sale], [T.cae - 0.2, -26, seno], [T.cae + 0.24, 8, seno], [T.cae + 0.58, -3, seno], [T.cae + 0.9, 0, seno]])
  + vibra(t, T.aterriza, 5, 3, 5)
  + vibra(t, T.posa, 4.5, 3.4, 6);

// base de la pila: en las manos, bajando al suelo o ya posada
const basePilaEn = (t) => {
  if (t >= T.posa) return {x: X_PILA, y: 0, ang: 0};
  const cu = cuerpoEn(t), tarde = cuerpoEn(t - 0.06);
  const p = gira(PORTE, cu.inclina * 0.5);
  const empuje = 14 * pulso(t, T.para + 0.02, T.para + 0.5) - 12 * pulso(t, T.cae - 0.25, T.cae + 0.4);   // alarga y recoge los brazos
  // el peso llega tarde: en vertical sigue a la cadera de hace un instante
  const porte = {x: cu.x + p.x + empuje, y: lerp(cu.y, tarde.y, 0.7) + p.y + vibra(t, T.aterriza, 16, 2.4, 6)};
  const k = claves(t, [[T.agacha + 0.05, 0], [T.suelta, 1, seno]]);
  const baja = mezclaP(porte, {x: X_PILA, y: -ALTO_SUELTA}, k);
  const u = clamp((t - T.suelta) / (T.posa - T.suelta));                     // caída libre del último tramo
  return {x: baja.x, y: t > T.suelta ? -ALTO_SUELTA * (1 - u * u) : baja.y, ang: cu.inclina * 0.4 * (1 - k)};
};

// aplastamiento de cada libro en los golpes (1 = normal)
const aplastaEn = (t, i, n) =>
  1 - vibra(t - i * 0.016, T.posa - 0.03, 0.26, 3.4, 6.5)             // al posar en el suelo: de abajo arriba
    - vibra(t - (n - 1 - i) * 0.012, T.aterriza - 0.03, 0.1, 3.6, 8);   // al caer el libro encima: de arriba abajo

// cuánto resbala el libro de arriba sobre el de debajo (en anchos de libro; + hacia delante)
const resbalaEn = (t) =>
  t >= T.aterriza ? 0 : claves(t, [[T.para - 0.05, 0], [T.para + 0.26, 0.36, sale], [T.cae - 0.22, 0.1], [T.cae, -0.42, (x) => x ** 1.5]]);

export const pilaEn = (t, libros) => {
  const n = libros.length;
  const b = basePilaEn(t);
  let x = b.x, y = b.y, ang = b.ang;
  const out = [];
  for (let i = 0; i < n; i++) {
    const ti = t - (i * RETRASO_PILA) / n;
    ang += (flexEn(ti) / n) * (0.6 + (0.8 * i) / (n - 1));              // cada libro se retrasa respecto al de debajo: de ahí la S
    const esc = aplastaEn(t, i, n);
    const l = libros[i];
    // descuadre: el fijo de cada libro más un vaivén al andar (la pila va suelta)
    const lado = l.cima ? resbalaEn(t) * l.ancho : l.desvio + 7 * Math.sin(2 * Math.PI * 2 * ciclo(ti) + i * 1.9) * marcha(ti) * (i / n);
    out.push({x: x + lado * cosG(ang), y: y + lado * sinG(ang), ang, escY: esc, escX: 1 + (1 - esc) * 0.35});
    x += l.alto * esc * sinG(ang);
    y -= l.alto * esc * cosG(ang);
  }
  return {libros: out, base: b, cima: {x, y}};
};

// ───── El libro viajero: resbala, vuela a la cola, la cola lo devuelve y vuelve a la pila ─────
const GRAVEDAD = 2800;
// tiro parabólico entre dos poses conocidas: u de 0 a 1, dur en segundos, vueltas = giros completos por el camino
// frenoX > 1 hace que salga rápido en horizontal y vaya perdiendo empuje (así empalma con la velocidad que traía)
const vuelo = (a, b, u, dur, vueltas, frenoX = 1) => {
  const x = u * dur;
  const vy = (b.y - a.y) / dur - 0.5 * GRAVEDAD * dur;
  const ux = 1 - (1 - u) ** frenoX;
  return {x: lerp(a.x, b.x, ux), y: a.y + vy * x + 0.5 * GRAVEDAD * x * x, ang: lerp(a.ang, b.ang + 360 * vueltas, seno(u) * 0.3 + ux * 0.7)};
};
// centro del libro de arriba cuando está sobre la pila
const cimaEn = (t, libros) => {
  const l = libros[libros.length - 1];
  const p = pilaEn(t, libros).libros[libros.length - 1];
  const h = (l.alto * p.escY) / 2;
  return {x: p.x + h * sinG(p.ang), y: p.y - h * cosG(p.ang), ang: p.ang, escY: p.escY, escX: p.escX};
};
export const viajeroEn = (t, libros) => {
  const l = libros[libros.length - 1];
  if (t < T.cae || t >= T.aterriza) return {...cimaEn(t, libros), donde: 'pila'};
  if (t < T.atrapa) {
    return {...vuelo(cimaEn(T.cae, libros), bandejaEn(T.atrapa, l.alto), (t - T.cae) / (T.atrapa - T.cae), T.atrapa - T.cae, -1, 1.5), escX: 1, escY: 1, donde: 'aire'};
  }
  if (t < T.lanza) {
    const golpe = vibra(t, T.atrapa - 0.03, 0.16, 3.4, 9);
    return {...bandejaEn(t, l.alto), escX: 1 + golpe * 0.4, escY: 1 - golpe, donde: 'cola'};
  }
  const u = (t - T.lanza) / (T.aterriza - T.lanza);
  return {...vuelo(bandejaEn(T.lanza, l.alto), cimaEn(T.aterriza, libros), u, T.aterriza - T.lanza, 1), escX: 1, escY: 1, donde: 'aire'};
};

// ───── Cara ─────
const PARPADEOS = [[0.92, 0.16], [T.atrapa - 0.02, 0.24], [T.aterriza - 0.02, 0.2], [T.gira + 0.24, 0.18]];
const parpadeoEn = (t) => PARPADEOS.reduce((v, [t0, dur]) => {
  const u = (t - t0) / dur;
  return u <= 0 || u >= 1 ? v : Math.min(v, Math.abs(Math.cos(Math.PI * u)) ** 1.3);
}, 1);

// suspiro de alivio tras salvar el libro: 0 nada, 1 de lleno (ojos cerrados, hombros caídos)
const suspiroEn = (t) => claves(t, [[T.aterriza + 0.12, 0], [T.aterriza + 0.26, 1, sale], [T.agacha - 0.08, 1], [T.agacha + 0.1, 0]]);

const caraEn = (t) => {
  const suspiro = suspiroEn(t);
  const alegre = claves(t, [[T.gira + 0.12, 0], [T.gira + 0.4, 1, sale]]);
  return {
    // ojos como platos: del frenazo a que el libro vuelve a su sitio
    platos: claves(t, [
      [T.frena + 0.02, 0], [T.frena + 0.12, 1, sale], [T.atrapa, 1], [T.atrapa + 0.22, 0.25], [T.lanza - 0.1, 0.3],
      [T.lanza + 0.1, 0.8, sale], [T.aterriza, 0.7], [T.aterriza + 0.2, 0],
    ]),
    abre: parpadeoEn(t) * lerp(1, 0.1, suspiro),                    // 1 abierto, 0 cerrado
    feliz: 0.26 * alegre,                                           // párpado de abajo que sube al sonreír
    cejaAlto: claves(t, [
      [T.frena, 5], [T.frena + 0.1, 14, sale], [T.atrapa, 13], [T.atrapa + 0.2, 8], [T.lanza - 0.24, 0], [T.lanza + 0.08, 11, sale],
      [T.aterriza + 0.1, 10], [T.aterriza + 0.3, 12], [T.agacha, 4], [T.gira + 0.3, 9],
    ]),
    cejaAng: claves(t, [                                            // + preocupado (la parte de dentro sube), − decidido
      [T.frena, 9], [T.frena + 0.1, 17, sale], [T.atrapa, 15], [T.atrapa + 0.2, 6], [T.lanza - 0.24, -15], [T.lanza + 0.08, 4, sale],
      [T.aterriza + 0.2, 10], [T.agacha, 4], [T.gira + 0.3, 0],
    ]),
    boca: {
      ancho: claves(t, [
        [T.frena, 11], [T.frena + 0.1, 12, sale], [T.para + 0.3, 19], [T.atrapa, 18], [T.atrapa + 0.14, 13], [T.lanza - 0.2, 12],
        [T.lanza + 0.08, 9], [T.aterriza, 9], [T.aterriza + 0.14, 8], [T.agacha - 0.05, 8], [T.agacha + 0.15, 12], [T.gira + 0.1, 12], [T.gira + 0.4, 24, sale],
      ]),
      curva: claves(t, [                                            // + sonrisa, − mueca
        [T.frena, -0.2], [T.frena + 0.1, -0.4], [T.para + 0.3, -0.9], [T.atrapa, -0.9], [T.atrapa + 0.18, 0.5], [T.lanza - 0.24, -0.4],
        [T.lanza + 0.08, 0], [T.aterriza + 0.14, 0], [T.agacha + 0.15, 0.4], [T.gira + 0.1, 0.3], [T.gira + 0.4, 1, sale],
      ]),
      abierta: claves(t, [                                          // 0 cerrada, 1 abierta del todo
        [T.frena, 0], [T.frena + 0.1, 1, sale], [T.para + 0.3, 0.85], [T.atrapa, 0.85], [T.atrapa + 0.12, 0], [T.lanza - 0.02, 0],
        [T.lanza + 0.1, 0.75, sale], [T.aterriza, 0.7], [T.aterriza + 0.1, 0.1], [T.aterriza + 0.24, 0.62], [T.agacha - 0.08, 0.5],
        [T.agacha + 0.12, 0], [T.gira + 0.12, 0], [T.gira + 0.42, 0.8, sale],
      ]),
      lengua: claves(t, [[T.frena - 0.02, 1], [T.frena + 0.06, 0]]), // lengua fuera de concentración mientras anda
    },
    guino: claves(t, [[T.presenta + 0.2, 0], [T.presenta + 0.29, 1, sale], [T.presenta + 0.52, 1], [T.presenta + 0.66, 0, seno]]),   // guiño final a cámara
    suspiro, alegre,
  };
};

// ───── Pose completa en el instante t ─────
export const calcular = (t, libros) => {
  const cu = cuerpoEn(t);
  const g = cu.giro;
  const cadera = {x: cu.x, y: cu.y};
  const cuello = cuelloDe(cu);

  // pila, libro viajero y cola
  const pila = pilaEn(t, libros);
  const viajero = viajeroEn(t, libros);
  const cola = colaEn(t);

  // piernas: la cadera viaja con el cuerpo y el pie se queda clavado donde pisa
  const gPie = 1 - seno(clamp((t - T.gira - 0.14) / 0.36));
  const piernas = [0, 1].map((i) => {
    const pie = pieEn(t, i);
    const lado = i === 0 ? -1 : 1;                                   // de frente, el cercano queda a la izquierda de la imagen
    const cad = delTorso(cu, {x: lerp(lado * 36, -lado * 7, g), y: 0});
    // la suela gira sobre la punta (talón arriba) o sobre el talón (punta arriba)
    const pivote = {x: pie.x + (pie.ang > 0 ? 40 : -18) * gPie, y: -pie.alto};
    const tobillo = suma(pivote, gira({x: (pie.ang > 0 ? -40 : 18) * gPie, y: -M.tobillo}, pie.ang));
    const rodilla = dosHuesos(cad, tobillo, M.muslo, M.espinilla, lerp(0.3 * lado, 1, g));   // de perfil la rodilla va hacia delante; de frente, un poco hacia fuera
    return {cadera: cad, rodilla, tobillo, pie: {x: pie.x, alto: pie.alto, ang: pie.ang, pivote, giro: gPie}, estira: rodilla.estira};
  });

  // cabeza: sigue al cuerpo con retraso y compensa su balanceo
  const tarde = cuerpoEn(t - 0.07);
  const agacha = pulso(t, T.cae + 0.02, T.cae + 0.44);              // agacha la cabeza cuando el libro le pasa por encima
  const rot = cu.inclina * 0.32 - 1.6 * cu.balanceo
    + claves(t, [[T.cae - 0.1, 0], [T.cae + 0.3, -7], [T.atrapa + 0.3, -5], [T.lanza + 0.2, -8], [T.aterriza, 3], [T.aterriza + 0.3, 5], [T.agacha, 2], [T.gira, 4], [T.gira + 0.4, 3.5]])
    + 1.2 * Math.sin(2 * Math.PI * 0.42 * (t - T.gira) - 0.8) * cu.reposo;
  const centro = suma(cuello, gira({x: lerp(0, -3, g), y: -M.cuelloCabeza}, cu.inclina * 0.5 + rot * 0.4));
  centro.y += (tarde.y - cu.y) * 0.55 + 16 * agacha + 5 * suspiroEn(t);
  const cara = caraEn(t);

  // hacia dónde gira la cabeza (giro: −1 izquierda … +1 derecha) y cabeceo (− arriba, + abajo)
  const giroCabeza = claves(t, [
    [T.cae - 0.14, 0.55],                                                               // andando: mira hacia la pila
    [T.cae + 0.26, -0.55], [T.atrapa + 0.2, -0.55],                                     // sigue al libro hacia atrás
    [T.atrapa + 0.32, 0.4, seno], [T.lanza - 0.2, 0.4],                                 // vistazo a la pila: calcula el tiro
    [T.lanza - 0.08, -0.5, seno], [T.lanza + 0.04, -0.5],                               // vuelve al libro
    [T.aterriza - 0.06, 0.55, entraSale], [T.aterriza + 0.1, 0.5],                      // lo acompaña hasta la pila
    [T.aterriza + 0.32, -0.3, seno], [T.agacha - 0.04, -0.3],                           // se aparta para suspirar
    [T.agacha + 0.2, 0.5, seno], [T.suelta, 0.7], [T.gira + 0.02, 0.6],                 // mira dónde deja la pila
    [T.gira + 0.38, 0, seno], [T.cartel + 0.1, 0],                                      // a cámara
    [T.cartel + 0.32, 0.12], [T.cartel + 0.75, 0.12], [T.cartel + 1.0, 0],              // vistazo al cartel y de vuelta
  ]);
  const cabeceo = claves(t, [
    [T.frena, -0.45], [T.para + 0.2, -0.2], [T.cae, -0.6], [T.cae + 0.24, -0.75],
    [T.atrapa, 0.3], [T.atrapa + 0.2, 0.3], [T.atrapa + 0.32, -0.6, seno], [T.lanza - 0.2, -0.6],
    [T.lanza - 0.08, 0.2, seno], [T.lanza, 0.1], [T.lanza + 0.3, -0.85], [T.aterriza, -0.6],
    [T.aterriza + 0.3, 0.2], [T.agacha, 0.1], [T.suelta, 0.75], [T.gira + 0.02, 0.6],
    [T.gira + 0.38, 0, seno], [T.cartel + 0.1, 0], [T.cartel + 0.32, -0.5], [T.cartel + 0.75, -0.5], [T.cartel + 1.0, 0],
  ]);

  // mirada: las pupilas siguen al libro viajero; al final miran a cámara (con un vistazo al cartel)
  const aBase = claves(t, [[T.aterriza + 0.3, 0], [T.agacha + 0.12, 1]]);
  const aCima = claves(t, [[T.atrapa + 0.2, 0], [T.atrapa + 0.3, 1, seno], [T.lanza - 0.2, 1], [T.lanza - 0.1, 0, seno]]);   // vistazo a la cima de la pila
  const objetivo = mezclaP(mezclaP(viajero, pila.cima, aCima), {x: pila.base.x - 30, y: pila.base.y - 60}, aBase);
  const dxm = objetivo.x - centro.x, dym = objetivo.y - (centro.y - 20);
  const dm = Math.hypot(dxm, dym) || 1;
  const aCamara = claves(t, [[T.gira + 0.02, 0], [T.gira + 0.3, 1]]);
  const aCartel = claves(t, [[T.cartel + 0.08, 0], [T.cartel + 0.3, 1, sale], [T.cartel + 0.78, 1], [T.cartel + 1.0, 0]]);
  const fuerza = Math.min(1, dm / 150) * 0.92;
  let mirada = gira({x: (dxm / dm) * fuerza, y: (dym / dm) * fuerza}, -rot);
  mirada = mezclaP(mirada, {x: 0, y: 0.04}, aCamara);
  mirada = mezclaP(mirada, {x: 0.3, y: -0.8}, aCartel);

  // orejas: rebotan con el paso, se van hacia delante en el frenazo, se agachan cuando pasa el libro
  const tO = t - 0.09;
  const rebote = 9 * Math.sin(2 * Math.PI * 2 * ciclo(tO) - APOYO * 2 * Math.PI + 2.4) * marcha(tO);
  const latigazo = vibra(t, T.frena + 0.1, 24, 2.3, 4.2) + vibra(t, T.aterriza, 9, 3, 6) + vibra(t, T.posa, 8, 3, 6);
  const gacha = 38 * agacha + 16 * cara.suspiro;
  const tic = vibra(t, T.presenta + 0.74, 13, 6.5, 9);
  const orejas = [rebote + latigazo - gacha + tic, rebote * 0.8 + latigazo + gacha];   // [izquierda, derecha] en grados

  // brazos: llevan la pila; después uno saluda y el otro se apoya en la cintura
  const hombros = [
    delTorso(cu, {x: lerp(-56, 18, g), y: -(M.torso - 12)}),
    delTorso(cu, {x: lerp(56, 42, g), y: -(M.torso - 10)}),
  ];
  const b = pila.base;
  const agarre = [suma(b, gira({x: -42, y: -8}, b.ang)), suma(b, gira({x: -2, y: -2}, b.ang))];
  const libre = claves(t, [[T.suelta - 0.02, 0], [T.suelta + 0.3, 1, sale]]);            // 0 agarra la pila, 1 brazos libres
  const aSaludo = claves(t, [[T.saluda - 0.2, 0], [T.saluda + 0.14, 1, seno]]);
  const saludando = claves(t, [[T.saluda + 0.02, 0], [T.saluda + 0.2, 1], [T.presenta - 0.25, 1], [T.presenta, 0]]);
  const presenta = claves(t, [[T.presenta - 0.2, 0], [T.presenta + 0.2, 1, sale]]);
  const vaiven = Math.sin(2 * Math.PI * 2.1 * (t - T.saluda) - 0.6) * saludando;
  const angMano = lerp(-22, -34, presenta) + 31 * vaiven + 2.5 * Math.sin(2 * Math.PI * 0.42 * (t - T.gira)) * cu.reposo * presenta;
  const codo0 = suma(hombros[0], {x: -70, y: lerp(6, 16, presenta)});
  const manoSaludo = suma(codo0, {x: M.antebrazo * sinG(angMano), y: -M.antebrazo * cosG(angMano)});
  const manoCuelga0 = suma(hombros[0], {x: lerp(-34, 30, g), y: 104});
  const mano0 = mezclaP(mezclaP(agarre[0], manoCuelga0, libre), manoSaludo, aSaludo);
  const aCintura = claves(t, [[T.suelta - 0.02, 0], [T.suelta + 0.4, 1, sale]]);
  const manoCintura = delTorso(cu, {x: lerp(74, 40, g), y: -50});
  const mano1 = mezclaP(agarre[1], manoCintura, aCintura);
  const brazos = [
    {hombro: hombros[0], mano: mano0, lado: lerp(-1, 1, aSaludo)},      // lado: hacia dónde dobla el codo (pasa por 0 = codo a cámara)
    {hombro: hombros[1], mano: mano1, lado: lerp(-1, 1, aCintura)},
  ].map((br) => {
    const codo = dosHuesos(br.hombro, br.mano, M.brazo, M.antebrazo, br.lado);
    return {...br, codo, estira: codo.estira};
  });

  return {
    t, cuerpo: cu, cadera, cuello, piernas, brazos, cola, pila, viajero,
    cabeza: {centro, rot, giro: giroCabeza, cabeceo, mirada, orejas, ...cara},
    libre, aSaludo, saludando, presenta,
  };
};

// ───── Cámara (en píxeles de pantalla): se acerca mientras dura el número y se abre para enseñar el cartel ─────
// z = aumento, cx = qué punto horizontal de la escena queda en el centro, dy = temblor vertical. El suelo (PIE_CAMARA) no se mueve.
export const PIE_CAMARA = 1380;
export const camaraEn = (t) => ({
  z: claves(t, [[0, 1], [T.frena, 1.1, seno], [T.posa, 1.1], [T.gira + 0.62, 1, seno]]),
  // acompaña la acción: a la derecha en el frenazo (la pila se vence hacia allí), a la izquierda cuando la cola caza el libro
  cx: claves(t, [[0, 540], [T.frena, 564, seno], [T.para + 0.28, 642, seno], [T.atrapa, 474, seno], [T.lanza, 484, seno], [T.aterriza, 562, seno], [T.posa, 574, seno], [T.gira + 0.62, 540, seno]]),
  dy: vibra(t, T.posa, 8, 5, 9) + vibra(t, T.para, 3, 6, 10),      // acusa el golpe de la pila en el suelo y el frenazo
});
