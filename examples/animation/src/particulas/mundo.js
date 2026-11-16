// MUNDO: las partículas y su coreografía.
// crearMundo() se ejecuta una vez por pestaña: reparte las partículas entre las letras de cada formación y
// guarda las constantes de cada una (retrasos, velocidades de estallido, color…).
// posiciones() responde a «¿dónde está cada partícula en el segundo t?» solo con fórmulas: no guarda nada de un
// fotograma para el siguiente, así que el motor puede renderizar los fotogramas en cualquier orden.
import {clamp, crearAzar, curva, hexALineal, lerp, muelle, MUELLE_LLEGADA, TAU} from './util.js';
import {puntosDeAnillo, puntosDeLatido, puntosDeTexto} from './formas.js';

// ───────────── LÍNEA DE TIEMPO (segundos) ─────────────
export const T_ESCRIBE = 0.95;           // el enjambre empieza a escribir la primera formación
export const T_ESTALLA = [3.3, 5.55];    // estallidos: de la 1.ª formación a la 2.ª y de la 2.ª al nombre
export const T_TEXTO = 6.35;             // entra el texto pequeño (HTML)
const ANTICIPA = 0.3;                    // antes de estallar, la palabra se traga a sí misma durante este tiempo
const T_BARRIDO = [2.3, 4.55, 6.9];      // un brillo cruza cada formación en este instante
const BARRIDO_S = 0.75;                  // lo que tarda en cruzarla
const T_COMETA = 6.3;                    // el pulso empieza a recorrer el adorno
const PERIODO_LATIDO = 0.8;              // segundos entre latidos (dos latidos antes del final)

// ───────────── REPARTO DE PARTÍCULAS ─────────────
const P_POLVO = 0.07;      // parte que queda suelta como polvo en órbita (profundidad y ambiente)
const P_ADORNO = 0.085;    // de las de texto, parte que dibuja el adorno del nombre
const REPARTO = {
  contorno: 0.22,          // de las de cada palabra, parte máxima que dibuja el borde de las letras (el «tubo de neón»)
  separa: 2.8,             // píxeles entre dos puntos seguidos del borde
  pared: 0.18,             // parte que forma el grosor de las letras hacia el fondo
};
const FONDO_LETRA = 105;   // grosor de las letras hacia el fondo, en píxeles
const MEZCLA_X = 110;      // cuánto se desordena el reparto izquierda→derecha (0 = cada partícula conserva su columna)

// ───────────── MAQUETA ─────────────
const CAJA_PALABRA = {ancho: 880, alto: 880, cuerpoMax: 1500, espaciado: 0.06};   // bloque de las dos formaciones
const CAJA_NOMBRE = {ancho: 860, alto: 330, cuerpoMax: 1500, espaciado: 0.06};    // bloque del nombre final
const ANCHO_NOMBRE_ANILLO = 740;   // con el adorno de anillo el nombre va algo más pequeño, para que la órbita lo rodee
const LATIDO_ANCHO = 900;
const ANILLO_RADIO = 472;
const ANILLO_ALABEO = -0.085;  // inclinación lateral de la órbita (radianes)
const ANILLO_VEL = 0.85;       // giro de la órbita (radianes por segundo)

// ───────────── MOVIMIENTO ─────────────
const FLUJO = 0.1;             // parte de su camino que el enjambre avanza cada segundo
const ESPIRAL_VUELTAS = 1.5;   // vueltas que da la espiral del enjambre de punta a punta
const GIRO_ESPIRAL = 0.9;      // giro de la espiral sobre su eje (radianes por segundo)
const RET_ESCRIBE = 0.5;       // la escritura barre de izquierda a derecha en este tiempo
const ARRASTRE = 4.6;          // freno del estallido (cuanto mayor, más corto)
const V_ESTALLIDO = 2700;      // velocidad máxima de salida en el estallido (px/s); la mayoría sale mucho más despacio
const IMPLOSION = 0.93;        // cuánto se encoge la palabra justo antes de estallar (1 = hasta un punto)
const GIRO_IMPLOSION = 1.0;    // radianes que gira sobre sí misma mientras se encoge (desagüe en espiral)
const GIRO_VUELO = 1.1;        // radianes de espiral con que cada partícula se acerca a su letra al escribir
const TURBULENCIA = 46;        // px de remolino durante el vuelo
const TEMBLOR = 1.25;          // px del temblor de vida cuando la palabra está formada
const POP_LLEGADA = 0.03;      // la palabra llega un 3 % grande y se asienta
const LATIDO_ESCALA = 0.022;   // cuánto crece el nombre en cada latido
const LATIDO_SALTO = 0.3;      // cuánto crece el pico del electrocardiograma en cada latido

