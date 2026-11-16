// Dibujo del zorro a partir de la pose que calcula guion.mjs. Aquí no hay animación: solo geometría y color.
// Todo va en unidades de esqueleto (origen en el suelo, bajo el punto de frenada); la escena lo coloca y escala.
import React from 'react';
import {M, grosorCola} from './guion.mjs';
import {clamp, lerp, caminoSuave, sinG, cosG, mezclaP, mezcla, alfa} from './util.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${r1(p.x)},${r1(p.y)}`;

// ───── Cola ─────
// La espina (11 puntos) se suaviza y se engorda con el perfil grosorCola para sacar el contorno.
const SUB = 4;
const catmull = (p0, p1, p2, p3, u) => {
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return {x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y)};
};
const contornoCola = (pts) => {
  const n = pts.length - 1;
  const P = (i) => pts[clamp(i, 0, n)];
  const espina = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < SUB; j++) espina.push(catmull(P(i - 1), P(i), P(i + 1), P(i + 2), j / SUB));
  espina.push(pts[n]);
  const m = espina.length - 1;
  return espina.map((p, k) => {
    const a = espina[Math.max(0, k - 1)], b = espina[Math.min(m, k + 1)];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {p, s: k / m, tx: (b.x - a.x) / d, ty: (b.y - a.y) / d};
  });
};
const PUNTA = 0.56;   // a partir de aquí la cola es clara

const Cola = ({cola, c}) => {
  const e = contornoCola(cola.pts);
  const lado = (k, signo, ancho = 1) => {
    const w = (grosorCola(e[k].s) / 2) * ancho * cola.erizo;
    return {x: e[k].p.x - e[k].ty * w * signo, y: e[k].p.y + e[k].tx * w * signo};
  };
  const izq = e.map((_, k) => lado(k, 1)), der = e.map((_, k) => lado(k, -1));
  const forma = caminoSuave([...izq, ...der.reverse().slice(1)], true);
  // punta clara: mismo contorno desde PUNTA, con el corte en zigzag (pelo)
  const k0 = e.findIndex((x) => x.s >= PUNTA);
  const w0 = (grosorCola(e[k0].s) / 2) * 1.15 * cola.erizo;
  const zig = [0, 1, 2, 3, 4].map((j) => {
    const lat = lerp(-w0, w0, j / 4), lon = j % 2 ? 15 : -13;
    return {x: e[k0].p.x - e[k0].ty * lat + e[k0].tx * lon, y: e[k0].p.y + e[k0].tx * lat + e[k0].ty * lon};
  });
  const punta = [...zig, ...e.slice(k0 + 1).map((_, i) => lado(k0 + 1 + i, 1, 1.15)), ...e.slice(k0 + 1).map((_, i) => lado(k0 + 1 + i, -1, 1.15)).reverse()];
  // sombra plana en el lado de abajo
  const panza = [...e.map((_, k) => lado(k, -1, 1.1)), ...e.map((_, k) => lado(k, -1, 0.42)).reverse()];
  return (
    <g>
      <clipPath id="recorteCola"><path d={forma} /></clipPath>
      <path d={forma} fill={c.zorro} />
      <g clipPath="url(#recorteCola)">
        <path d={'M' + punta.map(pt).join('L') + 'Z'} fill={c.claro} />
        <path d={'M' + panza.map(pt).join('L') + 'Z'} fill={alfa(c.oscuro, 0.1)} />
      </g>
    </g>
  );
};

// ───── Piernas ─────
const Pierna = ({pi, color, c}) => {
  const {cadera, rodilla, tobillo, pie} = pi;
  const calcetin = mezclaP(rodilla, tobillo, 0.3);
  const x0 = lerp(-23, -19, pie.giro), x1 = lerp(23, 42, pie.giro), dx = pie.x - pie.pivote.x;
  return (
    <g>
      <path d={`M${pt(cadera)}L${pt(rodilla)}L${pt(tobillo)}`} stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={`M${pt(calcetin)}L${pt(tobillo)}`} stroke={c.pata} strokeWidth={40} fill="none" />
      <g transform={`translate(${r1(pie.pivote.x)} ${r1(pie.pivote.y)}) rotate(${r1(pie.ang)})`}>
        <rect x={dx + x0 - 4} y={-31} width={x1 - x0 + 8} height={31} rx={15} fill={c.pata} />
      </g>
    </g>
  );
};

