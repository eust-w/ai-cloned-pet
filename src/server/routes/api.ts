import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import type {
  AvatarStyle,
  MotionAction,
  MediaKind,
  PetRecord,
  PetStatus,
  PlannerResponse,
  TouchZone,
  ValidationStatus
} from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import {
  type DbKeyframeRow,
  type DbAvatarAssetRow,
  type DbMediaRow,
  type DbMotionAssetRow,
  type DbPetRow,
  type DbReconstructionRow,
  getPetDetail,
  mapMedia,
  mapPet,
  nowIso
} from "../db.js";
import { AppError, notFound } from "../errors.js";
import type { OpenAIProvider } from "../providers/openaiProvider.js";
import { analyzeImageFile, hammingDistance } from "../services/mediaQuality.js";
import { extractKeyframes, hasFfmpeg } from "../services/video.js";
import { createAvatarPath, createDerivedPath, resolveStoragePath, storeOriginal } from "../storage/files.js";

export interface ApiContext {
  config: AppConfig;
  db: Database.Database;
  openai: OpenAIProvider;
}

const createPetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(["cat", "dog", "unknown"]).default("unknown"),
  personalityNotes: z.string().trim().max(2000).default(""),
  consentAccepted: z.literal(true)
});

const analyzeSchema = z.object({
  maxImages: z.number().int().min(1).max(12).default(8),
  force: z.boolean().default(false)
});

const reconstructSchema = z.object({
  mediaId: z.string().uuid().optional(),
  forceRegenerate: z.boolean().default(false)
});

const motionAssetsSchema = z.object({
  force: z.boolean().default(false),
  maxAssets: z.number().int().min(4).max(12).default(8)
});

const avatarAssetSchema = z.object({
  style: z.enum(["storybook", "soft_3d", "pixel", "ink"]).default("storybook"),
  sourceMediaId: z.string().uuid().optional(),
  forceRegenerate: z.boolean().default(false)
});

const interactionSchema = z.object({
  touchZone: z.enum(["head", "back", "belly", "paw", "tail", "face", "none"]).default("none"),
  message: z.string().trim().min(1).max(1000),
  useProvider: z.boolean().default(false),
  locale: z.enum(["zh", "en"]).default("zh")
});

const petParamsSchema = z.object({ petId: z.string().uuid() });
const mediaParamsSchema = z.object({ mediaId: z.string().uuid() });
const keyframeParamsSchema = z.object({ keyframeId: z.string().uuid() });
const motionAssetParamsSchema = z.object({ motionAssetId: z.string().uuid() });
const avatarAssetParamsSchema = z.object({ avatarAssetId: z.string().uuid() });
const reconstructionParamsSchema = z.object({ reconstructionId: z.string().uuid() });

