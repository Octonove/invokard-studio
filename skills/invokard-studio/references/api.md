# API reference — `scripts/`

All coordinates are pixels on the canvas (1080x1920 unless the format says otherwise); times are seconds; colours are
RGB tuples. Import with `sys.path.insert(0, <skill>/scripts)` (the template does it).

## reelkit.py — the engine

| Symbol | What |
|---|---|
| `W, H, FPS` | Canvas and frame rate: 1080, 1920, 30 by default (copies: re-import after `set_format`) |
| `set_format(fmt)` → `(W, H)` | `'9:16'` (default), `'16:9'` (1920x1080), `'1:1'` (1080x1080); aliases portrait/landscape/square, `'1920x1080'`. Call it first |
| `FORMAT` · `FORMATS` · `format_name(fmt)` · `env_format()` | Current format; the table; canonical name; the format asked by `REELKIT_FORMAT` (or `REELKIT_LANDSCAPE=1` → 16:9) |
| `LAYOUT` | Default positions for the current format (table below); edit a key to move that default for the whole reel |
| `set_base(path)` · `P(*parts)` | Work folder; paths resolve against it (absolute paths pass through) |
| `source_key(path)` | (absolute path, mtime) of an input: the cache key; clear error when the file is missing |
| `tool(name)` | Path of `ffmpeg`/`ffprobe`, or an error that says how to install it |
| `set_brand(hl_bg, hl_fg, stroke)` | Caption colours (done by `Brand.activate()`) |
| `font(kind, size)` | Pillow font: `black extrabold bold semi reg display serif serifi emoji` (see `fonts.py`) |
| `clamp01 lerp eo eio eback` | Easing helpers (`eback` overshoots: the "pop") |
| `load(path)` · `cover(im, w, h, cx, cy)` · `cover_cached(path, …)` | Load / scale-and-crop to fill |
| `blurred(path, radius, dark, tint)` | Blurred, darkened full-frame background |
| `gradient(top, bottom)` | Vertical gradient image |
| `blit(canvas, img, x, y, scale, alpha, anchor, rot)` | Composite RGBA on the canvas; anchor `c tl tc bc lc rc` |
| `shadowed(img, radius, offset, opacity)` | Adds a soft drop shadow (image grows by the pad) |
| `rrect(w, h, r, fill)` | Rounded rectangle image |
| `text_img(text, kind, size, fill, stroke, stroke_fill, tracking, shadow)` | Text on a transparent image (cached; you get a copy) |
| `emoji_img(char, size)` | Colour emoji image |
| `pill(text, kind, size, fg, bg, padx, pady, r, tracking, dot, shadow)` | Rounded label (cached; you get a copy) |
| `wrap(text, kind, size, maxw)` | Word-wrap into lines |
| `Still(path, z=(1, 1.06), c0=(.5, .5), c1=None, crop=None, fx=None)` | Image source with zoom `z` and focal point `c0→c1` (no motion: composed once) |
| `Clip(name, speed=1, start=0, z=(1, 1), c=(.5, .5), fx=None)` | Frames in `frames/<name>/`; `fx(im, t)` per-frame effect; frames of another size are cropped to fill (with a note) |
| `LEGACY_RESAMPLE` | `False`: zooms resample with `resize(box)` (~4x faster); `True`: the affine transform of 1.0.0, same pixels as before |
| `Func(f)` | Source from `f(t_local, dur) -> RGB image` |
| `duration(path)` · `speech_segments(path, noise='-38dB', d=0.1)` | ffprobe duration; voiced spans via silencedetect (cached per file version) |
| `voiced_spans(log, dur)` | The spans from a silencedetect log (pure; reads exponent and negative times) |
| `music_start(path)` | First strong onset (where the music is trimmed from) |
| `beat_grid(path, t0, t1, bpm_range, step)` | `(bpm, beat_seconds, first_beat)` |
| `Captions(size=None, y=None, maxw=None)` | Word-by-word captions; defaults from `LAYOUT` (9:16: 74, 1450, 900; 16:9: 64, 880, 1400) |
| `caps.line(key, text, audio, t0, y, size, show)` | Time `text` against `audio` starting at `t0` |
| `caps.from_words(key, [(text, start, end)], t0, y, size, show)` | From timed words (`align.py`, `elevenlabs.tts_timed`) |
| `caps.word_time(key, i)` · `caps.word_end(key, i)` | When word `i` starts / ends |
| `Reel(name)` | The composition |
| `reel.shot(t0, t1, source)` | Background source for `[t0, t1)`; later shots override earlier ones |
| `reel.ov(t0, t1, f)` | Layer `f(canvas, t_local, dur, t_global)` for `[t0, t1)`; drawn in order |
| `reel.vo(path, t, gain=1)` → end time | Voice track at `t` |
| `reel.sfx(path, t, gain=0.5)` | Effect at `t` |
| `reel.frame_at(t)` | RGB frame (for custom checks) |
| `reel.preview(times, out, cols, scale)` | Contact sheet |
| `reel.render(out, total, music=None, music_gain=0.24, music_offset=None, crf=16, preset='slow', **audio)` | Video + mix + mux; checks the audio inputs first; `preset='veryfast'` for drafts |
| `reel.check(music=None)` | Fails fast: ffmpeg present, every audio file exists, something to mix |
| `reel.render_audio(out, total, music, music_gain, music_offset, music_fade_in=0.5, music_fade_out=2.2, duck=True, loudness=-14, true_peak=-2.0, limiter=True, linear=True)` | The mix alone. `linear=True`: measure first, then one fixed gain for the whole reel, so the hook at 0 s is as loud as the rest; `linear=False`: the old single-pass dynamic loudnorm |
| `reel.cover(t, out)` | Frame at `t` without captions |