// ───────────── LUZ ─────────────
const LUZ_ENJAMBRE = 0.8;
const LUZ_VUELO = 0.65;
const LUZ_CONTORNO = 1.3;
const LUZ_PARED = 0.9;
const LUZ_ADORNO = 0.8;
const LUZ_LLEGADA = 0.7;       // destello de cada partícula al llegar a su sitio
const LUZ_BARRIDO = 1.5;
const LUZ_CARGA = 0.8;         // la palabra brilla más justo antes de estallar
const LUZ_LATIDO = 0.7;
const CENTELLEO = 1.3;         // fuerza de los destellos sueltos de cada partícula
const TINTE_PARED = 0.75;      // cuánto vira al tono profundo lo que está al fondo de la letra
const BLANCO_CONTORNO = 0.3;   // cuánto vira a blanco el borde de las letras

// ───────────── CÁMARA ─────────────
export const FOCAL = 1500;     // distancia de la cámara: cuanto menor, más perspectiva
const GIRO = [[0, -28], [0.95, -15], [1.85, -8], [3.3, 6], [3.63, 12], [4.2, -8], [5.55, 6], [5.88, 12], [6.5, -6.5], [8, 4]];   // grados
const CABECEO = [[0, 7], [1.85, 3], [3.3, -2.5], [3.63, -6], [4.2, 3], [5.55, -2.5], [5.88, -6], [6.5, 2.5], [8, -1]];        // grados
const ZOOM = [[0, 1], [0.95, 0.985], [1.85, 0.97], [3.3, 1], [3.47, 1.05], [3.95, 0.975], [4.2, 0.97], [5.55, 1], [5.72, 1.05], [6.2, 0.975], [6.5, 0.975], [8, 1]];
const SACUDIDA = 9;            // px de sacudida de cámara en cada estallido

// Tipos de partícula dentro de una formación
const RELLENO = 0, PARED = 1, ADORNO = 2, CONTORNO = 3;

