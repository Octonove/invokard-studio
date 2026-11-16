// Geometría de las piezas 3D, todas generadas con código: lata (perfil torneado), anilla,
// hoja, reparto de las gotas de condensación y peana.
// Unidades: el radio del cuerpo de la lata es 1 (≈ 33 mm). La base de la lata está en y = 0.
import * as THREE from 'three';
import {generador, lerp} from './util.js';

const TAU = Math.PI * 2;
export const SEGMENTOS = 160; // lados del torno: muchos, para que la silueta no tenga quiebros

// ---------------------------------------------------------------------------
// Perfil de la lata: tres tramos [radio, altura], recorridos de abajo arriba
// (LatheGeometry saca las normales del sentido del recorrido).
// ---------------------------------------------------------------------------
export const ALTO_LATA = 3.48;
const Y_CUERPO_0 = 0.42; // donde acaba el chaflán de abajo y empieza el cuerpo recto
const Y_CUERPO_1 = 3.0; // donde acaba el cuerpo recto y empieza el hombro

const bezier2 = (p0, c, p1, n) =>
  Array.from({length: n + 1}, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  });
const bezier3 = (p0, c1, c2, p1, n) =>
  Array.from({length: n + 1}, (_, i) => {
    const t = i / n, u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k]);
  });

// fondo de aluminio: cúpula hacia dentro y aro de apoyo
const PERFIL_FONDO = [
  [0.001, 0.33], [0.3, 0.31], [0.5, 0.24], [0.62, 0.14], [0.67, 0.05], [0.69, 0.012], [0.715, 0], [0.745, 0.005], [0.775, 0.03], [0.8, 0.075],
];
// parte pintada (la etiqueta): chaflán, cuerpo recto y hombro
const CHAFLAN = bezier2([0.8, 0.075], [0.975, 0.17], [1, Y_CUERPO_0], 16);
const CUERPO = Array.from({length: 9}, (_, i) => [1, lerp(Y_CUERPO_0, Y_CUERPO_1, (i + 1) / 10)]);
const HOMBRO = bezier3([1, Y_CUERPO_1], [1, 3.17], [0.835, 3.22], [0.815, 3.385], 22);
const PERFIL_PINTADO = [...CHAFLAN, ...CUERPO, ...HOMBRO];
// tapa de aluminio: cierre (el reborde), pared interior y panel
const PERFIL_TAPA = [
  [0.815, 3.385], [0.826, 3.4], [0.848, 3.41], [0.86, 3.435], [0.855, 3.465], [0.835, 3.48], [0.812, 3.478], [0.798, 3.462], [0.792, 3.43],
  [0.785, 3.375], [0.775, 3.345], [0.75, 3.335], [0.72, 3.345], [0.7, 3.365], [0.68, 3.372], [0.4, 3.372], [0.001, 3.372],
];
export const Y_PANEL_TAPA = 3.372;

// LatheGeometry deja sin normalizar la última normal del perfil: se normalizan todas.
const normalizar = (geo) => {
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
};
const torno = (perfil) => normalizar(new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), SEGMENTOS));

// Recorrido de la parte pintada: longitud acumulada en cada punto, para mapear la etiqueta
// por longitud de arco (así el dibujo no se estira en el hombro ni en el chaflán).
const RECORRIDO = (() => {
  const s = [0];
  for (let i = 1; i < PERFIL_PINTADO.length; i++) {
    s.push(s[i - 1] + Math.hypot(PERFIL_PINTADO[i][0] - PERFIL_PINTADO[i - 1][0], PERFIL_PINTADO[i][1] - PERFIL_PINTADO[i - 1][1]));
  }
  return s;
})();
const LARGO_PINTADO = RECORRIDO[RECORRIDO.length - 1];
const S_CUERPO_0 = RECORRIDO[CHAFLAN.length - 1];
const S_CUERPO_1 = RECORRIDO[CHAFLAN.length + CUERPO.length]; // primer punto del hombro (y = Y_CUERPO_1)

// Reparto de la etiqueta: qué fracción de su alto cae en el hombro, en el cuerpo y en el chaflán.
export const ZONAS_ETIQUETA = {
  hombro: (LARGO_PINTADO - S_CUERPO_1) / LARGO_PINTADO,
  cuerpo: (S_CUERPO_1 - S_CUERPO_0) / LARGO_PINTADO,
  chaflan: S_CUERPO_0 / LARGO_PINTADO,
  aspecto: TAU / LARGO_PINTADO, // perímetro / largo pintado
};