export async function registerApiRoutes(app: FastifyInstance, context: ApiContext) {
  app.get("/api/health", async () => ({
    ok: true,
    storageRoot: context.config.storageRoot,
    databasePath: context.config.databasePath,
    providers: {
      image: context.openai.isConfigured(),
      openai: context.openai.isConfigured()
    },
    ffmpeg: await hasFfmpeg()
  }));

  app.get("/api/avatar-styles", async () => ({ styles: avatarStyles }));

  app.get("/api/pets", async () => {
    const rows = context.db.prepare("SELECT * FROM pets ORDER BY created_at DESC").all() as DbPetRow[];
    return { pets: rows.map(mapPet) };
  });

  app.post("/api/pets", async (request, reply) => {
    const body = createPetSchema.parse(request.body);
    const timestamp = nowIso();
    const id = randomUUID();
    context.db
      .prepare(
        `INSERT INTO pets (id, name, species, personality_notes, consent_terms, status, identity_profile_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .run(id, body.name, body.species, body.personalityNotes, 1, "draft", timestamp, timestamp);

    const detail = getPetDetail(context.db, id);
    return reply.status(201).send(detail);
  });

  app.get("/api/pets/:petId", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const detail = getPetDetail(context.db, petId);
    if (!detail) {
      throw notFound("Pet");
    }
    return detail;
  });

  app.delete("/api/pets/:petId", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    ensurePet(context.db, petId);
    context.db.prepare("DELETE FROM pets WHERE id = ?").run(petId);
    await removePetStorage(context.config, petId);
    return { ok: true };
  });

  app.get("/api/pets/:petId/export", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const detail = getPetDetail(context.db, petId);
    if (!detail) {
      throw notFound("Pet");
    }
    return {
      ...detail,
      exportedAt: nowIso(),
      files: {
        media: detail.media.map((item) => ({ id: item.id, url: `/api/media/${item.id}/file` })),
        keyframes: detail.keyframes.map((item) => ({ id: item.id, url: `/api/keyframes/${item.id}/file` })),
        motionAssets: detail.motionAssets.map((item) => ({ id: item.id, action: item.action, url: `/api/motion-assets/${item.id}/file` })),
        avatarAssets: detail.avatarAssets.map((item) => ({ id: item.id, style: item.style, url: `/api/avatar-assets/${item.id}/file` }))
      }
    };
  });

  app.post("/api/pets/:petId/media", async (request, reply) => {
    const { petId } = petParamsSchema.parse(request.params);
    ensurePet(context.db, petId);
    const uploaded = await handleMediaUpload(context, request, petId);
    if (uploaded.length > 0) {
      updatePetStatus(context.db, petId, "media_uploaded");
    }
    const detail = getPetDetail(context.db, petId);
    return reply.status(201).send({ uploaded, detail });
  });

  app.get("/api/media/:mediaId/file", async (request, reply) => {
    const { mediaId } = mediaParamsSchema.parse(request.params);
    const media = getMediaRow(context.db, mediaId);
    const filePath = resolveStoragePath(context.config, media.storage_path);
    return reply.type(media.mime_type).send(fs.createReadStream(filePath));
  });

  app.get("/api/keyframes/:keyframeId/file", async (request, reply) => {
    const { keyframeId } = keyframeParamsSchema.parse(request.params);
    const keyframe = getKeyframeRow(context.db, keyframeId);
    const filePath = resolveStoragePath(context.config, keyframe.storage_path);
    return reply.type("image/jpeg").send(fs.createReadStream(filePath));
  });

  app.get("/api/motion-assets/:motionAssetId/file", async (request, reply) => {
    const { motionAssetId } = motionAssetParamsSchema.parse(request.params);
    const asset = getMotionAssetRow(context.db, motionAssetId);
    const filePath = resolveStoragePath(context.config, asset.storage_path);
    return reply.type("image/webp").send(fs.createReadStream(filePath));
  });

  app.get("/api/avatar-assets/:avatarAssetId/file", async (request, reply) => {
    const { avatarAssetId } = avatarAssetParamsSchema.parse(request.params);
    const asset = getAvatarAssetRow(context.db, avatarAssetId);
    const filePath = resolveStoragePath(context.config, asset.storage_path);
    return reply.type(asset.mime_type).send(fs.createReadStream(filePath));
  });

  app.post("/api/pets/:petId/analyze", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const body = analyzeSchema.parse(request.body ?? {});
    const pet = ensurePet(context.db, petId);
    if (pet.identity_profile_json && !body.force) {
      return getPetDetail(context.db, petId);
    }

    const candidates = collectIdentityCandidates(context, petId, body.maxImages);
    if (candidates.length === 0) {
      throw new AppError("NO_ACCEPTED_MEDIA", "Upload accepted photos or videos before running identity analysis.", 422);
    }

    const profile = await context.openai.createIdentityProfile(mapPet(pet), candidates);
    const status: PetStatus = profile.confidence < 0.45 || profile.missingAngles.length > 2 ? "needs_more_media" : "profile_ready";
    context.db
      .prepare("UPDATE pets SET identity_profile_json = ?, species = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(profile), profile.species, status, nowIso(), petId);

    return getPetDetail(context.db, petId);
  });

  app.post("/api/pets/:petId/reconstructions", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    reconstructSchema.parse(request.body ?? {});
    ensurePet(context.db, petId);
    throw new AppError("THREE_D_DISABLED", "3D reconstruction is disabled. This app now uses cached cartoon virtual pet avatars instead.", 410);
  });

  app.post("/api/pets/:petId/motion-assets", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const body = motionAssetsSchema.parse(request.body ?? {});
    const pet = ensurePet(context.db, petId);
    const existing = context.db
      .prepare("SELECT * FROM motion_assets WHERE pet_id = ? ORDER BY created_at ASC")
      .all(petId) as DbMotionAssetRow[];
    if (existing.length > 0 && !body.force) {
      return getPetDetail(context.db, petId);
    }

    const candidates = collectMotionCandidates(context, petId, body.maxAssets * 2);
    if (candidates.length === 0) {
      throw new AppError("NO_MOTION_SOURCES", "Upload accepted photos or videos before building an action atlas.", 422);
    }

    context.db.prepare("DELETE FROM motion_assets WHERE pet_id = ?").run(petId);
    const assets = await createMotionAssets(context, petId, candidates, body.maxAssets);
    const timestamp = nowIso();
    const insert = context.db.prepare(
      `INSERT INTO motion_assets
        (id, pet_id, action, scene, source_media_id, source_keyframe_id, storage_path, width, height, quality_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const transaction = context.db.transaction(() => {
      for (const asset of assets) {
        insert.run(
          asset.id,
          petId,
          asset.action,
          asset.scene,
          asset.sourceMediaId,
          asset.sourceKeyframeId,
          asset.storagePath,
          asset.width,
          asset.height,
          asset.qualityScore,
          timestamp
        );
      }
    });
    transaction();
    if (pet.status !== "model_ready") {
      updatePetStatus(context.db, petId, "asset_ready");
    }
    return getPetDetail(context.db, petId);
  });

  app.post("/api/pets/:petId/avatar-assets", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const body = avatarAssetSchema.parse(request.body ?? {});
    const pet = ensurePet(context.db, petId);
    const input = chooseAvatarInput(context, petId, body.sourceMediaId);
    const existing = context.db
      .prepare(
        `SELECT * FROM avatar_assets
         WHERE pet_id = ? AND style = ? AND source_media_id = ? AND IFNULL(source_keyframe_id, '') = IFNULL(?, '')
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(petId, body.style, input.sourceMediaId, input.sourceKeyframeId) as DbAvatarAssetRow | undefined;
    if (existing && !body.forceRegenerate) {
      return getPetDetail(context.db, petId);
    }
    if (!context.openai.isConfigured()) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        "Image generation is not configured. Add OPENAI_API_KEY or a compatible DashScope key before creating a virtual pet avatar.",
        503,
        { provider: "image" }
      );
    }

    const result = await context.openai.createCartoonSpriteSheet({
      pet: mapPet(pet),
      style: body.style,
      sourceImagePath: input.filePath,
      sourceMimeType: input.mimeType,
      sourceFileName: input.fileName
    });
    const id = randomUUID();
    const target = await createAvatarPath(context.config, petId, id, "spritesheet.webp");
    const metadata = await writeAvatarAtlas(result.frames, target.absolutePath);
    const timestamp = nowIso();

    context.db
      .prepare(
        `INSERT INTO avatar_assets
          (id, pet_id, style, provider, provider_model, provider_request_id, source_media_id, source_keyframe_id,
           storage_path, mime_type, width, height, frame_columns, frame_rows, frame_actions_json, prompt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        petId,
        body.style,
        result.provider,
        result.providerModel,
        result.providerRequestId,
        input.sourceMediaId,
        input.sourceKeyframeId,
        target.relativePath,
        "image/webp",
        metadata.width,
        metadata.height,
        avatarFrameColumns,
        avatarFrameRows,
        JSON.stringify(avatarFrameActions),
        result.prompt,
        timestamp
      );
    if (pet.status !== "model_ready") {
      updatePetStatus(context.db, petId, "asset_ready");
    }
    return getPetDetail(context.db, petId);
  });

  app.post("/api/reconstructions/:reconstructionId/poll", async (request) => {
    const { reconstructionId } = reconstructionParamsSchema.parse(request.params);
    const reconstruction = getReconstructionRow(context.db, reconstructionId);
    throw new AppError("THREE_D_DISABLED", `3D polling is disabled for reconstruction ${reconstruction.id}.`, 410);
  });

  app.get("/api/reconstructions/:reconstructionId/model", async (request) => {
    const { reconstructionId } = reconstructionParamsSchema.parse(request.params);
    const reconstruction = getReconstructionRow(context.db, reconstructionId);
    throw new AppError("THREE_D_DISABLED", `3D model download is disabled for reconstruction ${reconstruction.id}.`, 410);
  });

  app.post("/api/pets/:petId/interactions", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    const body = interactionSchema.parse(request.body);
    const pet = mapPet(ensurePet(context.db, petId));
    const provider = body.useProvider ? "openai" : "local";
    const response = body.useProvider
      ? await context.openai.planInteraction(pet, body.touchZone, body.message)
      : planLocalInteraction(pet, body.touchZone, body.message, body.locale);
    context.db
      .prepare("INSERT INTO interactions (id, pet_id, prompt, touch_zone, response_json, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), petId, body.message, body.touchZone, JSON.stringify(response), provider, nowIso());
    return { plan: response, provider };
  });

  app.post("/api/pets/:petId/likeness", async (request) => {
    const { petId } = petParamsSchema.parse(request.params);
    ensurePet(context.db, petId);
    throw new AppError("THREE_D_DISABLED", "3D likeness scoring is disabled. Current QA is based on real media validation and cached avatar review.", 410);
  });
}

async function handleMediaUpload(context: ApiContext, request: FastifyRequest, petId: string) {
  const uploaded = [];
  const parts = request.files({
    limits: {
      fileSize: context.config.maxUploadBytes,
      files: 24
    }
  });

  for await (const part of parts) {
    const kind = classifyMimeType(part.mimetype);
    if (!kind) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", `Unsupported media type: ${part.mimetype}`, 415);
    }

    const buffer = await part.toBuffer();
    if (buffer.byteLength > context.config.maxUploadBytes) {
      throw new AppError("UPLOAD_TOO_LARGE", `${part.filename} exceeds the configured upload size limit.`, 413);
    }

    const stored = await storeOriginal(context.config, petId, part.filename, buffer);
    const analysis = await analyzeStoredMedia(context, petId, kind, stored.absolutePath, part.mimetype);
    const validation = validationFromIssues(analysis.issues);
    const createdAt = nowIso();

    context.db
      .prepare(
        `INSERT INTO media
          (id, pet_id, kind, file_name, mime_type, size_bytes, storage_path, width, height, duration_seconds,
           quality_score, blur_score, lighting_score, perceptual_hash, validation_status, validation_issues_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stored.id,
        petId,
        kind,
        stored.fileName,
        part.mimetype,
        buffer.byteLength,
        stored.relativePath,
        analysis.width,
        analysis.height,
        analysis.durationSeconds,
        analysis.qualityScore,
        analysis.blurScore,
        analysis.lightingScore,
        analysis.perceptualHash,
        validation,
        JSON.stringify(analysis.issues),
        createdAt
      );

    for (const keyframe of analysis.keyframes) {
      context.db
        .prepare(
          `INSERT INTO keyframes
            (id, media_id, file_name, storage_path, timestamp_seconds, width, height, quality_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          stored.id,
          keyframe.fileName,
          keyframe.relativePath,
          keyframe.timestampSeconds,
          keyframe.width,
          keyframe.height,
          keyframe.qualityScore,
          createdAt
        );
    }

    uploaded.push(mapMedia(getMediaRow(context.db, stored.id)));
  }

  return uploaded;
}

async function analyzeStoredMedia(context: ApiContext, petId: string, kind: MediaKind, filePath: string, mimeType: string) {
  if (kind === "image") {
    const image = await analyzeImageFile(filePath);
    const duplicate = findDuplicateHash(context.db, petId, image.perceptualHash);
    const issues = [...image.issues];
    if (duplicate) {
      issues.push("Image appears to duplicate an existing upload.");
    }
    return {
      width: image.width,
      height: image.height,
      durationSeconds: null,
      qualityScore: image.qualityScore,
      blurScore: image.blurScore,
      lightingScore: image.lightingScore,
      perceptualHash: image.perceptualHash,
      keyframes: [],
      issues
    };
  }

  if (kind === "video") {
    if (!(await hasFfmpeg())) {
      throw new AppError("FFMPEG_NOT_AVAILABLE", "ffmpeg is required to extract still images from video uploads.", 503);
    }

    const issues: string[] = [];
    const frames = await extractKeyframes(context.config, petId, filePath);
    if (frames.length === 0) {
      issues.push("No still frames could be extracted from this video.");
    }
    const bestFrame = chooseBestFrame(frames);
    return {
      width: bestFrame?.width ?? null,
      height: bestFrame?.height ?? null,
      durationSeconds: null,
      qualityScore: bestFrame?.qualityScore ?? null,
      blurScore: null,
      lightingScore: null,
      perceptualHash: null,
      keyframes: frames,
      issues
    };
  }

  return {
    width: null,
    height: null,
    durationSeconds: null,
    qualityScore: null,
    blurScore: null,
    lightingScore: null,
    perceptualHash: null,
    keyframes: [],
    issues: mimeType.startsWith("audio/") ? [] : ["Unknown audio container."]
  };
}

function classifyMimeType(mimeType: string): MediaKind | null {
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return "image";
  }
  if (["video/mp4", "video/quicktime", "video/webm"].includes(mimeType)) {
    return "video";
  }
  if (["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/x-wav"].includes(mimeType)) {
    return "audio";
  }
  return null;
}

