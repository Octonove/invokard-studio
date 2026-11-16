// Dibujo de cada fruta en SVG. Todo se dibuja en «unidades de fruta» dentro de un grupo escalado por su tamaño.
// Truco de acabado: el dibujo (rabito, hoja, poros, pepitas) gira con el cuerpo, pero la luz NO: el degradado
// y el brillo se quedan fijos respecto a la pantalla, como si hubiera un foco arriba a la izquierda.
import React from 'react';
import {FORMAS} from './formas.js';
import {azar, mezcla, tonos} from './util.js';

const VERDE_HOJA = '#3F9B4B', VERDE_HOJA_OSC = '#2A7A3B', VERDE_MANZANA = '#9CCB3B';
const n2 = (v) => Math.round(v * 100) / 100;

// Estela de movimiento (motion blur): obturador = fracción del fotograma que «está abierta la cámara»
const OBTURADOR = 0.25, UMBRAL_ESTELA = 7, PASO_ESTELA = 0.04, NIVELES = 18;

// Color de piel de una pieza (el de datos.js si lo trae; las manzanas alternan rojo y verde)
export const colorDe = (p) => p.color || (p.tipo === 'manzana' && p.semilla % 3 === 0 ? VERDE_MANZANA : FORMAS[p.tipo].color);
export const claveDe = (p) => `${p.tipo}-${colorDe(p).replace('#', '')}`;