// Reparte una formación: nTexto destinos (relleno + contorno + paredes + adorno) ordenados de izquierda a derecha.
const crearFormacion = (lineas, familia, caja, nTexto, azar, tipoAdorno, conTexto) => {
  const nAdorno = tipoAdorno === 'ninguno' ? 0 : Math.round(nTexto * P_ADORNO);
  const txt = puntosDeTexto(lineas, familia, {...caja, cy: 0}, nTexto - nAdorno, REPARTO, FONDO_LETRA, azar);
  const nRelleno = txt.relleno.length / 2, nContorno = txt.contorno.length / 2, nPared = txt.pared.length / 4;
  const d = {
    x: new Float32Array(nTexto), y: new Float32Array(nTexto), z: new Float32Array(nTexto),
    tipo: new Uint8Array(nTexto),
    prof: new Float32Array(nTexto),        // hondura dentro de la letra, 0 (cara) a 1 (fondo)
    lam: new Float32Array(nTexto),         // adorno: por dónde va del recorrido, 0..1
    a1: new Float32Array(nTexto), a2: new Float32Array(nTexto),   // adorno de anillo: radio relativo y altura
  };
  let k = 0;
  for (let i = 0; i < nRelleno; i++, k++) {
    // el relleno no es una lámina: la mayoría está en la cara de la letra y el resto se reparte hacia el fondo
    const hondura = Math.pow(azar(), 3);
    d.x[k] = txt.relleno[i * 2];
    d.y[k] = txt.relleno[i * 2 + 1];
    d.z[k] = 4 - FONDO_LETRA * hondura;
    d.prof[k] = hondura;
    d.tipo[k] = RELLENO;
  }
  for (let i = 0; i < nContorno; i++, k++) {
    d.x[k] = txt.contorno[i * 2];
    d.y[k] = txt.contorno[i * 2 + 1];
    d.z[k] = (azar() - 0.5) * 3;
    d.tipo[k] = CONTORNO;
  }
  for (let i = 0; i < nPared; i++, k++) {
    d.x[k] = txt.pared[i * 4];
    d.y[k] = txt.pared[i * 4 + 1];
    d.z[k] = txt.pared[i * 4 + 2];
    d.prof[k] = txt.pared[i * 4 + 3];
    d.tipo[k] = PARED;
  }
  // Maqueta vertical del final: nombre, adorno y texto pequeño, centrados en conjunto.
  const alto = txt.caja.y1 - txt.caja.y0;
  let arriba = -alto / 2, abajo = alto / 2;   // extremos de la composición respecto al centro del nombre
  let yPie = alto / 2 + 92;                   // centro del texto pequeño
  let latido = null, anillo = null;
  if (tipoAdorno === 'latido') {
    const pico = clamp(alto * 0.42, 80, 135);
    const yBase = alto / 2 + 46 + pico;
    const l = puntosDeLatido(nAdorno, LATIDO_ANCHO, pico, azar);
    for (let i = 0; i < nAdorno; i++, k++) {
      d.x[k] = l.puntos[i * 3];
      d.y[k] = yBase + l.puntos[i * 3 + 1];
      d.z[k] = (azar() - 0.5) * 8;
      d.lam[k] = l.puntos[i * 3 + 2];
      d.tipo[k] = ADORNO;
    }
    latido = {lamPico: l.lamPico, yBase};
    abajo = yBase + 0.36 * pico;
    yPie = abajo + 84;
  } else if (tipoAdorno === 'anillo') {
    const semiY = alto / 2 + 104;             // la órbita pasa por encima y por debajo del nombre sin pisarlo
    const p = puntosDeAnillo(nAdorno, azar);
    for (let i = 0; i < nAdorno; i++, k++) {
      d.lam[k] = p[i * 3];
      d.a1[k] = p[i * 3 + 1];
      d.a2[k] = p[i * 3 + 2];
      d.x[k] = ANILLO_RADIO * Math.cos(TAU * p[i * 3]);   // solo para ordenar de izquierda a derecha
      d.tipo[k] = ADORNO;
    }
    const senT = Math.min(0.95, semiY / ANILLO_RADIO), cosT = Math.sqrt(1 - senT * senT);
    anillo = {senT, cosT, cosA: Math.cos(ANILLO_ALABEO), senA: Math.sin(ANILLO_ALABEO)};
    // Con la perspectiva, la mitad de la órbita que pasa por delante se ve más grande y la de detrás, más pequeña:
    // se cuenta con ello para que el texto pequeño quede siempre por debajo del anillo.
    const hondo = ANILLO_RADIO * cosT;
    arriba = (-semiY * FOCAL) / (FOCAL + hondo) - 10;
    abajo = (semiY * FOCAL) / (FOCAL - hondo) + 10;
    yPie = abajo + 72;
  }
  if (conTexto) abajo = yPie + 30;
  const sube = -(arriba + abajo) / 2;         // desplazamiento para centrar todo el conjunto en la escena
  if (latido) latido.yBase += sube;
  for (let i = 0; i < nTexto; i++) if (!(anillo && d.tipo[i] === ADORNO)) d.y[i] += sube;
  // Orden de izquierda a derecha (con algo de mezcla): la partícula n.º k del enjambre irá al destino n.º k.
  const clave = new Float32Array(nTexto);
  for (let i = 0; i < nTexto; i++) clave[i] = d.x[i] + (azar() - 0.5) * 2 * MEZCLA_X;
  const orden = Array.from({length: nTexto}, (_, i) => i).sort((a, b) => clave[a] - clave[b]);
  const F = {};
  for (const campo of Object.keys(d)) {
    F[campo] = new d[campo].constructor(nTexto);
    for (let i = 0; i < nTexto; i++) F[campo][i] = d[campo][orden[i]];
  }
  // Luz, tinte y grosor de cada destino según su tipo.
  const sitio = txt.area / Math.max(1, nRelleno);                   // píxeles de letra que le tocan a cada partícula del relleno
  const grano = clamp(Math.sqrt(sitio / 30), 0.85, 1.5);            // letras más grandes → puntos algo más gordos, para que no clareen
  F.lz = new Float32Array(nTexto);
  F.ti = new Float32Array(nTexto);                                  // tinte: > 0 vira al tono profundo, < 0 vira a blanco
  F.gr = new Float32Array(nTexto);
  for (let i = 0; i < nTexto; i++) {
    const tipo = F.tipo[i];
    const hondo = 1 - 0.65 * F.prof[i];                             // lo que está al fondo brilla menos
    F.lz[i] = tipo === PARED ? LUZ_PARED * hondo : tipo === CONTORNO ? LUZ_CONTORNO : tipo === ADORNO ? LUZ_ADORNO : hondo;
    F.ti[i] = tipo === CONTORNO ? -BLANCO_CONTORNO : tipo === ADORNO ? 0 : F.prof[i] * TINTE_PARED;
    F.gr[i] = tipo === RELLENO ? grano * (1 - 0.2 * F.prof[i]) : tipo === ADORNO ? 0.72 : 0.9;
  }
  return {
    ...F,
    cy: sube,                                 // centro vertical del bloque de letras (eje de escalas y estallidos)
    x0: txt.caja.x0, x1: txt.caja.x1, y0: txt.caja.y0 + sube, y1: txt.caja.y1 + sube,
    latido, anillo, yPie: yPie + sube,
  };
};

