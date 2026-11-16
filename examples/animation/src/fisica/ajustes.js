// Constantes de la animación: medidas de la escena, física y calendario.
// Quien adapta el vídeo NO necesita tocar esto (para eso está datos.js); está aquí para quien quiera afinar.

// ---------- Vídeo ----------
export const FPS = 30;
export const FOTOGRAMAS = 240;        // 8 segundos
export const ANCHO = 1080;
export const ALTO = 1920;

// ---------- Escena (píxeles) ----------
export const MARGEN = 60;             // margen lateral seguro de Instagram
export const TOLDO = {alto: 190, onda: 45, rayas: 12};          // el toldo tapa hasta y = alto + onda
export const POSTE = 30;              // ancho de los postes laterales (son las paredes de la física)
export const ROTULO = {
  tamAnte: 138,                       // cuerpo de la palabra pequeña (su cara de arriba empieza justo en y = 300, el límite seguro)
  baseAnte: 428,                      // línea base de la palabra pequeña
  altoNombre: 456,                    // y donde empiezan las mayúsculas del nombre gigante
  altoNombreSolo: 380,                // lo mismo cuando no hay palabra pequeña
  capMax: 320,                        // altura máxima de las letras gigantes (nombres cortos)
  fondoTapa: 16,                      // grosor visible de la cara de arriba de las letras
  tamTipo: 58,                        // cuerpo de la línea fina
  sepTipo: 64,                        // de la base del nombre a la base de la línea fina
};
export const CAJA = {x0: 50, x1: 1030, pared: 26, borde: 1118, fondo: 1450, base: 1474, liston: 46};
export const MOSTRADOR = {y: 1474, tabla: 30};
export const ETIQUETA = {
  x: 760,                             // centro deseado de la etiqueta (se ajusta al hueco entre letras más cercano)
  yAncla: 214,                        // de dónde cuelga (detrás del toldo)
  yOjal: 884,                         // dónde queda el ojal en reposo
  ancho: 420, alto: 264, chaflan: 44, ojal: 28,
};

// ---------- Física ----------
export const PX = 60;                 // 60 px = 1 metro del motor
export const GRAVEDAD = 5200;         // px/s² (la real a esta escala sería ~10.000: va algo más lenta para poder seguirla)
export const SUBPASOS = 4;            // pasos de simulación por fotograma (1/120 s cada uno)
export const PREVIO = 48;             // fotogramas que se simulan antes del fotograma 0 (así no arranca vacío)
export const LLENADO = 1.08;          // cuánta fruta cabe: fracción del hueco de la caja que ocupa la mezcla
export const ROCE = {fruta: 0.45, letra: 0.5, madera: 0.6};
export const REBOTE_LETRA = 0.42;     // las letras devuelven más que la madera

// Categorías de choque
export const CAT = {MADERA: 0x0001, LETRA: 0x0002, FRUTA: 0x0004, QUEDA: 0x0008};

// ---------- Calendario (segundos; negativo = antes del fotograma 0) ----------
// Cada oleada: de/a = cuándo se sueltan las piezas · parte = fracción del total · x = franja horizontal (0..1)
// v = velocidad inicial hacia abajo (px/s) · delante = fracción que cae por delante del rótulo sin tocarlo
export const OLEADAS = [
  {de: -1.55, a: -0.85, parte: 0.14, x: [0.08, 0.92], v: 500, delante: 0.6},  // ya están en la caja al empezar
  {de: -0.5, a: 0.35, parte: 0.15, x: [0.08, 0.92], v: 420, delante: 0.2},    // las primeras, sueltas: el fotograma 0 las pilla en el aire
  {de: 0.7, a: 1.2, parte: 0.14, x: [0.5, 0.94], v: 650, delante: 0.3},       // oleada por la derecha
  {de: 1.4, a: 1.9, parte: 0.14, x: [0.06, 0.52], v: 650, delante: 0.3},      // oleada por la izquierda
  {de: 2.25, a: 2.7, parte: 0.36, x: [0.08, 0.64], v: 820, delante: 0.5},     // el gran volcado
  {de: 3.15, a: 4.0, parte: 0.07, x: [0.1, 0.9], v: 500, delante: 0.3},       // rezagadas
];
export const ETIQUETA_T = {sale: 4.85};                         // segundo en que empieza a bajar la etiqueta
