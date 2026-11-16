// La coreografía: dónde está cada cosa en cada instante.
// Todo son funciones puras del tiempo t (segundos): el motor pinta los fotogramas sueltos y sin orden,
// así que aquí no se acumula nada. Lo que necesita «sumar» (ángulos girados a velocidad variable)
// se integra una sola vez en una tabla, al cargar el módulo.
//
//   0,00 – 0,44  la lata cae girando rápido
//   0,44         toca la peana: se aplasta, salpica y rebota dos veces
//   1,2  – 5,3   giro de expositor (lento en el logotipo, vivo en el dorso); la cámara se acerca en arco;
//                un reflejo cruza la lata (1,65–2,95 s)
//   5,3  – 6,3   gesto final: la lata coge impulso, se eleva y se ladea; el giro casi se para
//   6,3  – 8,0   plano final asentado (todo sigue vivo, pero muy despacio); segundo reflejo (6,25–7,45 s)
import {clamp, entraSale, escalon, golpe, lerp, muelle, prog, suave} from './util.js';

export const T_IMPACTO = 0.44; // la lata toca la peana
export const T_FINAL = 5.3; // empieza el gesto del plano final
export const T_SALTO = T_FINAL + 0.18; // la lata despega
export const T_REF = 7.0; // instante en que todo está exactamente como en el diseño del plano final
const DURACION = 8;

// ---------------------------------------------------------------------------
// Caída y rebotes de la lata (tiro parabólico resuelto con fórmula)
// ---------------------------------------------------------------------------
const GRAVEDAD = 22; // unidades/s² (a cámara lenta: con la gravedad real no daría tiempo a verlo)
const ALTURA_INICIAL = 3.35; // altura de la base de la lata en el fotograma 0
const REBOTE = 0.3; // fracción de velocidad que conserva en cada bote
const V0 = (ALTURA_INICIAL - 0.5 * GRAVEDAD * T_IMPACTO * T_IMPACTO) / T_IMPACTO;
const V_IMPACTO = V0 + GRAVEDAD * T_IMPACTO;
const V1 = V_IMPACTO * REBOTE;
const V2 = V1 * REBOTE;
export const T_BOTE_1 = T_IMPACTO + (2 * V1) / GRAVEDAD; // segundo toque
export const T_BOTE_2 = T_BOTE_1 + (2 * V2) / GRAVEDAD; // tercer toque: ya se queda

const alturaCaida = (t) => {
  if (t < T_IMPACTO) return ALTURA_INICIAL - V0 * t - 0.5 * GRAVEDAD * t * t;
  if (t < T_BOTE_1) return V1 * (t - T_IMPACTO) - 0.5 * GRAVEDAD * (t - T_IMPACTO) ** 2;
  if (t < T_BOTE_2) return V2 * (t - T_BOTE_1) - 0.5 * GRAVEDAD * (t - T_BOTE_1) ** 2;
  return 0;
};

// ---------------------------------------------------------------------------
// Tablas de ángulos: giro de la lata y fase de la órbita de rodajas y hojas
// ---------------------------------------------------------------------------
const PASO = 1 / 240;
const integrar = (velocidad) => {
  const n = Math.round(DURACION / PASO) + 2;
  const tabla = new Float64Array(n);
  for (let i = 1; i < n; i++) tabla[i] = tabla[i - 1] + 0.5 * (velocidad((i - 1) * PASO) + velocidad(i * PASO)) * PASO;
  return (t) => {
    const x = clamp(t, 0, DURACION) / PASO;
    const i = Math.min(n - 2, Math.floor(x));
    return lerp(tabla[i], tabla[i + 1], x - i);
  };
};