// Crea todo lo que no cambia con el tiempo. `familia` es la tipografía (ya cargada) con la que se escriben las palabras.
export const crearMundo = (datos, familia) => {
  const azar = crearAzar((datos.semilla ?? 7) * 7919 + 13);
  const N = Math.round(clamp(datos.particulas ?? 14000, 2000, 24000));
  const nPolvo = Math.round(N * P_POLVO);
  const nTexto = N - nPolvo;
  const conTexto = Boolean(datos.textoPequeno);
  const adorno = ['latido', 'anillo'].includes(datos.adorno) ? datos.adorno : 'ninguno';

  // Tienen que ser dos formaciones; si solo llega una, se repite para que nada se rompa.
  const palabras = [datos.formaciones[0], datos.formaciones[1] ?? datos.formaciones[0]].map((f) => [].concat(f).map(String));
  const F = [
    crearFormacion(palabras[0], familia, CAJA_PALABRA, nTexto, azar, 'ninguno', false),
    crearFormacion(palabras[1], familia, CAJA_PALABRA, nTexto, azar, 'ninguno', false),
    crearFormacion([String(datos.nombre)], familia, adorno === 'anillo' ? {...CAJA_NOMBRE, ancho: ANCHO_NOMBRE_ANILLO} : CAJA_NOMBRE, nTexto, azar, adorno, conTexto),
  ];

  const f32 = (n) => new Float32Array(n);
  const m = {
    N, nTexto, nPolvo, F, adorno, conTexto,
    // Constantes por partícula
    fa: f32(N), fb: f32(N), fc: f32(N),         // fases del temblor y del parpadeo
    wa: f32(N), wb: f32(N),                     // velocidades del temblor
    radio: f32(N), luz: f32(N), color: f32(N * 3),
    // Enjambre: sitio a lo largo, a lo ancho y a lo grueso de la cinta
    cintaS: f32(N), cintaW: f32(N), cintaH: f32(N),
    // Escritura de la primera formación
    ret1: f32(nTexto), dur1: f32(nTexto), arco: f32(nTexto * 3),
    // Estallidos
    retB: [f32(nTexto), f32(nTexto)], durB: [f32(nTexto), f32(nTexto)],
    vel: [f32(nTexto * 3), f32(nTexto * 3)], remolino: [f32(nTexto), f32(nTexto)],
    // Polvo
    pRad: f32(nPolvo), pAng: f32(nPolvo), pVel: f32(nPolvo), pY: f32(nPolvo),
    // Instantes derivados
    tLlegada: [T_ESCRIBE + 0.3, T_ESTALLA[0] + 0.4, T_ESTALLA[1] + 0.4],
    latidos: [],
    profundo: hexALineal(datos.colores.profundo),
  };

  // Paleta: degradado de los tonos de neón. Cada partícula tiene una identidad u (0..1) que decide su color y su
  // columna en todas las palabras: por eso el degradado va siempre de izquierda a derecha.
  const tonos = [].concat(datos.colores.neon);
  const neon = (tonos.length > 1 ? tonos : [tonos[0], tonos[0]]).map(hexALineal);   // con un solo color, todo de ese color
  const paleta = (u) => {
    const p = clamp(u) * (neon.length - 1);
    const i = Math.min(neon.length - 2, Math.floor(p));
    return neon[i].map((c, j) => lerp(c, neon[i + 1][j], p - i));
  };

  for (let i = 0; i < N; i++) {
    const esPolvo = i >= nTexto;
    const u = esPolvo ? azar() : (i + 0.5) / nTexto;
    m.fa[i] = azar() * TAU;
    m.fb[i] = azar() * TAU;
    m.fc[i] = azar() * TAU;
    m.wa[i] = 1.4 + azar() * 2.2;
    m.wb[i] = 1.4 + azar() * 2.2;
    // Enjambre: la cinta tiene tramos más poblados que otros, y casi una de cada cinco partículas vuela suelta alrededor.
    const suelta = azar() < 0.18;
    m.cintaS[i] = 1 - u + 0.025 * Math.sin(TAU * 2 * u + 1) + (azar() + azar() + azar() - 1.5) * 0.045;   // la cabeza (1) es la que escribe primero
    m.cintaW[i] = (azar() + azar() - 1) * (suelta ? 1.3 : 1);       // -1..1, más densa en el centro
    m.cintaH[i] = ((azar() + azar() + azar() - 1.5) / 1.5) * (suelta ? 4.5 : 1);
    let c = paleta(u + (azar() - 0.5) * 0.16);
    const talla = Math.pow(azar(), 1.5);                            // muchas pequeñas y unas pocas grandes
    let radio = 0.62 + 0.83 * talla;
    let luz = (1.2 - 0.35 * talla) * (0.8 + azar() * 0.4);
    if (azar() < 0.07) {                                            // chispas: unas pocas más blancas, gordas y brillantes
      c = c.map((v) => lerp(v, 1, 0.55));
      radio *= 1.3;
      luz *= 1.7;
    }
    if (esPolvo) {
      radio *= 0.7 + Math.pow(azar(), 2) * 1.6;
      luz *= 0.2 + 0.4 * Math.pow(azar(), 2);
    }
    m.radio[i] = radio;
    m.luz[i] = luz;
    m.color.set(c, i * 3);
  }

  // Escritura: retraso según la columna de destino (la palabra se escribe de izquierda a derecha).
  const f0 = F[0];
  for (let i = 0; i < nTexto; i++) {
    m.ret1[i] = RET_ESCRIBE * clamp((f0.x[i] - f0.x0) / (f0.x1 - f0.x0)) + azar() * 0.07;
    m.dur1[i] = 0.85 + azar() * 0.2;
    m.arco[i * 3] = (azar() - 0.5) * 90;
    m.arco[i * 3 + 1] = (azar() - 0.5) * 90;
    m.arco[i * 3 + 2] = 50 + azar() * 230;                          // el vuelo se acerca a la cámara y vuelve
  }
  // Estallidos: velocidad de salida de cada partícula y retraso con el que acude a la formación siguiente.
  for (let b = 0; b < 2; b++) {
    const desde = F[b], hacia = F[b + 1];
    const rMax = Math.hypot(hacia.x1, (hacia.y1 - hacia.y0) / 2);
    for (let i = 0; i < nTexto; i++) {
      // Sale del centro hacia el lado en el que estaba (así el estallido conserva el degradado de color),
      // con algo de azar y con profundidad. Muchas salen despacio y unas pocas rapidísimas: una estrella, no un bloque.
      const an = Math.atan2(desde.y[i] - desde.cy, desde.x[i]) + (azar() - 0.5) * 1.1;
      const el = (azar() * 2 - 1) * 1.0;                            // elevación: hacia la cámara o hacia el fondo
      const v = V_ESTALLIDO * (0.04 + 0.96 * Math.pow(azar(), 1.5));
      m.vel[b][i * 3] = Math.cos(an) * Math.cos(el) * v;
      m.vel[b][i * 3 + 1] = Math.sin(an) * Math.cos(el) * v;
      m.vel[b][i * 3 + 2] = Math.sin(el) * v;
      m.remolino[b][i] = (b === 0 ? 1 : -1) * (0.18 + azar() * 0.5);
      // la 2.ª formación cristaliza del centro hacia fuera; el nombre se escribe de izquierda a derecha
      const onda = b === 0
        ? clamp(Math.hypot(hacia.x[i], hacia.y[i] - hacia.cy) / rMax)
        : clamp((hacia.x[i] - hacia.x0) / (hacia.x1 - hacia.x0));
      m.retB[b][i] = 0.16 + 0.26 * onda + azar() * 0.05;
      m.durB[b][i] = 0.75 + azar() * 0.15;
    }
  }
  // Polvo: órbitas lentas alrededor de la escena.
  for (let k = 0; k < nPolvo; k++) {
    m.pRad[k] = 280 + Math.pow(azar(), 0.7) * 700;
    m.pAng[k] = azar() * TAU;
    m.pVel[k] = (0.05 + azar() * 0.13) * (azar() < 0.5 ? 1 : -1);
    m.pY[k] = (azar() * 2 - 1) * 1050;
  }
  // Latidos: el instante en que el pulso que recorre el electrocardiograma pasa por la cima del pico.
  if (F[2].latido) for (let c = 0; c < 2; c++) m.latidos.push(T_COMETA + (c + F[2].latido.lamPico) * PERIODO_LATIDO);
  return m;
};

