# Verificación de la beta 0.2.0

Resultado del 30 de septiembre de 2026: **100/100 pruebas pasan**, sin omisiones, TypeScript sin errores y bundle compilado. La prueba Python opcional se activó mediante `INVOKARD_TEST_PYTHON`. La entrega inicial 0.1.0 había validado 56 pruebas y una demo tipográfica de seis segundos con tres slides.

## Prueba real de subtítulos Maemuki

Se transcribió por MCP la voz original con faster-whisper 1.2.1, CTranslate2 4.8.2, PyAV 16.1.0 y el modelo local small, CPU int8. La configuración usa VAD con silencio mínimo de 200 ms y margen de 30 ms. Se reconocieron las 20 palabras; se corrigió únicamente puntuación y mayúsculas, conservando los intervalos y agrupándolos en cinco frases.

La comparación independiente con pausas medidas por FFmpeg encontró cero palabras enteras o centros de palabra dentro de las pausas, y unos 16 ms de solapamiento total en sus bordes. Esto verifica la mejora sobre este audio; no constituye una medida de exactitud fonética universal. whisper.cpp reconocía el texto pero situaba algunas palabras en silencios, por lo que se conserva como alternativa explícitamente heurística.

El reel se reexportó por MCP a 1080×1920, 30 fps, H.264/AAC y 15 segundos, con 20 palabras resaltadas, texto blanco grande, borde negro y acento de marca. Se verificaron fotogramas de cambios de palabra, pausa y cierre, así como ASS editable y SRT. Se reutilizaron imágenes, vídeo, voz y música de la primera prueba: esta revisión no hizo nuevas generaciones de pago.

Una segunda prueba copió únicamente `dist/` y `runtime/` fuera del repositorio y arrancó MCP desde otro directorio, sin `node_modules` junto al plugin y con rutas Unicode. Completó transcripción local de 20 palabras, JSON/SRT, guardado en modo `word` y limpieza de temporales. El entorno de pruebas usaba dependencias Python locales con `PYTHONPATH`; la instalación documentada utiliza un entorno virtual dedicado.

## Qué se comprueba

- TypeScript estricto y bundle autocontenido.
- Conexión MCP real por stdio desde un directorio distinto; creación, edición y validación de proyectos.
- FFmpeg real: vídeo, imágenes, audio, zoom, tiempos, portada, subtítulos, carrusel y cancelación sin borrar exportaciones anteriores.
- Proyectos con revisiones y exclusión entre procesos para evitar sobrescribir cambios desde distintos chats.
- Peticiones de proveedores simuladas: persistencia, recuperación, errores ambiguos, claves de petición repetidas y ausencia de reenvíos automáticos de pago.
- Descargas: destinos HTTPS públicos, DNS validado y fijado, redirecciones, tamaños, tiempos y limpieza de archivos parciales.
- Instalador, manifiesto y las tres skills.
- Render ASS real con cambio de palabra activa, pausa neutra y portada; validación de intervalos, estilos y escape de texto.
- Selección de motores, tiempos nativos faster-whisper, tokens whisper.cpp, rutas Unicode, cancelación y limpieza con procesos controlados y FFmpeg real.
- Runner Python real contra una API de modelo controlada: modo offline, VAD y serialización de metadatos ilimitados.

Las pruebas iniciales se ejecutan en Windows con Node 24. El objetivo del paquete es Node 22+ y FFmpeg compatible en Windows, macOS y Linux; no se afirma haber probado cada plataforma.

## Reproducir

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
node plugins/invokard-studio/dist/studio.mjs demo --workspace ./demo-projects
```

`pnpm test` recompila el bundle antes de ejecutar las pruebas. La demo no usa proveedores ni créditos; genera una composición tipográfica de seis segundos y tres slides.

Para incluir la prueba opcional del runner, define `INVOKARD_TEST_PYTHON` con la ruta a Python 3.11+ antes de ejecutar `pnpm test`; no necesita descargar un modelo. Sin esa variable, esa prueba se omite. Las inferencias reales descritas arriba se ejecutaron aparte con el modelo small instalado.

## Alcance y comprobaciones pendientes

- Instalación y activación desde la interfaz de Plugins de Codex.
- Generación real mediante la API de Higgsfield.
- Validación en macOS y Linux y con otros idiomas/modelos.

La prueba Maemuki anterior sí utilizó generación real de imagen, vídeo y voz por el MCP oficial Magnific, además de música Magnific y exportación local. Las pruebas simuladas de los adaptadores siguen cubriendo sus contratos y recuperación, sin demostrar disponibilidad de todos los modelos o cuentas.

Estos puntos no se sustituyen por las pruebas simuladas ni por la mera presencia de variables de entorno.

## Recuperación de una escritura interrumpida

Cada proyecto usa `.project.lock` durante una modificación. Las lecturas y exportaciones usan instantáneas; las escrituras esperan a la anterior y comprueban la revisión. Si un proceso se cierra abruptamente, el bloqueo puede permanecer. Comprueba que ya no hay un proceso escribiendo ese proyecto antes de eliminar únicamente su `.project.lock`; no hace falta borrar el proyecto ni sus recursos.
