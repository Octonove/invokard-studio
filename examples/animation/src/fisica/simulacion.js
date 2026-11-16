// La lluvia de fruta. Planck.js simula TODO el plano una sola vez (por pestaña) y se guarda la pose de cada pieza
// en cada fotograma; al pintar, cada fotograma solo lee su instante. Así el resultado es idéntico se pinte en el
// orden que se pinte. Este archivo no toca el navegador: recibe los contornos de las letras ya calculados.
//
// Cómo se entiende la profundidad (es un plano 2D, pero se lee como un escaparate):
//   · Las letras sobresalen de la pared. La fruta que cae pegada a la pared choca con ellas.
//   · Tras rebotar en una letra, la pieza «se cae por delante»: deja de chocar con el rótulo y sigue hasta la caja.
//   · Unas pocas piezas (seQuedan) nunca se sueltan: se quedan encima de las letras.
//   · Una parte de cada oleada cae directamente por delante, sin tocar el rótulo.
import {Box, Chain, Circle, Polygon, Vec2, World} from 'planck';
import {ANCHO, CAJA, CAT, FOTOGRAMAS, FPS, GRAVEDAD, LLENADO, MOSTRADOR, OLEADAS, POSTE, PREVIO, PX, REBOTE_LETRA, ROCE, SUBPASOS} from './ajustes.js';
import {FORMAS} from './formas.js';
import {clamp, generador, lerp, suaviza} from './util.js';

const m = (px) => px / PX;                         // de píxeles a metros del motor
export const NP = 8;                               // números por pieza y fotograma: x, y, ángulo, vx, vy, letra de apoyo, peso, capa
const TODO = 0xffff;
const POR_DELANTE = TODO & ~CAT.LETRA & ~CAT.QUEDA; // máscara de la pieza que ya cae por delante del rótulo

// Cuánto tarda una pieza en «caerse por delante» de las letras tras tocarlas (segundos)
const SUELTA_MIN = 0.04, SUELTA_MAX = 0.3;
// Muelle con el que las letras acusan los golpes (solo dibujo: la forma que choca no se mueve)
const LETRA_HZ = 8, LETRA_AMORT = 0.32, LETRA_K = 12, LETRA_KGIRO = 2.2;
const LETRA_TOPE = 10, LETRA_TOPE_GIRO = 1.6;      // px y grados como mucho
// Sacudida de cámara cuando cae peso en la caja
const CAM_HZ = 7, CAM_AMORT = 0.42, CAM_K = 2.2;
const MEDIA = 0.2;                                 // s: ventana con la que se descuenta el peso que ya está apoyado
// Cuando ya ha caído todo, el aire «se espesa» poco a poco para que nada se quede rodando sin fin
const CALMA = {desde: 4.5, dura: 1.2, lineal: 1.4, giro: 6};