// ───────────── FÓRMULAS DE POSICIÓN ─────────────
// Las funciones de abajo dejan su resultado en estas variables (así no se crean objetos en el bucle caliente).
let px = 0, py = 0, pz = 0;
let cx = 0, cy = 0, cz = 0;

// Campo de remolinos: un desplazamiento suave que depende del sitio y del tiempo. Los vecinos se mueven juntos,
// así que parece un fluido y no ruido.
const campo = (x, y, z, t) => {
  cx = Math.sin(y * 0.0131 + t * 1.3 + 1.1) + 0.5 * Math.sin(z * 0.0271 - t * 1.9 + 4.0);
  cy = Math.sin(z * 0.0117 + t * 1.1 + 2.3) + 0.5 * Math.sin(x * 0.0233 + t * 1.7 + 0.7);
  cz = Math.sin(x * 0.0149 - t * 1.5 + 5.2) + 0.5 * Math.sin(y * 0.0211 + t * 2.1 + 3.3);
};

// Enjambre: una cinta de partículas que sube en espiral, como una bandada que gira en remolino.
// Cada partícula tiene su sitio fijo dentro de la bandada (cintaS: 0 = cola, 1 = cabeza) y la bandada entera
// avanza por el camino (FLUJO) mientras la espiral gira sobre su eje (GIRO_ESPIRAL).
const enjambre = (m, i, t) => {
  const sb = m.cintaS[i];
  const s = sb + FLUJO * t;                         // por dónde va del camino
  const vuelta = TAU * ESPIRAL_VUELTAS;
  const th = vuelta * s + GIRO_ESPIRAL * t + 2.4;
  // el camino: una espiral irregular que sube (y negativa = arriba)
  const R = 265 + 90 * Math.sin(3.1 * s + 0.4);
  const dR = 90 * 3.1 * Math.cos(3.1 * s + 0.4);
  const sth = Math.sin(th), cth = Math.cos(th);
  const x = R * sth + 40 * Math.sin(2.3 * th + 1.0);
  const y = 470 - 940 * s + 80 * Math.sin(0.9 * th + 2.0);
  const z = 0.72 * R * cth + 30 * Math.cos(1.7 * th);
  // su dirección (derivada respecto a s)
  let tx = dR * sth + R * cth * vuelta + 92 * vuelta * Math.cos(2.3 * th + 1.0);
  let ty = -940 + 72 * vuelta * Math.cos(0.9 * th + 2.0);
  let tz = 0.72 * (dR * cth - R * sth * vuelta) - 51 * vuelta * Math.sin(1.7 * th);
  const tl = 1 / Math.hypot(tx, ty, tz);
  tx *= tl; ty *= tl; tz *= tl;
  // la anchura de la cinta apunta en una dirección que va girando a lo largo del camino; se le quita lo que tenga
  // de «a lo largo» para que la cinta sea perpendicular a su eje (donde coinciden, la cinta se estrecha: un pliegue)
  const g = 5.2 * s + 0.6 * t + 0.8, b = 2.1 * s + 0.5;
  const sg = Math.sin(g);
  let nx = Math.cos(g), ny = sg * Math.cos(b), nz = sg * Math.sin(b);
  const alo = nx * tx + ny * ty + nz * tz;
  nx -= alo * tx; ny -= alo * ty; nz -= alo * tz;
  const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;   // el grosor: perpendicular a las dos
  // forma de pincelada: ancha en el centro de la bandada y afilada en la cabeza y en la cola
  const perfil = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(sb))), 0.55);
  const w = m.cintaW[i] * (40 + 140 * perfil) * (1 + 0.22 * Math.sin(9 * s + 1.3 * t));
  const h = m.cintaH[i] * (10 + 12 * perfil);
  px = x + nx * w + bx * h;
  py = y + ny * w + by * h;
  pz = z + nz * w + bz * h;
  campo(px, py, pz, t);
  px += cx * 20; py += cy * 20; pz += cz * 20;
};

