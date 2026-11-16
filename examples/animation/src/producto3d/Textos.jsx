// Titulares en HTML, encima del lienzo 3D (salen nítidos y son fáciles de animar).
// Todo cae dentro de la zona segura de Instagram: y entre 300 y 1380, x entre 60 y 1020
// (menos el pie opcional, que va debajo a propósito y se quita con datos.pie = false).
//
//   0,30 s  entra la marca, letra a letra, mientras cae la lata (y da un bote con el golpe)
//   0,85 s  entra el sabor
//   1,00 s  salta el sello redondo
//   5,08 s  la marca y el sabor se van hacia arriba
//   5,38 s  entra la frase del plano final, palabra a palabra
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing} from 'invokard-studio';
import {FUENTE_TEXTO, FUENTE_TITULAR} from './fuentes.js';
import {T_FINAL, T_IMPACTO, T_SALTO} from './movimiento.js';
import {clamp, conAlfa, golpe, lerp, muelle, prog, suave} from './util.js';

// ---------- instantes ----------
const T_MARCA = 0.3;
const T_SABOR = 0.85;
const T_SELLO = 1.0;
const T_SALE = T_FINAL - 0.22; // la marca y el sabor se retiran
const T_FRASE = T_FINAL + 0.08; // entra la frase final
const T_PIE = 6.1;

// ---------- medidas (píxeles sobre 1080 x 1920) ----------
const TAM_MARCA = 204; // tamaño máximo de la marca; encoge si el nombre es largo
const TAM_FRASE = 124; // tamaño máximo de la frase final
const TAM_SABOR = 46;
const ESPACIADO_SABOR = 0.16; // em entre letras del sabor
const ANCHO_UTIL = 940; // ancho máximo de un titular (deja 70 px de margen a cada lado)
const BASE_MARCA = 514; // borde inferior de la máscara de la marca
const SELLO = {x: 222, y: 742, diametro: 216};

const acelera = Easing.in(Easing.cubic);

// Ancho real de un texto con la tipografía ya cargada (se suma letra a letra, que es como se pinta).
let lienzoDeMedir = null;
const anchoTexto = (texto, familia, tam, peso = 400) => {
  if (!lienzoDeMedir) lienzoDeMedir = document.createElement('canvas').getContext('2d');
  lienzoDeMedir.font = `${peso} ${tam}px "${familia}"`;
  return texto.split('').reduce((suma, letra) => suma + lienzoDeMedir.measureText(letra).width, 0);
};
// Tamaño de letra para que el texto quepa en «ancho» sin pasar de «tamMax».
const tamQueCabe = (ancho, tamMax, anchoATamMax) => Math.min(tamMax, (tamMax * ancho) / Math.max(1, anchoATamMax));

