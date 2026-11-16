// ============================================================================
//  DATOS DEL ANUNCIO — lo único que hay que tocar para adaptarlo a otro producto
// ============================================================================
//  Cada campo dice qué es y hasta dónde se puede estirar. Si un texto se pasa
//  del límite no se rompe nada (el logotipo y los titulares encogen solos),
//  pero deja de verse grande: respeta los máximos.
//
//  DATOS       → composición «Producto3d»
//  ALTERNATIVO → composición «Producto3dAlt» (otro sabor, otra paleta)
// ============================================================================

export const DATOS = {
  // ---------------- Textos ----------------
  marca: 'SOPLO', // Logotipo de la lata y titular grande. Máx. 7 letras (mejor en mayúsculas).
  tipo: 'Limonada con gas', // Qué es. Se lee en la etiqueta, sobre el logotipo. Máx. 18 caracteres.
  sabor: 'Limón y hierbabuena', // Sabor. Bajo el titular y en la etiqueta. Máx. 22 caracteres.
  sello: 'Nueva', // Palabra del sello redondo que salta junto a la lata. Máx. 6 letras.
  frase: ['Bien fría', 'sabe mejor'], // Titular del plano final, en dos líneas. Máx. 12 caracteres por línea.
  contenido: '330 ml', // Detalle de la etiqueta. Máx. 7 caracteres.
  ingredientes: 'Agua con gas, zumo de limón (12 %), azúcar de caña, hierbabuena y aromas naturales.', // Letra pequeña de la etiqueta. Máx. 110 caracteres.
  pie: false, // Texto opcional debajo de la zona segura (p. ej. 'De venta en tu súper') o false para no ponerlo. Máx. 26 caracteres.

  // ---------------- Fruta ----------------
  citrico: 'limon', // Rodajas que flotan y fruta de la etiqueta: 'limon', 'naranja' o 'lima'.
  hojas: true, // true: hojas verdes flotando y en la etiqueta. false: sin hojas.

  // ---------------- Colores (siempre #RRGGBB) ----------------
  colores: {
    lata: '#FFD21F', // Color principal de la lata (mitad superior de la etiqueta).
    tinta: '#0B2A66', // Color oscuro: logotipo y mitad inferior de la etiqueta. Tiene que contrastar con «lata».
    acento: '#22A3E8', // Color de apoyo: ola de la etiqueta y luz de contra.
    crema: '#FFF7DC', // Claros de la etiqueta: espuma de la ola y textos sobre la tinta.
    hoja: '#3FBF6C', // Verde de las hojas.
    fondoFoco: '#49BEF5', // Fondo: luz del foco que hay detrás de la lata (el tono más claro).
    fondo: '#1178D6', // Fondo: color principal.
    fondoBorde: '#073E8E', // Fondo: esquinas (el tono más oscuro).
    podio: '#2C9DEA', // Peana sobre la que cae la lata.
    texto: '#FFFFFF', // Titulares.
    textoAcento: '#FFD21F', // Segunda línea del titular final y sello redondo.
    textoSello: '#0B2A66', // Letras del sello (tienen que contrastar con «textoAcento»).
  },
};

export const ALTERNATIVO = {
  marca: 'SOPLO',
  tipo: 'Refresco con gas',
  sabor: 'Naranja y jengibre',
  sello: 'Nuevo',
  frase: ['Con chispa', 'de jengibre'],
  contenido: '330 ml',
  ingredientes: 'Agua con gas, zumo de naranja (14 %), azúcar de caña, jengibre y aromas naturales.',
  pie: false,

  citrico: 'naranja',
  hojas: true,

  colores: {
    lata: '#FF8A1F',
    tinta: '#4A1042',
    acento: '#F2508B',
    crema: '#FFF1DA',
    hoja: '#4CB05C',
    fondoFoco: '#C2478B',
    fondo: '#7A1F63',
    fondoBorde: '#2F0A35',
    podio: '#96307A',
    texto: '#FFFFFF',
    textoAcento: '#FFC247',
    textoSello: '#4A1042',
  },
};
