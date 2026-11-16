# Física de verdad: «La Huerta»

El cartel de una frutería de barrio en el que llueve fruta. Las letras gigantes del nombre son obstáculos sólidos: la fruta rebota en ellas, unas pocas piezas se quedan posadas encima y el resto llena una caja de madera. Al final baja, colgada de una cuerda, la etiqueta con el precio.

Nada está animado a mano. La lluvia es una simulación de Planck.js (un motor de física 2D) y la etiqueta es otra: una cuerda de eslabones con un cartón colgando. Todo se dibuja en SVG.

Vertical, 1080 × 1920, 30 fps, 240 fotogramas (8 s). Sin sonido.

## Cómo se renderiza

Desde la carpeta del kit:

```
node render.mjs fisica              vídeo con DATOS         → out/fisica.mp4
node render.mjs fisica alt          vídeo con ALTERNATIVO   → out/fisica-alt.mp4
node render.mjs fisica foto 120     un fotograma de control → out/fisica-f120.png
```

`Fisica` usa `DATOS` y `FisicaAlt` usa `ALTERNATIVO`, los dos de `datos.js`. La primera vez hace falta conexión: las tipografías se descargan de Google Fonts y quedan guardadas en `.invokard/fonts`, así que después funciona sin internet.

## Qué se puede cambiar

Todo está en `datos.js`. No hay que tocar nada más.

| Campo | Qué es | Límite |
|---|---|---|
| `antetitulo` | Palabra pequeña encima del nombre («LA») | 12 letras. `''` para quitarla |
| `nombre` | La palabra gigante. Sus letras son los obstáculos | De 3 a 9 letras, en mayúsculas. Admite Ñ y tildes |
| `tipo` | Línea fina bajo el nombre | 34 caracteres. Con un `·` se parte en dos y la cuerda cuelga en medio |
| `etiqueta.producto` | Nombre del producto en la etiqueta | 22 caracteres |
| `etiqueta.precio` | Precio | 8 caracteres, con coma decimal y € |
| `etiqueta.unidad` | Unidad, en pequeño junto al precio | 6 caracteres. `''` para quitarla |
| `pie` | Texto del mostrador, abajo del todo | 50 caracteres. `false` para ocultarlo |
| `paleta` | Nueve colores: pared, letras, toldo, claro, mostrador, madera, etiqueta, tinta y acento | `#RRGGBB` |
| `mezcla` | Qué fruta llueve y cuánta de cada una | De 90 a 130 piezas en total |
| `seQuedan` | Cuántas piezas se quedan posadas en las letras | De 0 a 14 |
| `semilla` | Cambia la lluvia entera por otra distinta | Cualquier entero |

Frutas disponibles: `naranja`, `limon`, `manzana`, `fresa`, `arandano`, `sandia`, `platano` y `rodaja`. Cada línea de la mezcla admite `tam` (de 0.4 a 1.3) y `color`, así que con las mismas formas salen mandarinas, limas, pomelos o kumquats (mira `ALTERNATIVO`).

Lo que se recoloca solo al cambiar los datos:

- El nombre se ajusta al ancho. Cuantas menos letras, más grandes; con tildes o Ñ se encoge lo justo para que quepan.
- La silueta con la que choca la fruta se saca de la propia tipografía, letra a letra. Vale cualquier letra, cifra o signo que tenga la fuente.
- El tamaño de la fruta se escala para que la caja quede llena con cualquier cantidad.
- La etiqueta cuelga por el hueco entre dos letras que quede más cerca de su sitio.
- Los textos largos se encogen en vez de cortarse. Dentro de los límites de la tabla nada baja de 40 px.
- Los colores de sombras, luces y vetas salen de la paleta. Funciona con pared clara y letras oscuras y al revés.

