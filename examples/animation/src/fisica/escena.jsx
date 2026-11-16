// El decorado: pared, toldo, postes, rótulo, caja, mostrador y etiqueta. Todo es SVG dibujado con código.
// Cada pieza recibe `tema` (los colores ya derivados de la paleta) y, si se mueve, su pose del fotograma.
import React from 'react';
import {ALTO, ANCHO, CAJA, ETIQUETA, MOSTRADOR, POSTE, ROTULO, TOLDO} from './ajustes.js';
import {aclara, ajusta, azar, conAlfa, entraSale, generador, luz, mezcla, oscurece} from './util.js';

const DESTELLO = {desde: 6.85, dura: 0.7};          // cuándo cruza la franja de luz por la etiqueta (segundos)
const BARRIDO = {desde: 6.1, dura: 0.95};           // cuándo cruza la franja de luz por el nombre gigante

const n1 = (v) => Math.round(v * 10) / 10;

// ---------- Colores derivados de la paleta ----------
export const crearTema = (p) => {
  const letraOscura = luz(p.letras) < 0.5, paredOscura = luz(p.pared) < 0.45;
  return {
    ...p,
    paredOscura,
    letraOscura,
    paredLuz: aclara(p.pared, paredOscura ? 0.1 : 0.22),
    paredSombra: oscurece(p.pared, paredOscura ? 0.3 : 0.12),
    letraCara: letraOscura ? p.letras : oscurece(p.letras, 0.04),
    letraPie: letraOscura ? oscurece(p.letras, 0.22) : oscurece(ajusta(p.letras, {s: 0.1}), 0.1),
    letraTapa: letraOscura ? aclara(ajusta(p.letras, {s: -0.02, h: -6}), 0.36) : '#ffffff',
    sombra: paredOscura ? 'rgba(4,10,30,0.5)' : conAlfa(oscurece(ajusta(p.pared, {s: 0.25}), 0.72), 0.34),
    maderaLuz: aclara(p.madera, 0.3),
    maderaMedia: oscurece(p.madera, 0.12),
    maderaOsc: oscurece(ajusta(p.madera, {s: 0.05}), 0.3),
    maderaHonda: oscurece(ajusta(p.madera, {s: 0.1, h: -6}), 0.58),
    mostrador: p.mostrador || p.toldo,
    mostradorOsc: oscurece(p.mostrador || p.toldo, 0.28),
    cuerda: '#D9BE8E',
    cuerdaOsc: '#8E6F45',
  };
};

// Vetas de madera: rayas finas algo onduladas, siempre las mismas para la misma semilla
const Vetas = ({x, y, w, h, n, semilla, color, vertical = false, op = 0.35}) => {
  const lineas = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.3 + azar(semilla + i) * 0.5) / n;
    const a = azar(semilla + i * 3.3) * 3 - 1.5, b = azar(semilla + i * 5.1) * 3 - 1.5;
    const ini = azar(semilla + i * 9.2) * 0.25, fin = 0.75 + azar(semilla + i * 2.7) * 0.25;
    if (vertical) {
      const px = x + w * k;
      lineas.push(`M${n1(px)} ${n1(y + h * ini)}C${n1(px + a)} ${n1(y + h * 0.4)} ${n1(px + b)} ${n1(y + h * 0.6)} ${n1(px)} ${n1(y + h * fin)}`);
    } else {
      const py = y + h * k;
      lineas.push(`M${n1(x + w * ini)} ${n1(py)}C${n1(x + w * 0.4)} ${n1(py + a)} ${n1(x + w * 0.6)} ${n1(py + b)} ${n1(x + w * fin)} ${n1(py)}`);
    }
  }
  return <path d={lineas.join('')} stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={op} />;
};