// Valores que dependen solo del instante (se calculan una vez por llamada a posiciones()), uno por formación:
// escala del bloque, fuerza del temblor, carga antes de estallar (0..1), posición del barrido de brillo y giro de implosión.
const escala = [1, 1, 1], vibra = [1, 1, 1], carga = [0, 0, 0], barrido = [0, 0, 0], cosF = [1, 1, 1], senF = [0, 0, 0];
let pulso = 0, tCometa = 0;   // fuerza del latido en este instante y tiempo desde que arrancó el pulso del adorno

// Un latido: sube en tres centésimas y se apaga en un cuarto de segundo.
const latidoEn = (d) => (d <= 0 ? 0 : (1 - Math.exp(-d * 55)) * Math.exp(-d * 7.5));

const prepararInstante = (m, t) => {
  pulso = 0;
  for (const tl of m.latidos) pulso += latidoEn(t - tl) + 0.5 * latidoEn(t - tl - 0.17);   // doble golpe: pum-pum
  for (let f = 0; f < 3; f++) {
    let s = 1 + POP_LLEGADA * (t < m.tLlegada[f] ? 1 : Math.exp(-(t - m.tLlegada[f]) * 4.5));
    let c = 0;
    if (f < 2) {
      // implosión: antes de estallar, la palabra se encoge girando hacia su centro, cada vez más deprisa
      const a = clamp((t - (T_ESTALLA[f] - ANTICIPA)) / ANTICIPA);
      c = a * a * a;
      s *= 1 - IMPLOSION * c;
    } else s += LATIDO_ESCALA * pulso;
    escala[f] = s;
    carga[f] = c;
    vibra[f] = 1 + 4 * c;
    cosF[f] = Math.cos(GIRO_IMPLOSION * c);
    senF[f] = Math.sin(GIRO_IMPLOSION * c);
    barrido[f] = lerp(-640, 640, (t - T_BARRIDO[f]) / BARRIDO_S);
  }
  tCometa = t - T_COMETA;
};

// Sitio de la partícula i cuando la formación f está armada (con su temblor de vida).
const formacion = (m, f, i, t) => {
  const F = m.F[f];
  let x, y, z;
  if (F.anillo && F.tipo[i] === ADORNO) {
    // órbita inclinada alrededor del nombre
    const A = F.anillo;
    const an = TAU * F.lam[i] + ANILLO_VEL * t;
    const r = ANILLO_RADIO * F.a1[i];
    const xr = r * Math.cos(an), fr = r * Math.sin(an);
    const yr = fr * A.senT + F.a2[i];
    x = xr * A.cosA - yr * A.senA;
    y = F.cy + xr * A.senA + yr * A.cosA;
    z = fr * A.cosT;
  } else {
    x = F.x[i]; y = F.y[i]; z = F.z[i];
    // el trazo del electrocardiograma salta con cada latido
    if (F.latido && F.tipo[i] === ADORNO) y = F.latido.yBase + (y - F.latido.yBase) * (1 + LATIDO_SALTO * pulso);
  }
  const s = escala[f], v = TEMBLOR * vibra[f];
  x *= s;
  y = (y - F.cy) * s;
  px = x * cosF[f] - y * senF[f] + v * Math.sin(m.wa[i] * t + m.fa[i]);
  py = F.cy + x * senF[f] + y * cosF[f] + v * Math.cos(m.wb[i] * t + m.fb[i]);
  pz = z * s + 3 * v * Math.sin(m.wa[i] * 0.8 * t + m.fc[i]);
};