// Línea con máscara: lo que hay dentro sube desde detrás del borde inferior y se asienta con muelle.
const Mascara = ({top, alto, children}) => (
  <div style={{position: 'absolute', left: 0, width: 1080, top, height: alto, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-end'}}>{children}</div>
);

// Contorno festoneado del sello
const festoneado = (radio, lobulos, hondo) => {
  const pts = [];
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const r = radio * (1 - hondo + hondo * Math.cos(a * lobulos));
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
};

export const Textos = ({datos, t}) => {
  const col = datos.colores;
  const sombraTexto = `0 8px 28px ${conAlfa(col.fondoBorde, 0.45)}`;
  const contorno = useMemo(() => festoneado(SELLO.diametro / 2, 16, 0.035), []);

  // Tamaños: se miden los textos de verdad para que ninguno se salga del margen, por largo que sea.
  const medidas = useMemo(() => {
    const sabor = datos.sabor.toUpperCase();
    const anchoSabor = anchoTexto(sabor, FUENTE_TEXTO, TAM_SABOR, 800) + ESPACIADO_SABOR * TAM_SABOR * sabor.length;
    const anchoFrase = Math.max(
      ...datos.frase.map((linea) => {
        const palabras = linea.split(' ');
        return palabras.reduce((suma, p) => suma + anchoTexto(p, FUENTE_TITULAR, TAM_FRASE), 0) + (palabras.length - 1) * 0.26 * TAM_FRASE;
      }),
    );
    return {
      marca: tamQueCabe(ANCHO_UTIL, TAM_MARCA, anchoTexto(datos.marca, FUENTE_TITULAR, TAM_MARCA)),
      sabor: tamQueCabe(ANCHO_UTIL, TAM_SABOR, anchoSabor),
      frase: tamQueCabe(ANCHO_UTIL, TAM_FRASE, anchoFrase),
      sello: tamQueCabe(SELLO.diametro - 42, 62, anchoTexto(datos.sello, FUENTE_TITULAR, 62)),
    };
  }, [datos]);

  // ----- marca: letra a letra -----
  const letras = datos.marca.split('');
  const altoMarca = medidas.marca * 1.22;

  // ----- sabor -----
  const entraSabor = prog(t, T_SABOR, 0.7, suave);
  const saleSabor = prog(t, T_SALE + 0.05, 0.3, acelera);

  // ----- sello -----
  const sello = muelle(t, T_SELLO, {damping: 9, stiffness: 140, mass: 0.8});
  const selloBote = golpe(t, T_SALTO + 0.08, 16, 6);

  // ----- pie -----
  const entraPie = prog(t, T_PIE, 0.6, suave);

  return (
    <AbsoluteFill>
      {/* marca: entra desde abajo y, al final, se va por arriba */}
      <Mascara top={BASE_MARCA - altoMarca} alto={altoMarca}>
        <div style={{fontFamily: FUENTE_TITULAR, fontSize: medidas.marca, lineHeight: 1.22, color: col.texto, whiteSpace: 'nowrap', textShadow: sombraTexto, padding: '0 40px'}}>
          {letras.map((l, i) => {
            const entra = muelle(t, T_MARCA + i * 0.05, {damping: 12, stiffness: 170, mass: 0.8});
            const sale = prog(t, T_SALE + i * 0.03, 0.3, acelera);
            const bote = golpe(t, T_IMPACTO + 0.02 + i * 0.018, 24, 8);
            return (
              <span key={i} style={{display: 'inline-block', transform: `translateY(${(1 - entra - sale) * 108}%) translateY(${bote * -16}px) rotate(${(1 - entra) * 7}deg)`}}>
                {l === ' ' ? ' ' : l}
              </span>
            );
          })}
        </div>
      </Mascara>

      {/* sabor */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: 1080,
          top: 478,
          textAlign: 'center',
          fontFamily: FUENTE_TEXTO,
          fontWeight: 800,
          fontSize: medidas.sabor,
          lineHeight: 1.2,
          letterSpacing: `${lerp(0.42, ESPACIADO_SABOR, entraSabor) + saleSabor * 0.2}em`,
          textIndent: `${ESPACIADO_SABOR}em`, // compensa el espaciado de la última letra: queda centrado de verdad
          textTransform: 'uppercase',
          color: col.texto,
          opacity: entraSabor * (1 - saleSabor),
          transform: `translateY(${(1 - entraSabor) * 18 - saleSabor * 14}px)`,
          textShadow: sombraTexto,
          whiteSpace: 'nowrap',
        }}
      >
        {datos.sabor}
      </div>

      {/* frase del plano final: dos líneas, palabra a palabra */}
      {datos.frase.map((linea, n) => {
        const palabras = linea.split(' ');
        return (
          <Mascara key={n} top={297 + n * TAM_FRASE * 0.97} alto={TAM_FRASE * 1.24}>
            <div style={{fontFamily: FUENTE_TITULAR, fontSize: medidas.frase, lineHeight: `${TAM_FRASE * 1.24}px`, color: n === 1 ? col.textoAcento : col.texto, whiteSpace: 'nowrap', textShadow: sombraTexto, padding: '0 40px'}}>
              {palabras.map((p, i) => {
                const entra = muelle(t, T_FRASE + n * 0.14 + i * 0.07, {damping: 13, stiffness: 150, mass: 0.85});
                return (
                  <span key={i} style={{display: 'inline-block', marginRight: i < palabras.length - 1 ? '0.26em' : 0, transform: `translateY(${(1 - entra) * 108}%) rotate(${(1 - entra) * 5}deg)`}}>
                    {p}
                  </span>
                );
              })}
            </div>
          </Mascara>
        );
      })}

      {/* sello redondo */}
      <div
        style={{
          position: 'absolute',
          left: SELLO.x - SELLO.diametro / 2,
          top: SELLO.y - SELLO.diametro / 2,
          width: SELLO.diametro,
          height: SELLO.diametro,
          transform: `scale(${sello * (1 + 0.1 * selloBote)}) rotate(${lerp(-70, -12, clamp(sello)) + selloBote * 6}deg)`,
          filter: `drop-shadow(0 10px 18px ${conAlfa(col.fondoBorde, 0.4)})`,
        }}
      >
        <svg width={SELLO.diametro} height={SELLO.diametro} viewBox={`${-SELLO.diametro / 2} ${-SELLO.diametro / 2} ${SELLO.diametro} ${SELLO.diametro}`} style={{position: 'absolute', overflow: 'visible'}}>
          {/* el borde festoneado gira despacio; las letras no */}
          <path d={contorno} fill={col.textoAcento} transform={`rotate(${t * 9})`} />
          <circle r={SELLO.diametro / 2 - 17} fill="none" stroke={col.textoSello} strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" transform={`rotate(${-t * 6})`} />
        </svg>
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TITULAR, fontSize: medidas.sello, color: col.textoSello, paddingBottom: 6}}>{datos.sello}</div>
      </div>

      {/* pie opcional, fuera de la zona segura (datos.pie = false lo quita) */}
      {datos.pie ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: 1080,
            top: 1648,
            textAlign: 'center',
            fontFamily: FUENTE_TEXTO,
            fontWeight: 700,
            fontSize: 44,
            letterSpacing: '0.06em',
            color: col.texto,
            opacity: 0.92 * entraPie,
            transform: `translateY(${(1 - entraPie) * 16}px)`,
            textShadow: sombraTexto,
          }}
        >
          {datos.pie}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