Caption syntax: `*word*` highlight · ` / ` block break · `shown|spoken`. Phrases split on `.,:;?!`.

### Default positions per format (`rk.LAYOUT`)

Pieces and captions use these when an argument is left out. 9:16 keeps the numbers 1.0.0 used.

| Key | 9:16 | 16:9 | 1:1 | Used by |
|---|---|---|---|---|
| `caption_size` · `caption_y` · `caption_maxw` | 74 · 1450 · 900 | 64 · 880 · 1400 | 64 · 880 · 900 | `Captions()` |
| `top` · `hook_y` · `label_y` · `card_y` | 236 · 300 · 255 · 215 | 120 · 170 · 110 · 110 | same as 16:9 | `headline`, `hook`, `section_label`, `Card` |
| `text_y` · `text_maxw` · `pill_maxw` | 470 · 950 · 900 | 300 · 1500 · 1400 | 300 · 950 · 900 | `text_layer`, `text_block`, headline pills |
| `item_y` · `benefit_y` | 300 · 1262 | 150 · 740 | 150 · 740 | `list_item` |
| `gradient_y0` · `handle_y` · `wipe_label_y` · `center_y` | 1100 · 1000 · 1480 · 900 | 540 · 540 · 900 · 540 | same as 16:9 | `bottom_gradient`, wipes, `end_card_layer` |
| `outro_save`, `comment_y`, `comment_dy`, `fan_size`, `fan_y`, `fan_cta_y` | see `reelkit.LAYOUTS` | | | the outros |

## pieces.py — components (need a `Brand` `B`)