function validationFromIssues(issues: string[]): ValidationStatus {
  return issues.length > 0 ? "warning" : "accepted";
}

function chooseBestFrame<T extends { qualityScore: number }>(frames: T[]) {
  let best: T | null = null;
  for (const frame of frames) {
    if (!best || frame.qualityScore > best.qualityScore) {
      best = frame;
    }
  }
  return best;
}

function ensurePet(db: Database.Database, petId: string) {
  const pet = db.prepare("SELECT * FROM pets WHERE id = ?").get(petId) as DbPetRow | undefined;
  if (!pet) {
    throw notFound("Pet");
  }
  return pet;
}

function getMediaRow(db: Database.Database, mediaId: string) {
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as DbMediaRow | undefined;
  if (!row) {
    throw notFound("Media");
  }
  return row;
}

function getKeyframeRow(db: Database.Database, keyframeId: string) {
  const row = db.prepare("SELECT * FROM keyframes WHERE id = ?").get(keyframeId) as DbKeyframeRow | undefined;
  if (!row) {
    throw notFound("Keyframe");
  }
  return row;
}

function getReconstructionRow(db: Database.Database, reconstructionId: string) {
  const row = db.prepare("SELECT * FROM reconstructions WHERE id = ?").get(reconstructionId) as DbReconstructionRow | undefined;
  if (!row) {
    throw notFound("Reconstruction");
  }
  return row;
}