// ---------- Trozos reutilizables (se definen una vez en <defs> y se clonan con <use>) ----------
const HOJA = 'M0 0C0.25 -0.42 0.75 -0.38 1 0C0.75 0.3 0.25 0.36 0 0Z';
const estrella = (cx, cy, r1, r2, n) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = (i * Math.PI) / n - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${n2(cx + r * Math.cos(a))} ${n2(cy + r * Math.sin(a))}`;
  }
  return d + 'Z';
};
const mediaLuna = (r, c) => `M${-r} ${-c}L${r} ${-c}A${r} ${r} 0 0 1 ${-r} ${-c}Z`;

// poros repartidos dentro de un óvalo (rx, ry): puntitos que dejan ver que la fruta gira
const poros = (semilla, n, rx, ry) => {
  const sal = [];
  for (let i = 0; i < n; i++) {
    const a = azar(semilla + i * 3.1) * Math.PI * 2, r = Math.sqrt(azar(semilla + i * 7.7)) * 0.86;
    sal.push(<circle key={i} cx={n2(Math.cos(a) * r * rx)} cy={n2(Math.sin(a) * r * ry)} r={n2(0.02 + azar(semilla + i) * 0.014)} />);
  }
  return sal;
};

// pepitas de la fresa, por filas, siguiendo la anchura del contorno
const pepitas = () => {
  const f = FORMAS.fresa, sal = [];
  const filas = [[-0.42, 3], [-0.1, 4], [0.22, 3], [0.52, 2], [0.78, 1]];
  filas.forEach(([y, n], j) => {
    const semi = Math.max(...f.contorno.filter(([, cy]) => Math.abs(cy - y) < 0.09).map(([cx]) => Math.abs(cx))) * 0.74;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -semi + (2 * semi * i) / (n - 1);
      sal.push(
        <g key={`${j}-${i}`} transform={`translate(${n2(x)} ${n2(y + (i % 2 ? 0.03 : -0.03))})`}>
          <ellipse cx={0} cy={-0.035} rx={0.062} ry={0.075} fill="#9E1027" opacity={0.55} />
          <ellipse rx={0.045} ry={0.066} fill="#FFE49A" />
        </g>,
      );
    }
  });
  return sal;
};

// Definiciones comunes: se montan una sola vez por fotograma
export const DefsFrutas = ({piezas}) => {
  const vistos = new Map();
  piezas.forEach((p) => vistos.set(claveDe(p), {tipo: p.tipo, color: colorDe(p)}));
  const yTop = Math.min(...FORMAS.fresa.contorno.map(([, y]) => y));
  return (
    <defs>
      {/* sombra blanda que cada pieza echa sobre lo que tiene detrás */}
      <radialGradient id="fs">
        <stop offset="0" stopColor="#1a0d00" stopOpacity="0.36" />
        <stop offset="0.55" stopColor="#1a0d00" stopOpacity="0.15" />
        <stop offset="1" stopColor="#1a0d00" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="rubor">
        <stop offset="0" stopColor="#FFD86B" stopOpacity="0.55" />
        <stop offset="1" stopColor="#FFD86B" stopOpacity="0" />
      </radialGradient>
      {/* un degradado de luz fija por cada color de fruta que haya en la mezcla */}
      {[...vistos.entries()].map(([k, {tipo, color}]) => {
        const t = tonos(tipo === 'rodaja' ? mezcla(color, '#FFE27A', 0.45) : color);
        return (
          <radialGradient key={k} id={`lz-${k}`} gradientUnits="userSpaceOnUse" cx={-0.36} cy={-0.44} r={1.62}>
            <stop offset="0" stopColor={t.claro} />
            <stop offset="0.5" stopColor={t.base} />
            <stop offset="1" stopColor={t.oscuro} />
          </radialGradient>
        );
      })}
      {[...vistos.entries()].filter(([, v]) => v.tipo === 'platano').map(([k, {color}]) => <DetallePlatano key={k} id={`det-${k}`} t={tonos(color)} />)}
      {/* estela de movimiento: desenfoque solo a lo largo de la trayectoria, en varios grados */}
      {Array.from({length: NIVELES}, (_, i) => (
        <filter key={i} id={`mb${i + 1}`} x="-130%" y="-35%" width="360%" height="170%">
          <feGaussianBlur stdDeviation={`${n2((i + 1) * PASO_ESTELA)} 0`} />
        </filter>
      ))}
      <g id="poros-a">{poros(11, 16, 0.92, 0.92)}</g>
      <g id="poros-b">{poros(47, 16, 0.92, 0.92)}</g>
      <g id="poros-l">{poros(83, 11, 0.78, 0.55)}</g>
      <g id="pepitas">{pepitas()}</g>
      <g id="hoja">
        <path d={HOJA} fill={VERDE_HOJA} />
        <path d="M0 0C0.25 0.36 0.75 0.3 1 0L0 0Z" fill={VERDE_HOJA_OSC} opacity={0.55} />
        <path d="M0.06 0L0.9 0" stroke="#D5F0B0" strokeWidth={0.03} strokeLinecap="round" opacity={0.7} fill="none" />
      </g>
      <g id="caliz" transform={`translate(0 ${n2(yTop + 0.1)})`}>
        {[-168, -128, -90, -52, -12, 20, 200].map((a, i) => (
          <path key={i} d="M0 0Q0.24 -0.17 0.5 0Q0.24 0.15 0 0Z" transform={`rotate(${a}) scale(${i > 4 ? 0.82 : 1})`} fill={i % 2 ? VERDE_HOJA : VERDE_HOJA_OSC} />
        ))}
        <path d="M0 -0.04L0.03 -0.3" stroke="#3E7D3A" strokeWidth={0.09} strokeLinecap="round" />
        <circle r={0.1} fill={VERDE_HOJA_OSC} />
      </g>
    </defs>
  );
};

// ---------- Cuerpo de cada fruta ----------
// Reciben: p (pieza), k (clave de color), t (tonos), g (grados de giro), gid (id del degradado contra-girado)
const brillo = (cx, cy, rx, ry, giro, op) => (
  <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${giro} ${cx} ${cy})`} fill="#fff" opacity={op} />
    <circle cx={cx - rx * 0.35} cy={cy - ry * 0.2} r={Math.min(rx, ry) * 0.42} fill="#fff" opacity={Math.min(0.9, op + 0.3)} />
  </>
);