// Punto de la superficie pintada a una distancia s del borde de abajo: radio, altura y normal del perfil.
export const puntoPintado = (s) => {
  const x = Math.min(Math.max(s, 0), LARGO_PINTADO - 1e-6);
  let i = 1;
  while (RECORRIDO[i] < x) i++;
  const k = (x - RECORRIDO[i - 1]) / (RECORRIDO[i] - RECORRIDO[i - 1]);
  const a = PERFIL_PINTADO[i - 1], b = PERFIL_PINTADO[i];
  const dr = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dr, dy);
  return {r: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), nr: dy / l, ny: -dr / l, tr: dr / l, ty: dy / l};
};
export const S_PINTADO = {largo: LARGO_PINTADO, cuerpo0: S_CUERPO_0, cuerpo1: S_CUERPO_1};

export const crearGeometriasLata = () => {
  const pintado = torno(PERFIL_PINTADO);
  // v de la textura por longitud de arco (0 abajo, 1 arriba)
  const uv = pintado.attributes.uv;
  const nPuntos = PERFIL_PINTADO.length;
  for (let i = 0; i <= SEGMENTOS; i++) {
    for (let j = 0; j < nPuntos; j++) uv.setY(i * nPuntos + j, RECORRIDO[j] / LARGO_PINTADO);
  }
  uv.needsUpdate = true;
  return {pintado, fondo: torno(PERFIL_FONDO), tapa: torno(PERFIL_TAPA)};
};

// ---------------------------------------------------------------------------
// Anilla: chapa con dos agujeros, extruida. Se dibuja tumbada sobre la tapa.
// ---------------------------------------------------------------------------
const estadio = (camino, x0, x1, r, antihorario) => {
  // contorno «pastilla» entre x0 y x1 con extremos redondos de radio r
  camino.moveTo(x0, -r);
  if (antihorario) {
    camino.lineTo(x1, -r);
    camino.absarc(x1, 0, r, -Math.PI / 2, Math.PI / 2, false);
    camino.lineTo(x0, r);
    camino.absarc(x0, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  } else {
    camino.absarc(x0, 0, r, (3 * Math.PI) / 2, Math.PI / 2, true);
    camino.lineTo(x1, r);
    camino.absarc(x1, 0, r, Math.PI / 2, -Math.PI / 2, true);
    camino.lineTo(x0, -r);
  }
};
export const crearGeometriaAnilla = () => {
  const forma = new THREE.Shape();
  estadio(forma, -0.02, 0.4, 0.155, true);
  const dedo = new THREE.Path(); // agujero para el dedo
  estadio(dedo, 0.27, 0.4, 0.085, false);
  forma.holes.push(dedo);
  const geo = new THREE.ExtrudeGeometry(forma, {depth: 0.014, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24});
  geo.rotateX(-Math.PI / 2); // tumbada: el grosor queda en vertical
  return geo;
};
// Contorno de la abertura (la lengüeta troquelada), como aro fino
export const crearGeometriaAbertura = () => {
  const forma = new THREE.Shape();
  forma.absellipse(0, 0, 0.2, 0.26, 0, TAU, false, 0);
  const hueco = new THREE.Path();
  hueco.absellipse(0, 0, 0.186, 0.246, 0, TAU, true, 0);
  forma.holes.push(hueco);
  const geo = new THREE.ShapeGeometry(forma, 48);
  geo.rotateX(-Math.PI / 2);
  return geo;
};

// ---------------------------------------------------------------------------
// Hoja de hierbabuena: malla curvada con borde aserrado. Mide 1 de largo (del pecíolo a la punta).
// ---------------------------------------------------------------------------
export const crearGeometriaHoja = () => {
  const NU = 12, NV = 72;
  const pos = [], uvs = [], idx = [];
  const sierra = (x) => 1 - 2 * Math.abs(((x % 1) + 1) % 1 - 0.5); // diente 0..1..0
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const ancho = 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.68)), 0.8) * (1 + 0.055 * sierra(v * 11)) + 0.004;
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU) * 2 - 1;
      const x = u * ancho;
      const y = v;
      // forma: arqueada a lo largo, un poco acanalada por el nervio, con el borde ondulado y la punta girada
      const arco = 0.11 * Math.sin(v * Math.PI * 0.95);
      const canal = 0.24 * Math.abs(u) * ancho - 0.1 * u * u * ancho;
      const rizo = 0.016 * Math.sin(v * 24) * u * u;
      const giro = (v - 0.4) * 0.2; // la hoja se retuerce un poco hacia la punta
      const z = arco + canal + rizo;
      pos.push(x * Math.cos(giro) - z * Math.sin(giro), y, x * Math.sin(giro) + z * Math.cos(giro));
      uvs.push(u * 0.5 + 0.5, v);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.translate(0, -0.5, -0.06); // centrada, para que gire sobre sí misma
  geo.computeVertexNormals();
  return geo;
};

