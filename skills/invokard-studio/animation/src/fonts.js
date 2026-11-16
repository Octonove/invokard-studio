// Google Fonts for animations:
//   import {loadFont} from 'invokard-studio/google-fonts/Inter';
//   const {fontFamily} = loadFont('normal', {weights: ['400', '700'], subsets: ['latin']});
// or, for any family name:  import {loadGoogleFont} from 'invokard-studio/google-fonts';
// The renderer downloads each font once and keeps it in the project (.invokard/fonts), so later renders work offline.
// No frame is captured until the requested weights are loaded.
import {continueRender, delayRender, __invokard} from 'invokard-studio';

export const createFont = (family) => (style = 'normal', options = {}) => {
  const weights = [...new Set((options.weights && options.weights.length ? options.weights : ['400']).map(String))]
    .sort((a, b) => Number(a) - Number(b));
  const italic = style === 'italic';
  const axis = italic ? `ital,wght@${weights.map((w) => `1,${w}`).join(';')}` : `wght@${weights.join(';')}`;
  const subsets = (options.subsets && options.subsets.length ? options.subsets : ['latin']).join(',');
  const url = `/__fonts/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}&display=block` +
    `&subsets=${encodeURIComponent(subsets)}`;
  const handle = delayRender(`font ${family} ${style} ${weights.join(',')}`);
  const done = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => {
      Promise.all(weights.map((w) => document.fonts.load(`${italic ? 'italic ' : ''}${w} 40px "${family}"`, 'AÁaáñÑ0123€¿?')))
        .then(() => { continueRender(handle); resolve(); }, reject);
    };
    link.onerror = () => reject(new Error(`Could not load the font "${family}" (${style} ${weights.join(', ')}). ` +
      'The first render downloads it from Google Fonts and needs internet; after that it is kept in .invokard/fonts.'));
    document.head.appendChild(link);
  });
  done.catch((e) => __invokard.setFatal(e.message));
  return {fontFamily: family, waitUntilDone: () => done};
};

export const loadGoogleFont = (family, style, options) => createFont(family)(style, options);
