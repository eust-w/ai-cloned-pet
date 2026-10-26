# AI Cloned Pet

Turn your pet's photos into a cartoon companion that reacts in your browser.

[简体中文](README.zh-CN.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md)

**Experimental alpha.** Photo-to-avatar generation and browser interactions work, but animation quality is still being developed. The generator currently creates nine pose images and builds 72 cells using image transforms; these are not 72 independently animated poses. This is a 2D companion, not a 3D reconstruction or a clone of an animal's personality.

## What You Can Do

- Bring your own pet photos, or extract still frames from a video with ffmpeg.
- Generate a cartoon avatar in storybook, toy-like, pixel, or ink styles.
- Click the stage to move the companion, touch it for a reaction, and use local text commands.
- Reuse cached sprites without calling an image model during ordinary interaction.
- Switch between Chinese (default) and English.
- Keep records in local SQLite, export metadata, and delete uploaded media.

No API keys, uploaded pets, generated avatars, or seeded sample data are included. A fresh install starts empty. Audio uploads are stored; voice cloning and audio understanding are not implemented.

## Quick Start

Requires **Node.js 24**, npm, and ffmpeg on PATH for video uploads. Start with photos if ffmpeg is unavailable.

```bash
git clone https://github.com/eust-w/ai-cloned-pet.git
cd ai-cloned-pet
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:4000. Create a pet, confirm media consent, upload photos, then configure a provider to generate an avatar. Never put a provider key into client-side code.

`npm run build` builds both components. `npm start` starts the compiled **API only**; use `npm run preview` in another terminal to preview the built web app locally.

## Providers And Cost

Configure your own provider in `.env`. For DashScope/Bailian, a configuration can look like this; choose models and an endpoint enabled for your account and region:

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
OPENAI_VISION_MODEL=qwen-vl-plus
OPENAI_IMAGE_MODEL=wan2.6-image
```

OpenAI-compatible chat/vision and image-edit integrations are also present. Compatible chat endpoints do not necessarily support image editing. Model access and pricing are controlled by the provider.

| Operation | Provider calls |
| --- | --- |
| Upload photos / extract video frames | None |
| Identity analysis | Vision request with selected images |
| Generate or regenerate an avatar | Currently **9 image requests**, one per pose |
| Idle, stage click, touch, local text commands | None |
| Text command with LLM enabled | Chat request |

Uploads are stored locally. Analysis sends selected images to the configured vision provider; generation sends a reference image to the image provider. LLM planning sends the profile and message. Generated assets are downloaded and cached locally. Generation is not free; cached playback avoids repeated inference charges.

## Current Limits

- Pose transforms cannot substitute for articulated walking, blinking, or tail motion. Matte quality and identity consistency still vary.
- The fallback photo atlas assigns photos to action slots; it does not recognize their actions.
- Local commands are rule-based; arbitrary conversational understanding requires the optional LLM.
- This is a local, single-user app with no authentication, billing limits, or background generation queue. Do not expose the API to the internet as a multi-user service.
- 3D routes are disabled and return `410 THREE_D_DISABLED`.
- JSON export contains metadata and file URLs, not a self-contained media backup.

See [release gates](docs/ROADMAP.md) before announcing a stable release. This independent project is not an official OpenAI/Codex product. Matching atlas dimensions do not imply verified Codex Pet import compatibility.

## Development And Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

Real integration test, against a running API and your own files:

```bash
COCO_TEST_MEDIA="/absolute/pet-video.mp4;/absolute/pet-photo.jpg" npm run test:real:coco
```

Add `REAL_TEST_ANALYZE=1` for paid vision analysis or `REAL_TEST_AVATAR=1` for a paid nine-image generation run. Provider tests are opt-in; CI does not spend API credits. Dimensions and HTTP status checks do **not** prove visual animation quality.

## Architecture

React/Vite → Fastify → SQLite and local media storage. ffmpeg extracts video frames; sharp handles image validation and atlas assembly. The server integrates vision, image generation, and optional LLM planning. The browser plays cached assets and handles local input.

## License

Code and project documentation: [MIT](LICENSE). Dependencies retain their own licenses. User uploads, model outputs, and local promotional media are **not** granted by the code license; see [asset policy](docs/ASSETS.md).