// ---------------------------------------------------------------------------
// Gotas de condensación: posiciones repartidas con semilla sobre la parte pintada.
// Cada gota: ángulo alrededor de la lata, distancia s a lo largo del perfil, radio y forma.
// Unas pocas «resbalan»: llevan velocidad y dejan un rastro corto.
// ---------------------------------------------------------------------------
// Ángulos (grados) de las gotas que resbalan: en las franjas laterales de la etiqueta y en los
// bordes de cada cara, nunca sobre el logotipo (las caras están centradas en 90° y 270°).
const ANGULOS_RESBALAN = [-17, 15, 33, 147, 165, 197, 213, 327];
// ¿Cae (ang, s) sobre el logotipo o sobre el texto del sabor de alguna de las dos caras?
const sobreTextos = (ang, s) => {
  const a = ((ang % TAU) + TAU) % TAU;
  const aCara = Math.min(Math.abs(a - Math.PI / 2), Math.abs(a - (3 * Math.PI) / 2));
  const v = s / LARGO_PINTADO; // 0 abajo, 1 arriba
  return aCara < 0.9 && ((v > 0.54 && v < 0.74) || (v > 0.32 && v < 0.42));
};

export const repartirGotas = (cuantas, semilla = 4321) => {
  const rnd = generador(semilla);
  const gotas = [];
  const sMin = S_CUERPO_0 * 0.55, sMax = LARGO_PINTADO - 0.1;
  // primero las que resbalan: grandes y en la mitad alta del cuerpo
  for (const grados of ANGULOS_RESBALAN) {
    gotas.push({
      ang: ((grados + 6 * (rnd() - 0.5)) * Math.PI) / 180,
      s: lerp(S_CUERPO_0 + 1.15, S_CUERPO_1 - 0.1, rnd()),
      radio: 0.048 + 0.014 * rnd(),
      alargada: 1.3,
      resbala: {desde: 0.9 + 2.2 * rnd(), velocidad: 0.13 + 0.1 * rnd(), ritmo: 1.6 + rnd(), fase: rnd() * TAU},
    });
  }
  let intentos = 0;
  while (gotas.length < cuantas && intentos < 60000) {
    intentos++;
    const u = rnd();
    // muchas pequeñas, pocas grandes; las grandes, más bien abajo (pesan)
    const radio = 0.011 + 0.047 * Math.pow(u, 2.8);
    const sesgo = radio > 0.035 ? Math.pow(rnd(), 1.6) : rnd();
    const s = lerp(sMin, sMax, sesgo);
    const ang = rnd() * TAU;
    // las gordas no se ponen encima de los textos de la etiqueta
    if (radio > 0.03 && sobreTextos(ang, s)) continue;
    // sin pisarse, y sin ponerse en el carril de una gota que resbala
    let libre = true;
    for (const o of gotas) {
      let da = Math.abs(((ang - o.ang) % TAU + TAU) % TAU);
      if (da > Math.PI) da = TAU - da;
      const ds = s - o.s;
      if (Math.hypot(da, ds) < (radio + o.radio) * 1.25) libre = false;
      if (o.resbala && da < o.radio + radio + 0.01 && ds < 0.02 && ds > -1.7) libre = false;
      if (!libre) break;
    }
    if (!libre) continue;
    gotas.push({ang, s, radio, alargada: radio > 0.036 ? 1.12 + 0.2 * rnd() : 0.92 + 0.16 * rnd(), resbala: null});
  }
  return gotas;
};

// ---------------------------------------------------------------------------
// Peana: cilindro con el canto de arriba redondeado. Su cara superior está en y = 0.
// ---------------------------------------------------------------------------
// colorArriba y colorAbajo (THREE.Color): la pared se va oscureciendo hacia abajo para fundirse con el fondo.
export const crearGeometriaPeana = (radio, alto, colorArriba, colorAbajo, canto = 0.07) => {
  // de abajo arriba: pared y canto redondeado, hasta el centro de la cara superior
  const pts = [[radio, -alto], [radio, -canto]];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push([radio - canto + canto * Math.cos(a), -canto + canto * Math.sin(a)]);
  }
  pts.push([radio * 0.6, 0], [0.001, 0]);
  const geo = normalizar(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 200));
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(colorArriba).lerp(colorAbajo, Math.min(1, Math.max(0, -pos.getY(i) / alto)));
    colores.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  return geo;
};
