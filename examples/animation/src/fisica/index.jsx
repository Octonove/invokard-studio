// «La Huerta»: el cartel de una frutería donde llueve fruta con física de verdad (Planck.js) dibujada en SVG.
//
//   Un fotograma:  node ../../skills/invokard-studio/animation/cli.mjs still src/fisica/index.jsx Fisica out/fisica-f090.png --frame 90
//   Vídeo final:   node ../../skills/invokard-studio/animation/cli.mjs render src/fisica/index.jsx Fisica out/fisica.mp4
//
// Composiciones: «Fisica» (datos principales) y «FisicaAlt» (datos alternativos). Lo que se cambia está en datos.js.
//
// Regla de oro: cada fotograma es función pura de su número. La simulación se calcula entera una vez por pestaña
// (preparar) y aquí solo se lee la pose que toca; por eso da igual en qué orden se pinten los fotogramas.
//
// Reparto del código:
//   datos.js       lo que se cambia para otro negocio      ajustes.js    medidas, física y calendario
//   letras.js      rótulo y silueta exacta de cada letra   formas.js     geometría de cada fruta
//   simulacion.js  la lluvia (Planck.js)                   etiqueta.js   la etiqueta colgada (Planck.js)
//   frutas.jsx     dibujo de la fruta                      escena.jsx    dibujo del decorado
import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame} from 'invokard-studio';
import {loadFont as cargarAnton} from 'invokard-studio/google-fonts/Anton';
import {loadFont as cargarBarlow} from 'invokard-studio/google-fonts/BarlowCondensed';
import {ALTO, ANCHO, CAJA, ETIQUETA, FOTOGRAMAS, FPS, MARGEN, ROTULO} from './ajustes.js';
import {ALTERNATIVO, DATOS} from './datos.js';
import {CajaDelante, CajaDetras, Etiqueta, Grano, Mostrador, MostradorDetras, Pared, Postes, Rotulo, SombraToldo, Toldo, crearTema} from './escena.jsx';
import {simularEtiqueta} from './etiqueta.js';
import {DefsFrutas, Fruta} from './frutas.jsx';
import {anchoTexto, componerRotulo} from './letras.js';
import {NP, simular} from './simulacion.js';
import {clamp} from './util.js';

// Las dos únicas familias: Anton para el rótulo y el precio, Barlow Condensed para el texto fino.
const anton = cargarAnton('normal', {weights: ['400'], subsets: ['latin']});
const barlow = cargarBarlow('normal', {weights: ['600'], subsets: ['latin']});
const FINA = barlow.fontFamily, GORDA = anton.fontFamily;

const DEPURAR = false;                                   // true: pinta encima los contornos con los que choca la física

