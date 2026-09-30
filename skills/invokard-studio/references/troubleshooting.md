# Troubleshooting

## ffmpeg / ffprobe not found
- Windows: `winget install Gyan.FFmpeg` (or download the "full" build from gyan.dev and add its `bin` to PATH).
- macOS: `brew install ffmpeg`. Linux: `sudo apt install ffmpeg` (≥ 5). Reopen the terminal / restart the agent so
  the new PATH is inherited. `install.py doctor` shows the version it finds.
- The engine needs `libx264`, `loudnorm`, `sidechaincompress`, `alimiter`, `silencedetect`, `ebur128`: all in the
  standard builds. No libass is required (captions are drawn by the engine, not by ffmpeg).

## Fonts
- Bundled: Inter (Black/ExtraBold/Bold/SemiBold/Regular, InterDisplay Black) and Playfair Display, all OFL. The colour
  emoji font (Noto Color Emoji, 25 MB) is optional: `python scripts/media.py fonts` downloads it. Without it the
  system emoji font is used when present (Segoe UI Emoji, Apple Color Emoji).
- Metrics: Inter Black measures the same as Segoe UI Black at equal size, so layouts designed on Windows carry over.
- Override a kind with `fonts.FONTS['black'] = '/path/to/font.ttf'` in the reel script, or set `INVOKARD_FONT_DIR`.

## Windows console
- Any script printing "→", "·" or an emoji crashes on cp1252 consoles. All scripts call `sys.stdout.reconfigure(
  encoding='utf-8')`; set `PYTHONIOENCODING=utf-8` when you run a one-liner from Bash.
- Git Bash turns arguments that start with `/` into `C:/Program Files/Git/…`: use `MSYS_NO_PATHCONV=1` or Windows paths.
- Long heredocs with mixed quotes fail with "unexpected EOF": write the `.py` file with your editor tool and run it by path.

## TLS
- Some machines (corporate proxies, antivirus inspection) break Python's certificate store: `requests` fails with
  CERTIFICATE_VERIFY_FAILED while curl works. Providers download results with curl first. For the API calls themselves,
  fix the store (`pip install --upgrade certifi`, or `SSL_CERT_FILE` pointing at the system bundle) or, as a last resort,
  `INVOKARD_TLS_VERIFY=0`.
- faster-whisper model downloads use the same store; a cached model is loaded offline first.

## Renders
- A 45 s reel takes 3-5 minutes (frame by frame). Run it in the background and wait for the final `ok`.
- Memory: a `Still` keeps one scaled image; `Clip` reads JPEGs on demand. Thousands of frames are fine.
- Frame grab to `.jpg` from the final mp4 can trip ffmpeg's mjpeg range check: `media.py frame` writes `.png`.
- `NotADirectoryError` in `frames/`: something other than frame folders is inside `frames/`. Move it out.

## Captions look wrong
- Words bunch up at the start: the voice file has leading silence longer than 30 ms and only one voiced span; the
  proportional fallback is being used. Split the sentence into two files or add punctuation that matches the pauses.
- The highlighted word shows in the wrong place: the count of phrases (by `.,:;?!`) does not match the pauses; "…" is
  not punctuation, write ".".
- Captions overlap the previous line: the engine trims the previous block automatically; if two `line()` calls share a
  start time, give each its own `t0`.

## Provider errors
- 401/403: wrong or missing key. 402: no credits. 410: endpoint retired (music on REST) → use the MCP. 429: wait a
  minute (50 requests/min per key). "requires additional permissions" on the MCP: read again with `creations_get`.
- A result without a URL: the task completed with moderation removal; rephrase the prompt.
