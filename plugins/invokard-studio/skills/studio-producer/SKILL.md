---
name: studio-producer
description: "Use when creating or revising finished posts, carousels, Reels or videos with Invokard Studio, assembling local or generated assets, adding captions and exporting editable projects and media."
---

# Invokard Studio — Producción

Lleva el encargo hasta archivos exportados y revisables. Coordina las skills Guionista y AI Media con el MCP local; el modelo del host aporta el criterio creativo.

## Primera ejecución

1. Llama a `studio_doctor` para comprobar FFmpeg, ffprobe y dependencias. Si faltan, remite al usuario al comando de setup documentado en el repositorio. No instales ni descargues herramientas como efecto de importar un módulo o iniciar MCP.
2. Recoge del contexto el objetivo, formato, duración o número de slides, idioma, material y marca. Haz preguntas breves solo sobre lo que falte. Usa el diálogo normal del host; elicitation es opcional.
3. Identifica un proyecto existente con `studio_get_project`, o crea uno con `studio_create_project`. Usa el `projectId` devuelto en las siguientes llamadas. No inventes IDs, rutas ni propiedades fuera del esquema.
4. Aplica `creator-videoscripter` para el mensaje y las escenas, y `creator-aimedia` cuando falten recursos. Mantén texto, tiempo y recursos separados en el proyecto editable.

## Operaciones

| Necesidad | Herramientas |
| --- | --- |
| Estado local y dependencias | `studio_doctor` |
| Crear, leer o modificar el proyecto | `studio_create_project`, `studio_get_project`, `studio_update_project` |
| Incorporar e inspeccionar recursos | `studio_import_asset`, `studio_inspect_media` |
| Guardar subtítulos con tiempos | `studio_set_captions` |
| Exportar vídeo y gestionar el trabajo | `studio_render`, `studio_job_status`, `studio_cancel_job` |
| Exportar post o carrusel | `studio_render_carousel` |
| Consultar/configurar proveedores | `studio_provider_status`, `studio_provider_setup` |
| Generación y recuperación del trabajo | `studio_provider_submit`, `studio_provider_poll`, `studio_provider_jobs`, `studio_provider_reconcile` |
| Transcribir audio | `studio_transcribe` |

Consulta siempre los parámetros reales en el cliente. Si una operación no existe o está deshabilitada, informa de ese tramo y continúa con las operaciones disponibles.

## Vídeo

Importa los medios; conserva sus IDs y procedencia. Ajusta las escenas a la duración real disponible. Revisa el orden, el texto y la mezcla de voz/música. Crea subtítulos desde una transcripción con tiempos o desde texto temporizado que el usuario facilite; no presentes tiempos estimados como reconocimiento de voz real.

Los clips de vídeo conservan su audio por defecto. Ajusta `scene.audioVolume` entre 0 y 2; usa 0 para silenciar un clip, por ejemplo cuando una voz añadida deba sustituir su diálogo. Comprueba la mezcla con las pistas de voz y música del proyecto.

La transcripción opcional usa whisper.cpp local, configurado mediante `WHISPER_CPP_PATH` y `WHISPER_MODEL_PATH`. Estas variables son rutas; no necesita una API key. Consulta el trabajo devuelto por `studio_transcribe` con `studio_job_status`: los tiempos corresponden al archivo de origen completo. Ajusta cada intervalo al recorte y posición del recurso en el montaje antes de llamar explícitamente a `studio_set_captions`. Si no está instalado, pide un SRT o continúa con texto temporizado identificado como tal. FFmpeg renderiza subtítulos existentes, pero no se supone que toda compilación incluya un motor de transcripción.

Renderiza una vista previa cuando sea útil. Tras iniciar un trabajo, usa su ID para consultar estado; no inicies otro render al recibir simplemente `running`. Abre el resultado local con las herramientas del host y comprueba legibilidad, recorte, tiempos, audio, portada y final. No afirmes haber visto u oído algo que no hayas abierto.

## Post y carrusel

Prepara slides con una idea principal y texto legible por slide. Mantén paleta, tipografía y márgenes. Usa `studio_render_carousel` para guardar el plan editable y generar PNG y vista previa. Consulta el ID devuelto con `studio_job_status` hasta terminar; omite `slides` cuando quieras volver a renderizar el plan guardado. Si el diseño exige una capacidad no implementada, adapta la propuesta o explica la limitación antes de prometerla.

## Revisiones y entrega

- Cambia el proyecto con `studio_update_project`; reutiliza los assets válidos. Las exportaciones anteriores deben conservarse.
- Un trabajo de proveedor se continúa por su identificador. No repitas un envío de pago incierto ni ocultes fallos.
- Entrega enlaces reales a vídeo, imágenes, SRT, copy, vista previa y proyecto JSON según lo que la operación haya producido. No prometas un archivo ausente.
- Resume qué se creó y qué requiere todavía revisión. Distingue validación local de generación real autenticada.
- El alcance de esta versión es creación y exportación. No publiques, programes ni conectes cuentas sociales para enviar contenido.

Nunca guardes claves en proyectos, prompts, logs ni metadatos. La autenticación ocurre en el navegador o entorno del usuario. Las credenciales del host no deben reutilizarse como credenciales de proveedor.