// Luz de la partícula i dentro de la formación f.
const luzFormacion = (m, f, i, t) => {
  const F = m.F[f];
  let b = F.lz[i] * (1 + LUZ_CARGA * carga[f]);
  if (F.tipo[i] === ADORNO) {
    if (F.latido) {
      // el pulso recorre la línea como en un monitor: cabeza muy brillante y estela que se apaga
      const vuelta = Math.min(1, Math.floor(tCometa / PERIODO_LATIDO - F.lam[i]));
      const d = vuelta < 0 ? 99 : tCometa - (vuelta + F.lam[i]) * PERIODO_LATIDO;
      const fin = Math.min(F.lam[i], 1 - F.lam[i]) * 9;             // los extremos de la línea se desvanecen
      return b * (0.7 + 1.5 * Math.exp(-d * 5.5) + 2.4 * Math.exp(-d * 34)) * Math.min(1, 0.12 + fin);
    }
    // anillo: un cometa de luz da vueltas más deprisa que las partículas
    let d = 0.3 + 0.38 * t - (F.lam[i] + (ANILLO_VEL * t) / TAU);
    d -= Math.floor(d);
    return b * (0.55 + 1.9 * Math.exp(-d * 5));
  }
  const d = F.x[i] + 0.45 * (F.y[i] - F.cy) - barrido[f];
  b *= 1 + LUZ_BARRIDO * Math.exp(-d * d * 0.00007);
  if (f === 2) b *= 1 + LUZ_LATIDO * pulso;
  return b;
};

// Polvo: órbita lenta + remolinos + un empujón hacia fuera en cada estallido.
const polvo = (m, i, t) => {
  const k = i - m.nTexto;
  const an = m.pAng[k] + m.pVel[k] * t;
  let x = m.pRad[k] * Math.cos(an), z = m.pRad[k] * Math.sin(an) * 0.85;
  let y = m.pY[k] + 24 * Math.sin(0.45 * t + m.fa[i]);
  campo(x, y, z, t * 0.6);
  x += cx * 28; y += cy * 28; z += cz * 28;
  for (let b = 0; b < 2; b++) {
    const d = t - T_ESTALLA[b] - 0.06;
    if (d <= 0) continue;
    const e = ((1 - Math.exp(-6 * d)) * Math.exp(-1.2 * d) * 190) / (Math.hypot(x, y, z) + 1);
    x += x * e; y += y * e; z += z * e;
  }
  px = x; py = y; pz = z;
};