// ───── Brazos ─────
const GROSOR_BRAZO = 30;
const Tramo = ({a, b, color}) => <path d={`M${pt(a)}L${pt(b)}`} stroke={color} strokeWidth={GROSOR_BRAZO} strokeLinecap="round" fill="none" />;
// Mano con tres deditos. "suelta" de 0 a 1: agarrando la pila los dedos miran arriba; libre, siguen al antebrazo.
const Mano = ({br, c, suelta, palma = 0}) => {
  const dir = (Math.atan2(br.mano.y - br.codo.y, br.mano.x - br.codo.x) * 180) / Math.PI + 90;
  const giro = lerp(0, ((dir + 540) % 360) - 180, suelta);
  const almohadilla = alfa(c.claro, 0.5 * palma);
  return (
    <g transform={`translate(${r1(br.mano.x)} ${r1(br.mano.y)}) rotate(${r1(giro)})`}>
      <circle cx={-13} cy={-14} r={8} fill={c.pata} />
      <circle cx={0} cy={-20} r={8.5} fill={c.pata} />
      <circle cx={13} cy={-14} r={8} fill={c.pata} />
      <ellipse rx={19.5} ry={20} fill={c.pata} />
      {palma > 0.02 && (
        <g fill={almohadilla}>
          <ellipse cx={0} cy={4} rx={9.5} ry={7.5} />
          <circle cx={-12} cy={-13} r={3.6} />
          <circle cx={0} cy={-19} r={3.8} />
          <circle cx={12} cy={-13} r={3.6} />
        </g>
      )}
    </g>
  );
};

// ───── Torso ─────
const TORSO = 'M-50,-166C-28,-178 28,-178 50,-166C76,-148 88,-62 86,-12C85,18 52,27 0,27C-52,27 -85,18 -86,-12C-88,-62 -76,-148 -50,-166Z';
const DELANTAL = 'M-36,-152L36,-152C40,-128 58,-108 72,-100L82,10Q0,26 -82,10L-72,-100C-58,-108 -40,-128 -36,-152Z';

const Torso = ({cu, c, conf}) => {
  const g = cu.giro;
  const dx = lerp(0, 48, g), ancho = lerp(1, 0.8, g);      // de perfil, lo de delante se va hacia el lado al que mira
  return (
    <g transform={`translate(${r1(cu.x)} ${r1(cu.y)}) rotate(${r1(cu.inclina)}) scale(${(1 + (1 - cu.estira) * 0.6).toFixed(3)} ${cu.estira.toFixed(3)})`}>
      <clipPath id="recorteTorso"><path d={TORSO} /></clipPath>
      <path d={TORSO} fill={c.zorro} />
      <g clipPath="url(#recorteTorso)">
        {conf.delantal ? (
          <g transform={`translate(${r1(dx)} 0) scale(${ancho.toFixed(3)} 1)`}>
            <path d="M-34,-150L-22,-186M34,-150L22,-186" stroke={c.delantal} strokeWidth={10} strokeLinecap="round" />
            <path d={DELANTAL} fill={c.delantal} />
            {/* bolsillo con un lápiz */}
            <g transform="rotate(8 14 -70)">
              <rect x={8} y={-88} width={10} height={34} rx={2} fill={c.cartel} />
              <path d="M8,-88L13,-99L18,-88Z" fill={c.claro} />
              <path d="M11,-94.6L13,-99L15,-94.6Z" fill={c.oscuro} />
            </g>
            <rect x={-30} y={-64} width={60} height={44} rx={9} fill={c.bolsillo} />
            <path d="M-22,-55L22,-55" stroke={alfa(c.claro, 0.55)} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 8" />
          </g>
        ) : (
          <ellipse cx={dx * 0.9} cy={-58} rx={56 * ancho} ry={74} fill={c.claro} />
        )}
        {/* sombra plana que la cabeza echa sobre el pecho */}
        <ellipse cx={lerp(0, 10, g)} cy={-M.torso + 22} rx={84} ry={40} fill={alfa(c.oscuro, 0.2)} />
      </g>
    </g>
  );
};

// ───── Cabeza ─────
const RADIO_OJO = 30;
const OREJA = 'M-42,12Q-38,-46 -4,-94Q2,-101 9,-92Q40,-46 42,12Z';
const OREJA_DENTRO = 'M-23,10Q-21,-34 -1,-66Q3,-71 7,-65Q23,-32 24,10Z';