// ---------- 1. Reparto: qué piezas hay, cuándo sale cada una y por dónde ----------
export const repartir = (datos, franja) => {
  const azar = generador(datos.semilla ?? 1);
  let piezas = [];
  (datos.mezcla || []).forEach((linea, nLinea) => {
    if (!FORMAS[linea.fruta]) return;
    const cantidad = clamp(Math.round(linea.cantidad || 0), 0, 80);
    for (let j = 0; j < cantidad; j++) piezas.push({tipo: linea.fruta, linea: nLinea, tam: clamp(linea.tam ?? 1, 0.3, 1.4), color: linea.color || null});
  });
  for (let i = piezas.length - 1; i > 0; i--) {                       // barajar con semilla
    const j = Math.floor(azar() * (i + 1));
    [piezas[i], piezas[j]] = [piezas[j], piezas[i]];
  }
  piezas = piezas.slice(0, 150);

  // Escala común para que la mezcla llene la caja sea cual sea la cantidad
  const hueco = (CAJA.x1 - CAJA.x0 - 2 * CAJA.pared) * (CAJA.fondo - CAJA.borde);
  let total = 0;
  piezas.forEach((p) => {
    p.vari = 0.93 + azar() * 0.14;                                    // cada pieza, un pelín distinta
    total += FORMAS[p.tipo].area * Math.pow(FORMAS[p.tipo].R * p.tam * p.vari, 2);
  });
  const escala = clamp(Math.sqrt((hueco * LLENADO) / Math.max(1, total)), 0.7, 1.35);
  piezas.forEach((p) => {
    p.R = FORMAS[p.tipo].R * p.tam * p.vari * escala;
  });

  // Las que se quedan encima de las letras: mezcla de tamaños y de tipos, nunca las piezas enormes.
  // No se admiten más de las que caben en el «estante» (el tramo del nombre que queda libre por arriba).
  const estante = Math.max(0, franja.x1 - franja.x0);
  const nQ = clamp(Math.round(datos.seQuedan ?? 9), 0, Math.min(14, Math.max(1, Math.round(estante / 70))));
  const aptas = piezas.filter((p) => p.tipo !== 'sandia' && p.tipo !== 'platano' && p.R < 56);
  const clase = (p) => (p.R < 21 ? 0 : p.R < 36 ? 1 : 2);
  const cupo = [Math.round(nQ * 0.4), Math.round(nQ * 0.25), 0];
  cupo[2] = Math.max(0, nQ - cupo[0] - cupo[1]);
  const quedan = [];
  for (const c of [2, 1, 0]) {
    // dentro de cada tamaño se va cogiendo una de cada línea de la mezcla, por turnos (la primera línea manda)
    const grupos = new Map();
    aptas.filter((p) => clase(p) === c).forEach((p) => {
      if (!grupos.has(p.linea)) grupos.set(p.linea, []);
      grupos.get(p.linea).push(p);
    });
    const colas = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    let turno = 0, vacias = 0;
    while (cupo[c] > 0 && colas.length && vacias < colas.length) {
      const cola = colas[turno % colas.length];
      turno++;
      if (!cola.length) {
        vacias++;
        continue;
      }
      vacias = 0;
      const p = cola.shift();
      p.queda = true;
      quedan.push(p);
      cupo[c]--;
    }
  }
  let faltan = cupo[0] + cupo[1] + cupo[2];
  for (const p of aptas) {
    if (faltan > 0 && !p.queda) {
      p.queda = true;
      quedan.push(p);
      faltan--;
    }
  }
  // Se sueltan en orden barajado: las dos primeras ya están posadas en el fotograma 0 y el resto va llegando
  // a lo largo de la lluvia. A lo ancho caen al azar sobre el nombre, así se agrupan de forma natural.
  const orden = quedan.map((_, j) => j);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  quedan.forEach((p, j) => {
    const turno = orden[j];
    p.tSale = turno === 0 ? -1.3 : turno === 1 ? -0.8 : lerp(0.2, 3.9, (turno - 2 + azar() * 0.7) / Math.max(1, quedan.length - 2));
    p.x = lerp(franja.x0 + p.R + 8, franja.x1 - 36, azar());
    p.vx = (azar() - 0.5) * 40;
    p.vy = 480;
    p.giro = (azar() - 0.5) * 3;
  });

  // El resto se reparte por oleadas. Cada línea de la mezcla se reparte por separado y en proporción,
  // para que todas las oleadas (también la primera) lleven de todo y no salga una tanda solo de arándanos.
  const resto = piezas.filter((p) => !p.queda);
  const acumulado = [];
  OLEADAS.reduce((suma, o, w) => (acumulado[w] = suma + o.parte), 0);
  const tandas = OLEADAS.map(() => []);
  const lineas = new Map();
  resto.forEach((p) => {
    if (!lineas.has(p.linea)) lineas.set(p.linea, []);
    lineas.get(p.linea).push(p);
  });
  [...lineas.keys()].sort((a, b) => a - b).forEach((clave) => {
    const grupo = lineas.get(clave), giro = azar();
    grupo.forEach((p, j) => {
      const u = ((j + giro) / grupo.length) * acumulado[acumulado.length - 1];
      const w = Math.max(0, acumulado.findIndex((c) => u < c));
      tandas[w].push(p);
    });
  });
  OLEADAS.forEach((o, w) => {
    const tanda = tandas[w];
    for (let i = tanda.length - 1; i > 0; i--) {                      // orden de salida dentro de la oleada, al azar
      const j = Math.floor(azar() * (i + 1));
      [tanda[i], tanda[j]] = [tanda[j], tanda[i]];
    }
    tanda.forEach((p, j) => {
      p.oleada = w;
      p.tSale = lerp(o.de, o.a, (j + azar()) / tanda.length);
      p.x = lerp(POSTE, ANCHO - POSTE, lerp(o.x[0], o.x[1], azar()));
      p.vx = (azar() - 0.5) * 170;
      p.vy = o.v * (0.9 + azar() * 0.25);
      p.giro = (azar() - 0.5) * 9;
      p.libre = azar() < o.delante;                                   // cae por delante del rótulo desde el principio
    });
  });

  piezas.forEach((p) => {
    p.angulo = azar() * Math.PI * 2;
    p.envuelve = FORMAS[p.tipo].radio * p.R;                          // radio que envuelve la pieza entera
    p.x = clamp(p.x, POSTE + p.envuelve + 4, ANCHO - POSTE - p.envuelve - 4);
    p.semilla = Math.floor(azar() * 1e6);                             // para los detalles del dibujo
  });
  piezas.sort((a, b) => a.tSale - b.tSale);
  piezas.forEach((p, i) => {
    p.i = i;
  });
  return {piezas, escala};
};

