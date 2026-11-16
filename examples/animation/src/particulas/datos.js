// DATOS DE LA ANIMACIÓN «PARTÍCULAS QUE ESCRIBEN»
// Esto es lo único que hay que tocar para adaptarla a otro negocio. Todo lo demás se recalcula solo:
// el cuerpo de letra se ajusta al ancho, las partículas se reparten entre las letras y los colores se propagan.
// Los límites de cada campo están junto a él; en NOTAS.md se explica qué pasa si se superan.

// Versión principal: el cartel luminoso de la apertura de un gimnasio inventado.
export const DATOS = {
  // Las DOS formaciones que escribe el enjambre antes del nombre (tienen que ser exactamente dos).
  // Cada formación es una lista de 1 o 2 líneas (3 como mucho). Cada línea se estira hasta ocupar el ancho,
  // así que una línea corta sale enorme y una larga sale pequeña.
  // Límite por línea: de 2 a 10 caracteres (12 como máximo absoluto). Mejor en mayúsculas; admite tildes, ñ, cifras y signos.
  formaciones: [
    ['GRAN', 'APERTURA'],
    ['12', 'ENE'],
  ],

  // Nombre del negocio: la formación final. Una sola línea, de 2 a 8 caracteres (10 como máximo).
  nombre: 'PULSO',

  // Texto pequeño y nítido que aparece debajo del nombre. Máximo 48 caracteres (a partir de unos 36 se encoge
  // para caber, sin bajar de 40 px). Pon '' para no mostrarlo: el nombre y el adorno se centran solos.
  textoPequeno: 'Gimnasio · Calle Mayor, 12',

  // Adorno de partículas que acompaña al nombre:
  //   'latido'  → línea de electrocardiograma bajo el nombre; un pulso la recorre y el nombre late dos veces
  //   'anillo'  → órbita inclinada que rodea el nombre, con un cometa de luz dando vueltas
  //   'ninguno' → solo el nombre
  adorno: 'latido',

  colores: {
    // Tonos de neón, de izquierda a derecha de cada palabra. De 2 a 4 colores vivos y luminosos, en formato #RRGGBB.
    neon: ['#19E3FF', '#6A7CFF', '#FF3FB4'],
    // Tono oscuro hacia el que vira lo que queda al fondo de las letras (les da volumen). #RRGGBB.
    profundo: '#2A1E8F',
    // Fondo: casi negro. Si se aclara, la luz deja de lucir. #RRGGBB.
    fondo: '#05060F',
    // Color del texto pequeño. Claro, casi blanco. #RRGGBB.
    texto: '#EAF4FF',
  },

  // Cantidad de puntos de luz. Entre 8000 y 16000. Con menos, las letras pierden cuerpo; con más, el render tarda más.
  particulas: 14000,

  // Semilla del azar: cambia el reparto de las partículas sin cambiar el diseño. Cualquier número entero.
  semilla: 7,
};

// Versión alternativa: las rebajas de una tienda de moda inventada, con paleta cálida y el adorno de anillo.
export const ALTERNATIVO = {
  formaciones: [
    ['REBAJAS', 'DE VERANO'],
    ['HASTA EL', '50 %'],
  ],
  nombre: 'SIROCO',
  textoPequeno: 'Moda y complementos · Calle Larga, 8',
  adorno: 'anillo',
  colores: {
    neon: ['#FFC53D', '#FF7A2B', '#FF2F6E'],
    profundo: '#7A1A22',
    fondo: '#0A0403',
    texto: '#FFF2E2',
  },
  particulas: 14000,
  semilla: 21,
};