const Cabeza = ({cab, c, conf}) => {
  // Falso 3D: los rasgos viven sobre una esfera y se desplazan al girar la cabeza; el contorno casi no cambia.
  const guinada = cab.giro * 22;
  const fx = (lon, r) => r * sinG(lon + guinada);
  const estrecha = (lon) => clamp(cosG(lon + guinada) / cosG(lon), 0.62, 1.08);
  const py = cab.cabeceo;
  const X = (x) => r1(x * (x < 0 ? 1 + 0.09 * cab.giro : 1 - 0.09 * cab.giro));
  const contorno = `M0,-104C${X(52)},-106 ${X(100)},-96 ${X(122)},-62C${X(136)},-38 ${X(150)},-8 ${X(164)},24C${X(146)},36 ${X(128)},62 ${X(96)},84C${X(66)},104 ${X(32)},112 0,112C${X(-32)},112 ${X(-66)},104 ${X(-96)},84C${X(-128)},62 ${X(-146)},36 ${X(-164)},24C${X(-150)},-8 ${X(-136)},-38 ${X(-122)},-62C${X(-100)},-96 ${X(-52)},-106 0,-104Z`;

  const nx = fx(0, 176), ny = 40 + py * 20;                 // nariz
  const jl = fx(-29, 150), jr = fx(29, 150), jy = 2 + py * 12; // cimas de los mofletes claros
  const mascara = `M-210,44C-165,-6 ${r1(jl - 46)},${r1(jy - 8)} ${r1(jl)},${r1(jy)}C${r1(jl + 30)},${r1(jy + 8)} ${r1(nx - 30)},${r1(ny - 4)} ${r1(nx)},${r1(ny - 4)}C${r1(nx + 30)},${r1(ny - 4)} ${r1(jr - 30)},${r1(jy + 8)} ${r1(jr)},${r1(jy)}C${r1(jr + 46)},${r1(jy - 8)} 165,-6 210,44L210,170L-210,170Z`;

  const R = RADIO_OJO * (1 + 0.2 * cab.platos);
  const rPupila = lerp(12.5, 6.5, cab.platos);
  const ojos = [-1, 1].map((l) => ({x: fx(l * 23, 150), y: -22 + py * 12, sx: estrecha(l * 23), l}));
  const yCeja = -R - 10 - cab.cejaAlto;

  // boca
  const b = cab.boca, mx = fx(0, 168), my = 77 + py * 17;
  const w = b.ancho, cv = b.curva * 9, ab = b.abierta * 23;
  const boca = `M${-w},${r1(-cv * 0.4)}Q0,${r1(cv * 0.9 - ab * 0.25)} ${w},${r1(-cv * 0.4)}Q0,${r1(cv * 1.5 + ab * 1.9)} ${-w},${r1(-cv * 0.4)}Z`;

  return (
    <g transform={`translate(${r1(cab.centro.x)} ${r1(cab.centro.y)}) rotate(${r1(cab.rot)})`}>
      {/* orejas: detrás de la cabeza, cada una con su rebote */}
      {[-1, 1].map((l, i) => (
        <g key={l} transform={`translate(${r1(l * 88 - sinG(guinada) * 30)} ${r1(-76 - py * 8)}) rotate(${r1(l * 15 + cab.orejas[i])}) scale(${(1 - l * 0.2 * cab.giro).toFixed(3)} 1)`}>
          <path d={OREJA} fill={c.zorro} />
          <path d={OREJA_DENTRO} fill={c.pata} />
        </g>
      ))}
      <clipPath id="recorteCabeza"><path d={contorno} /></clipPath>
      <path d={contorno} fill={c.zorro} />
      <g clipPath="url(#recorteCabeza)">
        <path d={mascara} fill={c.claro} />
        {/* coloretes */}
        <ellipse cx={r1(fx(-36, 150))} cy={r1(40 + py * 12)} rx={20 * estrecha(-36)} ry={11} fill={alfa(c.acento, 0.2)} />
        <ellipse cx={r1(fx(36, 150))} cy={r1(40 + py * 12)} rx={20 * estrecha(36)} ry={11} fill={alfa(c.acento, 0.2)} />
      </g>
      {/* nariz */}
      <path transform={`translate(${r1(nx)} ${r1(ny)})`} d="M-18,-9Q0,-15 18,-9Q15,7 0,13Q-15,7 -18,-9Z" fill={c.oscuro} />
      {/* boca (y lengua fuera cuando se concentra) */}
      <g transform={`translate(${r1(mx)} ${r1(my)})`}>
        {b.lengua > 0.02 && <ellipse cx={w * 0.45} cy={5 * b.lengua} rx={6.5} ry={8 * b.lengua} fill={c.acento} />}
        <clipPath id="recorteBoca"><path d={boca} /></clipPath>
        <path d={boca} fill={c.bocaDentro} stroke={c.oscuro} strokeWidth={6} strokeLinejoin="round" />
        {ab > 4 && <ellipse clipPath="url(#recorteBoca)" cx={0} cy={r1(cv * 1.5 + ab * 1.9 - 3)} rx={w * 0.62} ry={ab * 0.5} fill={c.acento} />}
      </g>
      {/* ojos */}
      {ojos.map((o, i) => {
        const guino = o.l > 0 ? cab.guino : 0;               // el guiño solo cierra el ojo de la derecha de la imagen
        const abre = cab.abre * (1 - guino);
        const tapa = (1 - abre) * 2 * R;                     // cuánto baja el párpado de arriba
        const px = cab.mirada.x * (R - rPupila - 5), pyy = cab.mirada.y * (R - rPupila - 5);
        return (
          <g key={i} transform={`translate(${r1(o.x)} ${r1(o.y)}) scale(${o.sx.toFixed(3)} 1)`}>
            <clipPath id={`recorteOjo${i}`}><circle r={R} /></clipPath>
            <circle r={R} fill={c.blanco} />
            <g clipPath={`url(#recorteOjo${i})`}>
              <circle cx={r1(px)} cy={r1(pyy)} r={rPupila} fill={c.oscuro} />
              <circle cx={r1(px - rPupila * 0.36)} cy={r1(pyy - rPupila * 0.36)} r={rPupila * 0.3} fill={c.blanco} />
              <rect x={-R - 2} y={-R - 2} width={2 * R + 4} height={r1(tapa + 2)} fill={c.zorro} />
              {/* párpado de abajo: sube al sonreír */}
              <ellipse cx={0} cy={r1(R * (2.05 - Math.min(1, cab.feliz + guino * 0.5) * 1.5))} rx={R * 1.5} ry={R * 1.1} fill={c.zorro} />
            </g>
            {abre < 0.5 && <path d={`M${-R * 0.62},${R * 0.1}Q0,${R * 0.46} ${R * 0.62},${R * 0.1}`} stroke={c.oscuro} strokeWidth={5.5} strokeLinecap="round" fill="none" opacity={1 - abre * 2} />}
            {conf.gafas && <circle r={R + 1.5} fill="none" stroke={c.oscuro} strokeWidth={6} />}
            {/* ceja */}
            <path transform={`translate(0 ${r1(yCeja + guino * 9)}) rotate(${r1(o.l * cab.cejaAng - guino * 10)})`} d="M-17,0L17,0" stroke={c.pata} strokeWidth={9} strokeLinecap="round" />
            {/* destello del guiño */}
            {guino > 0.05 && <path transform={`translate(${R + 26} ${-R - 6}) rotate(${r1(guino * 40)}) scale(${(guino * 0.62).toFixed(3)})`} d="M0,-30C3,-9 9,-3 30,0C9,3 3,9 0,30C-3,9 -9,3 -30,0C-9,-3 -3,-9 0,-30Z" fill={c.cartel} />}
          </g>
        );
      })}
      {/* puente de las gafas */}
      {conf.gafas && (
        <path d={`M${r1(ojos[0].x + (R + 1.5) * ojos[0].sx)},${r1(ojos[0].y - 3)}Q${r1((ojos[0].x + ojos[1].x) / 2)},${r1(ojos[0].y - 13)} ${r1(ojos[1].x - (R + 1.5) * ojos[1].sx)},${r1(ojos[1].y - 3)}`} stroke={c.oscuro} strokeWidth={6} fill="none" strokeLinecap="round" />
      )}
    </g>
  );
};

