// ─────────────────────────────────────────────────────────────────────────────
//  LO ÚNICO QUE HAY QUE TOCAR PARA ADAPTAR LA ANIMACIÓN A OTRO NEGOCIO
//  Cambia textos, colores y la mezcla de fruta. El resto se recoloca solo:
//  las letras nuevas pasan a ser los obstáculos, la caja se llena igual
//  y la etiqueta cuelga por el hueco que quede entre dos letras.
// ─────────────────────────────────────────────────────────────────────────────
//
//  Frutas disponibles para `mezcla` (cada una con su forma física):
//    'naranja'  redonda            'limon'    ovalada con pezón     'manzana' redonda con rabito
//    'fresa'    corazón pequeño    'arandano' bolita                'sandia'  tajada (media luna)
//    'platano'  curvo              'rodaja'   media rodaja de cítrico
//  En cada línea de la mezcla puedes añadir:
//    tam:   multiplica el tamaño (de 0.4 a 1.3). Ej.: una naranja con tam 0.72 es una mandarina.
//    color: color de la piel en #RRGGBB. Ej.: un limón verde es una lima.
//
//  Los límites de letras son los que mantienen todo grande y legible en un móvil.
//  Si te pasas, el texto no se corta: se encoge.

export const DATOS = {
  // Palabra pequeña que va encima del nombre. Máximo 12 letras. Déjala vacía ('') si no hay.
  antetitulo: 'LA',
  // La palabra gigante: sus letras son los obstáculos contra los que rebota la fruta.
  // De 3 a 9 letras, en mayúsculas (admite Ñ y tildes). Cuantas menos letras, más grandes salen.
  nombre: 'HUERTA',
  // Línea fina bajo el nombre. Máximo 34 caracteres.
  // Si lleva un punto medio (·), se parte ahí en dos trozos y la cuerda de la etiqueta cuelga entre ambos.
  tipo: 'FRUTERÍA DE BARRIO · DESDE 1987',

  // Etiqueta de precio que baja colgada al final.
  etiqueta: {
    producto: 'Naranjas de zumo',   // máximo 22 caracteres
    precio: '1,20 €',               // máximo 8 caracteres, con coma decimal y símbolo del euro
    unidad: '/kg',                  // máximo 6 caracteres ('' para quitarla)
  },

  // Texto del mostrador, abajo del todo (queda bajo los botones de Instagram). Máximo 50 caracteres.
  // Pon `pie: false` para ocultarlo.
  pie: 'Calle del Olmo, 12 · De lunes a sábado',

  // Paleta. Todo lo demás (sombras, luces, vetas de la madera) se calcula a partir de estos colores.
  paleta: {
    pared: '#F5E9D0',      // fondo
    letras: '#1C5340',     // nombre gigante y línea fina (que contraste con la pared)
    toldo: '#1C5340',      // rayas oscuras del toldo
    claro: '#FBF4E3',      // rayas claras del toldo y texto del mostrador
    mostrador: '#1C5340',  // frente del mostrador, abajo del todo (mejor oscuro)
    madera: '#D8A465',     // caja y postes
    etiqueta: '#1C5340',   // cartón de la etiqueta
    tinta: '#FBF4E3',      // texto de la etiqueta (que contraste con el cartón)
    acento: '#FFC53D',     // precio
  },

  // Qué llueve y cuánto. Total recomendado: de 90 a 130 piezas.
  // El tamaño se ajusta solo para que la caja quede llena sea cual sea la cantidad.
  mezcla: [
    {fruta: 'naranja', cantidad: 18},
    {fruta: 'manzana', cantidad: 10},
    {fruta: 'limon', cantidad: 11},
    {fruta: 'fresa', cantidad: 19},
    {fruta: 'arandano', cantidad: 40},
    {fruta: 'sandia', cantidad: 5},
    {fruta: 'platano', cantidad: 5},
  ],
  // Cuántas piezas se quedan posadas encima de las letras (de 0 a 14). Las enormes (sandía, plátano) nunca se quedan.
  seQuedan: 9,
  // Cambia este número para obtener otra lluvia distinta (cualquier entero). Con la misma semilla sale siempre igual.
  semilla: 5,
};

// Otra tienda con los mismos mimbres: solo cítricos, pared azul, letras claras y sin texto en el mostrador.
export const ALTERNATIVO = {
  antetitulo: 'EL',
  nombre: 'LIMONAR',
  tipo: 'CÍTRICOS DE TEMPORADA · VALENCIA',
  etiqueta: {
    producto: 'Limones del terreno',
    precio: '1,90 €',
    unidad: '/kg',
  },
  pie: false,
  paleta: {
    pared: '#1F4B8E',
    letras: '#FFF3D4',
    toldo: '#FFC531',
    claro: '#FFF8E6',
    mostrador: '#173E78',
    madera: '#DDB076',
    etiqueta: '#FFF3D4',
    tinta: '#1B3F7A',
    acento: '#E4572E',
  },
  mezcla: [
    {fruta: 'limon', cantidad: 16},
    {fruta: 'naranja', cantidad: 12},
    {fruta: 'naranja', cantidad: 16, tam: 0.72, color: '#F47A1F'},   // mandarinas
    {fruta: 'limon', cantidad: 12, tam: 0.8, color: '#8CC63F'},      // limas
    {fruta: 'naranja', cantidad: 5, tam: 1.22, color: '#F6B14A'},    // pomelos
    {fruta: 'rodaja', cantidad: 8},
    {fruta: 'limon', cantidad: 24, tam: 0.42, color: '#F6922A'},     // kumquats
  ],
  seQuedan: 8,
  semilla: 22,
};
