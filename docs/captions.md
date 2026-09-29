# Subtítulos profesionales

## Flujo para un Reel con voz

1. Importa la voz final o el vídeo hablado con `studio_import_asset`.
2. Ejecuta `studio_transcribe` sobre ese recurso. Configura faster-whisper local para obtener alineación con detección de voz; whisper.cpp queda como alternativa con tiempos heurísticos. Consulta [la instalación y el formato de reconocimiento](transcription.md).
3. Revisa texto y metadatos de alineación. Los nombres de marca pueden necesitar corrección. No confundas el número de tokens del modelo con el número de palabras.
4. Traslada **los tiempos de frase y los de cada palabra** del archivo de origen a la posición del montaje. Un recorte a los dos segundos seguido de inserción a los cinco segundos desplaza los tiempos útiles tres segundos; elimina las palabras fuera del recorte.
5. Guarda los subtítulos con `studio_set_captions`, `captionStyle.mode: "word"` y la revisión `expectedUpdatedAt` leída del proyecto.
6. Exporta con `studio_render`, espera el trabajo y abre el resultado. Comprueba cambios de palabra, pausas, márgenes y que los bloques no tapen el producto o la cara.

La sincronización es una estimación del reconocedor basada en el audio, no una garantía fonética perfecta. Cuando la salida no permite identificar un intervalo válido para una palabra, la herramienta debe informar de esa limitación. Revisa el audio o vuelve a transcribir con una configuración adecuada; nunca inventes tiempos equidistantes.

## Proyecto editable

```json
{
  "captions": [{
    "start": 0,
    "end": 1.5,
    "text": "Sigue adelante.",
    "words": [
      {"start": 0.15, "end": 0.55, "text": "Sigue"},
      {"start": 0.8, "end": 1.4, "text": "adelante."}
    ]
  }],
  "captionStyle": {
    "mode": "word",
    "fontSize": 92,
    "color": "#FFFFFF",
    "activeColor": "#F1B553",
    "outlineColor": "#000000",
    "outlineWidth": 5,
    "bold": true,
    "maxWordsPerLine": 3,
    "maxLines": 2,
    "marginBottom": 0.22
  }
}
```

Estos tiempos son un ejemplo de formato, no una transcripción. Cada palabra tiene inicio y fin en segundos. Los intervalos deben estar ordenados, no solaparse y quedar dentro de su frase. El texto de las palabras debe corresponder al de la frase; se permiten diferencias de mayúsculas y puntuación.

`fontSize` y `outlineWidth` se expresan para un lienzo de 1080 píxeles de ancho y se escalan proporcionalmente. `marginBottom` es la fracción de la altura del vídeo que se reserva por debajo del texto: 0,22 deja espacio para controles y copy de plataformas verticales. El color de palabra activa usa el acento de la marca si no se configura otro.

| Modo | Resultado |
| --- | --- |
| `word` | Resaltado sincronizado; falla si falta alineación de alguna frase. |
| `auto` | Resalta las frases alineadas; muestra texto completo y avisa cuando faltan tiempos por palabra. |
| `plain` | Texto por frase, sin resaltado. |

Los tiempos no se recalculan al cambiar el tamaño o el color. Los bloques se organizan para mejorar legibilidad; las pausas no mantienen resaltada la última palabra.

## Archivos y dependencias

- `reel.mp4`: texto incrustado en la imagen, reproducible sin archivos adicionales.
- `captions.srt`: compatibilidad con editores y plataformas; no conserva resaltado ni estilo.
- `captions.ass`: eventos temporizados y estilo editable, incluidos los cambios de palabra.
- `project.json`: palabras, tiempos y ajustes para volver a renderizar.

Se necesita FFmpeg con el filtro `ass`/libass para renderizar estos estilos. Si tu compilación carece de él, instala una compatible; Studio no debe sustituir silenciosamente el efecto por subtítulos pequeños. Las fuentes dependen del sistema o de un archivo local indicado mediante `brand.fontFile`. No se distribuyen fuentes comerciales del sistema con el plugin.
