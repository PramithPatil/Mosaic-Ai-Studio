# ComfyUI workflows

`image.api.json` is a Stable Diffusion 1.5 text-to-image API workflow. The app offers a higher-detail preset (512×512, 12 steps), a balanced preset (384×384, 8 steps), and a fast preview preset (320×320, 4 steps). Each image gets a fresh seed. It uses the positive prompt node `6` and expects `v1-5-pruned-emaonly-fp16.safetensors` in ComfyUI's `models/checkpoints` folder. The app substitutes the user's prompt in node `6` and reads the generated image from the `SaveImage` output. Higher-detail generation can take several minutes on CPU; image safety checks add time.

The matching `.env.local` settings are:

```dotenv
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_IMAGE_WORKFLOW_PATH=workflows/image.api.json
COMFYUI_IMAGE_PROMPT_NODE_ID=6
```

For a different image model or a custom workflow, export it with **Save (API Format)** and update the workflow path and positive text prompt node ID. To enable video, export a video workflow as `video.api.json` and set `COMFYUI_VIDEO_PROMPT_NODE_ID` to its positive prompt node. Image outputs must be PNG, JPEG, or WebP under an `images` output; video outputs must be MP4, WebM, MOV, or GIF under a `videos`, `video`, `gifs`, or `animations` output. Do not commit model weights or private workflow credentials.
