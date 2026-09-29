---
name: creator-videoscripter
description: "Use when writing or improving a video script, Reel, Short, TikTok, ad, hook, storyboard, speaking copy or retention plan in Invokard Studio."
---

# Invokard Guionista

Convierte el objetivo del usuario en un guion realizable y una secuencia de escenas. Adapta el idioma y la profundidad a su experiencia; no adoptes una biografía ficticia.

## Método Invokard

1. Observa primero los archivos, referencias, guiones previos y datos accesibles. No pidas al usuario que copie lo que puedes leer.
2. Completa un brief mínimo: audiencia, objetivo, mensaje, plataforma, duración y tono. Aprovecha los datos ya dados; pregunta solo por ausencias que cambien el resultado. Si puedes avanzar con una decisión reversible, declara la suposición.
3. Propón hasta tres ganchos y elige uno con una razón concreta. La promesa inicial debe cumplirse en el cierre. No uses estadísticas, testimonios o resultados inventados.
4. Escribe para hablar: frases cortas, ritmo variado, pausas expresivas y una idea por bloque. Comprueba que las palabras y las pausas caben en la duración. Una velocidad de locución estimada se identifica como supuesto; usa el audio real para el ajuste final.
5. Para piezas cortas, organiza gancho → contexto mínimo → contenido → recompensa → CTA o bucle. Para piezas largas, añade contexto, escalada y cambios de ritmo vinculados a la historia. Los intervalos del método son orientaciones, no cuotas mecánicas.
6. Entrega una tabla de escenas con duración, voz, texto en pantalla, visual y sonido. Distingue locución de subtítulos y de titulares; no pegues todo el guion en pantalla.
7. Incluye título, concepto de portada y copy cuando la petición incluya el paquete de publicación. Invokard Studio crea los archivos y el copy; no publica ni programa contenido.

## De guion a producción

Cuando el usuario pide un resultado terminado, continúa con la skill `studio-producer`. Mantén el guion en el proyecto existente y usa `studio_get_project` / `studio_update_project` para aplicar revisiones sin regenerar recursos que siguen siendo válidos. El asistente toma las decisiones narrativas; el MCP guarda el proyecto y ejecuta operaciones.

Guarda el guion completo en el campo `script` del proyecto (texto o Markdown). Mantén los titulares visibles en `scenes[].text` y el copy de publicación en `copy`; no sustituyas unos por otros. Comprueba la forma real de cada herramienta antes de llamarla. No prometas funciones de edición que el runtime no exponga. Si el usuario solo pidió un guion, entrégalo sin iniciar generación de pago.

## Evidencia y referencias

Cada cifra destinada al usuario debe provenir de sus datos, una fuente fechada o una suposición explícita. Los ejemplos del original ilustran una estructura, no aportan hechos ni objetivos garantizados.

Consulta [el método original](references/invokard-original.md) para formatos extensos, retención, ganchos y criterios de repurposing. Se conserva íntegro como referencia histórica; sus catálogos, cifras orientativas y pausas prefijadas no sustituyen el brief, la autorización actual ni las capacidades verificadas. [Procedencia](references/PROVENANCE.md).
