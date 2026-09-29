# Optional local speech transcription

Invokard Studio can transcribe an imported audio or video asset with the `whisper-cli` executable from [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Processing runs locally. Configure the executable and a compatible GGML model before using transcription:

```powershell
$env:WHISPER_CPP_PATH = 'C:\tools\whisper.cpp\whisper-cli.exe'
$env:WHISPER_MODEL_PATH = 'C:\models\ggml-base.bin'
```

On macOS or Linux, use absolute local paths with `export WHISPER_CPP_PATH=...` and `export WHISPER_MODEL_PATH=...`. Keep the executable's required libraries beside the executable. The plugin does not download a speech model automatically. Follow the project's installation and model instructions, and use a multilingual model for languages other than English.

The library entry point is `transcribe(projectDir, project, assetId, { language: 'es' })`. Language defaults to `auto`; an optional `AbortSignal` can cancel the operation. Only an audio or video asset contained in the project is accepted. FFmpeg and ffprobe must be available through the normal Studio media setup.

Studio converts the first audio stream to mono 16 kHz PCM WAV, then invokes `whisper-cli` with `-m MODEL -f audio.wav -l LANGUAGE -osrt -of transcript`. These flags are documented in the [official CLI reference](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md). Arguments are passed directly to the process without a shell.

The result contains `captions`, an array of `{ start, end, text }` in seconds, and `srt`, the absolute path of the saved `transcript.srt`. Each run creates a new directory under the project's `exports`. Intermediate WAV files are removed; earlier results are preserved. Transcription does not change the project's captions automatically. Review the words and timing, then apply the returned captions through the normal project update tool.

Timestamps refer to the complete source asset starting at zero. Align them when that asset is trimmed, rearranged, or placed later in a video. Current input duration is limited to two hours, with a two-hour process timeout; runtime depends on the model and machine. Invalid SRT and timings beyond the source duration are rejected. Audio with no recognized speech may return an empty caption list.

Verification covers real FFmpeg audio conversion, the documented subprocess argument contract, Unicode paths, parsed SRT timing, version preservation, cleanup and unsafe paths using a deterministic substitute for the speech executable. A real Whisper model was not downloaded or run during development; speech recognition accuracy and platform-specific whisper.cpp setup remain unverified.