// ---------- Pared ----------
export const Pared = ({tema}) => (
  <>
    <defs>
      <radialGradient id="luzPared" gradientUnits="userSpaceOnUse" cx={ANCHO * 0.42} cy={760} r={1250}>
        <stop offset="0" stopColor={tema.paredLuz} />
        <stop offset="0.55" stopColor={tema.pared} />
        <stop offset="1" stopColor={tema.paredSombra} />
      </radialGradient>
      <linearGradient id="pieDePared" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity={tema.paredOscura ? 0.3 : 0.16} />
      </linearGradient>
    </defs>
    <rect width={ANCHO} height={ALTO} fill="url(#luzPared)" />
    <rect x={0} y={MOSTRADOR.y - 150} width={ANCHO} height={150} fill="url(#pieDePared)" />
  </>
);

// ---------- Postes laterales (son las paredes de la física) ----------
export const Postes = ({tema}) => (
  <>
    <defs>
      <linearGradient id="poste" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={tema.maderaOsc} />
        <stop offset="0.45" stopColor={tema.maderaMedia} />
        <stop offset="1" stopColor={tema.madera} />
      </linearGradient>
      <linearGradient id="sombraPoste" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.22" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </linearGradient>
    </defs>
    {[0, 1].map((lado) => (
      <g key={lado} transform={lado ? `translate(${ANCHO} 0) scale(-1 1)` : undefined}>
        <rect x={POSTE} y={TOLDO.alto - 20} width={22} height={MOSTRADOR.y - TOLDO.alto + 20} fill="url(#sombraPoste)" />
        <rect x={0} y={TOLDO.alto - 40} width={POSTE} height={MOSTRADOR.y - TOLDO.alto + 40} fill="url(#poste)" />
        <rect x={POSTE - 3} y={TOLDO.alto - 40} width={3} height={MOSTRADOR.y - TOLDO.alto + 40} fill={tema.maderaLuz} opacity={0.55} />
        <Vetas x={3} y={TOLDO.alto} w={POSTE - 8} h={MOSTRADOR.y - TOLDO.alto} n={4} semilla={31 + lado * 17} color={tema.maderaHonda} vertical op={0.3} />
      </g>
    ))}
  </>
);