const Naranja = ({p, k, t, g}) => (
  <>
    <circle r={1} fill={`url(#lz-${k})`} />
    <circle r={0.985} fill="none" stroke={t.hondo} strokeWidth={0.03} opacity={0.3} />
    <g transform={`rotate(${g})`}>
      <use href={p.semilla % 2 ? '#poros-a' : '#poros-b'} fill={t.hondo} opacity={0.34} />
      {p.semilla % 5 < 2 ? <use href="#hoja" transform="translate(0.03 -0.76) rotate(-38) scale(0.66)" /> : null}
      <path d={estrella(0, -0.72, 0.12, 0.05, 5)} fill="#4E7F38" />
      <circle cx={0} cy={-0.72} r={0.04} fill="#2F5A27" />
    </g>
    {brillo(-0.42, -0.46, 0.25, 0.14, -40, 0.42)}
  </>
);

const Arandano = ({k, t, g}) => (
  <>
    <circle r={1} fill={`url(#lz-${k})`} />
    <g transform={`rotate(${g})`}>
      <path d={estrella(0, -0.5, 0.36, 0.17, 5)} fill={t.hondo} />
      <circle cx={0} cy={-0.5} r={0.11} fill={t.oscuro} />
    </g>
    <ellipse cx={-0.34} cy={-0.38} rx={0.36} ry={0.2} transform="rotate(-40 -0.34 -0.38)" fill="#D3DCFF" opacity={0.42} />
  </>
);

const Manzana = ({k, t, g, gid}) => (
  <>
    <defs>
      <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
    </defs>
    <g transform={`rotate(${g})`}>
      <path d={FORMAS.manzana.camino} fill={`url(#${gid})`} />
      <ellipse cx={0.24} cy={0.08} rx={0.52} ry={0.72} fill="url(#rubor)" />
      <path d="M-0.5 -0.5Q-0.64 0 -0.44 0.58M0.62 -0.46Q0.76 0.05 0.54 0.56" stroke={t.claro} strokeWidth={0.04} strokeLinecap="round" opacity={0.3} fill="none" />
      <ellipse cx={0} cy={-0.76} rx={0.24} ry={0.085} fill={t.hondo} opacity={0.6} />
      <path d="M0 -0.74Q0.02 -1 0.15 -1.17" stroke="#6B4423" strokeWidth={0.085} strokeLinecap="round" fill="none" />
      <use href="#hoja" transform="translate(0.06 -0.96) rotate(-20) scale(0.62)" />
    </g>
    {brillo(-0.44, -0.4, 0.17, 0.3, 26, 0.3)}
  </>
);

const Limon = ({k, t, g, gid}) => (
  <>
    <defs>
      <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
    </defs>
    <g transform={`rotate(${g})`}>
      <path d={FORMAS.limon.camino} fill={`url(#${gid})`} />
      <use href="#poros-l" fill={t.hondo} opacity={0.32} />
      <path d="M0.97 -0.1Q1.14 0 0.97 0.1Q0.93 0 0.97 -0.1Z" fill={t.oscuro} opacity={0.75} />
      <circle cx={-0.96} cy={0} r={0.06} fill="#6B8F3A" />
    </g>
    {brillo(-0.32, -0.3, 0.24, 0.11, -30, 0.4)}
  </>
);

const Fresa = ({k, g, gid}) => (
  <>
    <defs>
      <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
    </defs>
    <g transform={`rotate(${g})`}>
      <path d={FORMAS.fresa.camino} fill={`url(#${gid})`} />
      <use href="#pepitas" />
      <use href="#caliz" />
    </g>
    <ellipse cx={-0.34} cy={-0.2} rx={0.13} ry={0.24} transform="rotate(22 -0.34 -0.2)" fill="#fff" opacity={0.3} />
  </>
);

