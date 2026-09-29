# Invokard Studio — approved product design

User direction: one private GitHub repository, one integrated plugin, first tested in Codex, generating and exporting completed media. User explicitly authorized building and saving it to private GitHub on 2026-09-29.

## Product
The plugin packages Invokard's video scriptwriter and AI media methods, a production workflow, an executable local MCP, FFmpeg media tools, and provider configuration. The host assistant supplies creative reasoning. Magnific's official remote MCP supplies image/video/TTS generation after the user connects their account. Higgsfield uses a separate authenticated adapter; no provider is required for local media.

## Boundaries
Local projects preserve assets, scene timing, captions, audio, brand settings and social copy. A declarative project can be revised and rendered again without regenerating assets. All outputs are new versioned directories. Provider job IDs persist before polling. Never retry an uncertain paid submission automatically. API secrets remain in environment variables or external credential setup; no secret tool parameters, repository files or logs. No social publishing in this version.

## Runtime
Node >=22, TypeScript, MCP SDK, FFmpeg and ffprobe. Runtime ships as bundled JS in the plugin so installing the plugin does not require building TypeScript or a dependency install. A local setup command checks tools and assists with provider configuration. A separate optional tools install handles FFmpeg. Both protocol and CLI share services.

## Deliverables
MP4 reel, SRT captions, PNG cover; PNG post/carousel, caption text, editable project JSON, local HTML preview. Support imported media and provider outputs. Magnific requires account OAuth; real generation validation requires user credentials and credits and is reported separately from local validation.

## Verification
Real FFmpeg smoke render with generated fixtures; ffprobe verifies duration, dimensions and audio; caption escaping and Unicode; missing/corrupt/short files; path containment; interrupted job persistence; no plaintext credentials in tool results; MCP handshake/list/call and bundled CLI from an unrelated working directory; plugin manifest and skill validation.