// ---------- Rótulo ----------
// rotulo: lo que devuelve componerRotulo · muelles: [hundimiento, giro] por letra en este fotograma
// tipo: la línea fina ya medida ({partes: [{texto, x}], tam, espaciado}) · t: segundos
export const Rotulo = ({tema, rotulo, muelles, fuente, fuenteFina, tipo, t = 0}) => {
  const mov = (k) => {
    const L = rotulo.letras[k];
    const dy = muelles ? muelles[k * 2] : 0, g = muelles ? muelles[k * 2 + 1] : 0;
    return `translate(0 ${n1(dy)}) rotate(${Math.round(g * 100) / 100} ${n1(L.cx)} ${n1(L.cy)})`;
  };
  const y0 = rotulo.cajaNombre.y0, y1 = rotulo.base;
  const kBarrido = entraSale((t - BARRIDO.desde) / BARRIDO.dura);
  return (
    <>
      <defs>
        <linearGradient id="caraLetra" gradientUnits="userSpaceOnUse" x1="0" y1={y0} x2="0" y2={y1}>
          <stop offset="0" stopColor={tema.letraCara} />
          <stop offset="1" stopColor={tema.letraPie} />
        </linearGradient>
        <clipPath id="recorteNombre">
          {rotulo.letras.slice(0, rotulo.nGrandes).map((L, k) => (
            <text key={k} x={L.x} y={L.base} fontFamily={fuente} fontSize={L.tam}>{L.car}</text>
          ))}
        </clipPath>
        <linearGradient id="barrido" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={tema.letraOscura ? 0.3 : 0.75} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="difuminaLetras" filterUnits="userSpaceOnUse" x={0} y={220} width={ANCHO} height={700}>
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>
      {/* línea fina, pintada en la pared */}
      {tipo.partes.map((parte) => (
        <text key={parte.texto} x={n1(parte.x)} y={rotulo.base + ROTULO.sepTipo} fontFamily={fuenteFina} fontWeight={600} fontSize={tipo.tam} letterSpacing={n1(tipo.espaciado)} fill={tema.letras} opacity={0.92}>
          {parte.texto}
        </text>
      ))}
      {/* sombra blanda de las letras sobre la pared */}
      <g filter="url(#difuminaLetras)" fill={tema.sombra} transform="translate(7 20)">
        {rotulo.letras.map((L, k) => (
          <text key={k} x={L.x} y={L.base} fontFamily={fuente} fontSize={L.tam}>{L.car}</text>
        ))}
      </g>
      {rotulo.letras.map((L, k) => {
        const fondo = k < rotulo.nGrandes ? ROTULO.fondoTapa : Math.round(ROTULO.fondoTapa * 0.55);
        const tapas = [];
        for (let d = fondo; d >= 1; d--) tapas.push(<text key={d} x={L.x} y={L.base - d} fontFamily={fuente} fontSize={L.tam} fill={d === fondo ? mezcla(tema.letraTapa, '#ffffff', 0.25) : tema.letraTapa}>{L.car}</text>);
        return (
          <g key={k} transform={mov(k)}>
            {tapas}
            <text x={L.x} y={L.base} fontFamily={fuente} fontSize={L.tam} fill={k < rotulo.nGrandes ? 'url(#caraLetra)' : tema.letraCara}>{L.car}</text>
          </g>
        );
      })}
      {/* barrido de luz final sobre las caras de las letras (cuando ya está todo quieto) */}
      {kBarrido > 0 && kBarrido < 1 ? (
        <g clipPath="url(#recorteNombre)">
          <rect x={n1(-260 + (ANCHO + 520) * kBarrido)} y={y0 - 30} width={170} height={y1 - y0 + 60} transform={`skewX(-20)`} fill="url(#barrido)" />
        </g>
      ) : null}
    </>
  );
};

// ---------- Caja de madera ----------
const dentroX0 = CAJA.x0 + CAJA.pared, dentroX1 = CAJA.x1 - CAJA.pared;

// Lo que queda DETRÁS de la fruta: fondo, paredes y suelo
export const CajaDetras = ({tema}) => {
  const RENDIJA = 13, altoTabla = (CAJA.fondo - CAJA.borde - 4 - 2 * RENDIJA) / 3;
  return (
    <>
      <defs>
        <linearGradient id="hondoCaja" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="paredCaja" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={tema.maderaMedia} />
          <stop offset="0.5" stopColor={tema.madera} />
          <stop offset="1" stopColor={tema.maderaMedia} />
        </linearGradient>
        <radialGradient id="sombraSuelo">
          <stop offset="0" stopColor="#000" stopOpacity="0.4" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* sombra de la caja sobre el mostrador */}
      <ellipse cx={ANCHO / 2 + 8} cy={CAJA.base + 2} rx={(CAJA.x1 - CAJA.x0) / 2 + 40} ry={20} fill="url(#sombraSuelo)" />
      {/* fondo: tres tablas en penumbra con rendijas por las que se ve la pared */}
      <rect x={dentroX0 - 2} y={CAJA.borde + 4} width={dentroX1 - dentroX0 + 4} height={CAJA.fondo - CAJA.borde - 2} fill={oscurece(tema.pared, tema.paredOscura ? 0.45 : 0.3)} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={dentroX0 - 2} y={CAJA.borde + 4 + i * (altoTabla + RENDIJA)} width={dentroX1 - dentroX0 + 4} height={altoTabla} rx={2} fill={tema.maderaOsc} />
          <rect x={dentroX0 - 2} y={CAJA.borde + 4 + i * (altoTabla + RENDIJA)} width={dentroX1 - dentroX0 + 4} height={4} fill={tema.maderaMedia} opacity={0.5} />
          <Vetas x={dentroX0 + 10} y={CAJA.borde + 12 + i * (altoTabla + RENDIJA)} w={dentroX1 - dentroX0 - 20} h={altoTabla - 16} n={4} semilla={70 + i * 13} color={tema.maderaHonda} op={0.5} />
        </g>
      ))}
      <rect x={dentroX0 - 2} y={CAJA.borde + 4} width={dentroX1 - dentroX0 + 4} height={CAJA.fondo - CAJA.borde - 4} fill="url(#hondoCaja)" />
      {/* suelo */}
      <rect x={CAJA.x0} y={CAJA.fondo} width={CAJA.x1 - CAJA.x0} height={CAJA.base - CAJA.fondo} fill={tema.maderaMedia} />
      {/* paredes: cara de arriba (clara) + frente */}
      {[CAJA.x0, CAJA.x1 - CAJA.pared].map((x, i) => (
        <g key={i}>
          <rect x={x} y={CAJA.borde - 9} width={CAJA.pared} height={12} rx={2} fill={tema.maderaLuz} />
          <rect x={x} y={CAJA.borde} width={CAJA.pared} height={CAJA.base - CAJA.borde} fill="url(#paredCaja)" />
          <Vetas x={x + 3} y={CAJA.borde + 6} w={CAJA.pared - 6} h={CAJA.base - CAJA.borde - 12} n={3} semilla={90 + i * 7} color={tema.maderaHonda} vertical op={0.32} />
        </g>
      ))}
    </>
  );
};