| Symbol | What |
|---|---|
| `sfx(name)` | Path of a bundled effect: whoosh pop shimmer chime typing shutter coaster fridge |
| `Brand(dark, dark_deep, light, light_soft, accent, accent_text, alert, muted)` · `.activate()` | Palette; `from_colors(dark, accent)`, `from_logo(path)` |
| `BRANDS` | `studio` (navy/coral) · `lime` (navy/sky/lime) · `forest` (green) · `mono` (black/amber) |
| `source(name, img, speed, start, z, c)` | `Clip` if `frames/<name>/` exists, else `Still(img)` |
| `bottom_gradient(B, y0=None, strength=0.94)` | Dark veil for the lower third (first layer); y0 from `LAYOUT` |
| `fit_pill(text, maxw, size, **pill_kw)` | Pill that shrinks to fit |
| `badge(text, B, d=104)` · `disc(d, col)` · `chip(text, size, style, B, dot)` | Small labels |
| `mix(c1, c2, a)` · `flash(canvas, tl)` · `appear(c, img, x, y, t, t0)` · `ring(canvas, cx, cy, r, p, color)` | Helpers |
| `photo_card(path, w, h, crop, border, radius, cx, cy)` | Rounded thumbnail with shadow |
| `text_block(txt, size=84, maxw=None, box, text, stroke, kind)` | On-screen text with `*highlighted runs*` in one box each; emoji in colour |
| `text_layer(txt, y=None, size, maxw, pop, fade_out)` | Layer: pops a text_block in, fades out at the end |
| `headline(B, kicker, line, highlight, y=None)` | Layer: kicker pill + line + accent pill (top safe zone) |
| `hook(B, line, highlight, y=None, size=72)` | Layer: white line with shadow + accent pill (over photos) |
| `section_label(B, n, txt)` | Layer: «n · TEXT» pill at the top |
| `Card(B, w=940, h=300, x=None, y=None, plot)` · `.draw(c, p, header, legend)` → origin · `.curve(c, origin, fn, p, color, width)` | White chart card (centred by default); `fn(x) -> [0,1]` |
| `list_item(B, n, total, name, benefit, y_name=None, y_benefit=None)` | Layer for item `n` of `total` |
| `split_frame(before, after, xw, B, handle=True, y_handle=None)` | RGBA still: `after` revealed up to `xw` |
| `wipe_scene(before, after, B, hold=0, sweep=0.85, labels, y_label=None, settle=None, y_handle=None)` | Before/after scene |
| `browser_frame(shot, w=1400, url='')` · `phone_frame(shot, h=900)` | RGBA: a screenshot (path or image) in a browser window / a phone, with shadow |
| `logo_card(logo, w=860, pad=60, min_h=230, line, line_size, line_color, accent)` | White card with a logo (path or image) |
| `end_card_layer(card, t_pop=0.2, y=None)` | Layer: pops the card in (centre of the canvas by default) |
| `blur_in(src, dur=0.6, delay=0, radius=18, dark=0.35, tint)` | Source that blurs and darkens over time |
| `outro_save(B, background, logo, title, sub, cta, note)` | "Save this reel" closing scene |
| `outro_comment(c, tl, B, word, sub, handle, y=None, prompt)` | «Comment WORD» block (draw inside a scene) |
| `outro_fan(B, background, photos, word, sub, handle, size=None, y_photos=None, y_cta=None, extra)` | Closing scene with a fan of photos |

## media.py — `python media.py <command> … [--format 9:16|16:9|1:1]`

`--format` (or `REELKIT_FORMAT`) sets the canvas for `frames`, `extract` and the review sheets. A wrong number of
arguments prints the command's usage.

| Command | Arguments | What |
|---|---|---|
| `download` | dest url | curl download (skips if present) |
| `frames` | work [names…] | `vid/*.mp4` → `frames/<name>/` at 30 fps, cropped to the canvas (fill) |
| `extract` | work name source start dur [auto\|fill\|fit] | Segment of real footage → frames (the other orientation fitted over blur) |
| `sheet-img` | work [cols] | `review/imgs.jpg` of `img/` |
| `sheet-motion` | work | `review/motion.jpg`: 5 frames per clip |
| `sheet-footage` | work sources… | `review/footage_NN.jpg`: timestamped frames per source clip |
| `voice` | work | Durations and voiced spans of `vo/*` |
| `beats` | track [t0 t1 low high] | BPM, beat length, first beat |
| `energy` | track [step] | Loudness curve |
| `splice` | track out cut_at resume_at [total] [xfade] | Music edit with crossfade |
| `sound` | source out start dur [highpass] [fade_out] | Cut a real sound from a clip's audio |
| `silence` | out [dur] | Silent wav |
| `compare` | out file=Name\|cost… | Side-by-side model comparison video |
| `verify` | mp4 [n] | Specs, LUFS/peak, contact sheet from the final file |
| `frame` | mp4 t [out] | One full-size PNG frame |
| `web` | mp4 [out] [height] [crf] | 720p delivery copy (720x1280, 1280x720 or 720x720) |
| `gif` | mp4 [out] [width] [fps] [start] [dur] | GIF preview |
| `fonts` | | Download the emoji font, report all fonts |

## align.py

`python align.py <audio> [--lang xx] [--model small|medium|large-v3|<folder>] [--text "…"|file] [--start s] [--dur s] [--out json]`
→ JSON with `words: [{text, start, end}]`. `load_words(path)` returns `[(text, start, end)]` for `caps.from_words`.
With `--text`, recognised words snap to the real text (sequence alignment); `unmatched` counts gaps that were interpolated.

## providers/

`env.secret(NAME)` · `magnific.image/image_from_ref/video/voice/sound_effect/music/upscale/remove_background` ·
`elevenlabs.tts/tts_timed/voices/words_from_alignment` · `costs.estimate/report`. Details in `references/providers.md`.
