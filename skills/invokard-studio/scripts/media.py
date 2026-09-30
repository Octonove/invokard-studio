# media — production utilities. Usage:  python media.py <command> ...   (no arguments lists the commands)
import os, sys, glob, json, subprocess
for _s in (sys.stdout, sys.stderr):                    # Windows consoles default to cp1252: an arrow or an emoji would crash print()
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)

def _font(size, bold=True):
    import fonts; return fonts.font('bold' if bold else 'reg', size)

def _ff(*args, check=True):
    return subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=check)

def download(dest, url):
    """Download with curl (works where Python's TLS store is broken). Skips if the file already exists."""
    if os.path.exists(dest) and os.path.getsize(dest) > 0: print('exists', dest); return
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    rc = subprocess.run(['curl', '-sSfL', '--retry', '2', '-o', dest, url]).returncode
    print(('ok ' if rc == 0 else 'FAILED ') + dest, os.path.getsize(dest) if rc == 0 else '')

def frames(work, *names):
    """vid/<n>.mp4 -> frames/<n>/0001.jpg... at 30 fps and 1080x1920 (what reelkit.Clip reads). Generated clips are
    already 9:16; for camera footage use `extract`."""
    vids = [os.path.join(work, 'vid', n + '.mp4') for n in names] or sorted(glob.glob(os.path.join(work, 'vid', '*.mp4')))
    for v in vids:
        n = os.path.splitext(os.path.basename(v))[0]; d = os.path.join(work, 'frames', n)
        if os.path.isdir(d) and len(os.listdir(d)) > 20: print('exists', n); continue
        os.makedirs(d, exist_ok=True)
        _ff('-i', v, '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920', '-q:v', '2', os.path.join(d, '%04d.jpg'))
        print(n, len(os.listdir(d)), 'frames')

def extract(work, name, source, start, dur, mode='auto'):
    """A segment of real footage -> frames/<name>/. Portrait clips are scaled to fill 1080x1920; landscape clips are
    fitted 1420 px wide over a blurred, darkened copy of themselves (no crop, no quality loss). mode: auto|fill|fit"""
    d = os.path.join(work, 'frames', name); os.makedirs(d, exist_ok=True)
    if len(os.listdir(d)) > 10: print('exists', name); return
    if mode == 'auto':
        probe = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation',
                                         '-of', 'json', source]).decode()
        st = json.loads(probe)['streams'][0]; w, h = st['width'], st['height']
        rot = next((abs(int(sd.get('rotation', 0))) for sd in st.get('side_data_list', []) if 'rotation' in sd), 0)
        if rot in (90, 270): w, h = h, w
        mode = 'fit' if w > h else 'fill'
    if mode == 'fit':
        vf = ('[0:v]fps=30,split[a][b];'
              '[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:3,eq=brightness=-0.10:saturation=0.9[bg];'
              '[b]scale=1420:-2:flags=lanczos,crop=1080:ih[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2+40')
        _ff('-ss', f'{float(start):.3f}', '-t', f'{float(dur):.3f}', '-i', source, '-filter_complex', vf, '-q:v', '2', os.path.join(d, '%04d.jpg'))
    else:
        _ff('-ss', f'{float(start):.3f}', '-t', f'{float(dur):.3f}', '-i', source, '-vf',
            'fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920', '-q:v', '2', os.path.join(d, '%04d.jpg'))
    print(name, len(os.listdir(d)), 'frames', f'({mode})')