// Lo que queda DELANTE de la fruta: el listón de abajo
export const CajaDelante = ({tema}) => {
  const y = CAJA.base - CAJA.liston, x = CAJA.x0 - 7, w = CAJA.x1 - CAJA.x0 + 14;
  return (
    <>
      <defs>
        <linearGradient id="liston" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={aclara(tema.madera, 0.12)} />
          <stop offset="1" stopColor={tema.maderaMedia} />
        </linearGradient>
        <linearGradient id="sombraListon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect x={x + 6} y={y - 16} width={w - 12} height={16} fill="url(#sombraListon)" />
      <rect x={x} y={y - 5} width={w} height={8} rx={2} fill={tema.maderaLuz} />
      <rect x={x} y={y} width={w} height={CAJA.liston} rx={3} fill="url(#liston)" />
      <Vetas x={x + 30} y={y + 6} w={w - 60} h={CAJA.liston - 12} n={5} semilla={120} color={tema.maderaOsc} op={0.4} />
      {[x + 14, x + w - 14].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy={y + 17} r={4} fill={tema.maderaHonda} opacity={0.7} />
          <circle cx={cx} cy={y + CAJA.liston - 17} r={4} fill={tema.maderaHonda} opacity={0.7} />
          <circle cx={cx - 1} cy={y + 16} r={1.4} fill="#fff" opacity={0.5} />
          <circle cx={cx - 1} cy={y + CAJA.liston - 18} r={1.4} fill="#fff" opacity={0.5} />
        </g>
      ))}
    </>
  );
};

