# Verificación de la beta 0.1.0

Resultado de la entrega del 29 de septiembre de 2026: **56/56 pruebas pasan**, TypeScript sin errores y compilación correcta. Se verificó también un render a través del MCP desde una copia del bundle fuera del repositorio y sin `node_modules` junto a él. La demo exportó vídeo de seis segundos, portada, SRT, copy y tres slides.

## Qué se comprueba

- TypeScript estricto y bundle autocontenido.
- Conexión MCP real por stdio desde un directorio distinto; creación, edición y validación de proyectos.
- FFmpeg real: vídeo, imágenes, audio, zoom, tiempos, portada, subtítulos, carrusel y cancelación sin borrar exportaciones anteriores.
- Proyectos con revisiones y exclusión entre procesos para evitar sobrescribir cambios desde distintos chats.
- Peticiones de proveedores simuladas: persistencia, recuperación, errores ambiguos, claves de petición repetidas y ausencia de reenvíos automáticos de pago.
- Descargas: destinos HTTPS públicos, DNS validado y fijado, redirecciones, tamaños, tiempos y limpieza de archivos parciales.
- Instalador, manifiesto y las tres skills.
- whisper.cpp con proceso determinista de prueba y FFmpeg real para preparar el audio.

Las pruebas iniciales se ejecutan en Windows con Node 24. El objetivo del paquete es Node 22+ y FFmpeg compatible en Windows, macOS y Linux; no se afirma haber probado cada plataforma.

## Reproducir

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
node plugins/invokard-studio/dist/studio.mjs demo --workspace ./demo-projects
```

`pnpm test` recompila el bundle antes de ejecutar las pruebas. La demo no usa proveedores ni créditos; genera una composición tipográfica de seis segundos y tres slides.

## Comprobaciones pendientes con cuentas reales

- Instalación y activación desde la interfaz de Plugins de Codex.
- Inicio de sesión OAuth y generación real de Magnific.
- Una generación real mediante las API de Higgsfield y música Magnific, con credenciales y gasto autorizado.
- Transcripción con un modelo real de whisper.cpp instalado por el usuario.

Estos puntos no se sustituyen por las pruebas simuladas ni por la mera presencia de variables de entorno.

## Recuperación de una escritura interrumpida

Cada proyecto usa `.project.lock` durante una modificación. Las lecturas y exportaciones usan instantáneas; las escrituras esperan a la anterior y comprueban la revisión. Si un proceso se cierra abruptamente, el bloqueo puede permanecer. Comprueba que ya no hay un proceso escribiendo ese proyecto antes de eliminar únicamente su `.project.lock`; no hace falta borrar el proyecto ni sus recursos.
