# Mascota: el zorro librero

Animación vertical de 8 segundos (1080 × 1920, 30 fps, 240 fotogramas) hecha solo con código: un personaje 2D en SVG con esqueleto calculado fotograma a fotograma. No hay imágenes, vídeos ni iconos descargados; lo único que viene de fuera son dos tipografías de Google Fonts (Fraunces y Figtree).

## Qué se ve

El zorro de la librería «El Zorro Lector» entra andando con una pila de libros más alta que él. Frena en seco, la pila se vence hacia delante, el libro de arriba resbala, sale despedido por detrás y el zorro lo caza al vuelo con la cola. Mira la pila, calcula, y lo devuelve a su sitio de un coletazo. Suspira, deja la pila en el suelo, se gira a cámara, saluda y se desenrolla el cartel con la oferta. Termina con un guiño.

| Tramo | Segundos | Qué pasa |
|---|---|---|
| Entrada | 0,0 – 1,8 | Anda con la pila: los pies no patinan, el cuerpo bota, la pila se cimbrea en S y la cola llega tarde |
| Frenazo | 1,8 – 2,8 | Se queda a la pata coja, cola tiesa, ojos como platos; el libro de arriba resbala |
| La cola lo salva | 2,8 – 4,5 | El libro vuela hacia atrás, la cola lo caza y lo lanza de vuelta a la pila |
| Suspiro y pila al suelo | 4,5 – 5,4 | Alivio, se agacha y la pila cae los últimos centímetros con un aplastamiento |
| Oferta | 5,4 – 8,0 | Se gira, saluda, se desenrolla el cartel, guiño y reposo (respira, menea la punta de la cola) |

La cámara se acerca un 10 % mientras dura el número y se abre para el cartel; el fondo, el zorro y las hojas del primer plano la siguen en distinta medida, y eso da profundidad.

## Cómo se renderiza

Desde la carpeta del kit:

```
node render.mjs mascota              vídeo con DATOS         → out/mascota.mp4
node render.mjs mascota alt          vídeo con ALTERNATIVO   → out/mascota-alt.mp4
node render.mjs mascota foto 120     un fotograma de control → out/mascota-f120.png
```

`Mascota` usa `DATOS` y `MascotaAlt` usa `ALTERNATIVO`, los dos de `datos.js`. La primera vez hace falta conexión: las tipografías se descargan de Google Fonts y quedan guardadas en `.invokard/fonts`, así que después funciona sin internet.

## Qué se puede cambiar (solo `datos.js`)

| Campo | Qué es | Límite |
|---|---|---|
| `negocio` | Nombre del rótulo | Hasta 16 letras sale a 90 px; con más se encoge solo. Máximo 32 (a 40 px) |
| `tipo` | Línea pequeña sobre el nombre, en mayúsculas | Máximo 24 letras |
| `oferta.linea1` | Antetítulo del cartel, en mayúsculas | Máximo 24 letras |
| `oferta.linea2` | Titular de la oferta | Hasta 13 caracteres sale a unos 100 px; con 15 queda en 90 px. Más largo sigue cabiendo, pero ya no es un titular |
| `oferta.linea3` | Detalle (fechas, condiciones) | Máximo 33 letras |
| `pie` | Dirección al pie, por debajo de la zona segura | Máximo 42 letras. `false` lo oculta |
| `paleta.fondo` | Pared; de él salen suelo, estanterías y polvo | Color claro |
| `paleta.zorro` | Pelo del zorro; de él salen patas, cejas y sombras | Cualquier color medio |
| `paleta.claro` | Hocico, punta de la cola, papel, letras del rótulo | Blanco o casi |
| `paleta.oscuro` | Rótulo, delantal, ojos, textos del cartel | Oscuro: tiene que contrastar con `cartel` y `claro` |
| `paleta.cartel` | Cartel de la oferta, lámparas, lápiz | Color vivo y claro |
| `paleta.acento` | Libro de arriba (el que vuela), lengua, coloretes, alfombra | Color vivo |
| `pila.libros` | Número de libros | De 3 a 10. Luce más entre 7 y 10 |
| `pila.colores` | Colores de los lomos, de abajo arriba | Los que se quieran; si faltan, se repiten. El de arriba usa `acento` |
| `zorro.gafas` | Gafas redondas | `true` o `false` |
| `zorro.delantal` | Delantal de tendero (sin él, barriga clara) | `true` o `false` |

