# Partículas que escriben

Cartel luminoso hecho con 14.000 puntos de luz, íntegramente con código (lienzo 2D, sin vídeo, sin imágenes y sin IA).
Vertical para Instagram: 1080 × 1920, 30 fps, 240 fotogramas (8 s).

## Qué se ve

1. **0,0–1,0 s · Enjambre.** Una cinta de partículas sube en espiral, con degradado de un tono de neón a otro y polvo desenfocado alrededor.
2. **1,0–3,0 s · Primera formación.** La cabeza de la cinta se deshace en un abanico y escribe la palabra de izquierda a derecha. Las letras tienen grosor, giran unos grados con perspectiva, centellean y las cruza un brillo.
3. **3,0–5,3 s · Estallido y segunda formación.** La palabra se traga a sí misma girando, estalla en una estrella (destello, raya de luz, aro de onda expansiva, sacudida de cámara) y las partículas cristalizan del centro hacia fuera en la segunda formación.
4. **5,3–8,0 s · Estallido y nombre.** Segundo estallido; el nombre se escribe de izquierda a derecha con su adorno (electrocardiograma que late dos veces, o anillo en órbita) y debajo entra el texto pequeño, nítido, en HTML.

## Cómo se renderiza

Desde la carpeta del kit:

```
node render.mjs particulas              vídeo con DATOS         → out/particulas.mp4
node render.mjs particulas alt          vídeo con ALTERNATIVO   → out/particulas-alt.mp4
node render.mjs particulas foto 120     un fotograma de control → out/particulas-f120.png
```

`Particulas` usa `DATOS` y `ParticulasAlt` usa `ALTERNATIVO`, los dos de `datos.js`. La primera vez hace falta conexión: las tipografías se descargan de Google Fonts y quedan guardadas en `.invokard/fonts`, así que después funciona sin internet.

## Qué se puede cambiar (solo `datos.js`)

| Campo | Qué es | Límite |
|---|---|---|
| `formaciones` | Las dos formaciones que se escriben antes del nombre. Cada una es una lista de líneas. | Exactamente **2** formaciones. Cada formación, **1 o 2 líneas** (3 como máximo). Cada línea, de **2 a 10 caracteres** (12 como máximo). |
| `nombre` | El nombre final. | Una línea, de **2 a 8 caracteres** (10 como máximo). |
| `textoPequeno` | Texto nítido bajo el nombre. | **48 caracteres** como máximo. `''` lo oculta. |
| `adorno` | Adorno de partículas junto al nombre. | `'latido'`, `'anillo'` o `'ninguno'`. |
| `colores.neon` | Tonos de las partículas, de izquierda a derecha. | De **2 a 4** colores `#RRGGBB`, vivos y claros. |
| `colores.profundo` | Tono oscuro del fondo de las letras. | `#RRGGBB`, oscuro y saturado. |
| `colores.fondo` | Fondo. | `#RRGGBB`, casi negro. |
| `colores.texto` | Color del texto pequeño. | `#RRGGBB`, casi blanco. |
| `particulas` | Cantidad de puntos de luz. | De **8000 a 16000**. |
| `semilla` | Cambia el reparto al azar sin cambiar el diseño. | Cualquier entero. |

Cómo se comportan los textos:

- Cada línea se estira hasta ocupar el ancho (880 px), así que las líneas de una formación quedan justificadas en bloque: una línea corta sale enorme y una larga, pequeña. Si el bloque no cabe de alto (880 px), se encoge entero.
- Admite mayúsculas, minúsculas, tildes, ñ, cifras y signos (`¡`, `!`, `%`, `:`…). Con mayúsculas las letras quedan más llenas y se leen mejor.
- Por encima de 12 caracteres en una línea, o con 3 líneas largas, las letras salen tan pequeñas que los puntos ya no las dibujan bien: es mejor partir el texto en dos líneas o acortarlo.
- El texto pequeño se compone a 48 px; si es largo se encoge hasta caber, sin bajar de 40 px. Con más de unos 48 caracteres se saldría de los márgenes.
- Con el adorno `'anillo'` el nombre se compone algo más estrecho (740 px) para que la órbita lo rodee sin pisarlo.
- Si `textoPequeno` está vacío o el adorno es `'ninguno'`, el conjunto del final se vuelve a centrar solo.

