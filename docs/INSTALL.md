# Instalar Invokard Studio en Codex

## Ruta recomendada: repositorio privado → plugin

1. Instala Node.js 22 o posterior con npm, Git y Codex app o CLI. Comprueba `node --version` y que Codex pueda encontrar `node` en PATH. Si acabas de instalar Node, reinicia Codex.
2. Acepta la invitación al repositorio privado y clónalo autenticándote con Git. No incrustes credenciales en la URL.
3. Desde la raíz del clon:

```sh
node plugins/invokard-studio/scripts/setup.mjs
```

Este comando solo comprueba dependencias. Si faltan los binarios:

```sh
node plugins/invokard-studio/scripts/setup.mjs --install-tools
```

Se instalan `ffmpeg-static@5.3.0` y `ffprobe-static@3.1.0` con npm en `~/.invokard-studio/tools`. Se ejecuta el instalador de la dependencia FFmpeg para descargar el binario de tu plataforma. No se instala nada globalmente ni al iniciar MCP. El comando termina con código 0 cuando ambos binarios responden correctamente. `doctor` informa de las rutas y versiones disponibles; la demo comprueba el render con la compilación instalada.

Puedes usar binarios propios mediante `FFMPEG_PATH` y `FFPROBE_PATH`. Para elegir otra ubicación de descarga:

```sh
node plugins/invokard-studio/scripts/setup.mjs --install-tools --tools-dir "/ruta/a/herramientas"
```

Define también `INVOKARD_TOOLS_DIR` con esa ruta en el entorno desde el que arrancas Codex. El setup no cambia permanentemente tus variables de entorno. En Windows puedes usar una ruta como `C:/Invokard/tools`.

4. Comprueba el runtime y registra el catálogo desde la raíz del clon:

```sh
node plugins/invokard-studio/dist/studio.mjs doctor
codex plugin marketplace add .
```

5. En Codex app abre Plugins; en Codex CLI abre `/plugins`. Selecciona el catálogo Invokard Studio, instala Invokard Studio y empieza un chat nuevo. Pide: «Usa Invokard Studio para crear una demo local y muéstrame el resultado».
6. Verifica que están disponibles las tres skills y las herramientas `studio_*`. Si cambias variables de entorno, cierra y vuelve a abrir Codex para que el proceso herede los valores.

No hace falta `pnpm install` para usar el plugin: las dependencias JavaScript están incorporadas al bundle. FFmpeg/ffprobe y Node son dependencias externas comprobadas por setup.

## Cómo arranca MCP

Este paquete usa el manifiesto de compatibilidad Codex `.codex-plugin/plugin.json` y `.mcp.json`. El servidor ejecuta:

```json
{
  "command": "node",
  "args": ["dist/studio.mjs", "serve"],
  "cwd": "."
}
```

En este formato Codex resuelve `cwd` contra la raíz del plugin. Por eso funciona desde la copia instalada en caché y desde un directorio de conversación distinto. No depende de una variable de expansión inventada.

