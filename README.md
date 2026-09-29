# Invokard Studio

Plugin privado para Codex que convierte ideas y material existente en posts, carruseles, Reels y vídeos exportados. Integra los métodos Invokard Guionista y AI Media, proyectos editables, herramientas locales de FFmpeg y proveedores generativos opcionales.

**Beta 0.2.0 · Node.js 22 o posterior · Codex app o CLI.** La extensión IDE de Codex admite MCP, pero no el paquete de plugins completo.

## Instalar

Necesitas acceso al repositorio privado, Git, Node.js 22+ con npm y Codex. Autentica Git con tu propia cuenta; no introduzcas tokens en la URL.

```sh
git clone https://github.com/Octonove/invokard-studio.git
cd invokard-studio
node plugins/invokard-studio/scripts/setup.mjs
```

Si faltan FFmpeg o ffprobe, ejecuta explícitamente:

```sh
node plugins/invokard-studio/scripts/setup.mjs --install-tools
```

El instalador descarga versiones fijadas en tu carpeta personal de herramientas. Si ya tienes ambos binarios, el primer comando basta. Comprueba después el runtime y registra el catálogo privado:

```sh
node plugins/invokard-studio/dist/studio.mjs doctor
codex plugin marketplace add .
```

Abre Plugins en Codex app —o `/plugins` en Codex CLI—, elige el catálogo **Invokard Studio**, instala **Invokard Studio** y abre un chat nuevo. El bundle ya incluye las dependencias JavaScript: el usuario no necesita compilar ni instalar dependencias del repositorio.

[Instalación detallada y solución de problemas](docs/INSTALL.md).

## Primer encargo

> Usa Invokard Studio para crear un Reel vertical de 20 segundos con estas tres fotos. Mantén el estilo de mi marca, añade titulares y entrégame vídeo, portada y proyecto editable.

El asistente prepara el guion, incorpora recursos, compone la pieza y verifica los archivos. Para empezar sin cuentas generativas puedes usar tus imágenes, vídeos y audios. También puedes ejecutar una demo local:

```sh
node plugins/invokard-studio/dist/studio.mjs demo
```

## Qué incluye

| Pieza | Función |
| --- | --- |
| Guionista | Gancho, estructura, guion hablado, escenas y copy |
| AI Media | Prompts por plano, coherencia de recursos y control de gasto |
| Producción | Coordina proyecto, recursos, subtítulos, revisión y exportación |
| MCP local y CLI | Guardan proyectos y ejecutan operaciones de medios |
| FFmpeg y ffprobe | Ensamblan, exportan e inspeccionan archivos |
| Proveedores opcionales | Magnific por MCP oficial; Higgsfield y música Magnific mediante adaptadores locales |

Las exportaciones incluyen, según la operación, MP4, SRT, subtítulos ASS editables con estilo, portada PNG, PNG de slides, copy y vista previa HTML. El proyecto JSON y sus recursos permiten seguir editando. Una nueva exportación conserva las anteriores.

### Subtítulos para Reels

La versión 0.2.0 añade **texto grande y en negrita con resaltado de la palabra que se está pronunciando**, borde oscuro y bloques breves dentro de márgenes seguros. Tamaño, colores, líneas y posición inferior son configurables por proyecto. Para obtener tiempos por palabra se recomienda el motor local faster-whisper con detección de voz; whisper.cpp sigue disponible como alternativa con tiempos heurísticos. El asistente debe revisar nombres, texto y sincronización antes de exportar.

El modo `word` exige tiempos reales por palabra. Un SRT convencional solo contiene tiempos por frase: no se convierte en karaoke repartiendo su duración. El modo `auto` usa resaltado cuando hay alineación y devuelve advertencias cuando solo puede mostrar frases. [Guía de subtítulos y estilos](docs/captions.md) · [Transcripción local](docs/transcription.md).

El modelo creativo lo aporta Codex. Este plugin no incluye una suscripción generativa ni créditos. Tampoco publica ni programa contenido en redes.

## Conectar generación opcional

Para Magnific, sigue [la conexión oficial por OAuth](docs/INSTALL.md#proveedores-opcionales). Para Higgsfield y la API opcional de música Magnific, configura las variables de entorno de tu cuenta. Las claves no se piden en chat, no se pasan como argumentos de herramientas y no pertenecen al proyecto.

La configuración de una cuenta no prueba que tenga acceso a un modelo o créditos. La validación de adaptadores usa pruebas de red simuladas; una generación de pago real exige credenciales y un encargo concreto autorizado. [Proveedores y recuperación de trabajos](docs/providers.md).

## Datos y archivos

Por defecto los proyectos se guardan en `~/.invokard-studio/projects`, fuera de la instalación. Puedes elegir otra carpeta con `INVOKARD_WORKSPACE` o con `--workspace` en CLI. Las herramientas opcionales se guardan en `~/.invokard-studio/tools`; admite `INVOKARD_TOOLS_DIR`.

El render local procesa medios en tu equipo. Al usar un proveedor, se envían a ese servicio los datos requeridos por la operación. No hay un servidor central de Invokard en esta beta.

## Desarrollo

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

El bundle distribuible está en `plugins/invokard-studio/dist/studio.mjs`. [Diseño](docs/design.md) y [plan](docs/implementation-plan.md).

El método original de cada skill está conservado con su commit y procedencia bajo `skills/*/references/`. Distribución privada **UNLICENSED**; las dependencias y herramientas de terceros mantienen sus propias licencias.
