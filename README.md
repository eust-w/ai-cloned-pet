# AI Cloned Pet

Private prototype repo for cloning a real pet from user photos/videos into an interactive 3D AI pet.

## Product Goal

Users upload photos and short videos of a cat or dog. The system creates a personalized 3D pet that resembles the original pet closely enough for emotional use, then lets the user interact with it in a 3D scene through touch, voice, sounds, and conversation.

## Core Experience

- Upload 5-20 clear photos or a 20-60 second video around the pet.
- Build a pet identity profile: appearance, markings, size, breed hints, name, personality notes, sound samples when available.
- Generate a 3D asset with fur color, markings, face, body proportions, and texture detail.
- Rig the asset for animation: idle, walk, run, sit, lie down, jump, bark/meow, tail, ear, head, and reaction motions.
- Run a real-time interaction loop in a browser or app: user taps/strokes/calls the pet, the LLM selects actions, animation/audio systems execute them.

## Recommended Architecture

### 1. Media Ingestion

- Store original uploads separately from derived assets.
- Run quality checks for blur, pet visibility, occlusion, lighting, and duplicate frames.
- Extract keyframes from video and segment the pet from the background.
- Keep explicit consent and delete/export controls because users may upload personal household footage.

### 2. Pet Reconstruction Pipeline

Use two modes:

- MVP mode: segment the pet, generate a textured mesh from the best front/side images, then manually or semi-automatically refine rigging.
- High-similarity mode: use multi-view frames or video reconstruction, then preserve identity with texture projection and likeness scoring.

The important point is that a generic "cute dog/cat" generator is not enough. The pipeline must preserve subject-specific features: face shape, coat pattern, eye color, body proportions, scars, collar, and unusual markings.

### 3. Asset Format

- Runtime asset: `glTF/GLB` for mesh, materials, skeleton, and animation clips.
- Optional high-fidelity preview: Gaussian splat or neural rendering asset for likeness review.
- Store generated versions so the user can compare and approve before the pet enters the interactive scene.

### 4. Interaction Runtime

- Frontend 3D: Three.js or React Three Fiber.
- Animation: finite-state machine plus blendable clips.
- Touch input: raycast hit zones for head, back, belly, paw, tail, and face.
- LLM action planner: converts user intent and current pet state into structured action JSON.
- Audio: recorded pet samples when available, generated bark/meow variants when not, and speech/TTS for conversation mode.

Example planner output:

```json
{
  "emotion": "happy",
  "actions": [
    { "type": "animation", "name": "tail_wag", "intensity": 0.8 },
    { "type": "sound", "name": "soft_bark" },
    { "type": "move_to", "target": "near_user", "speed": "slow" }
  ],
  "reply": "I missed you. Can we play?"
}
```

### 5. Similarity QA

Treat likeness as a product requirement, not a nice-to-have.

- Compare source images against rendered views from the generated pet.
- Score coat pattern, face, proportions, and key identity marks separately.
- Reject or ask for more photos when confidence is low.
- Keep a human-in-the-loop review path for the first version; fully automatic cloning will need more validation data.

## MVP Milestones

1. Upload flow with image/video validation.
2. Pet segmentation and best-frame extraction.
3. Single-pet 3D asset generation into GLB.
4. Browser 3D viewer with orbit camera and basic animations.
5. Interaction controller for petting/calling/tapping.
6. LLM planner that emits structured actions.
7. Voice/sound layer.
8. Likeness scoring and regeneration loop.

## Technical Risks

- High likeness is hard from only one image; ask for multi-angle media early.
- Fur and fine markings are difficult to rig cleanly; start with texture fidelity before dynamic fur simulation.
- Gaussian splats can look very similar but are harder to animate like a normal skeleton mesh.
- Generated sounds and "dialogue as the pet" should be presented carefully so the user understands it is an AI companion, not the real animal.

