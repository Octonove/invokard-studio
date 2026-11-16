// La etiqueta de precio: una cuerda de eslabones articulados con un cartón colgando, simulada con Planck.js
// en un mundo aparte (no choca con la fruta: cuelga por delante). El punto de amarre baja desde detrás del
// toldo siguiendo una curva con un pequeño rebote final, y la física hace el resto: el balanceo, la comba de
// la cuerda y el cabeceo del cartón no están animados a mano.
import {Box, RevoluteJoint, RopeJoint, Vec2, World} from 'planck';
import {ETIQUETA, ETIQUETA_T, FOTOGRAMAS, FPS, PX, TOLDO} from './ajustes.js';

const m = (px) => px / PX;
const ESLABONES = 14;
const SUB = 8;                          // pasos por fotograma (la cuerda necesita paso fino)
const G = 16000;                        // px/s²: fija el ritmo del balanceo
const VAIVEN = 110;                     // cuánto se desplaza de lado el amarre mientras baja (provoca el balanceo)
const FRENO = {cuerda: 0.6, carton: 1.5, giro: 2.4};
// Curva de bajada 0→1 con un pequeño rebote al final (muelle amortiguado)
const A = 3.0, W = 2.6;
const bajada = (t) => (t <= 0 ? 0 : 1 - Math.exp(-A * t) * (Math.cos(W * t) + (A / W) * Math.sin(W * t)));

export const simularEtiqueta = (xReposo = ETIQUETA.x) => {
  const largo = (ETIQUETA.yOjal - ETIQUETA.yAncla) / ESLABONES;
  // al empezar, todo el conjunto está escondido por encima del borde del toldo
  const recorrido = ETIQUETA.yOjal + (ETIQUETA.alto - ETIQUETA.ojal) - (TOLDO.alto - 24);
  const amarre = (t) => {
    const s = bajada(t - ETIQUETA_T.sale);
    return [xReposo + VAIVEN * (1 - s), ETIQUETA.yAncla - recorrido * (1 - s)];
  };

  const mundo = new World({gravity: new Vec2(0, m(G))});
  const [x0, y0] = amarre(0);
  const ancla = mundo.createBody({type: 'kinematic', position: new Vec2(m(x0), m(y0))});
  let previo = ancla;
  const nudos = [];                     // cuerpos de la cuerda
  for (let i = 0; i < ESLABONES; i++) {
    const c = mundo.createBody({type: 'dynamic', position: new Vec2(m(x0), m(y0 + largo * (i + 0.5))), linearDamping: FRENO.cuerda, angularDamping: 1});
    c.createFixture({shape: new Box(m(3), m(largo / 2)), density: 4, filterMaskBits: 0});
    mundo.createJoint(new RevoluteJoint({}, previo, c, new Vec2(m(x0), m(y0 + largo * i))));
    nudos.push(c);
    previo = c;
  }
  // el cartón: su origen es el ojal
  const yOjal = y0 + largo * ESLABONES;
  const carton = mundo.createBody({type: 'dynamic', position: new Vec2(m(x0), m(yOjal)), linearDamping: FRENO.carton, angularDamping: FRENO.giro});
  carton.createFixture({shape: new Box(m(ETIQUETA.ancho / 2), m(ETIQUETA.alto / 2), new Vec2(0, m(ETIQUETA.alto / 2 - ETIQUETA.ojal))), density: 0.5, filterMaskBits: 0});
  mundo.createJoint(new RevoluteJoint({}, previo, carton, new Vec2(m(x0), m(yOjal))));
  // seguro contra el estiramiento de la cadena
  mundo.createJoint(new RopeJoint({maxLength: m(largo * ESLABONES * 1.004), localAnchorA: new Vec2(0, 0), localAnchorB: new Vec2(0, 0)}, ancla, carton));

  const dt = 1 / (FPS * SUB);
  const poses = [];
  const guardar = () => {
    const pts = [[ancla.getPosition().x * PX, ancla.getPosition().y * PX]];
    nudos.forEach((c, i) => {
      if (i === 0) return;
      const p = c.getWorldPoint(new Vec2(0, m(-largo / 2)));          // articulación de arriba de cada eslabón
      pts.push([p.x * PX, p.y * PX]);
    });
    const o = carton.getPosition();
    pts.push([o.x * PX, o.y * PX]);
    return {cuerda: pts, x: o.x * PX, y: o.y * PX, a: carton.getAngle()};
  };
  const f0 = Math.floor(ETIQUETA_T.sale * FPS) - 1;                  // antes de salir no hace falta simular: está escondida
  for (let f = 0; f < FOTOGRAMAS; f++) {
    if (f > f0) {
      for (let s = 0; s < SUB; s++) {
        const t = (f - 1) / FPS + s * dt;
        const [ax, ay] = amarre(t), [bx, by] = amarre(t + dt);
        ancla.setLinearVelocity(new Vec2(m((bx - ax) / dt), m((by - ay) / dt)));
        mundo.step(dt, 24, 12);
      }
    }
    poses[f] = guardar();
  }
  return poses;
};
