// El «plató» que se refleja en la lata. No se descarga ninguna imagen: se monta una escena
// con una bóveda teñida y varias cajas de luz, y se convierte en mapa de entorno (PMREM).
//
// Cómo se lee una lata: el centro refleja lo que hay detrás de la cámara y los bordes, lo que hay
// detrás de la lata. Por eso las cajas laterales traseras dan los filos de luz típicos de un bodegón
// y la pared del fondo, pintada con los colores del fondo, tiñe los cantos y la mete en la escena.
import * as THREE from 'three';
import {lienzoCajaLuz, texturaDeLienzo} from './texturas.js';

const GRADOS = Math.PI / 180;

// Cajas de luz. azimut: 0 = detrás de la cámara, 90 = derecha, 180 = detrás de la lata. Tamaños en unidades a 12 de distancia.
const CAJAS = [
  {nombre: 'principal', azimut: -54, elevacion: 20, ancho: 6.5, alto: 11, fuerza: 5.4, color: '#fff6e8'},
  {nombre: 'relleno', azimut: 36, elevacion: 6, ancho: 10, alto: 11, fuerza: 2.0, color: '#f2f6ff'},
  {nombre: 'filo derecho', azimut: 127, elevacion: 5, ancho: 1.7, alto: 14, fuerza: 15, color: '#ffffff'},
  {nombre: 'filo izquierdo', azimut: -143, elevacion: 5, ancho: 1.2, alto: 14, fuerza: 9, color: '#ffffff'},
  {nombre: 'cenital', azimut: 0, elevacion: 84, ancho: 10, alto: 10, fuerza: 3.4, color: '#ffffff'},
  {nombre: 'contra alta', azimut: 180, elevacion: 17, ancho: 15, alto: 6, fuerza: 2.4, color: '#ffffff'}, // es lo que refleja la tapa
];

const suave = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export const crearEntorno = (gl, col) => {
  const escena = new THREE.Scene();
  const desechables = [];

  // bóveda: gris neutro por delante (para no ensuciar el color de la etiqueta),
  // colores del fondo por detrás y color de la peana por abajo
  const boveda = new THREE.SphereGeometry(40, 64, 32);
  const pos = boveda.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  const neutro = new THREE.Color('#62666c');
  const techo = new THREE.Color('#7b7f85');
  const fondo = new THREE.Color(col.fondo);
  const foco = new THREE.Color(col.fondoFoco);
  const peana = new THREE.Color(col.podio).lerp(new THREE.Color('#c9ccd2'), 0.7).multiplyScalar(0.6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 40, y = pos.getY(i) / 40, z = pos.getZ(i) / 40;
    const atras = suave(-0.1, 0.7, -z);
    const centro = suave(0.55, 1, -z) * (1 - Math.min(1, Math.abs(y) * 1.6));
    c.copy(neutro).lerp(techo, suave(0.3, 0.95, y));
    c.lerp(fondo, atras * 0.95);
    c.lerp(foco, centro * 0.85);
    c.lerp(peana, suave(-0.08, -0.6, y) * 0.85);
    colores.set([c.r, c.g, c.b], i * 3);
    void x;
  }
  boveda.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  const matBoveda = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, toneMapped: false});
  escena.add(new THREE.Mesh(boveda, matBoveda));
  desechables.push(boveda, matBoveda);

  // cajas de luz: planos que suman luz, con el borde difuminado
  const mascara = texturaDeLienzo(lienzoCajaLuz(0.24), {color: false, anisotropia: 1});
  const plano = new THREE.PlaneGeometry(1, 1);
  desechables.push(mascara, plano);
  for (const caja of CAJAS) {
    const mat = new THREE.MeshBasicMaterial({map: mascara, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
    mat.color.set(caja.color).multiplyScalar(caja.fuerza);
    const m = new THREE.Mesh(plano, mat);
    const a = caja.azimut * GRADOS, e = caja.elevacion * GRADOS, d = 12;
    m.position.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d);
    m.scale.set(caja.ancho, caja.alto, 1);
    m.lookAt(0, 0, 0);
    escena.add(m);
    desechables.push(mat);
  }

  const pmrem = new THREE.PMREMGenerator(gl);
  const destino = pmrem.fromScene(escena, 0.012, 0.1, 100);
  pmrem.dispose();
  desechables.forEach((d) => d.dispose());
  return destino; // .texture es el mapa de entorno; quien lo use llama a .dispose() al terminar
};