Para probar otra semilla sin tocar el archivo: crea un JSON con `{"semilla": 12}` y añade `--props=ruta/al/archivo.json` al comando.

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `datos.js` | Lo que cambia quien adapta el vídeo |
| `ajustes.js` | Medidas de la escena, física y calendario de la lluvia |
| `letras.js` | Coloca el rótulo y saca la silueta exacta de cada letra |
| `formas.js` | Geometría de cada fruta: de los mismos puntos sale lo que se dibuja y lo que choca |
| `simulacion.js` | La lluvia. Simula los 8 s de una vez y guarda la pose de cada pieza en cada fotograma |
| `etiqueta.js` | La etiqueta colgada, simulada aparte |
| `frutas.jsx` | Dibujo de la fruta |
| `escena.jsx` | Dibujo del decorado: pared, toldo, rótulo, caja, mostrador y etiqueta |
| `index.jsx` | Junta todo y registra las dos composiciones |

Ideas que conviene conocer antes de tocar el código:

- **Cada fotograma es función pura de su número.** La simulación se calcula entera una vez por pestaña y se memoriza; pintar un fotograma es leer su pose. El azar va siempre con semilla.
- **La profundidad es un truco de capas.** La fruta que cae pegada a la pared choca con las letras; tras el rebote «se cae por delante» y deja de chocar con ellas. Una parte de cada oleada cae por delante desde el principio. Solo las de `seQuedan` no se sueltan nunca.
- **La luz no gira.** El dibujo de cada fruta gira con su cuerpo, pero el degradado y el brillo se quedan fijos respecto a la pantalla.
- **Las letras acusan los golpes**, pero solo en el dibujo: un muelle por letra recoge los impulsos del motor. La forma con la que choca la fruta no se mueve.
- **Estela de movimiento.** Cada pieza rápida lleva un desenfoque en la dirección en la que va.
- **Reposo limpio.** Al final el aire «se espesa» para que nada ruede sin fin, y lo que ya solo tiembla se clava en su pose final.

Para ver con qué choca la física, pon `DEPURAR = true` en `index.jsx`: pinta los contornos en magenta y unas cifras de la simulación.

## Qué no hace

- No lleva sonido.
- La fruta no choca con la etiqueta: cuelga por delante del montón.
- La fruta que cae por delante no rebota en las letras. Es lo que permite que la caja se llene con un nombre que ocupa todo el ancho.
- No hay más frutas que las ocho de la lista. Añadir una es dibujarla en `frutas.jsx` y darle forma en `formas.js`.
- No admite dos líneas de nombre gigante ni minúsculas en el rótulo.
- El pie del mostrador queda por debajo de la zona segura de Instagram: la interfaz lo tapa. Es decorado.
- Con nombres de más de 9 letras, o con una palabra pequeña muy larga, las letras salen más bajas y queda menos sitio para que se pose fruta encima.
- La línea fina solo esquiva la cuerda si lleva un `·` cerca de donde cuelga o si cabe entera a su izquierda. Si no, la cuerda la cruza.
- Cambiar cualquier dato de la mezcla, el nombre o la semilla cambia la lluvia entera (es una simulación caótica). Conviene mirar el último fotograma y probar otra semilla si el montón no convence.

## Lo que queda mejorable

Se entregó tras ocho rondas de revisión, sin correcciones abiertas. Estos son los límites que siguen ahí:

- **La parte baja de la caja queda fuera de la zona segura.** El fondo de la caja está en y = 1450 y el límite es 1380: los últimos 70 px del montón y el listón de madera pueden quedar bajo la interfaz de Instagram. El rótulo, la etiqueta y la cima del montón están dentro.
- **Durante el gran volcado (de 2,6 a 3,2 s) la fruta tapa buena parte del nombre.** Es el momento estrella y dura poco, pero en esos fotogramas el rótulo no se lee entero.
- **La cuerda pasa por delante de la fruta posada** que haya caído justo en el hueco entre letras por el que cuelga.
- **Al principio la caja se ve bastante vacía**: en el fotograma 0 hay unas siete piezas en el fondo y otras tantas en el aire o ya posadas en las letras.
- **El desenfoque de movimiento es gaussiano**, no una estela exacta: un fotograma suelto de una pieza muy rápida se ve blando.
- La fruta que se apoya en lo alto de las paredes de la caja queda pegada a los postes laterales, que son las paredes de la física.