// Posición de todas las partículas en el segundo t → P [x, y, z]*.
// Si se pasan L, T y G, deja además la luz, el tinte (>0 vira al tono profundo, <0 a blanco) y el grosor de cada una.
export const posiciones = (m, t, P, L, T, G) => {
  const {nTexto, N, F} = m;
  const conLuz = Boolean(L);
  prepararInstante(m, t);
  for (let i = 0; i < nTexto; i++) {
    let luz = 1, tinte = 0, grano = 1;
    let quieta = -1;                       // formación en la que está parada (-1 = está volando)
    const t1 = T_ESCRIBE + m.ret1[i];
    if (t < t1) {
      // 1. En el enjambre
      enjambre(m, i, t);
      luz = LUZ_ENJAMBRE;
    } else if (t < T_ESTALLA[0]) {
      const k = (t - t1) / m.dur1[i];
      if (k >= 1) quieta = 0;
      else {
        // 2. Volando del enjambre a su letra: mezcla de los dos sitios + un arco hacia la cámara
        const e = muelle(k), ec = Math.min(1, e), arco = 4 * ec * (1 - ec);
        enjambre(m, i, t);
        const ax = px, ay = py, az = pz;
        formacion(m, 0, i, t);
        // lo que le falta por recorrer se va encogiendo y, de paso, girando: llega en espiral, no en línea recta
        const an = GIRO_VUELO * arco, co = Math.cos(an), se = Math.sin(an);
        const fx = (ax - px) * (1 - e), fy = (ay - py) * (1 - e);
        px += fx * co - fy * se + m.arco[i * 3] * arco;
        py += fx * se + fy * co + m.arco[i * 3 + 1] * arco;
        pz += (az - pz) * (1 - e) + m.arco[i * 3 + 2] * arco;
        if (conLuz) {
          const llega = Math.exp(-Math.abs(k - MUELLE_LLEGADA) * m.dur1[i] * 6.5);
          luz = lerp(LUZ_VUELO, luzFormacion(m, 0, i, t), ec) * (1 + LUZ_LLEGADA * llega);
          tinte = F[0].ti[i] * ec;
          grano = lerp(1, F[0].gr[i], ec);
        }
      }
    } else {
      const b = t < T_ESTALLA[1] ? 0 : 1;
      const d = t - T_ESTALLA[b];                           // tiempo desde el estallido
      const k = (d - m.retB[b][i]) / m.durB[b][i];
      if (d <= 0) quieta = b;
      else if (k >= 1) quieta = b + 1;
      else {
        // 3. Estallido: sale despedida desde el punto en el que implosionó la palabra, frena, gira en remolino…
        formacion(m, b, i, t);
        const fx = px, fy = py, fz = pz;
        const q = (1 - Math.exp(-ARRASTRE * d)) / ARRASTRE;
        const v = m.vel[b];
        let x = fx + v[i * 3] * q, y = fy + v[i * 3 + 1] * q - F[b].cy;
        const z = fz + v[i * 3 + 2] * q;
        const an = m.remolino[b][i] * (1 - Math.exp(-3 * d));
        const co = Math.cos(an), se = Math.sin(an);
        const rx = x * co - y * se;
        y = F[b].cy + x * se + y * co;
        x = rx;
        campo(fx, fy, fz, t);
        const tu = TURBULENCIA * (1 - Math.exp(-4 * d));
        const bx = x + cx * tu, by = y + cy * tu, bz = z + cz * tu;
        // …y con su retraso acude a la formación siguiente
        const e = muelle(k), ec = Math.min(1, e);
        formacion(m, b + 1, i, t);
        px = bx + (px - bx) * e;
        py = by + (py - by) * e;
        pz = bz + (pz - bz) * e;
        if (conLuz) {
          const llega = Math.exp(-Math.abs(k - MUELLE_LLEGADA) * m.durB[b][i] * 6.5);
          const vuelo = LUZ_VUELO * (1 + 1.6 * Math.exp(-d * 7));
          luz = lerp(vuelo, luzFormacion(m, b + 1, i, t), ec) * (1 + LUZ_LLEGADA * llega);
          tinte = lerp(F[b].ti[i] * Math.exp(-d * 6), F[b + 1].ti[i], ec);
          grano = lerp(lerp(F[b].gr[i], 1, Math.min(1, d * 5)), F[b + 1].gr[i], ec);
        }
      }
    }
    if (quieta >= 0) {
      // 4. Parada en una formación
      formacion(m, quieta, i, t);
      if (conLuz) {
        luz = luzFormacion(m, quieta, i, t);
        tinte = F[quieta].ti[i];
        grano = F[quieta].gr[i];
      }
    }
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    if (conLuz) {
      // parpadeo suave + un destello breve de vez en cuando (el centelleo de la purpurina)
      const guino = Math.sin(t * m.wb[i] * 1.3 + m.fa[i] + m.fb[i]);
      L[i] = luz * (0.8 + 0.2 * Math.sin(t * (2 + m.wa[i]) + m.fc[i]) + (guino > 0.9 ? CENTELLEO * (guino - 0.9) * 10 : 0));
      T[i] = tinte;
      G[i] = grano;
    }
  }
  for (let i = nTexto; i < N; i++) {
    polvo(m, i, t);
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    if (conLuz) {
      L[i] = 0.75 + 0.25 * Math.sin(t * (1 + m.wa[i]) + m.fc[i]);
      T[i] = 0.25;
      G[i] = 1;
    }
  }
};

// ───────────── CÁMARA ─────────────
// Gira unos grados alrededor de la escena (las letras tienen paralaje), se acerca despacio mientras se lee cada
// palabra y da un latigazo con sacudida en cada estallido. Devuelve los valores en `cam`.
const RAD = Math.PI / 180;
export const camara = (t, cam) => {
  const giro = curva(GIRO, t) * RAD, cabeceo = curva(CABECEO, t) * RAD;
  cam.cg = Math.cos(giro); cam.sg = Math.sin(giro);
  cam.cc = Math.cos(cabeceo); cam.sc = Math.sin(cabeceo);
  cam.zoom = curva(ZOOM, t);
  cam.dx = 0; cam.dy = 0;
  for (let b = 0; b < 2; b++) {
    const d = t - T_ESTALLA[b];
    if (d <= 0) continue;
    const a = SACUDIDA * Math.exp(-d * 8);
    cam.dx += a * Math.sin(d * 61 + b * 2.1);
    cam.dy += a * Math.sin(d * 73 + 1.3 + b);
  }
  return cam;
};

// Destello de cada estallido (0 fuera de los estallidos): sube de golpe y se apaga en un cuarto de segundo.
export const destello = (t) => {
  let v = 0;
  for (let b = 0; b < 2; b++) {
    const d = t - T_ESTALLA[b];
    if (d > 0) v += (1 - Math.exp(-d * 60)) * Math.exp(-d * 9);
  }
  return v;
};
