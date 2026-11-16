// Lanzador del kit: un comando por animación, sin recordar opciones. Dibuja con el motor de animación de Invokard Studio.
//
//   node render.mjs lista                 → qué animaciones hay
//   node render.mjs oferta                → out/oferta.mp4 con los datos de src/oferta/datos.js (DATOS)
//   node render.mjs oferta alt            → out/oferta-alt.mp4 con los datos alternativos (ALTERNATIVO)
//   node render.mjs oferta foto 120       → out/oferta-f120.png, un solo fotograma para revisar (120 = segundo 4)
//   node render.mjs oferta fotos          → ocho fotogramas repartidos, para revisar la animación entera de un vistazo
//   node render.mjs oferta alt foto 120   → lo mismo con los datos alternativos («alt» vale también con «fotos»)
//   node render.mjs todas                 → renderiza todas, una detrás de otra
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
process.chdir(RAIZ);

// El motor: dentro del kit está en motor/; en el repositorio de Invokard Studio, en skills/invokard-studio/animation.
const MOTOR = [join(RAIZ, 'motor', 'src', 'index.mjs'), join(RAIZ, '..', '..', 'skills', 'invokard-studio', 'animation', 'src', 'index.mjs')]
  .find((p) => existsSync(p));
if (!MOTOR) { console.error('No encuentro el motor de animación (carpeta motor/).'); process.exit(1); }

// Las animaciones son las carpetas de src/ que tienen index.jsx; su composición se llama como la carpeta con mayúscula.
// La línea de cada una en «lista» sale de este mapa (si una carpeta nueva no está aquí, se lista sin descripción).
const QUE = {
  oferta: 'Cartel tipográfico con el descuento en un sello',
  cafe: 'Taza humeante con un 2x1 y un sello giratorio',
  baile: 'Academia: nombre que cae letra a letra y pasos numerados',
  mascota: 'Un zorro que anda, casi tira los libros y presenta la oferta',
  producto3d: 'Lata de refresco en 3D girando en un plató',
  fisica: 'Fruta que cae, rebota en el rótulo y llena la caja',
  particulas: 'Miles de puntos de luz que escriben un cartel',
  escena: 'Amanece en la calle y la tienda abre',
  foto: 'La foto de tu producto como protagonista, con precio y características',
  galeria: 'Tres fotos tuyas convertidas en un anuncio con titular y precio',
};
const animaciones = () => readdirSync('src', {withFileTypes: true}).filter((d) => d.isDirectory() && existsSync(join('src', d.name, 'index.jsx')))
  .map((d) => d.name).sort((a, b) => (a in QUE ? Object.keys(QUE).indexOf(a) : 99) - (b in QUE ? Object.keys(QUE).indexOf(b) : 99));
const idDe = (n) => n.charAt(0).toUpperCase() + n.slice(1);
const REPARTIDOS = [0, 34, 68, 102, 136, 170, 204, 239];    // los ocho fotogramas de «fotos»

const args = process.argv.slice(2);
const nombre = args[0];
if (!nombre || nombre === 'lista') {
  console.log('Animaciones del kit:\n');
  for (const n of animaciones()) console.log(`  ${n.padEnd(11)} ${QUE[n] || ''}`);
  console.log('\nUso: node render.mjs <animación> [alt] [foto <fotograma> | fotos]');
  console.log('Ejemplos: node render.mjs oferta · node render.mjs oferta foto 120 · node render.mjs oferta fotos · node render.mjs oferta alt');
  process.exit(0);
}

let motor;
try {
  motor = await import(pathToFileURL(MOTOR).href);
} catch (e) {
  console.error(/Cannot find (package|module)/.test(e.message)
    ? 'Faltan las dependencias del kit. Ejecuta primero: npm install' : `No se pudo cargar el motor: ${e.message}`);
  process.exit(1);
}

const avisos = {
  navegador: 'No encuentro ningún navegador. Instala Google Chrome o Microsoft Edge, o descarga uno para el kit con: node motor/cli.mjs browser',
  red: 'Esta tipografía no está guardada en el kit y no hay conexión para descargarla. Repite con internet.',
};
const explica = (e) => {
  const m = String(e.message || e);
  if (/No browser could be started/.test(m)) return `${avisos.navegador}\n\n${m}`;
  if (/Could not load the font|cannot be reached/.test(m)) return `${avisos.red}\n\n${m}`;
  return m;
};

const una = async (n, resto) => {
  if (!existsSync(`src/${n}/index.jsx`)) {
    console.error(`No conozco la animación «${n}». Prueba: node render.mjs lista`);
    return 1;
  }
  const alt = resto.includes('alt');
  const id = idDe(n) + (alt ? 'Alt' : '');
  const base = `out/${n}${alt ? '-alt' : ''}`;
  const entry = `src/${n}/index.jsx`;
  const browser = process.env.GL ? {gl: process.env.GL} : {};      // GL=swangle si el 3D sale en negro (ver LEEME.md)
  mkdirSync('out', {recursive: true});
  console.log(`Generando ${n}${alt ? ' (datos alternativos)' : ''}…`);
  const inicio = Date.now();
  const segundos = () => Math.round((Date.now() - inicio) / 1000);
  try {
    const iFoto = resto.indexOf('foto');
    if (resto.includes('fotos') || iFoto >= 0) {
      const fotos = resto.includes('fotos') ? REPARTIDOS : [Number(resto[iFoto + 1] ?? 120)];
      if (fotos.some((f) => !Number.isInteger(f) || f < 0 || f > 239)) {
        console.error('El fotograma tiene que ser un número entre 0 y 239 (30 fotogramas = 1 segundo).');
        return 1;
      }
      const r = await motor.renderStills({entry, composition: id, frames: fotos, browser,
        output: (f) => `${base}-f${String(f).padStart(3, '0')}.png`});
      for (const f of r.files) console.log(`  ${f}`);
      console.log(fotos.length > 1 ? `\nListo: ocho fotogramas en ${join(RAIZ, 'out')}  (${segundos()} s)` : `\nListo  (${segundos()} s)`);
      return 0;
    }
    const salida = `${base}.mp4`;
    await motor.renderMedia({entry, composition: id, output: salida, browser, crf: 18,
      onProgress: ({done, total}) => { if (done % 60 === 0 || done === total) process.stdout.write(`  ${done}/${total} fotogramas\n`); }});
    console.log(`\nListo: ${salida}  (${segundos()} s)\nRuta completa: ${join(RAIZ, salida)}`);
    return 0;
  } catch (e) {
    console.error(`\nNo se pudo generar ${n}:\n${explica(e)}`);
    return 1;
  }
};

if (nombre === 'todas') {
  let fallos = 0;
  for (const n of animaciones()) {
    console.log(`\n── ${n} ──`);
    fallos += (await una(n, args.slice(1))) === 0 ? 0 : 1;
  }
  process.exit(fallos ? 1 : 0);
}
process.exit(await una(nombre, args.slice(1)));