function getMotionAssetRow(db: Database.Database, motionAssetId: string) {
  const row = db.prepare("SELECT * FROM motion_assets WHERE id = ?").get(motionAssetId) as DbMotionAssetRow | undefined;
  if (!row) {
    throw notFound("Motion asset");
  }
  return row;
}

function getAvatarAssetRow(db: Database.Database, avatarAssetId: string) {
  const row = db.prepare("SELECT * FROM avatar_assets WHERE id = ?").get(avatarAssetId) as DbAvatarAssetRow | undefined;
  if (!row) {
    throw notFound("Avatar asset");
  }
  return row;
}

function updatePetStatus(db: Database.Database, petId: string, status: PetStatus) {
  db.prepare("UPDATE pets SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), petId);
}

function findDuplicateHash(db: Database.Database, petId: string, hash: string) {
  const rows = db
    .prepare("SELECT perceptual_hash FROM media WHERE pet_id = ? AND perceptual_hash IS NOT NULL")
    .all(petId) as Array<{ perceptual_hash: string }>;
  return rows.some((row) => hammingDistance(row.perceptual_hash, hash) <= 8);
}

function collectIdentityCandidates(context: ApiContext, petId: string, maxImages: number) {
  const media = context.db
    .prepare(
      "SELECT * FROM media WHERE pet_id = ? AND kind = 'image' AND validation_status IN ('accepted', 'warning') ORDER BY quality_score DESC NULLS LAST LIMIT ?"
    )
    .all(petId, maxImages) as DbMediaRow[];
  const keyframes = context.db
    .prepare(
      `SELECT k.*, m.pet_id FROM keyframes k
       JOIN media m ON m.id = k.media_id
       WHERE m.pet_id = ?
       ORDER BY k.quality_score DESC
       LIMIT ?`
    )
    .all(petId, maxImages) as Array<DbKeyframeRow & { pet_id: string }>;

  const candidates = [
    ...media.map((row) => ({
      id: row.id,
      filePath: resolveStoragePath(context.config, row.storage_path),
      mimeType: row.mime_type,
      label: `original ${row.file_name}, quality ${row.quality_score ?? "unknown"}`,
      quality: row.quality_score ?? 0
    })),
    ...keyframes.map((row) => ({
      id: row.media_id,
      filePath: resolveStoragePath(context.config, row.storage_path),
      mimeType: "image/jpeg",
      label: `video keyframe ${row.file_name} at ${row.timestamp_seconds}s, quality ${row.quality_score}`,
      quality: row.quality_score
    }))
  ];

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, maxImages);
}

