import fs from "node:fs/promises";
import path from "node:path";

const apiBase = process.env.REAL_TEST_API_BASE ?? "http://127.0.0.1:4000/api";
const mediaPaths = parseMediaPaths(process.env.COCO_TEST_MEDIA);
const keepPet = process.env.KEEP_REAL_TEST_PET === "1";
const runAnalyze = process.env.REAL_TEST_ANALYZE === "1";
const runAvatar = process.env.REAL_TEST_AVATAR === "1";

if (mediaPaths.length === 0) {
  throw new Error("Set COCO_TEST_MEDIA to semicolon-separated real photo/video paths before running test:real:coco.");
}

const missing = [];
for (const filePath of mediaPaths) {
  try {
    await fs.access(filePath);
  } catch {
    missing.push(filePath);
  }
}
if (missing.length > 0) {
  throw new Error(`Missing real media files:\n${missing.join("\n")}`);
}

const health = await fetchJson(`${apiBase}/health`);
const created = await fetchJson(`${apiBase}/pets`, {
  method: "POST",
  body: JSON.stringify({
    name: `coco-real-test-${Date.now()}`,
    species: "dog",
    personalityNotes: "Real Coco regression test using local media files.",
    consentAccepted: true
  })
});
const petId = created.pet.id;

try {
  const formData = new FormData();
  for (const filePath of mediaPaths) {
    const buffer = await fs.readFile(filePath);
    formData.append("files", new File([buffer], path.basename(filePath), { type: mimeFromPath(filePath) }));
  }
  const upload = await fetchJson(`${apiBase}/pets/${petId}/media`, {
    method: "POST",
    body: formData
  });
  assert(upload.detail.media.length === mediaPaths.length, `expected ${mediaPaths.length} uploaded media, got ${upload.detail.media.length}`);
  assert(upload.detail.keyframes.length > 0, "expected video keyframes from real ffmpeg ingestion");

  const analyze = runAnalyze && health.providers.openai ? await fetchJson(`${apiBase}/pets/${petId}/analyze`, { method: "POST", body: "{}" }) : null;
  const atlas = await fetchJson(`${apiBase}/pets/${petId}/motion-assets`, { method: "POST", body: "{}" });
  assert(atlas.motionAssets.length >= 4, `expected at least 4 atlas assets, got ${atlas.motionAssets.length}`);
  const firstAsset = atlas.motionAssets[0];
  const assetFile = await fetch(`${apiBase}/motion-assets/${firstAsset.id}/file`);
  assert(assetFile.ok, `motion asset file request failed: ${assetFile.status}`);
  const assetBytes = await assetFile.arrayBuffer();
  assert(assetBytes.byteLength > 1000, `motion asset file is too small: ${assetBytes.byteLength}`);

  let avatar = null;
  if (runAvatar) {
    assert(health.providers.image, "REAL_TEST_AVATAR=1 requires a configured image provider.");
    const avatarDetail = await fetchJson(`${apiBase}/pets/${petId}/avatar-assets`, {
      method: "POST",
      body: JSON.stringify({ style: "storybook" })
    });
    const latestAvatar = avatarDetail.avatarAssets[0];
    assert(latestAvatar, "expected a generated avatar asset");
    assert(latestAvatar.frameColumns === 8 && latestAvatar.frameRows === 9, "expected an 8x9 Codex Pet style avatar spritesheet");
    assert(latestAvatar.width === 1536 && latestAvatar.height === 1872, `expected 1536x1872 avatar atlas, got ${latestAvatar.width}x${latestAvatar.height}`);
    assert(latestAvatar.frameActions.length === 72, `expected 72 avatar frame actions, got ${latestAvatar.frameActions.length}`);
    const avatarFile = await fetch(`${apiBase}/avatar-assets/${latestAvatar.id}/file`);
    assert(avatarFile.ok, `avatar file request failed: ${avatarFile.status}`);
    assert((avatarFile.headers.get("content-type") ?? "").includes("image/webp"), "expected avatar file to be served as WebP");
    const avatarBytes = await avatarFile.arrayBuffer();
    assert(avatarBytes.byteLength > 1000, `avatar file is too small: ${avatarBytes.byteLength}`);
    avatar = {
      id: latestAvatar.id,
      style: latestAvatar.style,
      provider: latestAvatar.provider,
      model: latestAvatar.providerModel,
      bytes: avatarBytes.byteLength
    };
  }

  const interaction = await fetchJson(`${apiBase}/pets/${petId}/interactions`, {
    method: "POST",
    body: JSON.stringify({ touchZone: "head", message: "摸摸 Coco 的头" })
  });
  assert(interaction.provider === "local", `expected local planner, got ${interaction.provider}`);
  assert(interaction.plan.safetyNote.includes("没有消耗"), "expected Chinese no-token safety note");

  const disabled3dResponse = await fetch(`${apiBase}/pets/${petId}/reconstructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId: atlas.motionAssets[0].sourceMediaId })
  });
  const disabled3dBody = await disabled3dResponse.json();
  const disabled3d = { status: disabled3dResponse.status, code: disabled3dBody.error?.code ?? null };
  assert(disabled3dResponse.status === 410, `expected disabled 3D guard, got ${disabled3dResponse.status}`);
  assert(disabled3d.code === "THREE_D_DISABLED", `expected THREE_D_DISABLED, got ${disabled3d.code}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        petId,
        mediaCount: upload.detail.media.length,
        keyframeCount: upload.detail.keyframes.length,
        analyzed: Boolean(analyze),
        atlasCount: atlas.motionAssets.length,
        firstAtlasAction: firstAsset.action,
        firstAtlasBytes: assetBytes.byteLength,
        avatar,
        interactionProvider: interaction.provider,
        disabled3d
      },
      null,
      2
    )
  );
} finally {
  if (!keepPet) {
    await fetch(`${apiBase}/pets/${petId}`, { method: "DELETE" });
  }
}

function parseMediaPaths(value) {
  return (value ?? "")
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mimeFromPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

async function fetchJson(url, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${text}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