const Sandia = ({k, g, gid}) => {
  const c = FORMAS.sandia.cLuna;
  const pepas = [];
  [[0.54, [28, 59, 90, 121, 152]], [0.27, [48, 90, 132]]].forEach(([r, angs], j) =>
    angs.forEach((a, i) => {
      const rad = (a * Math.PI) / 180;
      pepas.push(
        <ellipse key={`${j}-${i}`} cx={n2(r * Math.cos(rad))} cy={n2(-c + r * Math.sin(rad))} rx={0.03} ry={0.058}
          transform={`rotate(${a - 90} ${n2(r * Math.cos(rad))} ${n2(-c + r * Math.sin(rad))})`} fill="#2B1A1F" />,
      );
    }),
  );
  return (
    <>
      <defs>
        <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
      </defs>
      <g transform={`rotate(${g})`}>
        <path d={mediaLuna(1, c)} fill="#1F7A43" stroke="#1F7A43" strokeWidth={0.03} strokeLinejoin="round" />
        <path d={mediaLuna(0.93, c)} fill="#63BE62" />
        <path d={mediaLuna(0.87, c)} fill="#F5F8D6" />
        <path d={mediaLuna(0.815, c)} fill={`url(#${gid})`} />
        {pepas}
        <path d={`M-0.74 ${-c + 0.045}L0.74 ${-c + 0.045}`} stroke="#fff" strokeWidth={0.035} strokeLinecap="round" opacity={0.28} />
      </g>
    </>
  );
};

const Rodaja = ({k, t, g, gid}) => {
  const c = FORMAS.rodaja.cLuna, N = 5, r = 0.8;
  const gajos = [];
  for (let i = 0; i < N; i++) {
    const a0 = ((i * 180) / N + 5) * (Math.PI / 180), a1 = (((i + 1) * 180) / N - 5) * (Math.PI / 180);
    const q = (a, rr) => `${n2(rr * Math.cos(a))} ${n2(-c + 0.06 + rr * Math.sin(a))}`;
    gajos.push(<path key={i} d={`M${q((a0 + a1) / 2, 0.1)}L${q(a0, r)}A${r} ${r} 0 0 1 ${q(a1, r)}Z`} fill={`url(#${gid})`} stroke={`url(#${gid})`} strokeWidth={0.05} strokeLinejoin="round" />);
  }
  return (
    <>
      <defs>
        <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
      </defs>
      <g transform={`rotate(${g})`}>
        <path d={mediaLuna(1, c)} fill={t.base} stroke={t.base} strokeWidth={0.03} strokeLinejoin="round" />
        <path d={mediaLuna(0.91, c)} fill="#FFF6DC" />
        {gajos}
        <path d={`M-0.7 ${-c + 0.045}L0.7 ${-c + 0.045}`} stroke="#fff" strokeWidth={0.035} strokeLinecap="round" opacity={0.3} />
      </g>
    </>
  );
};

