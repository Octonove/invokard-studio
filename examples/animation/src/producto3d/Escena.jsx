// La escena 3D: plató, lata con gotas, rodajas, hojas, burbujas y luces.
// Nada usa useFrame ni relojes: cada componente recibe t (segundos) y coloca sus piezas con las
// funciones de movimiento.js. Lo que hay que escribir «a mano» en Three.js (matrices de las
// instancias, cámara, giro del entorno) va en useLayoutEffect, que se ejecuta antes de que
// <ThreeCanvas> dibuje el fotograma.
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame} from 'invokard-studio';
import * as THREE from 'three';
import {CITRICOS, lienzoHoja, lienzoRelieveRodaja, lienzoRodaja} from './dibujos.js';
import {crearEntorno} from './entorno.js';
import {dibujarEtiqueta} from './etiqueta.js';
import {
  ALTO_LATA,
  crearGeometriaAbertura,
  crearGeometriaAnilla,
  crearGeometriaHoja,
  crearGeometriaPeana,
  crearGeometriasLata,
  puntoPintado,
  repartirGotas,
  S_PINTADO,
  Y_PANEL_TAPA,
  ZONAS_ETIQUETA,
} from './geometria.js';
import {apertura, barrido, camara, empujon, giroEntorno, hundimientoPeana, lata, orbita, separacion, T_BOTE_1, T_IMPACTO} from './movimiento.js';
import {HOJAS, RODAJAS} from './piezas.js';
import {lienzoFondo, lienzoSombra, texturaDeLienzo} from './texturas.js';
import {clamp, escalon, FPS, generador, lerp, mezcla, oscurece} from './util.js';