interface MotionCandidate {
  filePath: string;
  sourceMediaId: string;
  sourceKeyframeId: string | null;
  quality: number;
  scene: string;
}

function collectMotionCandidates(context: ApiContext, petId: string, limit: number): MotionCandidate[] {
  const media = context.db
    .prepare(
      "SELECT * FROM media WHERE pet_id = ? AND kind = 'image' AND validation_status IN ('accepted', 'warning') ORDER BY quality_score DESC NULLS LAST LIMIT ?"
    )
    .all(petId, limit) as DbMediaRow[];
  const keyframes = context.db
    .prepare(
      `SELECT k.*, m.pet_id, m.file_name AS media_file_name
       FROM keyframes k
       JOIN media m ON m.id = k.media_id
       WHERE m.pet_id = ?
       ORDER BY k.quality_score DESC
       LIMIT ?`
    )
    .all(petId, limit) as Array<DbKeyframeRow & { pet_id: string; media_file_name: string }>;

  const candidates = [
    ...media.map((row) => ({
      filePath: resolveStoragePath(context.config, row.storage_path),
      sourceMediaId: row.id,
      sourceKeyframeId: null,
      quality: row.quality_score ?? 0,
      scene: "photo"
    })),
    ...keyframes.map((row) => ({
      filePath: resolveStoragePath(context.config, row.storage_path),
      sourceMediaId: row.media_id,
      sourceKeyframeId: row.id,
      quality: row.quality_score,
      scene: `video ${Math.round(row.timestamp_seconds * 10) / 10}s`
    }))
  ];

  return candidates.sort((a, b) => b.quality - a.quality).slice(0, limit);
}

