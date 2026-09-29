"""Offline CPU transcription bridge; preserve native source-relative word times."""
import argparse
import dataclasses
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path

# A configured model is mandatory. This runner must never fetch models or send audio.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

parser = argparse.ArgumentParser()
parser.add_argument("--config", type=Path, required=True)
args = parser.parse_args()
request = json.loads(args.config.read_text(encoding="utf-8"))
model_path = Path(request["model"]).resolve(strict=True)
if not model_path.is_dir() or not (model_path / "model.bin").is_file():
    raise SystemExit("Expected an existing local CTranslate2 model directory with model.bin")

try:
    from faster_whisper import WhisperModel
except ImportError as error:
    raise SystemExit("Install runtime/requirements-transcription.txt into the configured Python environment: " + str(error))

audio = Path(request["input"]).resolve(strict=True)
output = Path(request["output"])
options = {
    "language": None if request["language"] == "auto" else request["language"],
    "beam_size": 5,
    "temperature": 0,
    "word_timestamps": True,
    "vad_filter": True,
    "vad_parameters": {"min_silence_duration_ms": 200, "speech_pad_ms": 30},
    "initial_prompt": request.get("prompt"),
    "condition_on_previous_text": False,
}
model = WhisperModel(str(model_path), device="cpu", compute_type="int8",
                     cpu_threads=8, num_workers=1, local_files_only=True)
segments, info = model.transcribe(str(audio), **options)
# Exhausting the generator runs recognition and its native VAD timeline restoration.
raw_segments = [dataclasses.asdict(segment) for segment in segments]
with audio.open("rb") as handle:
    audio_hash = hashlib.file_digest(handle, "sha256").hexdigest()

def json_metadata(value):
    """Native VAD uses Infinity for unlimited duration; this is metadata, not timing."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_metadata(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_metadata(item) for item in value]
    return value

result = {
    "engine": "faster-whisper",
    "version": importlib.metadata.version("faster-whisper"),
    "ctranslate2_version": importlib.metadata.version("ctranslate2"),
    "model": str(model_path),
    "audio_sha256": audio_hash,
    "options": {"device": "cpu", "compute_type": "int8", "cpu_threads": 8,
                "local_files_only": True, **options},
    "info": json_metadata(dataclasses.asdict(info)),
    "segments": raw_segments,
}
with output.open("x", encoding="utf-8") as handle:
    json.dump(result, handle, ensure_ascii=False, indent=2, allow_nan=False)
    handle.write("\n")