// ───── El zorro entero, en dos capas para poder meter la pila entre medias ─────
// "detras": cola, piernas, torso y brazo lejano.  "delante": brazo cercano, cabeza y antebrazo cercano.
export const ZorroDetras = ({p, c, conf}) => (
  <g>
    <Cola cola={p.cola} c={c} />
    <Pierna pi={p.piernas[1]} color={mezcla(c.zorro, c.zorroSombra, p.cuerpo.giro)} c={c} />
    <Pierna pi={p.piernas[0]} color={c.zorro} c={c} />
    <Torso cu={p.cuerpo} c={c} conf={conf} />
    <Tramo a={p.brazos[1].hombro} b={p.brazos[1].codo} color={mezcla(c.zorroBrazo, c.zorroSombra, p.cuerpo.giro)} />
    <Tramo a={p.brazos[1].codo} b={p.brazos[1].mano} color={mezcla(c.zorroBrazo, c.zorroSombra, p.cuerpo.giro)} />
    <Mano br={p.brazos[1]} c={c} suelta={p.libre} />
  </g>
);

export const ZorroDelante = ({p, c, conf}) => (
  <g>
    <Tramo a={p.brazos[0].hombro} b={p.brazos[0].codo} color={c.zorroBrazo} />
    <Cabeza cab={p.cabeza} c={c} conf={conf} />
    <Tramo a={p.brazos[0].codo} b={p.brazos[0].mano} color={c.zorroBrazo} />
    <Mano br={p.brazos[0]} c={c} suelta={p.libre} palma={p.aSaludo} />
  </g>
);