const GIRO_RAPIDO = 18.25; // rad/s mientras cae (casi 3 vueltas por segundo). Afinado para que en el fotograma 0 el logotipo mire a cámara
const GIRO_LENTO = 0.42; // rad/s mientras enseña el logotipo (unos 24° por segundo)
const GIRO_VIVO = 1.41; // rad/s al pasar por el dorso de la etiqueta (unos 80° por segundo). Afinado para que el logotipo quede centrado durante la pausa
const GIRO_FINAL = 0.1; // rad/s en el plano final: casi parada, pero viva
// Velocidad de giro de la lata en cada instante. El giro de expositor no es constante: se recrea
// en una cara (1,3–2,8 s), cruza con brío el sello del dorso (2,8–4,4 s) y frena en la otra cara.
export const velocidadGiro = (t) => {
  const extra = t < T_IMPACTO ? GIRO_RAPIDO : GIRO_RAPIDO * Math.exp(-(t - T_IMPACTO) / 0.21); // el roce con la peana la frena
  const crucero = lerp(GIRO_LENTO, GIRO_VIVO, escalon(2.8, 3.5, t)) + (GIRO_FINAL - GIRO_VIVO) * escalon(4.4, 5.65, t);
  return crucero + extra;
};
const anguloGirado = integrar(velocidadGiro);

// rodajas y hojas: remolino más vivo al principio, lento en el plano final
const velocidadOrbita = (t) => 0.3 * (1 + 2.2 * Math.exp(-t / 0.5)) * lerp(1, 0.25, escalon(T_FINAL - 0.3, T_FINAL + 1.3, t));
const faseOrbita = integrar(velocidadOrbita);
// fase relativa al plano final: en T_REF vale 0 y cada pieza está donde se diseñó
export const orbita = (t) => faseOrbita(t) - faseOrbita(T_REF);

// ---------------------------------------------------------------------------
// Cámara
// ---------------------------------------------------------------------------
export const camara = (t) => {
  const acercar = escalon(1.0, 5.5, t);
  return {
    // ángulo alrededor de la lata (arco suave de izquierda a derecha)
    azimut: -0.17 + 0.3 * escalon(0.5, 5.7, t) + 0.045 * clamp((t - 5.7) / 2.3),
    elevacion: 0.275 - 0.035 * acercar,
    distancia: 21.6 - 1.0 * prog(t, 0, 1.4, suave) - 1.95 * acercar + 1.05 * muelle(t, T_SALTO, {damping: 16, stiffness: 60, mass: 1}) - 0.3 * clamp((t - 6) / 2),
    // punto al que mira: sigue un poco a la lata cuando se eleva y tiembla con el golpe
    mira: [0, 1.785 + 0.27 * muelle(t, T_SALTO, {damping: 16, stiffness: 60, mass: 1}) - 0.05 * golpe(t, T_IMPACTO, 30, 10), 0],
  };
};

// ---------------------------------------------------------------------------
// Lata
// ---------------------------------------------------------------------------
// Ángulo de la lata con una cara (logotipo) mirando justo a la cámara.
const GIRO_CARA = -Math.PI / 2;