// ---------------------------------------------------------------------------
// Ajustes de la escena
// ---------------------------------------------------------------------------
export const CAMPO_VISION = 28; // grados, vertical (un teleobjetivo corto: poca deformación)
const RADIO_PEANA = 1.85;
const N_GOTAS = 620; // gotas de condensación
const N_RASTROS = 12; // hueco para los rastros de las gotas que resbalan (hay 8)
const N_BURBUJAS = 90;
const N_SALPICADURA = 84;
const OBTURADOR = 0.75; // fracción del fotograma que «expone» el giro rápido (desenfoque de la etiqueta)
const GIRO_NITIDO = 2.2; // rad/s: por debajo de esta velocidad la etiqueta sale nítida (el giro de expositor no se emborrona)
const GRADOS = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Recursos: geometrías, texturas y materiales. Se crean una vez por pestaña de render.
// ---------------------------------------------------------------------------
const crearRecursos = (datos, gl) => {
  const col = datos.colores;
  const pal = CITRICOS[datos.citrico] || CITRICOS.limon;
  const tx = {
    etiqueta: texturaDeLienzo(dibujarEtiqueta(datos, ZONAS_ETIQUETA), {repetir: true}),
    rodaja: texturaDeLienzo(lienzoRodaja(pal)),
    relieveRodaja: texturaDeLienzo(lienzoRelieveRodaja(), {color: false}),
    hoja: texturaDeLienzo(lienzoHoja(col.hoja)),
    sombra: texturaDeLienzo(lienzoSombra()),
    fondo: texturaDeLienzo(lienzoFondo(col), {anisotropia: 1}),
  };
  const entorno = crearEntorno(gl, col);

  // Etiqueta: tinta sobre aluminio con barniz. El desenfoque de giro se hace en el shader:
  // girar la lata es desplazar la textura en horizontal, así que basta promediar varias muestras.
  //
  // El reflejo que recorre la lata también va aquí: es una franja de luz que depende de hacia dónde
  // mira cada punto de la chapa (la normal), igual que el reflejo de una caja de luz alargada, pero
  // con la posición, el ancho y la fuerza a nuestro gusto (uBarrido = posición de -1 a 1, ancho, fuerza).
  const giroBorroso = {value: 0};
  const filoDeLuz = {value: new THREE.Vector3(-1.25, 0.085, 0)};
  const etiqueta = new THREE.MeshPhysicalMaterial({map: tx.etiqueta, metalness: 0.45, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.16});
  etiqueta.onBeforeCompile = (shader) => {
    shader.uniforms.uGiroBorroso = giroBorroso;
    shader.uniforms.uBarrido = filoDeLuz;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform float uGiroBorroso;\nuniform vec3 uBarrido;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = vec4( 0.0 );
          for ( int i = 0; i < 32; i ++ ) {
            float k = ( float( i ) + 0.5 ) / 32.0 - 0.5;
            sampledDiffuseColor += texture2D( map, vMapUv + vec2( k * uGiroBorroso, 0.0 ) );
          }
          diffuseColor *= sampledDiffuseColor / 32.0;
        #endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float dBarrido = normal.x - uBarrido.x;
        float filoBarrido = exp( - dBarrido * dBarrido / ( uBarrido.y * uBarrido.y ) );
        float haloBarrido = exp( - dBarrido * dBarrido / ( 12.0 * uBarrido.y * uBarrido.y ) );
        outgoingLight += vec3( uBarrido.z * ( filoBarrido + 0.25 * haloBarrido ) );
        #include <opaque_fragment>`,
      );
  };
  etiqueta.customProgramCacheKey = () => 'etiqueta-giro-borroso';

  // Agua: transparente y con refracción (a través de cada gota se ve la etiqueta deformada).
  // El brillo va más subido que en el agua real para que cada gota «pique» de luz como en un anuncio.
  const agua = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness: 0.16,
    ior: 1.4,
    roughness: 0.17,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    attenuationColor: '#cfe0ee',
    attenuationDistance: 0.4,
    envMapIntensity: 1.6,
  });
  agua.specularColor = new THREE.Color(3, 3, 3);

  // las gotas que saltan llevan un punto de luz propia para que se vean contra el fondo
  const aguaSalpica = agua.clone();
  aguaSalpica.specularColor = new THREE.Color(3, 3, 3);
  aguaSalpica.emissive = new THREE.Color('#cfeaff');
  aguaSalpica.emissiveIntensity = 0.12;

  const mat = {
    etiqueta,
    agua,
    aguaSalpica,
    aluminio: new THREE.MeshStandardMaterial({color: '#dfe2e6', metalness: 1, roughness: 0.25}),
    anilla: new THREE.MeshStandardMaterial({color: '#cfd3d9', metalness: 1, roughness: 0.34}),
    abertura: new THREE.MeshStandardMaterial({color: '#8d9299', metalness: 1, roughness: 0.5}),
    // sombra que cada gota deja sobre la chapa: es lo que le da bulto
    sombraGota: new THREE.MeshBasicMaterial({map: tx.sombra, color: '#000a1e', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2}),
    burbuja: new THREE.MeshPhysicalMaterial({color: '#ffffff', transmission: 1, thickness: 0.05, ior: 1.3, roughness: 0.03, metalness: 0, clearcoat: 1, envMapIntensity: 1.8, emissive: '#ffffff', emissiveIntensity: 0.05}),
    rodajaCara: new THREE.MeshPhysicalMaterial({
      map: tx.rodaja,
      color: '#b6b6b6', // un punto más oscura: con la luz de plató, la pulpa se quemaba a blanco
      roughness: 0.62,
      specularIntensity: 0.3,
      bumpMap: tx.relieveRodaja,
      bumpScale: 2.2,
      envMapIntensity: 0.6,
      emissive: '#ffffff',
      emissiveMap: tx.rodaja,
      emissiveIntensity: 0.16,
    }),
    rodajaCorteza: new THREE.MeshStandardMaterial({color: pal.corteza, roughness: 0.55}),
    hoja: new THREE.MeshStandardMaterial({map: tx.hoja, roughness: 0.5, side: THREE.DoubleSide, emissive: col.hoja, emissiveIntensity: 0.08}),
    peana: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.6, metalness: 0}),
    sombra: new THREE.MeshBasicMaterial({map: tx.sombra, color: oscurece(col.podio, 0.8), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2}),
    sombraNucleo: new THREE.MeshBasicMaterial({map: tx.sombra, color: oscurece(col.podio, 0.88), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4}),
    // aro de luz que se abre sobre la peana cuando cae la lata
    aro: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6}),
  };

  const geo = {
    ...crearGeometriasLata(),
    anilla: crearGeometriaAnilla(),
    abertura: crearGeometriaAbertura(),
    remache: new THREE.CylinderGeometry(0.055, 0.062, 0.03, 24),
    hoja: crearGeometriaHoja(),
    rodaja: new THREE.CylinderGeometry(1, 1, 0.1, 72, 1),
    gota: new THREE.SphereGeometry(1, 22, 14),
    burbuja: new THREE.SphereGeometry(1, 28, 18),
    peana: crearGeometriaPeana(RADIO_PEANA, 5.5, new THREE.Color(col.podio), new THREE.Color(mezcla(col.podio, col.fondoBorde, 0.9))),
    plano: new THREE.PlaneGeometry(1, 1), // tumbado: sombras sobre la peana
    disco: new THREE.PlaneGeometry(2, 2), // de pie: sombra de cada gota
    aro: new THREE.RingGeometry(0.955, 1, 128),
  };
  geo.plano.rotateX(-Math.PI / 2);
  geo.aro.rotateX(-Math.PI / 2);

  const liberar = () => {
    Object.values(tx).forEach((x) => x.dispose());
    Object.values(mat).forEach((x) => x.dispose());
    Object.values(geo).forEach((x) => x.dispose());
    entorno.dispose();
  };
  return {tx, mat, geo, entorno, giroBorroso, filoDeLuz, liberar};
};

