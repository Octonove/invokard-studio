// Builds the bundled font library in animation/fonts/: a few open-licensed (SIL OFL) Google Fonts families with every
// weight they ship, latin + latin-ext only, each with its CSS, its files and its licence. Renders that use one of these
// families never need the network. Maintainers run it once when the list changes:
//   node tools/fetch_fonts.mjs
// (Users never run it: the library is committed, and the local plugin is built from it.)
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const KEEP = new Set(['latin', 'latin-ext']);

// [family, css2 family parameter, folder in github.com/google/fonts/tree/main/ofl]
const FAMILIES = [
  ['Inter', 'Inter:ital,wght@0,100..900;1,100..900', 'inter'],
  ['Outfit', 'Outfit:wght@100..900', 'outfit'],
  ['Figtree', 'Figtree:ital,wght@0,300..900;1,300..900', 'figtree'],
  ['Poppins', 'Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700', 'poppins'],
  ['Montserrat', 'Montserrat:ital,wght@0,100..900;1,100..900', 'montserrat'],
  ['Space Grotesk', 'Space Grotesk:wght@300..700', 'spacegrotesk'],
  ['Barlow', 'Barlow:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700', 'barlow'],
  ['Barlow Condensed', 'Barlow Condensed:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700', 'barlowcondensed'],
  ['Oswald', 'Oswald:wght@200..700', 'oswald'],
  ['Anton', 'Anton', 'anton'],
  ['Bebas Neue', 'Bebas Neue', 'bebasneue'],
  ['Playfair Display', 'Playfair Display:ital,wght@0,400..900;1,400..900', 'playfairdisplay'],
  ['Fraunces', 'Fraunces:ital,wght@0,100..900;1,100..900', 'fraunces'],
  ['Shrikhand', 'Shrikhand', 'shrikhand'],
  ['Caveat', 'Caveat:wght@400..700', 'caveat'],
];

const get = async (url, binary) => {
  const r = await fetch(url, {headers: {'user-agent': UA}});
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
};

rmSync(ROOT, {recursive: true, force: true});
mkdirSync(ROOT, {recursive: true});
const index = {};
let total = 0;
for (const [family, param, ofl] of FAMILIES) {
  const slug = ofl;
  const dir = join(ROOT, slug);
  mkdirSync(dir, {recursive: true});
  const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(param).replace(/%20/g, '+')}&display=block`);
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)].filter(([, subset]) => KEEP.has(subset));
  if (!blocks.length) throw new Error(`No latin blocks for ${family}`);
  const out = [];
  let n = 0;
  for (const [, subset, block] of blocks) {
    let local = block;
    for (const [, url] of block.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
      const name = `${slug}-${String(++n).padStart(2, '0')}.woff2`;
      const data = await get(url, true);
      writeFileSync(join(dir, name), data);
      total += data.length;
      local = local.replace(url, `/__fonts/lib/${slug}/${name}`);
    }
    out.push(`/* ${subset} */\n${local}`);
  }
  writeFileSync(join(dir, 'font.css'), out.join('\n') + '\n');
  writeFileSync(join(dir, 'OFL.txt'), await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${ofl}/OFL.txt`));
  index[family] = slug;
  console.log(`${family}: ${n} files`);
}
writeFileSync(join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(ROOT, 'README.md'), '# Bundled fonts\n\nOpen-licensed Google Fonts families (SIL Open Font Licence 1.1, each folder has its `OFL.txt`), ' +
  'latin and latin-ext, every weight the family ships. Renders that use them need no network. Built with ' +
  '`node tools/fetch_fonts.mjs`.\n\n' + Object.keys(index).map((f) => `- ${f}`).join('\n') + '\n');
console.log(`${Object.keys(index).length} families, ${(total / 1048576).toFixed(2)} MB`);
