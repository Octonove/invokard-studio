// Comprobación numérica del guion, sin renderizar nada. Úsala después de tocar tiempos o medidas en guion.mjs:
//   node src/mascota/comprobar.mjs            → con los libros de DATOS
//   node src/mascota/comprobar.mjs 6          → con 6 libros
//   node src/mascota/comprobar.mjs 9 --libro  → además, el viaje del libro fotograma a fotograma
// Mira los 240 fotogramas y dice: si algún pie apoyado se mueve (patina), si alguna pierna o brazo no alcanza
// y tiene que estirarse, y cuál es el mayor salto de cada parte entre un fotograma y el siguiente (un salto
// muy grande suele ser un tirón que se ve).
import {calcular, prepararLibros, T} from './guion.mjs';
import {DATOS} from './datos.js';

const FPS = 30, N = 240;
const numero = Number(process.argv[2]);
const libros = prepararLibros(Number.isFinite(numero) && numero > 0 ? numero : DATOS.pila.libros);
const DETALLE = process.argv.includes('--libro');
const poses = Array.from({length: N}, (_, f) => calcular(f / FPS, libros));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let patina = 0, estiraPierna = 1, estiraBrazo = 1, fPierna = 0, fBrazo = 0;
const saltos = {};
const anota = (nombre, d, f) => {
  if (!saltos[nombre] || d > saltos[nombre].d) saltos[nombre] = {d, f};
};
for (let f = 0; f < N; f++) {
  const p = poses[f], q = poses[f - 1];
  p.piernas.forEach((pi, i) => {
    if (pi.estira > estiraPierna) { estiraPierna = pi.estira; fPierna = f; }
    // pie apoyado en este fotograma y en el anterior: no puede haberse movido
    if (q && pi.pie.alto === 0 && q.piernas[i].pie.alto === 0) patina = Math.max(patina, Math.abs(pi.pie.x - q.piernas[i].pie.x));
  });
  p.brazos.forEach((b) => { if (b.estira > estiraBrazo) { estiraBrazo = b.estira; fBrazo = f; } });
  if (!q) continue;
  anota('cadera', dist(p.cadera, q.cadera), f);
  anota('cabeza', dist(p.cabeza.centro, q.cabeza.centro), f);
  anota('libro', dist(p.viajero, q.viajero), f);
  anota('punta cola', dist(p.cola.pts.at(-1), q.cola.pts.at(-1)), f);
  anota('mano 0', dist(p.brazos[0].mano, q.brazos[0].mano), f);
  anota('mano 1', dist(p.brazos[1].mano, q.brazos[1].mano), f);
  anota('codo 0', dist(p.brazos[0].codo, q.brazos[0].codo), f);
  anota('codo 1', dist(p.brazos[1].codo, q.brazos[1].codo), f);
  anota('rodilla 0', dist(p.piernas[0].rodilla, q.piernas[0].rodilla), f);
  anota('rodilla 1', dist(p.piernas[1].rodilla, q.piernas[1].rodilla), f);
  anota('base pila', dist(p.pila.base, q.pila.base), f);
  anota('cima pila', dist(p.pila.cima, q.pila.cima), f);
}

console.log('libros:', libros.length, '· alto de la pila:', libros.reduce((s, l) => s + l.alto, 0).toFixed(0), 'unidades');
console.log('pie apoyado, deslizamiento máximo entre fotogramas (tiene que ser 0):', patina.toFixed(4));
console.log('pierna más estirada: x' + estiraPierna.toFixed(3), 'en f' + fPierna, '| brazo más estirado: x' + estiraBrazo.toFixed(3), 'en f' + fBrazo);
const tirantes = poses
  .map((p, f) => [f, Math.max(...p.piernas.map((x) => x.estira)), Math.max(...p.brazos.map((x) => x.estira))])
  .filter((x) => x[1] > 1.02 || x[2] > 1.02);
console.log('fotogramas con alguna extremidad estirada más de un 2 %:', tirantes.length ? tirantes.map((x) => 'f' + x[0] + ' pierna x' + x[1].toFixed(2) + ' brazo x' + x[2].toFixed(2)).join(', ') : 'ninguno');
console.log('mayor salto entre fotogramas (unidades de esqueleto):');
for (const [k, v] of Object.entries(saltos)) console.log('  ', k.padEnd(10), v.d.toFixed(1).padStart(6), ' f' + v.f, '(' + (v.f / FPS).toFixed(2) + ' s)');
console.log('tiempos del guion:', Object.entries(T).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · '));

if (DETALLE) {
  console.log('libro viajero, del frenazo a la vuelta a la pila:');
  for (let f = Math.round(T.para * FPS); f <= Math.round((T.aterriza + 0.1) * FPS); f++) {
    const v = poses[f].viajero;
    console.log('   f' + f, (f / FPS).toFixed(2) + ' s', v.donde.padEnd(5), 'x', v.x.toFixed(0).padStart(5), 'y', v.y.toFixed(0).padStart(5), 'giro', v.ang.toFixed(0).padStart(5));
  }
}
