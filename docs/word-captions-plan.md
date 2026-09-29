# Subtítulos por palabra · 0.2.0

Solicitud del usuario: subtítulos grandes y profesionales, con cada palabra resaltada cuando se pronuncia; incorporar la funcionalidad al plugin y actualizar el repositorio privado. El cambio y la nueva exportación de Maemuki están autorizados.

## Diseño

- Guardar `captions[].words[]` con inicio, fin y texto de cada palabra; rechazar intervalos solapados, fuera de la frase y texto que no coincida.
- Obtener tiempos del audio real con whisper.cpp; conservar JSON de reconocimiento. No dividir duraciones de frase en partes iguales ni presentar tiempos aproximados como medidos.
- Añadir `captionStyle`: modo automático, por palabra estricto o frase; tamaño, colores, borde, negrita, número de palabras/líneas y margen inferior.
- Renderizar con ASS/libass: fuente grande, negrita, blanco, palabra activa en color de marca, borde oscuro y bloques breves dentro de márgenes seguros. Las pausas no mantienen una palabra activa.
- Mantener SRT para compatibilidad y exportar ASS editable con el estilo y eventos por palabra. Los proyectos existentes siguen abriendo.
- Actualizar la skill de producción para que las piezas sociales con voz usen este flujo por defecto, revisen el reconocimiento y comprueben muestras visuales.
- Reexportar Maemuki sin regenerar ni volver a pagar los recursos existentes.

## Verificación

Pruebas de esquema/persistencia, JSON de tokens real, escape de texto ASS, selección temporal de palabra activa, bloques/márgenes, prueba de render FFmpeg y MCP desde el bundle, suite completa y typecheck. Revisión visual del reel a ambos lados de un cambio de palabra y de las pausas. Confirmar commit y bundle 0.2.0 en GitHub.