// ---------- Mostrador ----------
// Queda por debajo de la zona segura de Instagram: es decorado. El texto del pie se puede quitar con pie: false.
export const Mostrador = ({tema, pie, fuenteFina}) => {
  const y = MOSTRADOR.y, t = MOSTRADOR.tabla;
  const px = 54, py = y + t + 64, pw = ANCHO - 2 * px, ph = 196;       // panel enmarcado
  return (
    <>
      <defs>
        <linearGradient id="tabla" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tema.maderaMedia} />
          <stop offset="1" stopColor={tema.maderaOsc} />
        </linearGradient>
        <linearGradient id="bajoTabla" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.4" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="frente" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tema.mostrador} />
          <stop offset="1" stopColor={tema.mostradorOsc} />
        </linearGradient>
      </defs>
      <rect x={0} y={y + t} width={ANCHO} height={ALTO - y - t} fill="url(#frente)" />
      {/* molduras: con texto, un panel ancho; sin texto, tres paneles lisos */}
      {(pie ? [[px, pw]] : [0, 1, 2].map((i) => [px + i * ((pw + 24) / 3), (pw - 48) / 3])).map(([x, w]) => (
        <g key={x}>
          <rect x={x} y={py} width={w} height={ph} rx={10} fill="#000" opacity={0.13} />
          <rect x={x} y={py} width={w} height={ph} rx={10} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={3} />
          <rect x={x + 2} y={py + 3} width={w - 4} height={ph - 3} rx={9} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={2} />
          <rect x={x + 18} y={py + 18} width={w - 36} height={ph - 36} rx={5} fill="none" stroke={tema.claro} strokeOpacity={0.22} strokeWidth={2} />
        </g>
      ))}
      {/* zócalo */}
      <rect x={0} y={ALTO - 86} width={ANCHO} height={86} fill="#000" opacity={0.2} />
      <rect x={0} y={ALTO - 86} width={ANCHO} height={3} fill="#fff" opacity={0.08} />
      <rect x={0} y={y + t} width={ANCHO} height={50} fill="url(#bajoTabla)" />
      {/* tabla del mostrador */}
      <rect x={0} y={y} width={ANCHO} height={t} fill="url(#tabla)" />
      <rect x={0} y={y} width={ANCHO} height={3} fill={tema.maderaLuz} opacity={0.6} />
      <Vetas x={20} y={y + 6} w={ANCHO - 40} h={t - 12} n={3} semilla={150} color={tema.maderaHonda} op={0.3} />
      {pie ? (
        <text x={ANCHO / 2} y={py + ph / 2 + pie.tam * 0.34} textAnchor="middle" fontFamily={fuenteFina} fontWeight={600} fontSize={pie.tam} letterSpacing={2} fill={tema.claro} opacity={0.96}>
          {pie.texto}
        </text>
      ) : null}
    </>
  );
};

// Franja de mostrador que se ve por detrás de la caja (la cara de arriba, donde apoya)
export const MostradorDetras = ({tema}) => (
  <rect x={0} y={MOSTRADOR.y - 20} width={ANCHO} height={22} fill={mezcla(tema.madera, tema.maderaLuz, 0.4)} />
);