// Ajusta textos a su hueco (se mide con la fuente real ya cargada). Un texto demasiado largo no se corta:
// se encoge hasta caber. Con los límites de letras que indica datos.js, nada baja de 40 px.
const medirTextos = (datos, rotulo) => {
  const fina = (tam) => `600 ${tam}px "${FINA}"`, gorda = (tam) => `${tam}px "${GORDA}"`;
  const encoge = (tam, pide, hueco) => (pide <= hueco ? tam : Math.max(24, Math.floor((tam * hueco) / pide)));

  // Línea fina, bajo el nombre gigante. La cuerda de la etiqueta cuelga por delante, así que se busca no cruzarla:
  //   1) si el texto lleva un «·», se parte en dos: un trozo a cada lado de la cuerda, alineados con los bordes del nombre;
  //   2) si no, entero a la izquierda de la cuerda cuando cabe con buen tamaño;
  //   3) y si tampoco, a todo lo ancho (la cuerda lo cruzará).
  const tipo = {partes: [], tam: ROTULO.tamTipo, espaciado: 0};
  const texto = String(datos.tipo || '').trim();
  if (texto) {
    const x0 = MARGEN + 2, x1 = rotulo.cajaNombre.x1 - 2, cuerda = rotulo.xEtiqueta, aire = 18;
    const ancho = (t, tam) => anchoTexto(t, fina(tam));
    const trozos = texto.split('·').map((t) => t.trim()).filter(Boolean);
    if (trozos.length === 2 && cuerda > x0 + 200 && cuerda < x1 - 120) {
      const [a, b] = trozos;
      for (let tam = ROTULO.tamTipo; tam >= 50 && !tipo.partes.length; tam -= 2) {
        // el mismo interletrado para los dos trozos: el mayor que cabe en ambos lados (entre el 3 % y el 24 % del cuerpo)
        const e = Math.min((cuerda - aire - x0 - ancho(a, tam)) / Math.max(1, a.length - 1), (x1 - cuerda - aire - ancho(b, tam)) / Math.max(1, b.length - 1), tam * 0.24);
        if (e >= tam * 0.03) {
          tipo.tam = tam;
          tipo.espaciado = e;
          tipo.partes = [{texto: a, x: x0}, {texto: b, x: x1 - ancho(b, tam) - (b.length - 1) * e}];
        }
      }
    }
    if (!tipo.partes.length) {
      const n = Math.max(1, texto.length - 1);
      const pide = (tam) => ancho(texto, tam) + n * tam * 0.03;
      const largo = x1 - x0, corto = cuerda - aire - x0;
      const hueco = corto >= largo * 0.55 && encoge(tipo.tam, pide(tipo.tam), corto) >= 50 ? corto : largo;
      tipo.tam = encoge(tipo.tam, pide(tipo.tam), hueco);
      tipo.espaciado = clamp((hueco - ancho(texto, tipo.tam)) / n, 0, tipo.tam * 0.3);
      tipo.partes = [{texto, x: x0}];
    }
  }

  // Etiqueta: nombre del producto arriba y precio (con su unidad) abajo
  const e = datos.etiqueta || {};
  const util = ETIQUETA.ancho - 76;
  const producto = String(e.producto || '').trim(), precio = String(e.precio || '').trim(), unidad = String(e.unidad || '').trim();
  const tamProducto = encoge(54, anchoTexto(producto, fina(54)), util);
  const tamPrecio = encoge(108, anchoTexto(precio, gorda(108)) + (unidad ? 8 + anchoTexto(unidad, gorda(108 * 0.46)) : 0), util);

  // Pie del mostrador
  let pie = null;
  if (datos.pie) {
    const texto = String(datos.pie).trim();
    pie = {texto, tam: encoge(50, anchoTexto(texto, fina(50)) + texto.length * 2, ANCHO - 2 * MARGEN - 96)};
  }
  return {tipo, etiqueta: {producto, precio, unidad, tamProducto, tamPrecio}, pie};
};

// Todo lo que se calcula una sola vez por pestaña y por juego de datos: rótulo, lluvia, etiqueta, textos y colores.
const memoria = new Map();
const preparar = (datos) => {
  const clave = JSON.stringify(datos);
  if (!memoria.has(clave)) {
    const rotulo = componerRotulo(datos, GORDA);
    memoria.set(clave, {
      rotulo,
      lluvia: simular(datos, rotulo.letras, rotulo.franja, rotulo.base),
      etiqueta: simularEtiqueta(rotulo.xEtiqueta),
      textos: medirTextos(datos, rotulo),
      tema: crearTema(datos.paleta),
    });
  }
  return memoria.get(clave);
};

// Capa de comprobación (solo con DEPURAR): contornos que usa la física y cuatro cifras de la simulación
const Depuracion = ({rotulo, lluvia, pose, textos}) => (
  <>
    <text x={70} y={930} fontSize={30} fontFamily="monospace" fill="#c0f">
      {`cuerpos: nombre ${rotulo.tam} · línea fina ${textos.tipo.tam} · producto ${textos.etiqueta.tamProducto} · precio ${textos.etiqueta.tamPrecio} · pie ${textos.pie ? textos.pie.tam : '-'}`}
    </text>
    <text x={70} y={880} fontSize={30} fontFamily="monospace" fill="#c0f">
      {`escala ${lluvia.escala.toFixed(3)} · piezas ${lluvia.piezas.length} · última calma f${Math.max(...lluvia.piezas.map((p) => p.calma ?? 0))} · se mueven ${lluvia.piezas.filter((p) => Math.hypot(pose[p.i * NP + 3], pose[p.i * NP + 4]) > 0.2).length}`}
    </text>
    <g fill="none" stroke="#ff00ff" strokeWidth={1.5}>
      {rotulo.letras.flatMap((L, k) => L.contornos.map((c, j) => <polygon key={`${k}-${j}`} points={c.map((q) => q.join(',')).join(' ')} />))}
      <rect x={CAJA.x0} y={CAJA.borde} width={CAJA.pared} height={CAJA.base - CAJA.borde} />
      <rect x={CAJA.x1 - CAJA.pared} y={CAJA.borde} width={CAJA.pared} height={CAJA.base - CAJA.borde} />
      <rect x={CAJA.x0} y={CAJA.fondo} width={CAJA.x1 - CAJA.x0} height={CAJA.base - CAJA.fondo} />
    </g>
  </>
);

