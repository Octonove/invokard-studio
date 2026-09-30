# Invokard Studio

Creado por **Antonio José Bergoños (Octonove)**. El código y la documentación se publican con licencia MIT; conserva el aviso de autoría al reutilizarlos. Los medios de los ejemplos tienen derechos separados: [MEDIA_LICENSE.md](MEDIA_LICENSE.md).

Si te ahorra una sesión de montaje, [invítame a una Paulaner](https://www.paypal.com/donate/?business=stradoxx%40gmail.com&no_recurring=0&currency_code=EUR&item_name=Support%20Invokard%20Studio). El motor de reels funciona igual de bien sin cerveza.

**Reels que parecen editados, hechos por tu agente de programación.** Una skill para Claude Code, Codex, Antigravity,
Gemini CLI y Cursor, y un motor en Python que compone cada fotograma: subtítulos palabra a palabra con la palabra
clave resaltada, titulares y píldoras animadas, gráficas, cortinillas de antes y después, cortes a tiempo con la
música, tarjetas de cierre y una mezcla de audio bien hecha. Trae imágenes y clips de Magnific (o de cualquier otro
proveedor), el metraje del propio cliente, o solo una canción y su portada.

*Read this in English: [README.md](README.md).*

| Metraje del cliente, cortado al ritmo | Ilustraciones + voz + gráfica | Una canción y su portada |
|:---:|:---:|:---:|
| ![Schippers](examples/schippers/preview.gif) | ![Ekilib](examples/ekilib/preview.gif) | ![Maemuki](examples/maemuki/preview.gif) |
| [Schippers New Zealand](examples/schippers/) · 31 s · 34 clips de móvil, sin locución, el guion del cliente en pantalla, una cortinilla sobre el logo, todo sobre una rejilla de 115 BPM. Cero créditos en vídeo. | [Ekilib](examples/ekilib/) · 45 s · nueve frases de locución, trece ilustraciones al estilo del cliente, una tarjeta de glucosa animada, una lista numerada, un morph. | [Maemuki](examples/maemuki/) · 20 s · el estribillo transcrito en local y ajustado a la letra; una panorámica sobre la portada. Cero créditos. |

Un cuarto conjunto, tres reels de prompts para [Simplifica con IA](examples/simplificaconia/), enseña el cierre
«Comenta PALABRA» y las píldoras de sección (hechos con la versión anterior del motor; no incluyen script). De los
otros tres, el `reel.py` que los produjo va dentro de la skill (`skills/invokard-studio/assets/examples/`), para que
el agente lo lea antes de escribir el suyo: ese fichero *es* el montaje.

## Cómo funciona

```
   guion ──▶ voz (un fichero por frase) ──▶ subtítulos palabra a palabra ──▶ cada corte = el tiempo de una palabra
   imágenes (IA, con referencia de estilo) ──▶ previsualizar el montaje en fijo ──▶ clips solo para los planos con movimiento
   clips del cliente ──▶ hojas de contactos ──▶ extraer tramos ──▶ rejilla de beats ──▶ cortinilla ──▶ tarjeta en el golpe final
   canción / locución grabada ──▶ align.py (faster-whisper) ──▶ subtítulos desde palabras con tiempo
                                        │
                              reel.py  ─┴─▶  reelkit: fotogramas con Pillow ──▶ ffmpeg h264 + mezcla ──▶ out/reel.mp4 + portada
```

El agente escribe `reel.py` (entre 60 y 150 líneas que describen planos, capas, voz y efectos), lo previsualiza como
hoja de contactos, lo corrige y lo renderiza. La skill (`skills/invokard-studio/SKILL.md`) es el método: qué generar y
en qué orden, cómo medir los tiempos, qué comprobar, qué cuesta cada cosa y qué no hacer. Sale de trabajo entregado a
clientes, no de una demo.

## Instalar

Requisitos: Python 3.10+, ffmpeg y ffprobe en el PATH ([problemas frecuentes](skills/invokard-studio/references/troubleshooting.md)).

```bash
git clone https://github.com/Octonove/invokard-studio.git
cd invokard-studio
pip install -r requirements.txt
python install.py            # detecta Claude Code / Codex / Antigravity / Gemini CLI / Cursor / Windsurf e instala la skill en cada uno
python install.py doctor     # ffmpeg, paquetes, fuentes, claves (solo el nombre), agentes encontrados
```

| Agente | Dónde queda la skill | Cómo se invoca |
|---|---|---|
| Claude Code | `~/.claude/skills/invokard-studio` | pide un reel; o `/invokard-studio` |
| Codex CLI / app | `~/.codex/skills/invokard-studio` y `~/.agents/skills/` | `$invokard-studio hazme un reel de 30 s con estos clips` |
| Antigravity | `~/.gemini/config/skills/invokard-studio` | `/invokard-studio` |
| Gemini CLI | `~/.gemini/skills/invokard-studio` | `/invokard-studio` o pídelo |
| Cursor | `~/.cursor/skills/invokard-studio` | pídelo; Cursor lee también las carpetas de Claude y Codex |
| Windsurf | `~/.codeium/windsurf/skills/invokard-studio` | pídelo |

`python install.py --project .` la instala en el proyecto actual (`.agents/skills`, `.claude/skills`…) para que un
equipo la comparta por git. `--link` usa un enlace simbólico o junction: lo que edites en este repo se aplica al
momento. `--agents codex,cursor` limita los destinos. `python install.py uninstall` quita lo instalado.

Opcional: `pip install -r requirements-align.txt` (faster-whisper) para subtítulos a partir de una locución grabada o
una canción.

## Conectar un proveedor de medios

El motor renderiza medios locales sin ninguna cuenta. Para *generar* imágenes, clips, voz y música:

- **MCP de Magnific** (recomendado): añade `https://mcp.magnific.com` a los servidores MCP de tu agente e inicia
  sesión en el navegador. `.mcp.json.example` es el fragmento para Claude Code; para Codex,
  `codex mcp add magnific --url https://mcp.magnific.com`. Da Nano Banana Pro, Kling 3.0, Veo 3.1, voces de ElevenLabs,
  música Lyria 3 y un simulador de coste.
- **API REST de Magnific**: `MAGNIFIC_API_KEY` en `.env` (ver `.env.example`) → `scripts/providers/magnific.py`.
- **ElevenLabs**: `ELEVENLABS_API_KEY` → `scripts/providers/elevenlabs.py`, con tiempos por palabra.
- **Tus propios ficheros**: fotos, clips, una voz grabada, una pista con licencia, en la carpeta de trabajo.

Las claves viven en el entorno o en `.env`, nunca en el chat ni en los scripts. Modelos, decisiones y precios en
créditos: [references/providers.md](skills/invokard-studio/references/providers.md).

## El primer reel

Dile al agente qué tienes. Tres peticiones que funcionan:

> Hazme un reel de 30 segundos para Instagram sobre este artículo. Usa la skill invokard-studio. Colores de marca
> del logo en ref/logo.png.

> Aquí tienes 20 clips del trabajo en `clips/`. Monta un reel de antes y después con este texto en pantalla, sin
> locución, cortado a la música.

> Esto es una canción y su portada. Hazme un teaser de 20 segundos del estribillo con la letra.

El agente crea la carpeta de trabajo (`python scripts/new_reel.py`), genera o incorpora el material, previsualiza el
montaje como hoja de contactos (`review/preview.jpg`), renderiza (`out/reel.mp4`, `out/cover.jpg`) y verifica el
fichero (`media.py verify`: especificaciones, sonoridad y una hoja de contactos sacada del MP4 final). No publica nada.

## Qué hay dentro

```
skills/invokard-studio/
  SKILL.md                     el método (estándar Agent Skills; lo lee cualquier agente que lea SKILL.md)
  references/                  production.md · footage.md · providers.md · api.md · troubleshooting.md
  scripts/reelkit.py           el motor: fuentes, capas, subtítulos, mezcla de audio, rejilla de beats
  scripts/pieces.py            componentes: marca, titular, píldoras, bloques de texto, tarjeta con curva, ítems, cortinilla, cierres
  scripts/media.py             herramientas: frames, extract, hojas de contactos, tramos de voz, beats, splice, verify, web, gif…
  scripts/align.py             tiempos por palabra de cualquier audio (faster-whisper), ajustados al texto real
  scripts/providers/           magnific.py · elevenlabs.py · costs.py · env.py
  scripts/new_reel.py          crea la carpeta de trabajo y un reel.py desde template_reel.py
  assets/fonts/ · assets/sfx/  Inter, Playfair Display (OFL); ocho efectos de sonido
  assets/examples/             schippers · ekilib · maemuki: el reel.py de cada reel entregado
examples/                      esos tres más simplificaconia: copias 720p, gifs, portadas, notas
install.py                     install / doctor / uninstall
tests/                         tests del motor y del instalador (pytest; sin créditos ni claves)
```

Los tests se ejecutan con `python -m pytest tests -q` (necesita ffmpeg).

## Decisiones de diseño

- **Todo lo que hay en pantalla lo pone el motor.** Las imágenes se generan sin texto; tipografía, cajas, subtítulos
  y animación se componen al renderizar: salen nítidos, con el tiempo exacto, y cambiar de marca es una línea.
- **El tiempo sale del audio, no del ojo.** Un fichero de voz por frase le da al motor las pausas; subtítulos y cortes
  se derivan de ahí. Con una locución grabada o una canción, `align.py` da las palabras.
- **Previsualizar antes de gastar.** El montaje se construye y se revisa sobre imágenes fijas; los clips se generan
  al final, solo para los planos que necesitan movimiento, después de estimar el coste.
- **El metraje real es material de primera.** Los clips horizontales se encajan sobre su propio desenfoque, los tramos
  se eligen en hojas de contactos y los cortes van sobre una rejilla de beats medida en la pista.
- **La mezcla viene hecha.** Ducking bajo la voz, −14 LUFS, limitador de pico real; efectos en los cortes.

## Estado

Versión pública 1.0.0. Construida y verificada en Windows 11 con Python 3.14 y ffmpeg 8; el código no tiene
rutas de plataforma (las fuentes van empaquetadas y las del sistema son el respaldo), pero macOS y Linux no se han
probado todavía. El plugin 0.x en TypeScript para Codex se conserva bajo la etiqueta `v0.2.0-codex`.

Licencia: MIT para código y documentación ([LICENSE](LICENSE)); los medios de ejemplo solo pueden mostrarse según sus [términos separados](MEDIA_LICENSE.md). Las fuentes conservan su licencia OFL.