// ---------- Toldo ----------
const siluetaToldo = () => {
  const w = ANCHO / TOLDO.rayas, r = TOLDO.onda;
  let d = `M0 -10H${ANCHO}V${TOLDO.alto}`;
  for (let i = TOLDO.rayas - 1; i >= 0; i--) d += `A${w / 2} ${r} 0 0 1 ${n1(i * w)} ${TOLDO.alto}`;
  return d + 'Z';
};
export const SombraToldo = () => (
  <>
    <defs>
      <filter id="difuminaToldo" filterUnits="userSpaceOnUse" x={-40} y={0} width={ANCHO + 80} height={TOLDO.alto + TOLDO.onda + 120}>
        <feGaussianBlur stdDeviation="13" />
      </filter>
    </defs>
    <path d={siluetaToldo()} transform="translate(0 22)" fill="#000" opacity={0.3} filter="url(#difuminaToldo)" />
  </>
);
// El volante se mece: cada onda es un faldón suelto que se inclina un poco, más cuando pasa la fruta.
// t en segundos. Es una función pura del tiempo (suma de senos), no hay estado.
const campana = (t, centro, ancho) => Math.exp(-Math.pow((t - centro) / ancho, 2));
const inclinacion = (i, t) => {
  const calma = 0.9 * Math.sin(2.2 * t + i * 0.7) + 0.5 * Math.sin(5.2 * t + i * 1.9);
  const racha = 0.7 * campana(t, 1.0, 0.35) + 0.8 * campana(t, 1.75, 0.35) + 2.2 * campana(t, 2.75, 0.5) + 1.3 * campana(t, 5.05, 0.3);
  return calma + racha * (1.6 * Math.sin(13 * t + i * 1.3) + 0.9 * Math.sin(21 * t + i * 2.6));
};
export const Toldo = ({tema, t = 0}) => {
  const w = ANCHO / TOLDO.rayas, r = TOLDO.onda, costura = TOLDO.alto - 12;
  const color = (i) => (i % 2 ? tema.claro : tema.toldo);
  const faldon = (i) => `M${n1(i * w - 0.6)} ${costura - 2}H${n1((i + 1) * w + 0.6)}V${TOLDO.alto}A${w / 2 + 0.6} ${r} 0 0 1 ${n1(i * w - 0.6)} ${TOLDO.alto}Z`;
  return (
    <>
      <defs>
        <linearGradient id="plieguesToldo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={TOLDO.alto + r}>
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {/* volante: un faldón por raya, cada uno con su inclinación */}
      {Array.from({length: TOLDO.rayas}, (_, i) => (
        <g key={i} transform={`translate(0 ${costura}) skewX(${n1(inclinacion(i, t))}) translate(0 ${-costura})`}>
          <path d={faldon(i)} fill={color(i)} />
          <path d={faldon(i)} fill="url(#plieguesToldo)" />
        </g>
      ))}
      {/* lona de arriba, fija */}
      {Array.from({length: TOLDO.rayas}, (_, i) => (
        <rect key={i} x={n1(i * w)} y={-12} width={n1(w + 0.5)} height={costura + 12} fill={color(i)} />
      ))}
      <rect x={0} y={-12} width={ANCHO} height={costura + 12} fill="url(#plieguesToldo)" />
      {/* pespunte donde empieza el volante */}
      <path d={`M0 ${TOLDO.alto - 12}H${ANCHO}`} stroke="#000" strokeOpacity={0.14} strokeWidth={2} strokeDasharray="10 8" />
    </>
  );
};