def sheet_img(work, cols=5):
    """review/imgs.jpg with every illustration: check style, stray text and LOGOS before spending on video."""
    from PIL import Image, ImageDraw
    fs = sorted(glob.glob(os.path.join(work, 'img', '*.png')) + glob.glob(os.path.join(work, 'img', '*.jpg')))
    if not fs: print('no images in img/'); return
    w, h = 300, 533; rows = -(-len(fs) // cols)
    sheet = Image.new('RGB', (cols * (w + 6), rows * (h + 34)), 'white'); d = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        x, y = (i % cols) * (w + 6), (i // cols) * (h + 34)
        sheet.paste(Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS), (x, y + 30)); d.text((x + 4, y + 4), os.path.basename(f), fill='black', font=_font(20))
    out = os.path.join(work, 'review', 'imgs.jpg'); os.makedirs(os.path.dirname(out), exist_ok=True); sheet.save(out, quality=88); print(out)

def sheet_motion(work):
    """review/motion.jpg: 5 frames per clip to see that the animation respects the drawing and invents nothing."""
    from PIL import Image, ImageDraw
    ns = sorted(n for n in os.listdir(os.path.join(work, 'frames')) if os.path.isdir(os.path.join(work, 'frames', n)))
    w, h = 190, 338; sheet = Image.new('RGB', (5 * (w + 4) + 170, len(ns) * (h + 4)), 'white'); d = ImageDraw.Draw(sheet)
    for r, n in enumerate(ns):
        fs = sorted(os.listdir(os.path.join(work, 'frames', n))); k = len(fs); d.text((6, r * (h + 4) + 8), n, fill='black', font=_font(20))
        for c, i in enumerate([0, k // 4, k // 2, 3 * k // 4, k - 1]):
            sheet.paste(Image.open(os.path.join(work, 'frames', n, fs[i])).resize((w, h), Image.LANCZOS), (170 + c * (w + 4), r * (h + 4)))
    out = os.path.join(work, 'review', 'motion.jpg'); os.makedirs(os.path.dirname(out), exist_ok=True); sheet.save(out, quality=86); print(out)

def sheet_footage(work, *sources):
    """review/footage_N.jpg: a row of timestamped frames per source clip, to pick segments from real footage.
    sources: video files (or a folder). Frame every max(0.6 s, duration/12)."""
    from PIL import Image, ImageDraw
    files = []
    for s in sources: files += sorted(glob.glob(os.path.join(s, '*.m*4')) + glob.glob(os.path.join(s, '*.MOV')) + glob.glob(os.path.join(s, '*.mov'))) if os.path.isdir(s) else [s]
    tmp = os.path.join(work, 'review', '_tmp'); os.makedirs(tmp, exist_ok=True); F = _font(18)
    Wd = 1900; sheets = []; cur = Image.new('RGB', (Wd, 1560), (30, 30, 30)); d = ImageDraw.Draw(cur); x, y = 10, 10
    def new():
        nonlocal cur, d, x, y
        sheets.append(cur); cur = Image.new('RGB', (Wd, 1560), (30, 30, 30)); d = ImageDraw.Draw(cur); x, y = 10, 10
    for c in files:
        n = os.path.splitext(os.path.basename(c))[0]
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', c]).decode())
        step = max(0.6, dur / 12); ts = [round(0.1 + i * step, 2) for i in range(int((dur - 0.15) / step) + 1)]
        d.text((x, y), f'{n}  ({dur:.1f}s)', font=F, fill=(255, 220, 90)); y += 26; x = 10
        for t in ts:
            out = os.path.join(tmp, f'{n}_{t}.png')
            _ff('-ss', str(t), '-i', c, '-frames:v', '1', '-vf', 'scale=-2:220', out, check=False)
            if not os.path.exists(out): continue
            im = Image.open(out).convert('RGB')
            if x + im.width > Wd - 10: x = 10; y += 250
            if y + 250 > 1560: new(); d.text((x, y), f'{n} (cont.)', font=F, fill=(255, 220, 90)); y += 26
            cur.paste(im, (x, y)); d.text((x + 4, y + 196), f'{t}', font=F, fill='white', stroke_width=2, stroke_fill='black'); x += im.width + 6
            os.remove(out)
        x = 10; y += 232
        if y + 270 > 1560: new()
    sheets.append(cur)
    for i, s in enumerate(sheets):
        p = os.path.join(work, 'review', f'footage_{i + 1:02d}.jpg'); s.save(p, quality=85); print(p)
    try: os.rmdir(tmp)
    except OSError: pass

def voice(work):
    """Duration and voiced spans of every vo/*.mp3|wav: timings and cuts of the edit come from here."""
    import reelkit as rk; rk.set_base(work); total = 0
    for f in sorted(glob.glob(os.path.join(work, 'vo', '*.mp3')) + glob.glob(os.path.join(work, 'vo', '*.wav'))):
        rel = os.path.relpath(f, work).replace('\\', '/'); dur = rk.duration(rel); total += dur
        print(rel, round(dur, 2), [(round(a, 2), round(b, 2)) for a, b in rk.speech_segments(rel)])
    print('voice total:', round(total, 2), 's  (add ~0.3 s between sentences and 3-4 s of outro)')

def beats(track, t0='0', t1=None, low='80', high='160'):
    """Tempo, beat length and first beat of a music track (for cutting on the beat). Optional window t0 t1 and BPM range."""
    import reelkit as rk
    bpm, beat, first = rk.beat_grid(track, float(t0), float(t1) if t1 else None, (float(low), float(high)))
    print(f'BPM {bpm}  beat {beat:.5f} s  first beat {first} s   bar(k) = {first} + 4*k*{beat:.5f}')
    return bpm, beat, first

def energy(track, step='0.5'):
    """Loudness curve of a track in dB per window, to find its drops, breaks and final hit."""
    import numpy as np
    sr = 22050; step = float(step)
    a = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', track, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-']), np.int16).astype(np.float32) / 32768
    t = 0.0
    while t + step <= len(a) / sr:
        s = a[int(t * sr):int((t + step) * sr)]; e = 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9)
        print(f'{t:6.2f}s {e:6.1f} dB ' + '#' * max(0, int((e + 50) / 1.5))); t += step

