---
name: creator-aimedia
description: "Use when producing AI images, video shots, voice or consistent visual assets for Invokard Studio, choosing connected providers, writing generation prompts or controlling generation costs."
---

# Invokard AI Media

Produce los recursos necesarios para una pieza, con control de coherencia, parámetros y gasto. El entregable es un archivo cuando existe una herramienta conectada que puede generarlo.

## Método Invokard

1. Observa las referencias y el estado del proyecto antes de preguntar. Usa `studio_provider_status` para comprobar presencia de configuración local y la lista de herramientas del host para descubrir MCP remotos. La configuración no verifica autenticación, saldo ni acceso. No atribuyas a un proveedor capacidades que no hayas comprobado.
2. Parte de un guion o concepto. Si falta, aplica `creator-videoscripter`. Define qué aporta cada plano, su duración, formato y continuidad.
3. Elige motor por etapa: imagen, animación, voz o música. Comprueba el modelo y sus parámetros actuales en el catálogo real del proveedor. No copies precios ni límites de la referencia histórica.
4. Mantén un ancla visual: referencia del producto/personaje, paleta, iluminación y estilo. Usa semilla o referencia cuando el modelo lo soporte; no presentes una semilla como garantía universal de identidad.
5. Para continuidad visual, prioriza un fotograma ya aceptado y luego su animación. Describe sujeto, acción, encuadre, cámara, luz y restricciones por plano. No envíes sintaxis de un motor a otro.
6. Calcula gasto previsto y límite de intentos, incluyendo descartes. Reutiliza la autorización concreta del usuario cuando cubra proveedor, tarea y gasto; pide el dato o permiso que falte antes de una operación de pago. La conexión de una cuenta no equivale a autorizar gasto ilimitado.
7. Revisa anatomía, producto, texto, continuidad, movimiento y audio. Cambia una variable relevante por iteración y conserva los recursos útiles.

## Ejecución con proveedores

- **Magnific:** usa su MCP oficial cuando esté disponible en el host. El asistente coordina sus herramientas y las de Studio; el MCP local no llama a un MCP hermano. Selecciona operaciones y parámetros leyendo el esquema real. Importa el resultado con `studio_import_asset` usando su URL pública HTTPS o un archivo local; guarda `provider` y `creationId` cuando estén disponibles. No inventes campos que el esquema de importación no admita.
- **Higgsfield:** usa `studio_provider_setup` para instrucciones y `studio_provider_status` para estado. `studio_provider_submit` devuelve un trabajo persistido; sigue su identificador con `studio_provider_poll`. Nunca repitas automáticamente una petición con estado `submission_unknown`: comprueba el historial del proveedor o informa al usuario.
- **Recursos locales:** importa los archivos existentes y continúa sin requerir cuentas generativas.
- **Música Magnific:** el adaptador local Lyria 3 usa una API key propia configurada como `MAGNIFIC_API_KEY`. Es una conexión separada del OAuth del MCP remoto. Usa el catálogo y esquema expuestos por `studio_provider_submit`; conserva el trabajo igual que con Higgsfield.
- No solicites, leas en voz alta ni incluyas claves/tokens en argumentos, chat o archivos del proyecto. Las credenciales se configuran en el entorno local o mediante OAuth en el navegador. El asistente pregunta por datos creativos mediante diálogo normal; no depende de elicitation.

Los trabajos reales pueden tardar, fallar o consumir créditos. Informa según el estado observado; un prompt, un ID o una URL pendiente no es un archivo generado. Guarda los resultados antes de ensamblar.

## Entrega

Continúa con `studio-producer` para ensamblar, subtitular, revisar y exportar. Verifica derechos del material cuando el encargo lo requiera y pide autorización explícita para clonación de voz; no inventes licencias ni afirmaciones legales. Marca en el copy las necesidades de divulgación relevantes para material sintético que pueda confundirse con una grabación.

Consulta [el método original](references/invokard-original.md) para la escalera de consistencia, estrategia por plano y coste por recurso útil. Es una referencia histórica: no aplica pausas obligatorias nuevas ni promete proveedores conectados o versiones actuales. [Procedencia](references/PROVENANCE.md).
