# v0.1.0-alpha.1

First source release of the local-first photo-to-companion workbench.

## Included

- React/TypeScript workbench, Chinese by default, with English UI.
- Local SQLite/media storage, real ffmpeg video frame extraction, configurable image/vision providers.
- Cached 2D sprite playback, pointer movement, touch feedback and local command planning.
- MIT source license, English/Chinese setup docs, security and asset policies, CI configuration.
- Real-media integration and browser interaction scripts, plus local video recording/rendering tools.

## Verification

Local Node.js 24 install, typecheck, lint, build and 11 tests passed. Coco's two photos and four videos produced 24 extracted frames and eight local photo atlases. Chromium interaction checks passed at 1600x1000 and 390x844. No paid generation was invoked by this validation. See [verification](VERIFICATION.md) for boundaries, including approximately 47% clean-package line coverage.

## Known Limits

This is an **Alpha**, not a realistic digital clone. Nine generated poses are expanded with image transforms; the 72 cells are not 72 articulated animation drawings. Matte artifacts, identity drift and abrupt pose transitions remain possible. The demo uses previously generated assets and does not certify current provider quality.

Fresh installs contain no example pet, API key or personal media. Initial image generation and optional vision/LLM calls may cost money. Asset playback is local. There is no user authentication or public-hosting hardening; use only on a trusted local machine. 3D generation is disabled, and export is metadata-only.

Personal photos, generated pet images and promotional videos are not part of the source license or source archive. Do not republish them under MIT merely because the code is MIT-licensed.