def splice(track, out, cut_at, resume_at, total=None, xfade='0.025'):
    """Music edit: keep 0..cut_at, then jump to resume_at (both at bar starts) with a short crossfade -> out (wav).
    Lets a short reel use a break or a final hit that sits later in the track."""
    cut_at, resume_at, x = float(cut_at), float(resume_at), float(xfade) / 2
    pad = f',apad=whole_dur={float(total) + 0.5}' if total else ''
    fc = (f'[0:a]atrim=0:{cut_at + x:.4f},asetpts=PTS-STARTPTS[a];[0:a]atrim=start={resume_at - x:.4f},asetpts=PTS-STARTPTS[b];'
          f'[a][b]acrossfade=d={float(xfade)}:c1=tri:c2=tri,aresample=48000,aformat=channel_layouts=stereo{pad}[o]')
    _ff('-i', track, '-filter_complex', fc, '-map', '[o]', out); print(out, f'splice {cut_at} <- {resume_at}')

def sound(source, out, start, dur, highpass='120', fade_out='0.25'):
    """Cut a real sound (pressure washer, engine, crowd) from a video's audio track -> wav, with fades and a highpass."""
    _ff('-ss', str(start), '-t', str(dur), '-i', source, '-vn', '-af',
        f'highpass=f={highpass},afade=t=in:d=0.05,afade=t=out:st={float(dur) - float(fade_out)}:d={fade_out},aresample=48000', out); print(out)

def silence(out, dur='1'):
    """A silent wav (a placeholder voice track when a reel has no narration but needs the mixer)."""
    _ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', str(dur), out); print(out)

