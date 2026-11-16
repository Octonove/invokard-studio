# Producto en 3D — el anuncio de una lata, hecho con código

Un spot vertical de 8 segundos (1080 × 1920, 30 fps) de una lata de refresco inventada, «SOPLO».
No hay nada grabado, dibujado a mano ni generado con IA de vídeo: la lata, la etiqueta, las gotas,
las rodajas, las hojas, el plató y los titulares salen de código (Three.js dentro del motor de animación de Invokard Studio).

## Qué se ve

| Segundos | Qué pasa |
|---|---|
| 0,0 – 0,45 | La lata cae girando muy rápido sobre una peana (la etiqueta se emborrona con el giro). El fotograma 0 sale nítido, con el logotipo de frente, para que sirva de miniatura. |
| 0,45 – 1,2 | Golpe: la lata se aplasta, rebota dos veces, salta un puñado de gotas, se abre un aro de luz en la peana y las rodajas se apartan. Entra la marca letra a letra y, después, el sabor y el sello. |
| 1,2 – 5,3 | Giro de expositor: se recrea en el logotipo, cruza con brío el dorso (sello y letra pequeña) y frena en la otra cara. Un filo de luz recorre la lata (1,65–2,95 s), las gotas brillan, alguna resbala, suben burbujas y la cámara se acerca en arco. |
| 5,3 – 6,3 | Gesto final: la lata coge impulso, se eleva y se ladea; la marca se va por arriba y entra la frase. |
| 6,3 – 8,0 | Plano final asentado, con un segundo reflejo. Todo sigue vivo, pero muy despacio. |

## Cómo se renderiza

Desde la carpeta del kit:

```
node render.mjs producto3d              vídeo con DATOS         → out/producto3d.mp4
node render.mjs producto3d alt          vídeo con ALTERNATIVO   → out/producto3d-alt.mp4
node render.mjs producto3d foto 120     un fotograma de control → out/producto3d-f120.png
```

`Producto3d` usa `DATOS` y `Producto3dAlt` usa `ALTERNATIVO`, los dos de `datos.js`. La primera vez hace falta conexión: las tipografías se descargan de Google Fonts y quedan guardadas en `.invokard/fonts`, así que después funciona sin internet.

Si en tu equipo el 3D sale en negro, renderiza con `--gl angle` (o `--gl swangle`: más lento, pero no depende de la tarjeta gráfica).

## Qué se puede cambiar (solo `datos.js`)

| Campo | Qué es | Límite |
|---|---|---|
| `marca` | Logotipo de la lata y titular grande | 7 letras (mejor en mayúsculas) |
| `tipo` | Qué es; va en la etiqueta, sobre el logotipo | 18 caracteres |
| `sabor` | Bajo el titular y en la etiqueta | 22 caracteres |
| `sello` | Palabra del sello redondo | 6 letras |
| `frase` | Titular del plano final: dos líneas | 12 caracteres por línea |
| `contenido` | Detalle de la etiqueta («330 ml») | 7 caracteres |
| `ingredientes` | Letra pequeña de la etiqueta | 110 caracteres |
| `pie` | Texto opcional bajo la zona segura, o `false` | 26 caracteres |
| `citrico` | Rodajas que flotan y fruta de la etiqueta | `'limon'`, `'naranja'` o `'lima'` |
| `hojas` | Hojas verdes flotando y en la etiqueta | `true` o `false` |
| `colores.lata` / `tinta` | Los dos colores de la etiqueta | `#RRGGBB`; tienen que contrastar entre sí |
| `colores.acento` / `crema` / `hoja` | Ola, claros y verde de la etiqueta | `#RRGGBB` |
| `colores.fondoFoco` / `fondo` / `fondoBorde` / `podio` | Plató: del tono más claro al más oscuro, y la peana | `#RRGGBB` |
| `colores.texto` / `textoAcento` / `textoSello` | Titulares, segunda línea de la frase y sello, letras del sello | `#RRGGBB` |

Si un texto se pasa del límite no se rompe nada: los titulares, el sello y los textos de la etiqueta
se miden y encogen para caber. Simplemente dejan de verse tan grandes.