Los textos se miden con la fuente ya cargada y se ajustan solos: el nombre y el titular encogen, las líneas en mayúsculas juntan las letras. Ninguno baja de 40 px; si se pasa del máximo, se sale de su cartel.

Todos los demás colores (sombras, madera, suelo, alfombra, hojas) se calculan mezclando esos seis, así que al cambiar la paleta todo acompaña.

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `datos.js` | Lo único que hay que tocar para adaptarla |
| `guion.mjs` | El guion: tiempos, medidas del esqueleto y qué hace cada parte del cuerpo en cada instante. Solo números, sin React |
| `Zorro.jsx` | Dibuja el zorro a partir de la pose |
| `Libros.jsx` | La pila y el libro que vuela |
| `Fondo.jsx` | Pared, lámparas, estanterías, suelo, alfombra y hojas del primer plano |
| `Rotulo.jsx` | Rótulo, cartel de la oferta, destellos y pie; aquí se cargan las fuentes |
| `Efectos.jsx` | Sombras en el suelo, polvo, rayitas de golpe y gotas de susto |
| `Escena.jsx` | Lo junta todo en capas y aplica la cámara; saca los tonos derivados de la paleta |
| `util.mjs` | Curvas, interpolación por claves, vibraciones, azar con semilla, color, cinemática inversa |
| `comprobar.mjs` | Comprobación numérica del guion sin renderizar (`node src/mascota/comprobar.mjs`) |

Ideas clave:

- **Todo es función del número de fotograma.** No hay estado que se acumule ni azar sin semilla. Lo que «llega tarde» (cola, orejas, pila, cabeza) se consigue evaluando el movimiento del cuerpo en un instante anterior, con un retraso que crece hacia la punta.
- **Los pies no patinan** porque la fase del paso se mide en distancia recorrida, no en tiempo: cada pie se queda clavado en su pisada mientras el cuerpo le pasa por encima, y las piernas se resuelven con cinemática inversa de dos huesos.
- **Los tiempos están encadenados** al principio de `guion.mjs` (`T.frena`, `T.para`, `T.cae`…): si se alarga un tramo, lo que viene detrás se retrasa solo.
- **Falso 3D.** La cabeza gira desplazando los rasgos sobre una esfera imaginaria, y el cuerpo pasa de perfil a frente moviendo delantal, hombros, caderas y pies.
- **El libro que vuela** sigue dos tiros parabólicos calculados entre poses conocidas: de la cima de la pila a la «bandeja» de la cola y de vuelta.

## Qué no hace

- No tiene sonido.
- No se adapta a otros formatos: está compuesta para 1080 × 1920 con las zonas seguras de Instagram (lo esencial entre y = 300 e y = 1380). Mientras la cámara está cerca (del segundo 1 al 5,5) el rótulo queda algo por encima de esa franja; vuelve a su sitio para el plano final.
- La duración es fija: 8 segundos. Para cambiarla hay que retocar los tiempos de `guion.mjs` y la duración en `index.jsx`.
- El personaje es este zorro. Cambian sus colores, las gafas y el delantal, pero no su forma: otra mascota es otro dibujo (`Zorro.jsx`).
- Con pocos libros (3 a 5) la pila no llega a la cabeza y el libro pasa por delante de la cara al volar: funciona, pero pierde gracia.
- Dos colores de la paleta muy parecidos entre sí (por ejemplo `zorro` y `acento`, o `cartel` y `oscuro`) hacen que el libro de arriba o el texto del cartel se lean peor: no hay comprobación automática de contraste.

## Pendiente (lo que quedó sin pulir tras las ocho rondas de revisión)

- **Al dejar la pila en el suelo** (segundos 5,0 a 5,5) la cabeza del zorro tapa el centro de la pila durante medio segundo. Se entiende por las manos en la base, el polvo y porque al incorporarse la pila queda a la vista, pero no es la pose más limpia del número.
- **En el frenazo**, el libro de arriba llega a 56 px del borde derecho (medido en el vídeo final): cabe, pero roza el margen lateral de 60 px durante unos cinco fotogramas. No es texto ni cara.
- **No hay desenfoque de movimiento.** En los tramos más rápidos (el latigazo de la pila al frenar y el coletazo que devuelve el libro) las cosas se mueven hasta 60 unidades por fotograma; el libro lleva una estela de dos copias tenues para suavizarlo, la pila y la cola no.
- El saludo es corto de brazo (los brazos del zorro son cortos para su cabeza): la mano queda junto al moflete, no por encima de la cabeza.