// ---------------------------------------------------------------------------
// Gotas de condensación: instancias pegadas a la superficie pintada de la lata
// ---------------------------------------------------------------------------
const Gotas = ({rec, t, velocidad}) => {
  const refGotas = useRef(null);
  const refSombras = useRef(null);
  const gotas = useMemo(() => repartirGotas(N_GOTAS), []);
  useLayoutEffect(() => {
    const M = new THREE.Matrix4();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
    // con el giro rápido las gotas se convierten en trazos y se desvanecen (como en una foto movida)
    const barrida = (Math.max(0, Math.abs(velocidad) - GIRO_NITIDO) / FPS) * OBTURADOR; // ángulo recorrido durante la exposición
    const visible = 1 - escalon(3.5, 10, Math.abs(velocidad));
    // coloca una instancia sobre la chapa: ang alrededor de la lata, s a lo largo del perfil,
    // radios en horizontal (rx), a lo largo del perfil (ry) y hacia fuera (rz); (dx, dy) la desplaza sobre la chapa
    const colocar = (malla, i, ang, s, rx, ry, rz, hundida = 0, dx = 0, dy = 0) => {
      const p = puntoPintado(s);
      const sen = Math.sin(ang), cos = Math.cos(ang);
      X.set(cos, 0, -sen); // tangente horizontal
      Y.set(p.tr * sen, p.ty, p.tr * cos); // hacia arriba, siguiendo el perfil
      Z.set(p.nr * sen, p.ny, p.nr * cos); // hacia fuera
      const px = p.r * sen + X.x * dx + Y.x * dy - Z.x * hundida;
      const py = p.y + X.y * dx + Y.y * dy - Z.y * hundida;
      const pz = p.r * cos + X.z * dx + Y.z * dy - Z.z * hundida;
      M.makeBasis(X.multiplyScalar(rx), Y.multiplyScalar(ry), Z.multiplyScalar(rz));
      M.setPosition(px, py, pz);
      malla.setMatrixAt(i, M);
    };
    const mg = refGotas.current, ms = refSombras.current;
    let estela = gotas.length;
    gotas.forEach((gta, i) => {
      let s = gta.s;
      if (gta.resbala) {
        const x = Math.max(0, t - gta.resbala.desde);
        const r = gta.resbala;
        // baja a tirones: la velocidad sube y baja, pero nunca retrocede
        const bajada = r.velocidad * (x - (0.8 / r.ritmo) * (Math.sin(r.ritmo * x + r.fase) - Math.sin(r.fase)));
        s = Math.max(S_PINTADO.cuerpo0 * 0.6, gta.s - bajada);
        const largo = gta.s - s;
        // rastro corto y aplastado por encima: la película de agua que deja (se seca enseguida, no crece sin fin)
        const rastro = Math.min(largo, 0.22);
        if (rastro > 0.02) colocar(mg, estela, gta.ang, s + rastro / 2 + gta.radio * 0.5, gta.radio * 0.5 * visible, rastro / 2 + gta.radio * 0.3, gta.radio * 0.07 * visible);
        else colocar(mg, estela, gta.ang, s, 0, 0, 0);
        estela++;
      }
      const estirada = 1 + Math.min(5, (barrida * 0.5) / gta.radio);
      const rz = gta.radio * 0.62 * visible;
      colocar(mg, i, gta.ang, s, gta.radio * estirada * visible, gta.radio * gta.alargada * visible, rz, rz * 0.25); // un poco hundida: se ve un casquete
      // sombra: un disco difuso, corrido hacia abajo y hacia la derecha (la luz viene de arriba a la izquierda)
      const rs = gta.radio * 1.55 * visible;
      colocar(ms, i, gta.ang, s, rs * estirada, rs * gta.alargada, 1, -0.004, gta.radio * 0.3, -gta.radio * 0.42);
    });
    mg.count = estela; // solo se dibujan las instancias que se han colocado
    ms.count = gotas.length;
    mg.instanceMatrix.needsUpdate = true;
    ms.instanceMatrix.needsUpdate = true;
  }, [gotas, t, velocidad]);
  return (
    <>
      <instancedMesh ref={refSombras} args={[rec.geo.disco, rec.mat.sombraGota, N_GOTAS]} frustumCulled={false} renderOrder={1} />
      <instancedMesh ref={refGotas} args={[rec.geo.gota, rec.mat.agua, N_GOTAS + N_RASTROS]} frustumCulled={false} />
    </>
  );
};

