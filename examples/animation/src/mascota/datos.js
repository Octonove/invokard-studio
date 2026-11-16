// Datos de la mascota. Esto es lo ÚNICO que hay que tocar para adaptarla a otro negocio:
// textos, colores y número de libros. Los textos se miden con la fuente ya cargada y, si son largos,
// se ajustan solos (encogen o juntan las letras) sin bajar nunca de 40 px; pasados los límites, se salen de su cartel.

export const DATOS = {
  negocio: 'El Zorro Lector',          // nombre del rótulo. Hasta 16 letras sale a 90 px; con más se encoge. Máximo 32.
  tipo: 'Librería',                    // línea pequeña sobre el nombre, sale en mayúsculas. Máximo 24 letras.
  oferta: {
    linea1: 'Feria del libro',         // antetítulo, sale en mayúsculas. Máximo 24 letras.
    linea2: '−10 % en todo',           // titular. Hasta 13 caracteres sale a unos 100 px; no pases de 15 o bajará de 90 px.
    linea3: 'Del 5 al 8 de diciembre', // detalle. Máximo 33 letras.
  },
  pie: 'Calle del Olmo, 12 · Abrimos los domingos', // dirección al pie (queda por debajo de la zona segura de Instagram). Pon false para ocultarlo. Máximo 42 letras.
  paleta: {
    fondo: '#F6EBD7',     // pared (crema). De este color salen también el suelo, las estanterías y el polvo
    zorro: '#E8742C',     // pelo del zorro
    claro: '#FFF7E8',     // hocico, punta de la cola, papel de los libros y letras del rótulo
    oscuro: '#17393F',    // verde azulado oscuro: rótulo, delantal, ojos y textos del cartel. Tiene que contrastar con "cartel" y con "claro"
    cartel: '#E6A92E',    // mostaza: cartel de la oferta, lámparas y detalles
    acento: '#D5483B',    // libro de arriba (el que vuela), lengua, coloretes y alfombra
  },
  pila: {
    libros: 9,            // número de libros de la pila: de 3 a 10. Donde más luce el número es entre 7 y 10 (la pila pasa de la cabeza)
    colores: ['#17393F', '#E6A92E', '#5E9C92', '#F1DFC0', '#2F6B6F', '#B7C9A8', '#C9772B'], // lomos de abajo arriba; si faltan, se repiten. El de arriba usa "acento"
  },
  zorro: {
    gafas: true,          // gafas redondas de lector
    delantal: true,       // delantal de tendero (con false, barriga clara)
  },
};

// Segundo juego de datos: otra tienda, otra paleta y otra oferta. Sirve de prueba de que nada se rompe al cambiarlo todo.
export const ALTERNATIVO = {
  negocio: 'Papelería Tinta',
  tipo: 'Papelería y regalos',
  oferta: {
    linea1: 'Vuelta al cole',
    linea2: '3 × 2 en bolis',
    linea3: 'Solo hasta el 15 de septiembre',
  },
  pie: false,
  paleta: {
    fondo: '#EAF0F7',
    zorro: '#4B62D6',
    claro: '#FFFFFF',
    oscuro: '#1C2452',
    cartel: '#FFC83D',
    acento: '#FF6B5E',
  },
  pila: {
    libros: 7,
    colores: ['#1C2452', '#FFC83D', '#7FB7E6', '#FFFFFF', '#39C5A3', '#B9A2F0'],
  },
  zorro: {
    gafas: false,
    delantal: true,
  },
};
