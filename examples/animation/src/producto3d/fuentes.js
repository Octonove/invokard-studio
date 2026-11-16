// Tipografías (las dos únicas familias del anuncio), cargadas con invokard-studio/google-fonts.
//  - Shrikhand: logotipo y titulares (cursiva gruesa, con aire de marca de refresco).
//  - Outfit: textos pequeños, en mayúsculas espaciadas.
import {loadFont as cargarTitular} from 'invokard-studio/google-fonts/Shrikhand';
import {loadFont as cargarTexto} from 'invokard-studio/google-fonts/Outfit';

const titular = cargarTitular('normal', {weights: ['400'], subsets: ['latin']});
const texto = cargarTexto('normal', {weights: ['500', '700', '800'], subsets: ['latin']});

export const FUENTE_TITULAR = titular.fontFamily;
export const FUENTE_TEXTO = texto.fontFamily;

// Promesa que se cumple cuando las dos familias están listas para pintar (también dentro de un lienzo).
export const fuentesListas = () =>
  Promise.all([titular.waitUntilDone(), texto.waitUntilDone()]).then(() => {
    // document.fonts.load fuerza a que el navegador las tenga disponibles para ctx.font
    const pruebas = [`400 100px "${FUENTE_TITULAR}"`, `500 40px "${FUENTE_TEXTO}"`, `700 40px "${FUENTE_TEXTO}"`, `800 40px "${FUENTE_TEXTO}"`];
    return Promise.all(pruebas.map((p) => document.fonts.load(p, 'SOPLOñí')));
  });
