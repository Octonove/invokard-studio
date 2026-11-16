// Rodajas y hojas que flotan alrededor de la lata.
// Cada pieza se describe por dónde queda en el PLANO FINAL (segundo 7): el resto del tiempo
// orbita hacia atrás desde ahí, así que el encuadre final sale siempre como está diseñado.
//
//   radio    distancia al eje de la lata (la lata mide 1 de radio; la peana, 1,85)
//   angulo   en grados alrededor de la lata: 0 = hacia la cámara, 90 = a la derecha, 180 = detrás
//   altura   sobre la peana (la lata mide 3,48 de alto)
//   tam      radio de la rodaja o largo de la hoja
//   sentido  +1 gira hacia la derecha por delante, -1 al revés
//   ritmo    velocidad de su órbita respecto a la general
//   pose     orientación en el plano final (radianes, ejes x, y, z). En una rodaja, x ≈ 1,3 la pone de
//            cara a la cámara y z la ladea; en una hoja, z la hace girar sobre el plano de la imagen.
//   volteo   cuánto gira sobre sí misma mientras orbita (poco en x: una rodaja de canto parece un palo)
//
// Dos reglas para que la etiqueta se lea siempre:
//   1. Las piezas que van a la altura de la etiqueta (entre 0,5 y 3,5) nunca cruzan por delante de
//      la lata: las que acaban a la izquierda giran con sentido +1 y las de la derecha con -1, de modo
//      que todas llegan desde atrás, cada una por su lado (como dos alas que se abren).
//   2. Entre 3,8 y 5,8 de altura quedarían detrás de los titulares: ahí no se pone nada.
// Por delante de la lata solo pasan las piezas bajas (a la altura de la peana).
//
// El plano final está compuesto en dos columnas, a los lados de la lata, alternando hoja y rodaja:
// la rodaja grande delante y abajo a la izquierda, y lo demás subiendo por la derecha.

export const RODAJAS = [
  {radio: 2.5, angulo: -31, altura: 0.55, tam: 0.8, sentido: 1, ritmo: 1.0, pose: [1.25, 0.6, 0.35], volteo: [0.1, 0.8, 0.4], fase: 0.3}, // la protagonista
  {radio: 2.2, angulo: 68, altura: 1.6, tam: 0.56, sentido: -1, ritmo: 1.0, pose: [1.3, -0.8, -0.6], volteo: [0.08, -0.7, -0.42], fase: 3.1}, // sale de detrás de la lata
  {radio: 2.5, angulo: 37, altura: 0.15, tam: 0.5, sentido: 1, ritmo: 1.0, pose: [1.15, -0.3, 0.75], volteo: [-0.1, 0.6, 0.26], fase: 5.2}, // baja: es la que cruza por delante
  {radio: 2.6, angulo: 159, altura: 5.95, tam: 0.46, sentido: -1, ritmo: 0.8, pose: [1.45, 0.6, 0.5], volteo: [0.1, 0.5, 0.42], fase: 2.4}, // ambiente, arriba
];

export const HOJAS = [
  {radio: 2.05, angulo: 53, altura: 3.4, tam: 0.9, sentido: -1, ritmo: 1.0, pose: [0.5, 0.3, -0.9], volteo: [0.2, 0.25, 0.6], fase: 0.8},
  {radio: 2.12, angulo: -76, altura: 2.15, tam: 0.85, sentido: 1, ritmo: 1.0, pose: [0.3, -0.5, 1.1], volteo: [-0.2, 0.3, 0.5], fase: 2.2},
  {radio: 2.2, angulo: -111, altura: 0.9, tam: 0.8, sentido: 1, ritmo: 0.9, pose: [0.6, 0.4, 0.4], volteo: [0.2, -0.3, 0.7], fase: 3.7},
  {radio: 2.2, angulo: 124, altura: 0.02, tam: 0.7, sentido: -1, ritmo: 0.9, pose: [0.5, 0.5, -1.3], volteo: [0.25, 0.3, -0.6], fase: 5.0},
  {radio: 2.7, angulo: -13, altura: -0.5, tam: 0.8, sentido: 1, ritmo: 0.85, pose: [0.6, -0.4, 0.9], volteo: [0.2, 0.3, 0.5], fase: 2.9}, // baja, por delante de la peana
  {radio: 2.4, angulo: 79, altura: -1.9, tam: 0.85, sentido: -1, ritmo: 0.82, pose: [0.3, 0.5, 2.0], volteo: [0.2, -0.35, 0.6], fase: 0.1}, // ambiente, abajo
  {radio: 2.4, angulo: -113, altura: 6.2, tam: 0.8, sentido: 1, ritmo: 1.0, pose: [0.4, 0.2, 0.5], volteo: [-0.2, 0.3, 0.6], fase: 1.3}, // ambiente, arriba
];