def compare(out, *clips):
    """Side-by-side video to compare models. clips: file=Name|cost"""
    from PIL import Image, ImageDraw
    cl = [a.split('=', 1) for a in clips]; w, h, bar = 540, 960, 96
    head = Image.new('RGB', (w * len(cl), bar), (14, 26, 58)); d = ImageDraw.Draw(head)
    for i, (_, lab) in enumerate(cl):
        name, _, cost = lab.partition('|')
        d.text((i * w + w / 2, 30), name, fill='white', font=_font(30), anchor='mm'); d.text((i * w + w / 2, 68), cost, fill=(166, 206, 50), font=_font(24), anchor='mm')
    cab = out + '.header.png'; head.save(cab); ins, fc = [], []
    for i, (p, _) in enumerate(cl):
        ins += ['-stream_loop', '1', '-i', p]; fc.append(f'[{i}:v]fps=24,scale={w}:{h}:flags=lanczos,trim=duration=8,setpts=PTS-STARTPTS[v{i}]')
    fc.append(''.join(f'[v{i}]' for i in range(len(cl))) + f'hstack=inputs={len(cl)}[row]'); fc.append(f'[{len(cl)}:v][row]vstack=inputs=2[out]')
    _ff(*ins, '-loop', '1', '-t', '8', '-i', cab, '-filter_complex', ';'.join(fc), '-map', '[out]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', '8', out)
    os.remove(cab); print(out)

def verify(mp4, n=14):
    """Specs, loudness (target -14 LUFS) and a contact sheet taken from the FINAL mp4, not from the engine."""
    from PIL import Image
    print(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,channels',
                                   '-of', 'default=nw=1', mp4]).decode().replace('\n', '  '))
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp4, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    print([l.strip() for l in err.splitlines() if l.strip().startswith(('I:', 'Peak:'))][-2:])
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).decode()); n = int(n)
    cols = 7; rows = -(-n // cols); tmp = mp4 + '.f.png'; sheet = Image.new('RGB', (cols * 274, rows * 484), 'white')
    for i in range(n):
        _ff('-ss', str(round(dur * (i + 0.5) / n, 2)), '-i', mp4, '-frames:v', '1', '-vf', 'scale=270:480', tmp)
        sheet.paste(Image.open(tmp).convert('RGB'), ((i % cols) * 274, (i // cols) * 484))
    os.remove(tmp); out = os.path.splitext(mp4)[0] + '_sheet.jpg'; sheet.save(out, quality=88); print(out)

def frame(mp4, t, out=None):
    """One full-size frame at second t -> png (jpg output from an mp4 trips ffmpeg's mjpeg range check)."""
    out = out or os.path.splitext(mp4)[0] + f'_{t}.png'; _ff('-ss', str(t), '-i', mp4, '-frames:v', '1', out); print(out)

def web(mp4, out=None, height='1280', crf='24'):
    """Lighter copy for a website or a preview: 720x1280, capped bitrate, faststart."""
    out = out or os.path.splitext(mp4)[0] + '-web.mp4'
    _ff('-i', mp4, '-vf', f'scale=-2:{height}:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-maxrate', '1500k', '-bufsize', '3000k',
        '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out); print(out)

def gif(mp4, out=None, width='360', fps='12', start='0', dur=None):
    """Animated GIF preview (for a README): palette-optimised, `width` px wide."""
    out = out or os.path.splitext(mp4)[0] + '.gif'; span = ['-t', str(dur)] if dur else []
    _ff('-ss', str(start), *span, '-i', mp4, '-vf', f'fps={fps},scale={width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
        '-loop', '0', out); print(out, os.path.getsize(out))

EMOJI_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notocoloremoji/NotoColorEmoji-Regular.ttf'
def fonts_cmd():
    """Download the optional colour emoji font (Noto Color Emoji, 25 MB, OFL) into assets/fonts and report every font."""
    import fonts
    download(os.path.join(fonts.BUNDLED, 'NotoColorEmoji.ttf'), EMOJI_URL)
    fonts.FONTS.clear()
    for k, v in fonts.status().items(): print(f'{k:10s} {v}')

COMMANDS = {'download': download, 'frames': frames, 'extract': extract, 'sheet-img': sheet_img, 'sheet-motion': sheet_motion,
            'sheet-footage': sheet_footage, 'voice': voice, 'beats': beats, 'energy': energy, 'splice': splice, 'sound': sound,
            'silence': silence, 'compare': compare, 'verify': verify, 'frame': frame, 'web': web, 'gif': gif, 'fonts': fonts_cmd}
if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        for k, f in COMMANDS.items(): print(f'{k:14s} {f.__doc__.strip().splitlines()[0]}')
        sys.exit(0)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
