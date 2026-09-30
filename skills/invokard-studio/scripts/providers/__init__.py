# providers — generation back-ends. Each module reads its key from the environment (providers/env.py) and never logs it.
#   magnific   images, image-to-video, voice-over, sound effects, upscale, remove background (REST, MAGNIFIC_API_KEY)
#   elevenlabs voice-over with per-word timestamps (ELEVENLABS_API_KEY)
#   costs      credit table and estimates (video is >95 % of a reel's spend: estimate first)
# The Magnific MCP connector (OAuth) is used directly by the agent, not from here: see references/providers.md.
