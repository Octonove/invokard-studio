# costs — credit prices as last checked by hand. Providers do not return prices; what is not published is NOT invented.
# Video is >95 % of a reel's spend: estimate BEFORE generating, and warn when a batch passes WARN_CREDITS.
CHECKED = '2026-09-21'
WARN_CREDITS = 5000

MAGNIFIC = {
    # image, credits per image
    'seedream-v4-5': 50, 'nano-banana-pro': 75, 'z-image': 5, 'flux-2-klein': 45, 'flux-pro-v1-1': 50, 'mystic': 100,
    # video, credits per second (image-to-video)
    'kling-v2-5-pro': 28, 'kling-v2-6-pro': 45,
    # via the official MCP connector only (slug: credits per second at 1080p)
    'kling-30': 90, 'kling-30@720p': 70, 'kling-26': 45, 'kling-25@720p': 28, 'google-veo3_1-lite': 40, 'google-veo3_1': 200, 'bytedance-seedance-pro-2.5': 790,
    # music (MCP): credits per track
    'google-lyria-3-pro': 160,
}
UNPUBLISHED = ('voice-over', 'sound effects', 'remove background', 'upscale (billed in EUR per output pixels)')

def estimate(images=0, image_model='seedream-v4-5', video_seconds=0, video_model='kling-v2-5-pro', music_tracks=0, music_model='google-lyria-3-pro'):
    """Credits for a plan. Lines with unpublished prices are listed, not summed."""
    lines = []
    if images: lines.append((f'{images} x {image_model}', images * MAGNIFIC[image_model]))
    if video_seconds: lines.append((f'{video_seconds} s x {video_model}', video_seconds * MAGNIFIC[video_model]))
    if music_tracks: lines.append((f'{music_tracks} x {music_model}', music_tracks * MAGNIFIC[music_model]))
    total = sum(c for _, c in lines)
    return {'lines': lines, 'total': total, 'warn': total > WARN_CREDITS, 'unpublished': UNPUBLISHED, 'checked': CHECKED}

def report(**kw):
    e = estimate(**kw)
    for label, c in e['lines']: print(f'  {label:32s} {c:6d} cr')
    print(f'  {"total":32s} {e["total"]:6d} cr   (prices checked {e["checked"]}; not priced: {", ".join(e["unpublished"])})')
    if e['warn']: print(f'  ! above {WARN_CREDITS} credits: confirm with the user before generating')
    return e

if __name__ == '__main__':
    import sys
    a = dict(x.split('=') for x in sys.argv[1:]); a = {k: (int(v) if v.isdigit() else v) for k, v in a.items()}
    report(**a)