// ---------- Etiqueta de precio ----------
// pose: {cuerda: [[x, y], …], x, y, a} · textos: {producto, tamProducto, precio, unidad, tamPrecio}
const suave = (p) => {
  let d = `M${n1(p[0][0])} ${n1(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
    d += `Q${n1(p[i][0])} ${n1(p[i][1])} ${n1(mx)} ${n1(my)}`;
  }
  const u = p[p.length - 1];
  return d + `L${n1(u[0])} ${n1(u[1])}`;
};
export const Etiqueta = ({tema, pose, textos, fuente, fuenteFina, t = 0}) => {
  const {ancho: w, alto: h, chaflan: c, ojal} = ETIQUETA;
  const silueta = `M${-w / 2 + c} ${-ojal}H${w / 2 - c}L${w / 2} ${c - ojal}V${h - ojal}H${-w / 2}V${c - ojal}Z`;
  const m = 15;
  const marco = `M${-w / 2 + c + 4} ${-ojal + m}H${w / 2 - c - 4}L${w / 2 - m} ${c - ojal + 5}V${h - ojal - m}H${-w / 2 + m}V${c - ojal + 5}Z`;
  const cuerda = suave(pose.cuerda);
  const yProducto = 70, yRaya = 88, yPrecio = h - ojal - 40;      // medidas desde el ojal hacia abajo
  const kDestello = entraSale((t - DESTELLO.desde) / DESTELLO.dura);
  return (
    <>
      <defs>
        <filter id="sombraEtiqueta" x="-30%" y="-30%" width="160%" height="170%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <clipPath id="recorteCarton">
          <path d={silueta} />
        </clipPath>
        <linearGradient id="destello" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="carton" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={aclara(tema.etiqueta, 0.1)} />
          <stop offset="1" stopColor={oscurece(tema.etiqueta, 0.12)} />
        </linearGradient>
      </defs>
      {/* sombra de la cuerda y de la etiqueta sobre lo que hay detrás */}
      <path d={cuerda} transform="translate(8 12)" stroke="#000" strokeOpacity={0.16} strokeWidth={6} fill="none" strokeLinecap="round" />
      <g transform={`translate(${n1(pose.x + 12)} ${n1(pose.y + 20)}) rotate(${n1((pose.a * 180) / Math.PI)})`} filter="url(#sombraEtiqueta)">
        <path d={silueta} fill="#000" opacity={0.36} />
      </g>
      {/* cuerda trenzada */}
      <path d={cuerda} stroke={tema.cuerdaOsc} strokeWidth={7.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={cuerda} stroke={tema.cuerda} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={cuerda} stroke={tema.cuerdaOsc} strokeWidth={4.5} fill="none" strokeDasharray="2.5 9" opacity={0.55} />
      <g transform={`translate(${n1(pose.x)} ${n1(pose.y)}) rotate(${n1((pose.a * 180) / Math.PI)})`}>
        <path d={silueta} fill="url(#carton)" stroke="url(#carton)" strokeWidth={10} strokeLinejoin="round" />
        <path d={marco} fill="none" stroke={tema.tinta} strokeWidth={2.5} strokeDasharray="9 7" strokeLinejoin="round" opacity={0.45} />
        <text x={0} y={yProducto} textAnchor="middle" fontFamily={fuenteFina} fontWeight={600} fontSize={textos.tamProducto} fill={tema.tinta}>{textos.producto}</text>
        <path d={`M${-w / 2 + 46} ${yRaya}H${w / 2 - 46}`} stroke={tema.tinta} strokeWidth={2.5} opacity={0.3} />
        <text x={0} y={yPrecio} textAnchor="middle" fontFamily={fuente} fontSize={textos.tamPrecio} fill={tema.acento}>
          {textos.precio}
          {textos.unidad ? <tspan fontSize={textos.tamPrecio * 0.46} fill={tema.tinta} dx={8}>{textos.unidad}</tspan> : null}
        </text>
        {/* destello final: una franja de luz cruza el cartón cuando ya está casi quieto */}
        {kDestello > 0 && kDestello < 1 ? (
          <g clipPath="url(#recorteCarton)">
            <rect x={n1(-w / 2 - 150 + (w + 300) * kDestello)} y={-ojal - 20} width={110} height={h + 40} transform="skewX(-22)" fill="url(#destello)" />
          </g>
        ) : null}
        {/* ojal metálico con el nudo */}
        <circle r={15} fill="#E9E2D0" />
        <circle r={15} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={2} />
        <circle r={8} fill={oscurece(tema.etiqueta, 0.6)} />
        <circle cx={0} cy={-3} r={6.5} fill={tema.cuerda} stroke={tema.cuerdaOsc} strokeWidth={2} />
      </g>
    </>
  );
};

// ---------- Grano ----------
// Una baldosa de ruido fino generada una vez (con semilla) y repetida: da textura de papel sin coste por fotograma.
let baldosa = null;
const ruido = () => {
  if (baldosa) return baldosa;
  const T = 256, c = document.createElement('canvas');
  c.width = T;
  c.height = T;
  const g = c.getContext('2d'), im = g.createImageData(T, T), dado = generador(99);
  for (let i = 0; i < T * T; i++) {
    const v = dado() * 255;
    im.data[i * 4] = v;
    im.data[i * 4 + 1] = v;
    im.data[i * 4 + 2] = v;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  baldosa = c.toDataURL('image/png');
  return baldosa;
};
export const Grano = ({fuerza = 0.07}) => (
  <>
    <defs>
      <pattern id="grano" width={256} height={256} patternUnits="userSpaceOnUse">
        <image href={ruido()} width={256} height={256} />
      </pattern>
    </defs>
    <rect width={ANCHO} height={ALTO} fill="url(#grano)" opacity={fuerza} style={{mixBlendMode: 'overlay'}} />
  </>
);
