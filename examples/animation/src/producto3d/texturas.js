// Texturas del plató, pintadas con código: fondo, sombra de contacto y cajas de luz.
import * as THREE from 'three';
import {conAlfa, generador, mezcla} from './util.js';

// Convierte un lienzo 2D en textura de Three.js.
export const texturaDeLienzo = (lienzo, {color = true, repetir = false, anisotropia = 16} = {}) => {
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropia;
  if (repetir) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
};

// Fondo del plató: degradado con un foco suave detrás de la lata y las esquinas más oscuras.
// Lleva un ruido finísimo para que el degradado no haga bandas al comprimir el vídeo.
export const lienzoFondo = (col, w = 1080, h = 1920) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = col.fondoBorde;
  g.fillRect(0, 0, w, h);
  // foco: centro claro detrás de la lata, que se abre hacia el color principal y muere en las esquinas
  const cx = w * 0.5, cy = h * 0.47;
  const foco = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.62);
  foco.addColorStop(0, col.fondoFoco);
  foco.addColorStop(0.22, mezcla(col.fondoFoco, col.fondo, 0.35));
  foco.addColorStop(0.55, col.fondo);
  foco.addColorStop(1, col.fondoBorde);
  g.fillStyle = foco;
  g.fillRect(0, 0, w, h);
  // disco tono sobre tono y aro fino detrás de la lata: un sol gráfico, muy discreto
  g.fillStyle = conAlfa(col.fondoFoco, 0.16);
  g.beginPath();
  g.arc(cx, cy + h * 0.02, w * 0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = conAlfa(col.fondoFoco, 0.22);
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy + h * 0.02, w * 0.47, 0, Math.PI * 2);
  g.stroke();
  // un velo oscuro arriba y abajo para recoger la mirada hacia el centro
  const velo = g.createLinearGradient(0, 0, 0, h);
  velo.addColorStop(0, conAlfa(col.fondoBorde, 0.55));
  velo.addColorStop(0.22, conAlfa(col.fondoBorde, 0));
  velo.addColorStop(0.72, conAlfa(col.fondoBorde, 0));
  velo.addColorStop(1, conAlfa(col.fondoBorde, 0.65));
  g.fillStyle = velo;
  g.fillRect(0, 0, w, h);
  // ruido de ±2 niveles
  const img = g.getImageData(0, 0, w, h);
  const rnd = generador(77);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 4;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
};

// Mancha de sombra: opaca en el centro y transparente en el borde (blanca: el color lo pone el material).
export const lienzoSombra = (lado = 256) => {
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = lado;
  const g = c.getContext('2d');
  const r = lado / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.78)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.82, 'rgba(255,255,255,0.09)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, lado, lado);
  return c;
};

// Caja de luz: rectángulo blanco con los bordes difuminados (para los reflejos del entorno).
export const lienzoCajaLuz = (borde = 0.22, lado = 128) => {
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = lado;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, lado, lado);
  g.filter = `blur(${lado * borde * 0.5}px)`;
  g.fillStyle = '#fff';
  const m = lado * borde;
  g.fillRect(m, m, lado - 2 * m, lado - 2 * m);
  return c;
};