El formato portable nuevo usa `plugin.json` / `mcp.json` y admite `${PLUGIN_ROOT}`; no se mezcla con este manifiesto legacy. La resolución de rutas se verificó en el [parser oficial Codex](https://github.com/openai/codex/blob/222e24b737e36ec8bbb56be2a27638c428b266bf/codex-rs/codex-mcp/src/plugin_config.rs).

Los proyectos se guardan fuera del plugin en `~/.invokard-studio/projects`. `INVOKARD_WORKSPACE` permite elegir otra ubicación persistente. No uses la carpeta de caché del plugin para tus proyectos.

## Proveedores opcionales

### Magnific: imágenes, vídeo y voz por MCP oficial

Añade el servidor y completa el inicio de sesión en el navegador:

```sh
codex mcp add magnific --url https://mcp.magnific.com
codex mcp login magnific
```

También puedes añadir la URL desde los ajustes MCP de Codex. El host mantiene la sesión OAuth y expone las herramientas de Magnific al asistente. El asistente coordina esas herramientas con Studio e importa los archivos resultantes. El servidor local de Studio no llama al MCP hermano.

Documentación: [Magnific MCP](https://docs.magnific.com/modelcontextprotocol). Revisa acceso y créditos en tu cuenta antes de encargar generación.

### Higgsfield y música Magnific

Configura estas variables mediante el administrador de entorno de tu sistema o tu gestor de secretos local, fuera del chat y del repositorio:

| Operación | Variables |
| --- | --- |
| Higgsfield | `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET` |
| Música Magnific Lyria 3 | `MAGNIFIC_API_KEY` |
| Transcripción local opcional whisper.cpp | `WHISPER_CPP_PATH`, `WHISPER_MODEL_PATH` |

El OAuth del MCP Magnific no configura automáticamente su API key de música. No escribas secretos en `.mcp.json`, `project.json`, comandos guardados en historial ni mensajes al asistente. Este paquete solo transmite a su proceso los nombres permitidos por `env_vars`.

La transcripción es local mediante un ejecutable whisper.cpp y un modelo instalado por el usuario. Esas dos variables contienen rutas, no claves. El instalador de herramientas de Studio solo descarga FFmpeg/ffprobe; no instala whisper.cpp ni modelos. También puedes proporcionar subtítulos SRT existentes. No se implementa un servicio de transcripción OpenAI en esta beta.

`studio_transcribe` devuelve un trabajo: consulta `studio_job_status` para recuperar la transcripción. Sus tiempos pertenecen al archivo de origen completo. Ajusta los tiempos a los recortes y posiciones del montaje antes de guardarlos mediante `studio_set_captions`.

Usa `studio_provider_setup` para obtener las instrucciones del proveedor y `studio_provider_status` para comprobar presencia de configuración. Un resultado «configurado» no confirma autenticación, saldo o generación.

Conserva el identificador de cada trabajo. Si un envío acaba en `submission_unknown`, puede haber sido cobrado aunque no se haya recibido respuesta: revisa el historial del proveedor antes de solicitar otro. [Contrato y recuperación](providers.md).

## CLI

Todos los comandos utilizan el bundle distribuido:

```sh
node plugins/invokard-studio/dist/studio.mjs doctor
node plugins/invokard-studio/dist/studio.mjs demo --workspace "./mis-proyectos"
node plugins/invokard-studio/dist/studio.mjs create --title "Mi Reel"
node plugins/invokard-studio/dist/studio.mjs get --project ID
node plugins/invokard-studio/dist/studio.mjs import --project ID --file "/ruta/foto.png" --kind image
node plugins/invokard-studio/dist/studio.mjs update --project ID --json cambios.json
node plugins/invokard-studio/dist/studio.mjs captions --project ID --file captions.srt
node plugins/invokard-studio/dist/studio.mjs render --project ID --preview
node plugins/invokard-studio/dist/studio.mjs render --project ID
node plugins/invokard-studio/dist/studio.mjs carousel --project ID --json slides.json
```

Sustituye `ID` por el identificador devuelto por `create`. Utiliza la misma carpeta `--workspace` en los comandos que deban acceder al mismo proyecto. `update` recibe un objeto JSON con los campos que quieras cambiar; `carousel` recibe un array de slides conforme al esquema publicado por MCP.

Los clips de vídeo conservan su audio. El campo `audioVolume` de cada escena acepta valores de 0 a 2; 0 silencia el clip. El render mezcla ese audio con las pistas de voz y música del proyecto.

El comando `serve` se reserva al cliente MCP. No imprimas mensajes de diagnóstico en su stdout: ese canal transporta el protocolo.

## Actualizar

Actualiza el clon con Git, refresca el marketplace y reinstala o actualiza el plugin desde Plugins. Reinicia Codex y abre una nueva sesión: el host utiliza una copia instalada, no modifica en vivo la que está ejecutándose. Conserva tus proyectos fuera de la instalación.

## Problemas habituales

- **No aparece el plugin:** confirma que `codex plugin marketplace add .` se ejecutó desde la raíz del repositorio y que la entrada está instalada y activada.
- **Node no encontrado:** instala Node 22+ y reinicia Codex. El runtime no descarga Node automáticamente.
- **npm no encontrado al instalar herramientas:** usa una instalación de Node que incluya npm. El setup admite `--npm-cli "/ruta/npm-cli.js"` para ubicaciones personalizadas.
- **FFmpeg no encontrado:** ejecuta setup, revisa `FFMPEG_PATH`/`FFPROBE_PATH` y la carpeta de herramientas.
- **Falta libass, fuentes o un codec:** usa una compilación con `libass`, `drawtext` y `libx264`, y ejecuta la demo. `doctor` informa de versiones y disponibilidad; no enumera filtros ni codecs. No todas las instalaciones FFmpeg tienen las mismas funciones.
- **Proveedor sin configurar:** puedes seguir trabajando con medios locales. La generación autenticada requiere tu propia cuenta.
- **Ruta con espacios o caracteres Unicode:** pon la ruta completa entre comillas. No copies rutas de otro equipo.
- **Extensión IDE:** la extensión Codex no instala plugins completos actualmente. La ruta de esta beta es Codex app/CLI. MCP independiente es posible, pero exige instalar las skills aparte y no es la ruta documentada de esta beta.

Fuentes de instalación: [MCP Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [plugins y superficies admitidas](https://learn.chatgpt.com/docs/plugins), [empaquetado y marketplaces privados](https://developers.openai.com/plugins/build/plugins). Consultadas el 29 de septiembre de 2026.
