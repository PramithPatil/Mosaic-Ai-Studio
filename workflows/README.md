# ComfyUI workflow exports

Export ComfyUI workflows with **Save (API Format)** and place them in this folder as:

- `image.api.json` for image generation
- `video.api.json` for video generation

Set the matching `COMFYUI_*_PROMPT_NODE_ID` in `.env.local` to the positive text prompt node ID in each exported workflow. The image workflow should expose a PNG, JPEG, or WebP under an `images` output; the video workflow should expose an MP4, WebM, MOV, or GIF under a `videos`, `video`, `gifs`, or `animations` output. Do not commit model weights or private workflow credentials.