const motionSlots: Array<{ action: MotionAction; scene: string }> = [
  { action: "idle", scene: "front" },
  { action: "look_at_user", scene: "close" },
  { action: "head_tilt", scene: "reaction" },
  { action: "tail_wag", scene: "happy" },
  { action: "approach_user", scene: "near" },
  { action: "stay_near_user", scene: "companion" },
  { action: "play", scene: "play" },
  { action: "sit", scene: "rest" }
];

const avatarFrameColumns = 8;
const avatarFrameRows = 9;
const avatarCellWidth = 192;
const avatarCellHeight = 208;
const avatarAtlasWidth = avatarFrameColumns * avatarCellWidth;
const avatarAtlasHeight = avatarFrameRows * avatarCellHeight;
const avatarFrameActions: MotionAction[] = [
  ...repeatAction("idle", avatarFrameColumns),
  ...repeatAction("approach_user", avatarFrameColumns),
  ...repeatAction("stay_near_user", avatarFrameColumns),
  ...repeatAction("look_at_user", avatarFrameColumns),
  ...repeatAction("play", avatarFrameColumns),
  ...repeatAction("tail_wag", avatarFrameColumns),
  ...repeatAction("head_tilt", avatarFrameColumns),
  ...repeatAction("sit", avatarFrameColumns),
  ...repeatAction("idle", avatarFrameColumns)
];

function repeatAction(action: MotionAction, count: number) {
  return Array.from({ length: count }, () => action);
}

const avatarStyles: Array<{ id: AvatarStyle; label: string; description: string }> = [
  {
    id: "storybook",
    label: "Storybook",
    description: "Soft illustrated mascot for a warm companion pet."
  },
  {
    id: "soft_3d",
    label: "Soft 3D",
    description: "Rounded toy-like app mascot with gentle depth."
  },
  {
    id: "pixel",
    label: "Pixel",
    description: "Readable game-sprite style with a strong silhouette."
  },
  {
    id: "ink",
    label: "Ink",
    description: "Line-and-watercolor character with expressive markings."
  }
];

async function createMotionAssets(context: ApiContext, petId: string, candidates: MotionCandidate[], maxAssets: number) {
  const slots = motionSlots.slice(0, maxAssets);
  const assets = [];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const candidate = candidates[index % candidates.length];
    if (!slot || !candidate) {
      continue;
    }
    const output = await createDerivedPath(context.config, petId, `${slot.action}.webp`);
    const metadata = await sharp(candidate.filePath)
      .rotate()
      .resize(960, 720, {
        fit: "contain",
        background: { r: 248, g: 250, b: 252, alpha: 1 }
      })
      .webp({ quality: 86 })
      .toFile(output.absolutePath);
    assets.push({
      id: output.id,
      action: slot.action,
      scene: `${slot.scene} from ${candidate.scene}`,
      sourceMediaId: candidate.sourceMediaId,
      sourceKeyframeId: candidate.sourceKeyframeId,
      storagePath: output.relativePath,
      width: metadata.width,
      height: metadata.height,
      qualityScore: candidate.quality
    });
  }
  return assets;
}

interface AvatarFrameSource {
  action: MotionAction;
  buffer: Buffer;
}