export const lata = (t) => {
  // elevación del plano final: muelle con un vaivén muy lento después
  const sube = muelle(t, T_SALTO, {damping: 12, stiffness: 105, mass: 1});
  const flota = 0.035 * Math.sin((t - T_SALTO) * 2.1) * escalon(T_SALTO + 0.5, T_SALTO + 1.4, t);
  const altura = alturaCaida(t) + 0.3 * sube + flota;

  // aplastamiento: golpe en cada toque, encogida antes de saltar y estirón al despegar
  const impulso = Math.sin(Math.PI * clamp((t - T_FINAL) / 0.24)) ** 2;
  const aplasta = golpe(t, T_IMPACTO, 38, 16) + 0.3 * golpe(t, T_BOTE_1, 38, 18) + 0.4 * impulso - 0.35 * golpe(t, T_SALTO, 22, 9);
  const estira = t < T_IMPACTO ? 0.045 * (t / T_IMPACTO) : 0; // se alarga al caer
  const escalaY = 1 + estira - 0.075 * aplasta;
  const escalaXZ = 1 - estira * 0.5 + 0.04 * aplasta;

  // cabeceo sobre la base: entra algo inclinada y se tambalea al aterrizar
  const cae = t < T_IMPACTO ? 1 - t / T_IMPACTO : 0;
  const tambaleoZ = -0.17 * cae + 0.05 * golpe(t, T_IMPACTO, 13, 6) + 0.012 * golpe(t, T_BOTE_1, 16, 8);
  const tambaleoX = 0.1 * cae + 0.02 * golpe(t, T_IMPACTO + 0.03, 11, 6);

  // ladeo del plano final, alrededor del centro de la lata
  const ladea = muelle(t, T_SALTO + 0.04, {damping: 10, stiffness: 80, mass: 1});
  const ladeoZ = -0.165 * ladea + 0.012 * Math.sin((t - T_SALTO) * 1.5) * escalon(T_SALTO + 0.6, T_SALTO + 1.6, t);
  const ladeoX = 0.07 * ladea;

  const cam = camara(T_REF);
  return {
    altura,
    escalaY,
    escalaXZ,
    tambaleoX,
    tambaleoZ,
    ladeoX,
    ladeoZ,
    // en T_REF una cara mira a la cámara, girada todavía un poco hacia la izquierda
    giro: GIRO_CARA + cam.azimut - 0.11 + anguloGirado(t) - anguloGirado(T_REF),
    velocidad: velocidadGiro(t),
    // Velocidad «que se ve»: la que decide cuánto se emborrona la etiqueta. Arranca en cero para que
    // el fotograma 0 (la posible miniatura) salga nítido, como un cartel, y en tres fotogramas ya es la real.
    velocidadVisible: velocidadGiro(t) * escalon(0, 0.1, t),
  };
};

// La peana cede con el golpe y vuelve.
export const hundimientoPeana = (t) => -0.06 * golpe(t, T_IMPACTO, 21, 9) - 0.015 * golpe(t, T_BOTE_1, 24, 11);

// ---------------------------------------------------------------------------
// Luz que barre la lata: dos pasadas (momento estrella y plano final)
// ---------------------------------------------------------------------------
const PASADAS = [
  {desde: 1.65, dura: 1.3}, // mientras se lee el logotipo
  {desde: 6.25, dura: 1.2}, // remate del plano final
];
export const barrido = (t) => {
  for (const p of PASADAS) {
    const k = (t - p.desde) / p.dura;
    // avanza casi a velocidad constante (un punto más despacio al entrar y al salir) para que dé tiempo a verlo cruzar
    if (k > 0 && k < 1) return {azimut: lerp(-2.3, 2.3, lerp(k, entraSale(k), 0.3)), fuerza: Math.sin(Math.PI * k) ** 1.2};
  }
  return {azimut: -2.3, fuerza: 0};
};

// Giro lento del entorno reflejado: los brillos se deslizan por el metal todo el rato.
export const giroEntorno = (t) => -0.3 + 0.55 * escalon(0.4, 7.6, t);

// ---------------------------------------------------------------------------
// Rodajas, hojas y burbujas
// ---------------------------------------------------------------------------
// Empujón que reciben las piezas que flotan cuando la lata golpea la peana (llega antes a las cercanas).
export const empujon = (t, radio) => {
  const x = t - (T_IMPACTO + 0.035 * radio);
  const salto = t - (T_SALTO + 0.03 * radio);
  return (x > 0 ? Math.exp(-4.2 * x) * Math.sin(7.5 * x) : 0) + (salto > 0 ? 0.4 * Math.exp(-4 * salto) * Math.sin(6 * salto) : 0);
};
// Al empezar las piezas están más abiertas y se cierran hacia su órbita.
export const apertura = (t) => 0.3 * (1 - prog(t, 0, 1.3, suave));

// Sombra de contacto: cuánto se separa la lata de la peana (0 apoyada → 1 arriba del todo)
export const separacion = (t) => clamp(lata(t).altura / 2.6);
