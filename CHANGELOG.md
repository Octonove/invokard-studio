# Cambios

## 0.2.0 · 30 de septiembre de 2026

- Subtítulos grandes para vídeo social: negrita, borde oscuro, palabra activa en el acento de marca y márgenes configurables.
- Intervalos por palabra persistidos en el proyecto y validados contra la frase y el montaje.
- Exportación de subtítulos ASS con estilo, además de SRT y MP4.
- Modos por palabra estricto, automático con advertencias y texto por frase. No se inventan tiempos a partir de la duración de una frase.
- Reconocimiento local faster-whisper con detección de voz y tiempos por palabra. Runner Python incluido, dependencias fijadas y modelo local configurables; sin descargas al iniciar MCP.
- Alternativa whisper.cpp con JSON de tokens y advertencias sobre sus intervalos heurísticos, soporte de vocabulario y rutas Unicode de Windows.
- Revisión de nombres de marca y del audio real como parte de la skill de producción.
- Compatibilidad de los proyectos anteriores y conservación de exportaciones previas.
- Prueba real de Maemuki reexportada con los recursos existentes, sin volver a consumir créditos generativos.

## 0.1.0 · 29 de septiembre de 2026

Primera beta privada: tres skills Invokard, MCP y CLI local, proyectos editables, FFmpeg, exportación de vídeo/carruseles y proveedores generativos opcionales.