// Detalle del plátano (facetas, arista y puntas): se define una vez por color y se clona
const puntoPlatano = (k, r) => {
  const f = FORMAS.platano, fi = k * f.alfa;
  return [r * Math.sin(fi) - f.centro[0], r * Math.cos(fi) - f.centro[1]];
};
// franja entre dos «alturas» del grosor (fa y fb, de -1 = borde de dentro a 1 = borde de fuera)
const franjaPlatano = (fa, fb, k0, k1, n = 16) => {
  const a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const k = k0 + ((k1 - k0) * i) / n, h = FORMAS.platano.grosor(k);
    a.push(puntoPlatano(k, 1 + fa * h));
    b.push(puntoPlatano(k, 1 + fb * h));
  }
  return 'M' + a.concat(b.reverse()).map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L') + 'Z';
};
const DetallePlatano = ({id, t}) => {
  const [ax, ay] = puntoPlatano(-1, 1), [bx, by] = puntoPlatano(1, 1);
  const al = FORMAS.platano.alfa;
  // tangente en cada punta (hacia fuera)
  const tb = [Math.cos(al), -Math.sin(al)], ta = [-Math.cos(al), -Math.sin(al)];
  return (
    <g id={id}>
      <path d={franjaPlatano(0.3, 1, -0.97, 0.97)} fill={t.oscuro} opacity={0.34} />
      <path d={franjaPlatano(0.24, 0.36, -0.9, 0.92)} fill={t.hondo} opacity={0.3} />
      <path d={franjaPlatano(-0.78, -0.42, -0.72, 0.78)} fill="#fff" opacity={0.26} />
      {/* rabo (derecha) y punta de la flor (izquierda) */}
      <path d={`M${n2(bx - tb[0] * 0.03)} ${n2(by - tb[1] * 0.03)}l${n2(tb[0] * 0.15)} ${n2(tb[1] * 0.15)}`} stroke="#8C7B30" strokeWidth={0.105} strokeLinecap="round" />
      <path d={`M${n2(bx + tb[0] * 0.13)} ${n2(by + tb[1] * 0.13)}l${n2(tb[0] * 0.02)} ${n2(tb[1] * 0.02)}`} stroke="#4E3F1B" strokeWidth={0.1} strokeLinecap="round" />
      <path d={`M${n2(ax)} ${n2(ay)}l${n2(ta[0] * 0.035)} ${n2(ta[1] * 0.035)}`} stroke="#4A3718" strokeWidth={0.1} strokeLinecap="round" />
    </g>
  );
};

const Platano = ({k, g, gid}) => (
  <>
    <defs>
      <radialGradient id={gid} href={`#lz-${k}`} gradientTransform={`rotate(${-g})`} />
    </defs>
    <g transform={`rotate(${g})`}>
      <path d={FORMAS.platano.camino} fill={`url(#${gid})`} stroke={`url(#${gid})`} strokeWidth={0.05} strokeLinejoin="round" />
      <use href={`#det-${k}`} />
    </g>
  </>
);

const CUERPOS = {naranja: Naranja, arandano: Arandano, manzana: Manzana, limon: Limon, fresa: Fresa, sandia: Sandia, rodaja: Rodaja, platano: Platano};

// Una pieza en su pose: sombra blanda + cuerpo. x, y en píxeles; a en radianes; vx, vy en px por fotograma;
// vuelo (0..1) = cuánto se separa de lo que tiene detrás (aleja y ablanda su sombra).
export const Fruta = ({p, x, y, a, vx = 0, vy = 0, vuelo = 0}) => {
  const forma = FORMAS[p.tipo];
  const Cuerpo = CUERPOS[p.tipo];
  const g = n2((a * 180) / Math.PI);
  const t = tonos(colorDe(p));
  let cuerpo = <Cuerpo p={p} k={claveDe(p)} t={t} g={g} gid={`g${p.i}`} />;
  const v = Math.hypot(vx, vy);
  if (v > UMBRAL_ESTELA) {
    // cuanto más rápido va, más se estira el desenfoque en la dirección en la que se mueve
    const nivel = Math.min(NIVELES, Math.round((OBTURADOR * v) / 3.2 / p.R / PASO_ESTELA));
    if (nivel > 0) {
      const rumbo = n2((Math.atan2(vy, vx) * 180) / Math.PI);
      cuerpo = (
        <g transform={`rotate(${rumbo})`} filter={`url(#mb${nivel})`}>
          <g transform={`rotate(${-rumbo})`}>{cuerpo}</g>
        </g>
      );
    }
  }
  return (
    <g transform={`translate(${n2(x)} ${n2(y)}) scale(${n2(p.R)})`}>
      <g transform={`translate(${n2(0.1 + 0.34 * vuelo)} ${n2(0.27 + 0.62 * vuelo)}) rotate(${g})`} opacity={n2(1 - 0.3 * vuelo)}>
        <ellipse rx={n2(forma.sombra[0] * (1.3 + 0.24 * vuelo))} ry={n2(forma.sombra[1] * (1.3 + 0.24 * vuelo) + 0.1)} fill="url(#fs)" />
      </g>
      {cuerpo}
    </g>
  );
};