// ---------------------------------------------------------------------------
// La lata
// ---------------------------------------------------------------------------
const Lata = ({rec, t}) => {
  const p = lata(t);
  const centro = ALTO_LATA / 2;
  return (
    <group position={[0, p.altura, 0]}>
      {/* tambaleo sobre la base (aterrizaje) */}
      <group rotation={[p.tambaleoX, 0, p.tambaleoZ]}>
        {/* ladeo alrededor del centro (plano final) */}
        <group position={[0, centro, 0]} rotation={[p.ladeoX, 0, p.ladeoZ]}>
          {/* aplastamiento, con la base quieta */}
          <group position={[0, -centro, 0]} scale={[p.escalaXZ, p.escalaY, p.escalaXZ]}>
            <group rotation={[0, p.giro, 0]}>
              <mesh geometry={rec.geo.pintado} material={rec.mat.etiqueta} />
              <mesh geometry={rec.geo.fondo} material={rec.mat.aluminio} />
              <mesh geometry={rec.geo.tapa} material={rec.mat.aluminio} />
              <group position={[0, Y_PANEL_TAPA, 0]} rotation={[0, 0.9, 0]}>
                <mesh geometry={rec.geo.anilla} material={rec.mat.anilla} position={[0, 0.02, 0]} />
                <mesh geometry={rec.geo.remache} material={rec.mat.aluminio} position={[0, 0.03, 0]} />
                <mesh geometry={rec.geo.abertura} material={rec.mat.abertura} position={[-0.37, 0.003, 0]} />
              </group>
              <Gotas rec={rec} t={t} velocidad={p.velocidadVisible} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Rodajas y hojas en órbita
// ---------------------------------------------------------------------------
const posicionPieza = (p, t) => {
  const ang = p.angulo * GRADOS + p.sentido * orbita(t) * p.ritmo;
  const emp = empujon(t, p.radio);
  const radio = p.radio * (1 + apertura(t)) + 0.5 * emp;
  const y = p.altura + 0.09 * Math.sin(t * 0.9 + p.fase) + 0.2 * emp;
  return [Math.sin(ang) * radio, y, Math.cos(ang) * radio];
};
const rotacionPieza = (p, t) => {
  const f = orbita(t);
  return [p.pose[0] + p.volteo[0] * f, p.pose[1] + p.volteo[1] * f, p.pose[2] + p.volteo[2] * f];
};

const Flotantes = ({rec, t, conHojas}) => {
  const caras = useMemo(() => [rec.mat.rodajaCorteza, rec.mat.rodajaCara, rec.mat.rodajaCara], [rec]);
  return (
    <>
      {RODAJAS.map((p, i) => (
        <mesh key={'r' + i} geometry={rec.geo.rodaja} material={caras} position={posicionPieza(p, t)} rotation={rotacionPieza(p, t)} scale={[p.tam, p.tam, p.tam]} />
      ))}
      {conHojas &&
        HOJAS.map((p, i) => (
          <mesh key={'h' + i} geometry={rec.geo.hoja} material={rec.mat.hoja} position={posicionPieza(p, t)} rotation={rotacionPieza(p, t)} scale={[p.tam, p.tam, p.tam]} />
        ))}
    </>
  );
};

// ---------------------------------------------------------------------------
// Burbujas que suben
// ---------------------------------------------------------------------------
const Burbujas = ({rec, t}) => {
  const ref = useRef(null);
  const burbujas = useMemo(() => {
    const rnd = generador(909);
    return Array.from({length: N_BURBUJAS}, () => ({
      ang: rnd() * TAU,
      radio: RADIO_PEANA + 0.3 + 1.6 * Math.pow(rnd(), 0.85), // siempre por fuera de la peana: ninguna atraviesa la lata ni la peana
      y0: rnd(),
      sube: 0.45 + 0.9 * rnd(),
      tam: 0.03 + 0.085 * Math.pow(rnd(), 2),
      bamboleo: 0.05 + 0.1 * rnd(),
      ritmo: 1.2 + 1.8 * rnd(),
      fase: rnd() * TAU,
    }));
  }, []);
  useLayoutEffect(() => {
    const malla = ref.current;
    const M = new THREE.Matrix4();
    burbujas.forEach((b, i) => {
      // nacen por debajo del encuadre y mueren por encima: el salto de vuelta nunca se ve
      const suelo = -7;
      const techo = 8.5;
      const k = (b.y0 + (b.sube * t) / (techo - suelo)) % 1;
      const y = lerp(suelo, techo, k);
      const nace = escalon(0, 0.06, k) * (1 - escalon(0.94, 1, k)); // crece al nacer y se apaga al llegar arriba
      const ang = b.ang + 0.25 * Math.sin(t * 0.5 + b.fase);
      const r = b.radio + b.bamboleo * Math.sin(t * b.ritmo + b.fase);
      const tam = b.tam * nace * (1 + 0.06 * Math.sin(t * b.ritmo * 2.3 + b.fase)); // tiembla un poco al subir
      M.makeScale(tam, tam, tam);
      M.setPosition(Math.sin(ang) * r, y, Math.cos(ang) * r);
      malla.setMatrixAt(i, M);
    });
    malla.instanceMatrix.needsUpdate = true;
  }, [burbujas, t]);
  return <instancedMesh ref={ref} args={[rec.geo.burbuja, rec.mat.burbuja, N_BURBUJAS]} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------
// Salpicadura: gotas que salen despedidas cuando la lata golpea la peana
// ---------------------------------------------------------------------------
const GRAVEDAD_GOTAS = 17;
const Salpicadura = ({rec, t}) => {
  const ref = useRef(null);
  const gotas = useMemo(() => {
    const rnd = generador(5150);
    return Array.from({length: N_SALPICADURA}, (_, i) => {
      const segunda = i >= N_SALPICADURA - 18; // las últimas salen en el segundo bote, con menos fuerza
      const f = segunda ? 0.45 : 1;
      const ang = rnd() * TAU;
      return {
        t0: (segunda ? T_BOTE_1 : T_IMPACTO) + 0.03 * rnd(),
        ang,
        y: 0.08 + (segunda ? 0.5 : 1.5) * Math.pow(rnd(), 1.7),
        fuera: f * (1.6 + 3.6 * rnd()),
        arriba: f * (0.6 + 4.6 * Math.pow(rnd(), 1.4)),
        lado: f * (0.8 + 1.8 * rnd()),
        tam: 0.035 + 0.07 * Math.pow(rnd(), 2),
        vida: 0.42 + 0.45 * rnd(),
      };
    });
  }, []);
  useLayoutEffect(() => {
    const malla = ref.current;
    const M = new THREE.Matrix4();
    const pos = new THREE.Vector3(), vel = new THREE.Vector3(), esc = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const eje = new THREE.Vector3(0, 0, 1);
    gotas.forEach((gta, i) => {
      const x = t - gta.t0;
      if (x <= 0 || x >= gta.vida) {
        M.makeScale(0, 0, 0);
        malla.setMatrixAt(i, M);
        return;
      }
      const sen = Math.sin(gta.ang), cos = Math.cos(gta.ang);
      // sale hacia fuera, hacia arriba y un poco de lado (la lata viene girando)
      const vx = sen * gta.fuera + cos * gta.lado, vz = cos * gta.fuera - sen * gta.lado;
      pos.set(sen * 1.02 + vx * x, gta.y + gta.arriba * x - 0.5 * GRAVEDAD_GOTAS * x * x, cos * 1.02 + vz * x);
      vel.set(vx, gta.arriba - GRAVEDAD_GOTAS * x, vz);
      const rapidez = vel.length();
      q.setFromUnitVectors(eje, vel.normalize());
      // crece al salir, se estira con la velocidad y se consume al final; si toca la peana, desaparece
      let tam = gta.tam * escalon(0, 0.05, x) * (1 - escalon(gta.vida * 0.55, gta.vida, x));
      if (pos.y < 0.03 && Math.hypot(pos.x, pos.z) < RADIO_PEANA) tam = 0;
      esc.set(tam, tam, tam * (1 + rapidez * 0.14));
      M.compose(pos, q, esc);
      malla.setMatrixAt(i, M);
    });
    malla.instanceMatrix.needsUpdate = true;
  }, [gotas, t]);
  return <instancedMesh ref={ref} args={[rec.geo.gota, rec.mat.aguaSalpica, N_SALPICADURA]} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------
// Peana y sombra de contacto
// ---------------------------------------------------------------------------
const Peana = ({rec, t}) => {
  const sep = separacion(t);
  const p = lata(t);
  // la sombra se abre y se aclara cuando la lata se separa; con la lata ladeada se corre un poco
  const amplia = lerp(3.0, 5.2, sep);
  return (
    <group position={[0, hundimientoPeana(t), 0]}>
      <mesh geometry={rec.geo.peana} material={rec.mat.peana} />
      <mesh
        geometry={rec.geo.plano}
        material={rec.mat.sombra}
        material-opacity={lerp(0.8, 0.1, Math.pow(sep, 0.6))}
        position={[0.26 + 0.2 * sep - p.ladeoZ * 1.2, 0.004, -0.16 - 0.16 * sep]}
        scale={[amplia * 1.12, 1, amplia]}
        renderOrder={1}
      />
      <mesh geometry={rec.geo.plano} material={rec.mat.sombraNucleo} material-opacity={lerp(0.85, 0, clamp(sep * 5))} position={[0.03, 0.006, -0.02]} scale={[2.2, 1, 2.2]} renderOrder={2} />
      {/* aro de choque: nace bajo la lata y muere al llegar al canto de la peana */}
      {[T_IMPACTO, T_BOTE_1].map((t0, i) => {
        const k = clamp((t - t0) / (i ? 0.34 : 0.5));
        const abre = 1 - Math.pow(1 - k, 3);
        const radio = lerp(1.0, RADIO_PEANA - 0.08, abre);
        return <mesh key={i} geometry={rec.geo.aro} material={rec.mat.aro} material-opacity={(i ? 0.22 : 0.55) * (1 - k) * (k > 0 ? 1 : 0)} position={[0, 0.008, 0]} scale={[radio, 1, radio]} renderOrder={3} />;
      })}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Escena completa
// ---------------------------------------------------------------------------
export const Escena = ({datos}) => {
  const t = useCurrentFrame() / FPS;
  const {gl, scene, camera} = useThree();
  const rec = useMemo(() => crearRecursos(datos, gl), [datos, gl]);

  // fondo y reflejos
  useLayoutEffect(() => {
    scene.background = rec.tx.fondo;
    scene.environment = rec.entorno.texture;
    scene.environmentIntensity = 1.15;
    return () => {
      scene.background = null;
      scene.environment = null;
      rec.liberar();
    };
  }, [rec, scene]);

  // cámara, giro del entorno y desenfoque de giro: se escriben a mano en cada fotograma
  useLayoutEffect(() => {
    const c = camara(t);
    const ce = Math.cos(c.elevacion);
    camera.position.set(c.mira[0] + Math.sin(c.azimut) * ce * c.distancia, c.mira[1] + Math.sin(c.elevacion) * c.distancia, c.mira[2] + Math.cos(c.azimut) * ce * c.distancia);
    camera.lookAt(c.mira[0], c.mira[1], c.mira[2]);
    camera.updateMatrixWorld();
    scene.environmentRotation.set(0, giroEntorno(t), 0);
    rec.giroBorroso.value = (Math.max(0, lata(t).velocidadVisible - GIRO_NITIDO) / TAU / FPS) * OBTURADOR;
    const b = barrido(t);
    rec.filoDeLuz.value.set((b.azimut / 2.3) * 1.12, 0.085, 0.8 * b.fuerza);
  }, [camera, rec, scene, t]);

  const luz = barrido(t);
  const alturaBarrido = 1.74 - 10 * Math.tan(camara(t).elevacion);
  const colorContra = useMemo(() => mezcla('#ffffff', datos.colores.acento, 0.4), [datos]);
  return (
    <>
      {/* luz principal, arriba a la izquierda */}
      <directionalLight position={[-5, 8, 7]} intensity={2.3} color="#fff4e2" />
      {/* contra con color, por detrás a la derecha */}
      <directionalLight position={[6, 3.5, -7]} intensity={2.6} color={colorContra} />
      {/* luz que acompaña al filo que barre la lata: enciende las gotas a su paso */}
      <directionalLight position={[Math.sin(luz.azimut) * 10, alturaBarrido, Math.cos(luz.azimut) * 10]} intensity={3 * luz.fuerza} color="#ffffff" />
      <Peana rec={rec} t={t} />
      <Lata rec={rec} t={t} />
      <Flotantes rec={rec} t={t} conHojas={datos.hojas} />
      <Burbujas rec={rec} t={t} />
      <Salpicadura rec={rec} t={t} />
    </>
  );
};
