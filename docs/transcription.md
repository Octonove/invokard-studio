# Optional local speech transcription

Invokard Studio transcribes imported audio or video locally. The preferred optional backend is [faster-whisper](https://github.com/SYSTRAN/faster-whisper); [whisper.cpp](https://github.com/ggml-org/whisper.cpp) remains available. No speech model is downloaded automatically.

## Recommended: faster-whisper

Create a dedicated Python **3.11 or newer** environment and install the pinned `runtime/requirements-transcription.txt` distributed with the plugin. It pins faster-whisper 1.2.1, CTranslate2 4.8.2 and PyAV 16.1.0; PyAV 19 is incompatible with the decoder call in this faster-whisper release. Keep Python and its packages together in that environment, then configure:

Example from the repository root on Windows with Python 3.12 installed:

```powershell
py -3.12 -m venv "$env:USERPROFILE\.invokard-studio\asr"
$env:FASTER_WHISPER_PYTHON_PATH = "$env:USERPROFILE\.invokard-studio\asr\Scripts\python.exe"
& $env:FASTER_WHISPER_PYTHON_PATH -m pip install -r plugins/invokard-studio/runtime/requirements-transcription.txt
$env:FASTER_WHISPER_MODEL_PATH = "$env:USERPROFILE\.invokard-studio\models\faster-whisper-small"
& $env:FASTER_WHISPER_PYTHON_PATH -c "import os; from huggingface_hub import snapshot_download; snapshot_download(repo_id='Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120', local_dir=os.environ['FASTER_WHISPER_MODEL_PATH'])"
```

The last command explicitly downloads the model during setup. Preserve those two environment variables in the environment that starts Codex, then restart Codex. On macOS/Linux create a venv with `python3 -m venv`, use its `bin/python` and export the same variables. You can instead point them at an existing installation:

```powershell
$env:FASTER_WHISPER_PYTHON_PATH = 'C:\tools\invokard-asr\Scripts\python.exe'
$env:FASTER_WHISPER_MODEL_PATH = 'C:\models\faster-whisper-small'
```

The model must already be a local CTranslate2 model directory containing non-empty `model.bin`, `config.json`, `tokenizer.json`, and the remaining files supplied with the model. Download the complete trusted model snapshot during setup; a URL or model name cannot be used in this variable. The runner enforces `local_files_only=True`, offline Hugging Face mode and disabled telemetry. Models are not fetched during a transcription job. A dedicated virtual environment is recommended for Codex: packages installed with `pip --target` need an explicitly supplied `PYTHONPATH`, which an MCP host may not inherit automatically.

`engine: 'auto'` is the default. It selects faster-whisper when both faster-whisper variables are present, otherwise whisper.cpp. Use `engine: 'faster-whisper'` or `engine: 'whisper.cpp'` to choose explicitly. Missing dependencies or a failed run do not silently switch the selected engine. The doctor reports configuration presence separately from verification; it does not load Python or the model.

The packaged Python runner lives at `runtime/faster-whisper.py` beside `dist/` and `src/`. It runs CPU int8 inference with eight threads, beam size five and native word timestamps. Silero VAD uses 200 ms minimum silence and 30 ms speech padding; the engine restores timestamps to the original audio timeline. Context comes from optional `prompt`, and `condition_on_previous_text` is disabled. Full native JSON, including word confidence, model version and audio hash, is preserved. Unlimited metadata values such as VAD's infinite maximum duration become JSON `null`; word times are never sanitized or changed.

```typescript
const result = await transcribe(projectDir, project, voiceAssetId, {
  engine: 'faster-whisper',
  language: 'es',
  prompt: 'Maemuki. Siempre hacia delante. Avanzar empieza.',
});
```

The engine estimates word boundaries using cross-attention DTW and native postprocessing. Studio preserves those intervals, with no uniform duration division or clamping. Review the result against the voice before final export: this is model alignment, not a guarantee of exact phonetic boundaries. In the real Maemuki sample, the VAD configuration recognized all 20 words; independent silence QA found no word wholly in a pause and about 16 ms total overlap with measured long pauses. This is evidence for that sample, not a universal accuracy claim.

## Alternative: whisper.cpp

Configure the `whisper-cli` executable and a compatible GGML model:

```powershell
$env:WHISPER_CPP_PATH = 'C:\tools\whisper.cpp\whisper-cli.exe'
$env:WHISPER_MODEL_PATH = 'C:\models\ggml-base.bin'
```

On macOS or Linux, use absolute local paths with `export WHISPER_CPP_PATH=...` and `export WHISPER_MODEL_PATH=...`. Keep the executable's required libraries beside the executable. The plugin does not download a speech model automatically. Follow the project's installation and model instructions, and use a multilingual model for languages other than English.

The library entry point is `transcribe(projectDir, project, assetId, { engine: 'whisper.cpp', language: 'es' })`. Language defaults to `auto`; an optional `AbortSignal` can cancel either engine. Only an audio or video asset contained in the project is accepted. FFmpeg and ffprobe must be available through the normal Studio media setup.

Studio converts the first audio stream to mono 16 kHz PCM WAV, then invokes `whisper-cli` with `-m MODEL -f audio.wav -l LANGUAGE -osrt -ojf -ml 60 -sow -of transcript`. Full JSON exposes token offsets in milliseconds. A positive maximum segment length also enables token timing in older versions; splitting at words retains readable phrases. See the [official CLI reference](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md) and [implementation of JSON output and token timing](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp). Studio uses a single processor and does not enable VAD, preserving the source timeline.

Optional `prompt` supplies up to 2000 characters of real vocabulary or context, such as a brand name. It is a recognition hint, not a replacement transcript or forced alignment. Optional `dtwModel` selects the model's attention preset for DTW: `tiny`, `tiny.en`, `base`, `base.en`, `small`, `small.en`, `medium`, `medium.en`, `large.v1`, `large.v2`, `large.v3`, or `large.v3.turbo`. Choose the preset matching the installed model. Studio then adds `-dtw PRESET -nfa`; the latter disables flash attention for attention-based alignment. These names and flags come from the official CLI implementation. Returned word intervals still use the engine's `offsets.from/to`; the separate `t_dtw` point is not treated as a word interval.

```typescript
const result = await transcribe(projectDir, project, voiceAssetId, {
  engine: 'whisper.cpp',
  language: 'es',
  dtwModel: 'small', // requires a compatible small model
  prompt: 'Maemuki. Siempre hacia delante. Avanzar empieza.',
});
```

Arguments are passed without a shell. On Windows, Studio creates a temporary hard link named `model.bin` beside the intermediate WAV; it copies the model if linking is unavailable across volumes or due to permissions. This avoids a reproduced crash in the official Windows CLI when an absolute model argument contains accented characters. Unicode context uses the CLI's documented `@response-file` reader with UTF-8 text, one argument per line. Prompt whitespace is normalized so it cannot add response-file arguments. Use a current whisper.cpp release supporting this interface. Temporary model links/copies and argument files are removed with the WAV on success or cancellation.

## Result and word timing

The result contains:

- `captions`: phrases with `{ start, end, text, words? }`. Each word is `{ start, end, text }`, in seconds, relative to the same source asset.
- `srt`: absolute path to the original phrase-level `transcript.srt`.
- `json`: absolute path to the original `transcript.json`, when produced. This preserves model evidence for review; malformed JSON can also be retained with an explicit limitation.
- `timing`: `{ basis: 'source_asset_seconds', engine, source, method, wordTiming, timedCaptions, totalCaptions, limitations }`. `wordTiming` is `complete`, `partial`, or `unavailable`.

For faster-whisper, `source` is `faster-whisper-word-timestamps` and `method` is `cross-attention-dtw-silero-vad`. For whisper.cpp, they are `whisper.cpp-token-offsets` and `heuristic-token-offsets`. Both include a review warning; complete word coverage is distinct from accurate synchronization. Native faster-whisper words are validated directly against phrase text and bounds. The following token aggregation details apply to whisper.cpp.

Subword tokens are joined using the whitespace boundaries present in the model's text. The first and last lexical token boundaries define each word. A zero-length subtoken can contribute a model boundary when the combined word has a positive duration. A complete word with no positive duration is not stretched. Punctuation is retained in the displayed word but does not extend its spoken interval; internal tokens such as `[_BEG_]` and timestamp markers are omitted.

Every phrase must match its original SRT text and interval. Token text must reconstruct that phrase, and lexical offsets must be finite, ordered, non-overlapping and within the phrase and source. If any word cannot be aligned independently, that phrase keeps its text and phrase timing but has no `words`; `timing.limitations` explains why. Missing/malformed JSON, multiword tokens, mismatched text, missing offsets and zero-duration words never trigger uniform duration division, clamping, or invented word times. Whitespace-based grouping is intended for languages such as Spanish and English; it does not perform linguistic word segmentation for languages without spaces.

`timing.wordTiming === 'complete'` means only that every word has a formally valid model interval. It does **not** establish acoustic synchronization. The [whisper.cpp implementation](https://github.com/ggml-org/whisper.cpp/blob/master/src/whisper.cpp) fills unknown token intervals proportionally using token voice-length estimates, then adjusts them using signal energy. Enabling DTW adds separate `t_dtw` points and does not replace those heuristic `offsets` intervals. Every result from this backend therefore includes an explicit heuristic-timing limitation, even with complete coverage. The upstream project also calls [word-level timestamps experimental](https://github.com/ggml-org/whisper.cpp#word-level-timestamp-experimental). Listen and review against the audio before using word highlighting; this backend alone is not a precision alignment guarantee.

Each run creates a new directory under the project's `exports`; earlier results are preserved. Transcription does not change project captions automatically. Review the words and timing, regroup into suitable display phrases if needed, then apply the returned captions through the normal project update tool. Preserve word intervals when regrouping; SRT by itself does not carry word timing.

Timestamps refer to the complete source asset starting at zero. Align them when that asset is trimmed, rearranged, or placed later in a video. Current input duration is limited to two hours, with a two-hour process timeout; runtime depends on the model and machine. Invalid SRT and timings beyond the source duration are rejected. Audio with no recognized speech may return an empty caption list.

Automated verification covers real FFmpeg conversion, backend selection, subprocess contracts, Unicode paths/context, token aggregation, punctuation, special tokens, unavailable/partial timing, version preservation, cancellation, cleanup and unsafe paths. Audio transcription does not require the unrelated libass video subtitle filter. Deterministic speech subprocesses keep those tests offline. Setting `INVOKARD_TEST_PYTHON` to a Python executable also runs the packaged Python bridge against a controlled model API, checking offline/VAD settings and metadata serialization without a speech model.

Separately, the official Windows CPU whisper.cpp release reporting version 1.9.4 and its multilingual `small` model were run on the Maemuki voice recording on 2026-09-30. A contextual DTW run recognized the 20 script words and supplied formally valid intervals; acoustic QA then found some words inside measured pauses or starting before the voice. This proves successful recognition and parsing, **not** professional word synchronization. The faster-whisper small/int8/VAD run improved alignment on the same audio as described above. An excerpt of real whisper.cpp output is retained as a parser regression fixture.