Zonas seguras de Instagram: todo el texto queda entre y = 300 e y = 1380 y a más de 60 px de los lados cuando está formado y se lee. No hay pie por debajo de y = 1380, así que no hace falta el campo `pie`.

## Ajustes finos (dentro del código, con las constantes arriba de cada archivo)

- `mundo.js`: línea de tiempo (`T_ESCRIBE`, `T_ESTALLA`, `T_TEXTO`…), reparto de partículas (polvo, contorno, paredes, adorno), fuerza del estallido, cámara (claves de giro, cabeceo y zoom).
- `luz.js`: tamaño y brillo de los puntos, largo de las estelas, halos, rayos, grano, viñeta y curva de revelado.
- `formas.js`: composición del texto y reparto parejo de los puntos (disco de Poisson).

## Cómo está hecho

- **Destinos**: cada texto se dibuja en un lienzo oculto con la fuente ya cargada (se espera con `delayRender`/`continueRender`) y se leen sus píxeles. Los de dentro dan el relleno, repartido con separación mínima entre puntos para que quede denso y parejo; los del borde dan el contorno (el «tubo de neón») y las paredes hundidas hacia el fondo, que son el grosor de la letra.
- **Movimiento**: la posición de cada partícula es una fórmula del tiempo: mezcla entre el sitio de origen y el de destino con respuesta de muelle (se pasa un poco y se asienta), retrasos por partícula que forman ondas, impulso de estallido con freno, remolino y turbulencia que se calma al llegar.
- **Profundidad**: cada partícula tiene x, y, z. La cámara gira y cabecea unos grados con perspectiva; lo que se aleja del plano de las letras se desenfoca y pierde brillo.
- **Estelas**: en cada fotograma se evalúa cada partícula en 9 instantes (el actual y 8 anteriores, 0,085 s) y se unen con un trazo que se apaga hacia la cola. Cuando la partícula para, el trazo se reduce a un punto.
- **Luz**: no se pintan colores, se suma luz en una memoria de decimales; el halo son copias reducidas y desenfocadas, y al final una curva de revelado quema hacia el blanco lo que se acumula.
- **Texto pequeño**: es HTML encima del lienzo. El polvo que pasa por detrás de su franja se apaga, para que una mota no parezca un signo de puntuación.
- **Determinismo**: no hay estado entre fotogramas, ni relojes, ni `Math.random`; el azar va con semilla. El mismo fotograma sale idéntico renderizado solo o dentro del vídeo.

Archivos: `datos.js` (lo editable), `formas.js`, `mundo.js`, `luz.js`, `Escena.jsx` (componente), `index.jsx` (composiciones) y `util.js` (utilidades).

Tipografías (dos familias de Google Fonts): Anton para las palabras de partículas y Barlow 500 para el texto pequeño.

## Qué no hace

- No admite más ni menos de dos formaciones antes del nombre (si solo se pone una, se repite). La línea de tiempo está pensada para 8 segundos exactos; cambiar la duración exige mover las constantes de tiempo de `mundo.js`.
- No lleva sonido.
- No reparte palabras largas en varias líneas por su cuenta: las líneas se escriben a mano en `datos.js`.
- No usa logotipos, imágenes ni iconos: solo texto, el electrocardiograma y el anillo.
- No es un bucle perfecto: el último fotograma (nombre formado) no enlaza con el primero (enjambre).
- La escritura de derecha a izquierda y los emojis no están contemplados (Anton no tiene esos glifos y saldrían con otra letra).
- Las partículas se ven como purpurina fina: en una pantalla pequeña o con mucha compresión los puntos sueltos se funden y queda la forma luminosa de las letras, que es lo que importa que se lea.