// `semilla` es opcional: sirve para probar otra lluvia desde la línea de comandos (--props) sin tocar datos.js
const Escena = ({datos: datosBase, semilla}) => {
  const datos = useMemo(() => (semilla == null ? datosBase : {...datosBase, semilla}), [datosBase, semilla]);
  const f = clamp(useCurrentFrame(), 0, FOTOGRAMAS - 1), t = f / FPS;
  const [listo, setListo] = useState(false);
  const [espera] = useState(() => delayRender('fuentes y simulación'));
  useEffect(() => {
    // la silueta de las letras se lee de la fuente real: hay que esperarla antes de simular
    Promise.all([anton.waitUntilDone(), barlow.waitUntilDone()]).then(() => {
      preparar(datos);
      setListo(true);
      continueRender(espera);
    });
  }, [datos, espera]);
  if (!listo) return <AbsoluteFill style={{background: datos.paleta.pared}} />;

  const {rotulo, lluvia, etiqueta, textos, tema} = preparar(datos);
  const pose = lluvia.poses[f], muelles = lluvia.muelles[f], cam = lluvia.camara[f];
  const pinta = (p) => {
    const o = p.i * NP;
    let x = pose[o], y = pose[o + 1], a = pose[o + 2];
    if (Number.isNaN(x) || y < -p.R * 2) return null;                 // aún no ha nacido o sigue por encima del encuadre
    const peso = pose[o + 6];
    if (peso > 0.01) {
      // posada en una letra: sigue su temblor (hundimiento y giro alrededor del centro de la letra)
      const k = pose[o + 5], L = rotulo.letras[k];
      const g = (peso * muelles[k * 2 + 1] * Math.PI) / 180, c = Math.cos(g), s = Math.sin(g);
      const dx = x - L.cx, dy = y - L.cy;
      x = L.cx + dx * c - dy * s;
      y = L.cy + dx * s + dy * c + peso * muelles[k * 2];
      a += g;
    }
    // las que caen por delante echan la sombra más lejos mientras están en el aire
    const vuelo = pose[o + 7] * clamp((CAJA.borde + 30 - y) / 240);
    return <Fruta key={p.i} p={p} x={x} y={y} a={a} vx={pose[o + 3]} vy={pose[o + 4]} vuelo={vuelo} />;
  };
  return (
    <AbsoluteFill style={{background: tema.pared}}>
      <svg width={ANCHO} height={ALTO} viewBox={`0 0 ${ANCHO} ${ALTO}`}>
        <DefsFrutas piezas={lluvia.piezas} />
        {/* La cámara acusa los golpes fuertes: todo el decorado se mueve a la vez (con un pelín de aumento para no enseñar el borde). */}
        <g transform={`translate(${ANCHO / 2} ${ALTO / 2}) scale(1.012) translate(${-ANCHO / 2 + cam[0]} ${-ALTO / 2 + cam[1]})`}>
          {/* Orden de pintado, de atrás adelante: pared y rótulo · caja · fruta · listón de la caja · etiqueta · toldo */}
          <Pared tema={tema} />
          <Rotulo tema={tema} rotulo={rotulo} muelles={muelles} fuente={GORDA} fuenteFina={FINA} tipo={textos.tipo} t={t} />
          <MostradorDetras tema={tema} />
          <CajaDetras tema={tema} />
          <Postes tema={tema} />
          {/* primero las que se quedan en las letras; encima, las que caen por delante */}
          <g>{lluvia.piezas.filter((p) => p.queda).map(pinta)}</g>
          <g>{lluvia.piezas.filter((p) => !p.queda).map(pinta)}</g>
          <CajaDelante tema={tema} />
          <Mostrador tema={tema} pie={textos.pie} fuenteFina={FINA} />
          {etiqueta[f].y > -ETIQUETA.alto ? <Etiqueta tema={tema} pose={etiqueta[f]} textos={textos.etiqueta} fuente={GORDA} fuenteFina={FINA} t={t} /> : null}
          <SombraToldo />
          <Toldo tema={tema} t={t} />
          {DEPURAR ? <Depuracion rotulo={rotulo} lluvia={lluvia} pose={pose} textos={textos} /> : null}
        </g>
        <Grano />
      </svg>
    </AbsoluteFill>
  );
};

const Raiz = () => (
  <>
    <Composition id="Fisica" component={Escena} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FOTOGRAMAS} defaultProps={{datos: DATOS}} />
    <Composition id="FisicaAlt" component={Escena} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FOTOGRAMAS} defaultProps={{datos: ALTERNATIVO}} />
  </>
);

registerRoot(Raiz);