Consejos de color: la lata luce más con un fondo de color opuesto (amarillo sobre azul, naranja sobre
ciruela). `tinta` debe ser oscura (lleva encima textos claros) y `lata`, clara o viva.

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `index.jsx` | Registra las dos composiciones: `Producto3d` (DATOS) y `Producto3dAlt` (ALTERNATIVO). |
| `datos.js` | Lo único que hay que tocar para adaptarlo. |
| `Anuncio.jsx` | Junta el lienzo 3D, los titulares y un grano fino. Espera a las tipografías antes de montar nada. |
| `Escena.jsx` | La escena 3D: materiales, lata, gotas, rodajas, hojas, burbujas, salpicadura, peana y luces. |
| `movimiento.js` | La coreografía entera: funciones puras del tiempo (caída, rebotes, giro, cámara, reflejo, órbitas). |
| `piezas.js` | Dónde queda cada rodaja y cada hoja en el plano final y cómo llega hasta ahí. |
| `etiqueta.js` | La etiqueta de la lata, dibujada en un lienzo 2D de 4096 × 2048. |
| `dibujos.js` | Cítricos y hojas dibujados con código (planos para la etiqueta, con relieve para las piezas 3D). |
| `geometria.js` | Perfil torneado de la lata, anilla, hoja, peana y reparto de las gotas. |
| `entorno.js` | El plató que se refleja en la lata: cajas de luz montadas con código (sin imágenes HDR). |
| `texturas.js` | Fondo, sombra de contacto y cajas de luz, pintados en lienzos. |
| `Textos.jsx` | Titulares en HTML (marca, sabor, frase, sello y pie). |
| `fuentes.js` | Las dos tipografías: Shrikhand (logotipo y titulares) y Outfit (textos pequeños). |
| `util.js` | Curvas, muelles, azar con semilla y mezcla de colores. |

Algunos trucos que conviene conocer antes de tocar:

- **Nada depende del fotograma anterior.** No hay `useFrame`, relojes ni `Math.random`. Los ángulos que
  resultan de girar a velocidad variable se integran una vez en una tabla (`movimiento.js`).
- **Lo que se escribe a mano en Three.js** (matrices de instancias, cámara, giro del entorno) va en
  `useLayoutEffect`, que se ejecuta antes de que `<ThreeCanvas>` dibuje el fotograma.
- **Desenfoque de giro.** Girar la lata es desplazar la textura en horizontal, así que el shader de la
  etiqueta promedia 32 muestras a lo ancho. Solo actúa por encima de 2,2 rad/s (`GIRO_NITIDO`).
- **Reflejo que recorre la lata.** Es una franja añadida en el shader según hacia dónde mira la chapa
  (`uBarrido`), como el reflejo de una caja de luz alargada. Se programa en `PASADAS` (`movimiento.js`).
- **Gotas.** 620 instancias con refracción (`transmission`) más un disco de sombra por gota. Las ocho que
  resbalan y las más gordas se colocan fuera del logotipo y del sabor.
- **El plano final manda.** Cada rodaja y cada hoja se define por su sitio en el segundo 7 y orbita
  hacia atrás desde ahí. Las que van a la altura de la etiqueta llegan siempre por detrás de la lata.
- **Nitidez.** El lienzo 3D se calcula al doble de resolución (`SOBREMUESTREO` en `Anuncio.jsx`) además
  del antialias. Bajarlo a 1 acelera el render y deja los bordes algo más duros.
- **Grano.** `GRANO` en `Anuncio.jsx` (0,04). Ponerlo a 0 lo quita y el archivo pesa menos.

## Qué no hace

- No lleva sonido.
- La lata es siempre una lata de 330 ml: no hay botella, brik ni otros formatos, y su forma no se edita desde `datos.js`.
- Dos caras iguales en la etiqueta, con un sello y un bloque de letra pequeña entre ellas. La composición de la etiqueta es fija: cambian textos, fruta y colores.
- Solo tres cítricos (limón, naranja, lima). Otra fruta exige dibujarla en `dibujos.js`.
- El código de barras, la dirección y los ingredientes son de atrezo.
- El tiempo está pensado para 8 segundos a 30 fps. Cambiar la duración obliga a reajustar los instantes de `movimiento.js` y `Textos.jsx`.
- No hay desenfoque de profundidad ni sombras proyectadas entre piezas: la sombra de la lata sobre la peana es una mancha difusa que sigue su altura.
- Las burbujas son ambiente: no salen de la lata.

## Límites conocidos

- Con cuatro pestañas de render a la vez, un mismo fotograma puede diferir en un puñado de píxeles (9 de
  2 millones, 2 niveles de 255 como mucho en la prueba) respecto al mismo fotograma renderizado suelto.
  Dos renders sueltos del mismo fotograma dan archivos idénticos.
- Si `colores.lata` es muy oscuro, las gotas se ven menos sobre la mitad superior y el logotipo pierde contraste.
- El pie opcional cae sobre el frente de la peana; con textos de más de 26 caracteres se sale de ella.