// ---------- 2. Simulación ----------
// letras: [{contornos: [[[x, y], …], …], cx, cy}] en píxeles · franja: {x0, x1, y} borde de arriba del nombre
// suelo: y por debajo de la cual una pieza ya ha dejado atrás el rótulo
export const simular = (datos, letras, franja, suelo) => {
  const {piezas, escala} = repartir(datos, franja);
  const mundo = new World({gravity: new Vec2(0, m(GRAVEDAD))});

  // Madera: postes, caja y mostrador
  const madera = mundo.createBody();
  const caja = (x0, y0, x1, y1, dato) =>
    madera.createFixture({
      shape: new Box(m((x1 - x0) / 2), m((y1 - y0) / 2), new Vec2(m((x0 + x1) / 2), m((y0 + y1) / 2))),
      friction: ROCE.madera, restitution: 0.05, filterCategoryBits: CAT.MADERA, userData: dato,
    });
  caja(-300, -4000, POSTE, MOSTRADOR.y, {madera: 'poste'});
  caja(ANCHO - POSTE, -4000, ANCHO + 300, MOSTRADOR.y, {madera: 'poste'});
  caja(-300, MOSTRADOR.y, ANCHO + 300, MOSTRADOR.y + 200, {madera: 'suelo'});
  caja(CAJA.x0, CAJA.fondo, CAJA.x1, CAJA.base, {madera: 'suelo'});
  caja(CAJA.x0, CAJA.borde, CAJA.x0 + CAJA.pared, CAJA.base, {madera: 'pared'});
  caja(CAJA.x1 - CAJA.pared, CAJA.borde, CAJA.x1, CAJA.base, {madera: 'pared'});

  // Letras: cada contorno es una cadena cerrada con la silueta exacta del carácter
  const rotulo = mundo.createBody();
  letras.forEach((letra, k) => {
    letra.contornos.forEach((c) => {
      if (c.length < 3) return;
      rotulo.createFixture({
        shape: new Chain(c.map(([x, y]) => new Vec2(m(x), m(y))), true),
        friction: ROCE.letra, restitution: REBOTE_LETRA, filterCategoryBits: CAT.LETRA, userData: {letra: k},
      });
    });
  });

  // Avisos del motor: quién toca el rótulo (o a una pieza posada en él) y con cuánta fuerza
  const nL = letras.length;
  const golpe = new Float64Array(nL), torsion = new Float64Array(nL);
  let golpeCaja = 0, golpeLado = 0, pasoActual = 0;
  mundo.on('begin-contact', (c) => {
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const da = fa.getUserData(), db = fb.getUserData();
    const pa = fa.getBody().getUserData(), pb = fb.getBody().getUserData();
    let pieza = null;
    if (da && da.letra != null) pieza = pb;
    else if (db && db.letra != null) pieza = pa;
    else if (pa && pb && pa.enRotulo !== pb.enRotulo) pieza = pa.enRotulo ? pb : pa;   // toca a una que está posada
    if (pieza && !pieza.enRotulo && pieza.tToque == null) pieza.tToque = pasoActual;
  });
  mundo.on('post-solve', (c, impulso) => {
    const da = c.getFixtureA().getUserData(), db = c.getFixtureB().getUserData();
    if (!da && !db) return;
    const wm = c.getWorldManifold(null);
    if (!wm) return;
    let J = 0;
    for (const j of impulso.normalImpulses) J += j;
    if (!(J > 0)) return;
    // la normal va de A a B: lo que recibe el objeto fijo es +J·n si es B y -J·n si es A
    const s = da ? -1 : 1, dato = da || db;
    const fx = s * J * wm.normal.x, fy = s * J * wm.normal.y;
    if (dato.letra != null) {
      const L = letras[dato.letra], p = wm.points[0];
      golpe[dato.letra] += fy;
      if (p) torsion[dato.letra] += (p.x - m(L.cx)) * fy - (p.y - m(L.cy)) * fx;
    } else if (dato.madera === 'suelo') golpeCaja += Math.max(0, fy);
    else if (dato.madera === 'pared') golpeLado += fx;
  });

  const filtrar = (p, categoria, mascara) => {
    for (let f = p.cuerpo.getFixtureList(); f; f = f.getNext()) f.setFilterData({groupIndex: 0, categoryBits: categoria, maskBits: mascara});
  };
  const hayHueco = (p, x, y, cuales) =>
    cuales.every((q) => {
      const o = q.cuerpo.getPosition();
      return Math.hypot(o.x * PX - x, o.y * PX - y) > p.envuelve + q.envuelve + 5;
    });

  const nacer = (p) => {
    // Nace por encima del encuadre. Busca sitio libre donde tocaba, luego a los lados y, si no, más arriba:
    // así un volcado denso llega como un bloque compacto de varias filas y no se queda en cola.
    const vecinas = piezas.filter((q) => q.cuerpo && q.cuerpo.getPosition().y * PX < 200);
    // las que se quedan posadas no se salen de su franja (nunca caen sobre la palabra pequeña)
    const xMin = p.queda ? franja.x0 + p.R + 8 : POSTE + p.envuelve + 4;
    const xMax = ANCHO - POSTE - p.envuelve - 4;
    let x = null, y = 0;
    busca: for (let nivel = 0; nivel < 7; nivel++) {
      y = -p.envuelve - 24 - nivel * 104;
      for (const d of [0, 50, -50, 100, -100, 150, -150, 210, -210]) {
        const cand = clamp(p.x + d, xMin, xMax);
        if (hayHueco(p, cand, y, vecinas)) {
          x = cand;
          break busca;
        }
      }
    }
    if (x == null) return false;
    const forma = FORMAS[p.tipo];
    const cuerpo = mundo.createBody({
      type: 'dynamic', position: new Vec2(m(x), m(y)), angle: p.angulo,
      linearVelocity: new Vec2(m(p.vx), m(p.vy)), angularVelocity: p.giro,
      linearDamping: 0.02, angularDamping: p.queda ? 1.8 : 0.7, userData: p,
    });
    p.enRotulo = !!p.queda;
    forma.fisica.forEach((parte) => {
      const shape = parte.c
        ? new Circle(new Vec2(0, 0), m(parte.c * p.R))
        : new Polygon(parte.p.map(([px, py]) => new Vec2(m(px * p.R), m(py * p.R))));
      cuerpo.createFixture({
        shape, density: 1, friction: ROCE.fruta, restitution: forma.rebote,
        filterCategoryBits: p.queda ? CAT.QUEDA : CAT.FRUTA, filterMaskBits: p.libre ? POR_DELANTE : TODO,
      });
    });
    p.cuerpo = cuerpo;
    return true;
  };

  // En qué letra descansa cada pieza posada (directamente o sobre otra posada): al dibujar, sigue el temblor de su letra.
  const apoyos = () => {
    const posadas = piezas.filter((p) => p.cuerpo && p.enRotulo);
    posadas.forEach((p) => {
      p.toca = -1;
      for (let ce = p.cuerpo.getContactList(); ce; ce = ce.next) {
        if (!ce.contact.isTouching()) continue;
        const da = ce.contact.getFixtureA().getUserData(), db = ce.contact.getFixtureB().getUserData();
        const k = da && da.letra != null ? da.letra : db && db.letra != null ? db.letra : -1;
        if (k >= 0) p.toca = k;
      }
    });
    posadas.forEach((p) => {
      if (p.toca >= 0) return;
      for (let ce = p.cuerpo.getContactList(); ce; ce = ce.next) {
        if (!ce.contact.isTouching()) continue;
        const otra = ce.other.getUserData();
        if (otra && otra.enRotulo && otra.toca >= 0) p.toca2 = otra.toca;
      }
    });
    posadas.forEach((p) => {
      const k = p.toca >= 0 ? p.toca : p.toca2 ?? -1;
      p.toca2 = undefined;
      if (k >= 0) {
        p.apoyoK = k;
        p.apoyoW = (p.apoyoW || 0) + (1 - (p.apoyoW || 0)) * 0.6;
      } else p.apoyoW = (p.apoyoW || 0) * 0.5;
    });
    piezas.forEach((p) => {
      if (p.cuerpo && !p.enRotulo) p.apoyoW = (p.apoyoW || 0) * 0.5;
    });
  };

  const dt = 1 / (FPS * SUBPASOS);
  const N = piezas.length;
  const poses = [], muelles = [], camara = [];
  const ly = new Float64Array(nL), lvy = new Float64Array(nL), lr = new Float64Array(nL), lvr = new Float64Array(nL);
  const reposo = new Float64Array(nL);              // peso que ya descansa en cada letra (se descuenta)
  let cy = 0, cvy = 0, cx = 0, cvx = 0, reposoCaja = 0;
  const wL = 2 * Math.PI * LETRA_HZ, wC = 2 * Math.PI * CAM_HZ, kMedia = dt / MEDIA;
  let sig = 0;
  for (let paso = -PREVIO * SUBPASOS; paso < FOTOGRAMAS * SUBPASOS; paso++) {
    pasoActual = paso;
    const t = paso * dt;
    while (sig < N && piezas[sig].tSale <= t) {
      if (!nacer(piezas[sig])) {
        piezas[sig].tSale += dt;                     // no hay hueco: espera un paso
        break;
      }
      sig++;
    }
    for (let i = 0; i < sig; i++) {
      const p = piezas[i];
      if (p.enRotulo) {
        // una de las que se quedan ha acabado cayéndose del rótulo: pasa a ser una pieza más del montón
        const o = p.cuerpo.getPosition();
        if (o.y * PX > suelo + p.envuelve) {
          const delante = piezas.filter((q) => q.cuerpo && q !== p && q.libre);
          if (o.y * PX > CAJA.borde - 160 || hayHueco(p, o.x * PX, o.y * PX, delante)) {
            filtrar(p, CAT.FRUTA, POR_DELANTE);
            p.enRotulo = false;
            p.libre = true;
          }
        }
      } else if (!p.libre && p.tToque != null) {
        // ya ha rebotado en una letra: deja de chocar con el rótulo y «se cae por delante»
        const lleva = (paso - p.tToque) * dt;
        if ((lleva >= SUELTA_MIN && p.cuerpo.getLinearVelocity().y > 0.5) || lleva >= SUELTA_MAX) {
          filtrar(p, CAT.FRUTA, POR_DELANTE);
          p.libre = true;
        }
      }
    }
    if (t > CALMA.desde) {
      const k = suaviza((t - CALMA.desde) / CALMA.dura);
      for (let i = 0; i < sig; i++) {
        piezas[i].cuerpo.setLinearDamping(lerp(0.02, CALMA.lineal, k));
        piezas[i].cuerpo.setAngularDamping(lerp(piezas[i].queda ? 1.8 : 0.7, CALMA.giro, k));
      }
    }
    golpe.fill(0);
    torsion.fill(0);
    golpeCaja = 0;
    golpeLado = 0;
    mundo.step(dt, 8, 3);

    // muelles de las letras y de la cámara (integración semiimplícita); solo empuja lo que excede al peso ya posado
    for (let k = 0; k < nL; k++) {
      const extra = golpe[k] - reposo[k];
      reposo[k] += (golpe[k] - reposo[k]) * kMedia;
      lvy[k] += LETRA_K * Math.max(0, extra);
      lvy[k] += (-wL * wL * ly[k] - 2 * LETRA_AMORT * wL * lvy[k]) * dt;
      ly[k] += lvy[k] * dt;
      lvr[k] += LETRA_KGIRO * (Math.abs(extra) > 0.02 ? torsion[k] : 0);
      lvr[k] += (-wL * wL * lr[k] - 2 * LETRA_AMORT * wL * lvr[k]) * dt;
      lr[k] += lvr[k] * dt;
    }
    const extraCaja = golpeCaja - reposoCaja;
    reposoCaja += (golpeCaja - reposoCaja) * kMedia;
    cvy += CAM_K * Math.max(0, extraCaja);
    cvy += (-wC * wC * cy - 2 * CAM_AMORT * wC * cvy) * dt;
    cy += cvy * dt;
    cvx += CAM_K * 0.5 * golpeLado;
    cvx += (-wC * wC * cx - 2 * CAM_AMORT * wC * cvx) * dt;
    cx += cvx * dt;

    if ((paso + 1) % SUBPASOS === 0) {
      const f = (paso + 1) / SUBPASOS;
      if (f >= 0 && f < FOTOGRAMAS) {
        apoyos();
        const pose = new Float32Array(N * NP).fill(NaN);
        for (let i = 0; i < sig; i++) {
          const p = piezas[i], c = p.cuerpo, o = c.getPosition(), v = c.getLinearVelocity();
          pose[i * NP] = o.x * PX;
          pose[i * NP + 1] = o.y * PX;
          pose[i * NP + 2] = c.getAngle();
          pose[i * NP + 3] = (v.x * PX) / FPS;                       // px por fotograma
          pose[i * NP + 4] = (v.y * PX) / FPS;
          pose[i * NP + 5] = p.apoyoK ?? -1;                         // letra en la que descansa (-1: ninguna)
          pose[i * NP + 6] = p.apoyoW || 0;                          // cuánto la sigue (0..1)
          p.capa = p.capa == null ? (p.libre ? 1 : 0) : p.capa + ((p.libre ? 1 : 0) - p.capa) * 0.4;
          pose[i * NP + 7] = p.capa;                                 // 0 = pegada a la pared, 1 = por delante del rótulo
        }
        poses[f] = pose;
        const mu = new Float32Array(nL * 2);
        for (let k = 0; k < nL; k++) {
          mu[k * 2] = LETRA_TOPE * Math.tanh(ly[k] / LETRA_TOPE);                 // hundimiento, px (con tope suave)
          mu[k * 2 + 1] = LETRA_TOPE_GIRO * Math.tanh(lr[k] / LETRA_TOPE_GIRO);   // giro, grados
        }
        muelles[f] = mu;
        camara[f] = [4 * Math.tanh(cx / 4), 7 * Math.tanh(cy / 7)];
      }
    }
  }

  // ---------- 3. Reposo limpio ----------
  // Cuando una pieza ya solo tiembla (menos de UMBRAL por fotograma hasta el final), se lleva con suavidad a su
  // pose final y se queda clavada: el montón no vibra.
  const UMBRAL = 0.45, FUNDIDO = 10;
  const ultima = poses[FOTOGRAMAS - 1];
  for (let i = 0; i < N; i++) {
    const o = i * NP;
    if (Number.isNaN(ultima[o])) continue;
    let calma = FOTOGRAMAS - 1;
    for (let f = FOTOGRAMAS - 1; f > 0; f--) {
      const a = poses[f], b = poses[f - 1];
      if (Number.isNaN(b[o])) break;
      const mov = Math.hypot(a[o] - b[o], a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]) * piezas[i].R;
      if (mov > UMBRAL) break;
      calma = f - 1;
    }
    for (let f = calma; f < FOTOGRAMAS - 1; f++) {
      const k = suaviza((f - calma) / FUNDIDO), a = poses[f];
      for (let j = 0; j < 3; j++) a[o + j] = lerp(a[o + j], ultima[o + j], k);
      if (k >= 1) {
        a[o + 3] = 0;
        a[o + 4] = 0;
      }
    }
    piezas[i].calma = calma;
  }

  return {
    piezas: piezas.map((p) => ({i: p.i, tipo: p.tipo, R: p.R, color: p.color, queda: !!p.queda, semilla: p.semilla, calma: p.calma})),
    poses, muelles, camara, escala,
  };
};
