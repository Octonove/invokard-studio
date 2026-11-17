# Invokard Studio Local

**Videos made with code by Claude Code, entirely on your computer.** Reels and shorts from your own photos, clips,
voice recordings and music, with word-by-word captions, animated headlines, charts, before/after wipes, cuts on the
beat, end cards and a mixed soundtrack; and animations drawn frame by frame with React: kinetic type, animated ads,
charts that grow, a product in 3D, physics, particles. 9:16, 16:9 and 1:1. No accounts, no API keys, and nothing is
sent anywhere while it works. MIT.

| Montage + animation, from one script | Your first reel, with no outside media |
|:---:|:---:|
| ![A reel that uses both engines](examples/animated-reel/preview.gif) | ![Frames of the first-reel example](examples/first-reel/preview.jpg) |

It is the local edition of [Invokard Studio](https://github.com/Octonove/invokard-studio): the same two engines, without
the parts that use online media services.

## What you can ask for

- "Make a 30-second vertical reel from the clips in `footage/`, cut on the beat of `music/track.mp3`, with my logo at the end."
- "Here are four voice recordings and three photos: make a reel with word-by-word captions and a before/after wipe."
- "Draw an 8-second animated ad for my bakery: the headline 'Fresh bread at 7', a price tag that pops in, colours #1E3A5F and #CE6E61."
- "Turn these numbers into a 10-second animated bar chart in 16:9 for LinkedIn."
- "Re-render last week's reel in 1:1 for the feed."

Claude writes a short `reel.py` (and, for drawn shots, a React component), previews the whole edit as a contact sheet,
fixes it, renders the MP4 and checks the final file: resolution, frame rate, loudness (−14 LUFS) and a contact sheet
taken from the video itself.

## Install

In Claude Code:

```bash
claude plugin marketplace add Octonove/invokard-studio-local
claude plugin install invokard-studio-local@invokard-studio-local
```

Then ask for a reel or an animation. Your computer needs:

- **Python 3.10+** with Pillow and numpy (`python -m pip install Pillow numpy`), and **ffmpeg** on the PATH
  (Windows `winget install Gyan.FFmpeg`, macOS `brew install ffmpeg`, Linux `sudo apt install ffmpeg`).
- For drawn animation: **Node.js 18+**, one `npm install` in `skills/invokard-studio-local/animation`, and **Google
  Chrome or Microsoft Edge** installed (it draws in that browser, without opening a window).

Try it with no media of your own: `python examples/first-reel/reel.py` (montage) and `python
examples/animated-reel/reel.py` (montage + animation) draw their pictures and synthesise their own stand-in voice and
music on the first run.

## What it runs, and what it sends

- **Runs on your computer:** Python scripts in `skills/invokard-studio-local/scripts`, `ffmpeg`/`ffprobe`, Node.js
  for the animation engine, and your installed Chrome or Edge in headless mode. The animation engine serves its pages
  from a local server on `127.0.0.1` that only the browser on your machine connects to.
- **Reads and writes:** the files you point it to and the work folder of each video (`img/`, `vid/`, `vo/`, `music/`,
  `frames/`, `out/`, `review/`).
- **Sends: nothing.** No telemetry, no accounts, no calls to online services. Fonts (15 open-licensed families) and
  sound effects are bundled; the engine never downloads a font, a browser or a video.
- **Downloads once, when you install the requirements:** Pillow and numpy from PyPI, and the animation engine's
  packages from npm (React, three.js, esbuild, playwright-core, and an ffmpeg build that is used only when ffmpeg is
  not on the PATH). The skill tells you before it runs those installs.
- **The repository's tests** (`.github/workflows/test.yml`) run only on GitHub's servers: they install the same
  requirements and render both examples on every change. They are not part of what the plugin runs on your computer.

## What it does not do

It does not generate images, video clips, voices or music with AI: it works with your own material and with what it
draws with code. For a voice-over, you record one file per sentence (a phone voice memo is fine) and the captions and
cuts follow your voice.

## Support and security

Questions and bugs: [GitHub issues](https://github.com/Octonove/invokard-studio-local/issues). Security reports:
see [SECURITY.md](SECURITY.md).

## Licences

Code and documentation: MIT ([LICENSE](LICENSE)), by Antonio José Bergoños (Octonove). Fonts: SIL Open Font Licence 1.1
(each with its licence file). The eight sound effects in `skills/invokard-studio-local/assets/sfx` were made for Invokard
Studio and can be used in the videos you make with it.