async function writeAvatarAtlas(frameSources: AvatarFrameSource[], outputPath: string) {
  if (frameSources.length === 0) {
    throw new AppError("PROVIDER_EMPTY_IMAGE", "Image provider returned no usable avatar frames.", 502);
  }

  const composites = [];
  for (let row = 0; row < avatarFrameRows; row += 1) {
    const source = frameSources[row % frameSources.length];
    if (!source) {
      continue;
    }
    for (let column = 0; column < avatarFrameColumns; column += 1) {
      const input = await renderAvatarCell(source.buffer, source.action, row, column);
      composites.push({
        input,
        left: column * avatarCellWidth,
        top: row * avatarCellHeight
      });
    }
  }

  return sharp({
    create: {
      width: avatarAtlasWidth,
      height: avatarAtlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(outputPath);
}

async function renderAvatarCell(sourceBuffer: Buffer, action: MotionAction, row: number, column: number) {
  const transform = avatarFrameTransform(action, row, column);
  const spriteWidth = Math.round(avatarCellWidth * 0.82 * transform.scale);
  const spriteHeight = Math.round(avatarCellHeight * 0.86 * transform.scale);
  const resized = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .resize(spriteWidth, spriteHeight, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleaned = removeEdgeConnectedLightBackground(resized.data, resized.info.width, resized.info.height);
  const rendered = await sharp(cleaned, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4
    }
  })
    .rotate(transform.rotate, {
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = clamp(Math.round((avatarCellWidth - rendered.info.width) / 2 + transform.dx), 0, Math.max(0, avatarCellWidth - rendered.info.width));
  const top = clamp(Math.round((avatarCellHeight - rendered.info.height) / 2 + transform.dy), 0, Math.max(0, avatarCellHeight - rendered.info.height));

  return sharp({
    create: {
      width: avatarCellWidth,
      height: avatarCellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: rendered.data, left, top }])
    .png()
    .toBuffer();
}

function removeEdgeConnectedLightBackground(data: Buffer, width: number, height: number) {
  const output = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const index = y * width + x;
    if (!visited[index] && isRemovableBackgroundPixel(output, index * 4)) {
      visited[index] = 1;
      stack.push(index);
    }
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) {
      continue;
    }
    const offset = index * 4;
    output[offset + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return output;
}

function isRemovableBackgroundPixel(data: Buffer, offset: number) {
  const alpha = data[offset + 3] ?? 0;
  if (alpha < 8) {
    return true;
  }
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  return green > 110 && green - red > 35 && green - blue > 25;
}

function avatarFrameTransform(action: MotionAction, row: number, column: number) {
  const phase = (column / avatarFrameColumns) * Math.PI * 2;
  const bounce = Math.sin(phase);
  const sway = Math.sin(phase + row * 0.4);
  switch (action) {
    case "approach_user":
      return { dx: 0, dy: Math.round(bounce * 2), rotate: sway * 1.2, scale: 0.9 + column * 0.018 };
    case "stay_near_user":
      return { dx: Math.round(sway * 8), dy: Math.round(Math.abs(bounce) * 2), rotate: sway * 1.5, scale: 0.97 };
    case "look_at_user":
      return { dx: Math.round(sway * 3), dy: Math.round(bounce * 1.5), rotate: sway * 1.8, scale: 1 };
    case "play":
      return { dx: Math.round(sway * 5), dy: Math.round(-Math.abs(bounce) * 8), rotate: sway * 3.5, scale: 1.02 };
    case "tail_wag":
      return { dx: Math.round(sway * 2), dy: 0, rotate: sway * 2.4, scale: 1 };
    case "head_tilt":
      return { dx: 0, dy: Math.round(bounce * 1.5), rotate: sway * 4.5, scale: 1 };
    case "sit":
      return { dx: 0, dy: Math.round(bounce * 2), rotate: sway * 0.8, scale: 0.98 + bounce * 0.01 };
    case "idle":
      return { dx: 0, dy: Math.round(bounce * 3), rotate: sway * 0.8, scale: 1 + bounce * 0.01 };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface AvatarCandidate {
  filePath: string;
  fileName: string;
  mimeType: string;
  sourceMediaId: string;
  sourceKeyframeId: string | null;
  quality: number;
}

function collectAvatarCandidates(context: ApiContext, petId: string, limit: number): AvatarCandidate[] {
  const media = context.db
    .prepare(
      "SELECT * FROM media WHERE pet_id = ? AND kind = 'image' AND validation_status IN ('accepted', 'warning') ORDER BY quality_score DESC NULLS LAST LIMIT ?"
    )
    .all(petId, limit) as DbMediaRow[];
  const keyframes = context.db
    .prepare(
      `SELECT k.*, m.pet_id, m.file_name AS media_file_name
       FROM keyframes k
       JOIN media m ON m.id = k.media_id
       WHERE m.pet_id = ?
       ORDER BY k.quality_score DESC
       LIMIT ?`
    )
    .all(petId, limit) as Array<DbKeyframeRow & { pet_id: string; media_file_name: string }>;

  return [
    ...media.map((row) => ({
      filePath: resolveStoragePath(context.config, row.storage_path),
      fileName: row.file_name,
      mimeType: row.mime_type,
      sourceMediaId: row.id,
      sourceKeyframeId: null,
      quality: row.quality_score ?? 0
    })),
    ...keyframes.map((row) => ({
      filePath: resolveStoragePath(context.config, row.storage_path),
      fileName: row.file_name,
      mimeType: "image/jpeg",
      sourceMediaId: row.media_id,
      sourceKeyframeId: row.id,
      quality: row.quality_score
    }))
  ]
    .sort((a, b) => b.quality - a.quality)
    .slice(0, limit);
}

function chooseAvatarInput(context: ApiContext, petId: string, requestedMediaId: string | undefined) {
  if (requestedMediaId) {
    const media = getMediaRow(context.db, requestedMediaId);
    if (media.pet_id !== petId || media.kind !== "image" || media.validation_status === "rejected") {
      throw new AppError("INVALID_AVATAR_INPUT", "Avatar source must be one accepted or warning image for this pet.", 422);
    }
    return {
      filePath: resolveStoragePath(context.config, media.storage_path),
      fileName: media.file_name,
      mimeType: media.mime_type,
      sourceMediaId: media.id,
      sourceKeyframeId: null
    };
  }

  const candidates = collectAvatarCandidates(context, petId, 12);
  const candidate = candidates[0];
  if (!candidate) {
    throw new AppError("NO_AVATAR_INPUT", "Upload accepted photos or videos before generating a virtual pet avatar.", 422);
  }
  return candidate;
}

function planLocalInteraction(pet: PetRecord, touchZone: TouchZone, message: string, locale: "zh" | "en" = "zh"): PlannerResponse {
  const species = pet.identityProfile?.species === "cat" ? "cat" : "dog";
  const lowered = message.toLowerCase();
  const wantsPlay = /play|ball|toy|walk|outside|出去|玩|球|散步/.test(lowered);
  const wantsCome = /come|here|过来|来|靠近/.test(lowered);
  const wantsRest = /sleep|rest|calm|坐|休息|睡/.test(lowered);
  const emotion: PlannerResponse["emotion"] = wantsRest ? "calm" : wantsPlay ? "playful" : wantsCome ? "happy" : "curious";
  const soundName = species === "cat" ? "soft_meow" : "soft_bark";
  const reply =
    locale === "zh" ? (species === "cat" ? "我在这里。" : "我来了。") : species === "cat" ? "I am here." : "I'm here.";
  const safetyNote =
    locale === "zh" ? "本地确定性规划；本次没有消耗模型 token。" : "Local deterministic planner; no provider token was used.";

  if (wantsRest) {
    return {
      emotion,
      actions: [
        { type: "animation", name: "sit", intensity: 0.7, target: touchZone, speed: "slow" },
        { type: "animation", name: "slow_blink", intensity: 0.5, target: "face", speed: "slow" }
      ],
      reply,
      safetyNote
    };
  }

  return {
    emotion,
    actions: [
      { type: "animation", name: species === "cat" ? "tail_sway" : "tail_wag", intensity: wantsPlay ? 0.9 : 0.65, target: "tail", speed: "normal" },
      { type: "animation", name: touchZone === "head" || touchZone === "face" ? "head_tilt" : "look_at_user", intensity: 0.7, target: touchZone, speed: "normal" },
      { type: "move_to", name: wantsCome || wantsPlay ? "approach_user" : "stay_near_user", intensity: wantsCome || wantsPlay ? 0.85 : 0.45, target: "near_user", speed: wantsPlay ? "fast" : "normal" },
      { type: "sound", name: soundName, intensity: wantsPlay ? 0.6 : 0.35, target: "mouth", speed: "normal" }
    ],
    reply,
    safetyNote
  };
}

async function removePetStorage(config: AppConfig, petId: string) {
  await Promise.allSettled([
    fsp.rm(path.join(config.storageRoot, "originals", petId), { recursive: true, force: true }),
    fsp.rm(path.join(config.storageRoot, "derived", petId), { recursive: true, force: true }),
    fsp.rm(path.join(config.storageRoot, "models", petId), { recursive: true, force: true }),
    fsp.rm(path.join(config.storageRoot, "avatars", petId), { recursive: true, force: true })
  ]);
}
