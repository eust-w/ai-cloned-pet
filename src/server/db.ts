import Database from "better-sqlite3";
import type {
  AvatarAssetRecord,
  KeyframeRecord,
  LikenessReport,
  MediaKind,
  MediaRecord,
  MotionAssetRecord,
  PetDetailResponse,
  PetIdentityProfile,
  PetRecord,
  PetStatus,
  ReconstructionRecord,
  Species,
  ValidationStatus
} from "../shared/types.js";
import type { AppConfig } from "./config.js";

export interface DbPetRow {
  id: string;
  name: string;
  species: Species;
  personality_notes: string;
  consent_terms: number;
  status: PetStatus;
  identity_profile_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMediaRow {
  id: string;
  pet_id: string;
  kind: MediaKind;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  quality_score: number | null;
  blur_score: number | null;
  lighting_score: number | null;
  perceptual_hash: string | null;
  validation_status: ValidationStatus;
  validation_issues_json: string;
  created_at: string;
}

export interface DbKeyframeRow {
  id: string;
  media_id: string;
  file_name: string;
  storage_path: string;
  timestamp_seconds: number;
  width: number;
  height: number;
  quality_score: number;
  created_at: string;
}

export interface DbReconstructionRow {
  id: string;
  pet_id: string;
  provider: string;
  provider_endpoint: string;
  provider_request_id: string | null;
  status: ReconstructionRecord["status"];
  progress: number | null;
  input_media_id: string | null;
  model_url: string | null;
  local_model_path: string | null;
  gaussian_splat_url: string | null;
  thumbnail_url: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMotionAssetRow {
  id: string;
  pet_id: string;
  action: MotionAssetRecord["action"];
  scene: string;
  source_media_id: string | null;
  source_keyframe_id: string | null;
  storage_path: string;
  width: number;
  height: number;
  quality_score: number | null;
  created_at: string;
}

export interface DbAvatarAssetRow {
  id: string;
  pet_id: string;
  style: AvatarAssetRecord["style"];
  provider: AvatarAssetRecord["provider"];
  provider_model: string;
  provider_request_id: string | null;
  source_media_id: string | null;
  source_keyframe_id: string | null;
  storage_path: string;
  mime_type: string;
  width: number;
  height: number;
  frame_columns: number;
  frame_rows: number;
  frame_actions_json: string;
  prompt: string;
  created_at: string;
}

export interface DbLikenessRow {
  id: string;
  pet_id: string;
  source_media_id: string;
  reconstruction_id: string;
  overall_score: number;
  face_score: number;
  coat_pattern_score: number;
  color_score: number;
  proportion_score: number;
  identity_marks_score: number;
  decision: LikenessReport["decision"];
  notes_json: string;
  created_at: string;
}

export function openDatabase(config: AppConfig) {
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      species TEXT NOT NULL,
      personality_notes TEXT NOT NULL DEFAULT '',
      consent_terms INTEGER NOT NULL,
      status TEXT NOT NULL,
      identity_profile_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration_seconds REAL,
      quality_score REAL,
      blur_score REAL,
      lighting_score REAL,
      perceptual_hash TEXT,
      validation_status TEXT NOT NULL,
      validation_issues_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keyframes (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      timestamp_seconds REAL NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      quality_score REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reconstructions (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_endpoint TEXT NOT NULL,
      provider_request_id TEXT,
      status TEXT NOT NULL,
      progress REAL,
      input_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      model_url TEXT,
      local_model_path TEXT,
      gaussian_splat_url TEXT,
      thumbnail_url TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS motion_assets (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      scene TEXT NOT NULL,
      source_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      source_keyframe_id TEXT REFERENCES keyframes(id) ON DELETE SET NULL,
      storage_path TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      quality_score REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS avatar_assets (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      style TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_model TEXT NOT NULL,
      provider_request_id TEXT,
      source_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      source_keyframe_id TEXT REFERENCES keyframes(id) ON DELETE SET NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      frame_columns INTEGER NOT NULL,
      frame_rows INTEGER NOT NULL,
      frame_actions_json TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS likeness_reports (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      source_media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      reconstruction_id TEXT NOT NULL REFERENCES reconstructions(id) ON DELETE CASCADE,
      overall_score REAL NOT NULL,
      face_score REAL NOT NULL,
      coat_pattern_score REAL NOT NULL,
      color_score REAL NOT NULL,
      proportion_score REAL NOT NULL,
      identity_marks_score REAL NOT NULL,
      decision TEXT NOT NULL,
      notes_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      touch_zone TEXT NOT NULL,
      response_json TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_media_pet ON media(pet_id);
    CREATE INDEX IF NOT EXISTS idx_keyframes_media ON keyframes(media_id);
    CREATE INDEX IF NOT EXISTS idx_reconstructions_pet ON reconstructions(pet_id);
    CREATE INDEX IF NOT EXISTS idx_motion_assets_pet ON motion_assets(pet_id);
    CREATE INDEX IF NOT EXISTS idx_avatar_assets_pet ON avatar_assets(pet_id);
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

export function mapPet(row: DbPetRow): PetRecord {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    personalityNotes: row.personality_notes,
    status: row.status,
    identityProfile: parseJson<PetIdentityProfile | null>(row.identity_profile_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapMedia(row: DbMediaRow): MediaRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    qualityScore: row.quality_score,
    blurScore: row.blur_score,
    lightingScore: row.lighting_score,
    validationStatus: row.validation_status,
    validationIssues: parseJson<string[]>(row.validation_issues_json, []),
    createdAt: row.created_at
  };
}

export function mapKeyframe(row: DbKeyframeRow): KeyframeRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    fileName: row.file_name,
    timestampSeconds: row.timestamp_seconds,
    width: row.width,
    height: row.height,
    qualityScore: row.quality_score,
    createdAt: row.created_at
  };
}

export function mapReconstruction(row: DbReconstructionRow): ReconstructionRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    provider: row.provider,
    providerEndpoint: row.provider_endpoint,
    providerRequestId: row.provider_request_id,
    status: row.status,
    progress: row.progress,
    inputMediaId: row.input_media_id,
    modelUrl: row.model_url,
    localModelAvailable: Boolean(row.local_model_path),
    gaussianSplatUrl: row.gaussian_splat_url,
    thumbnailUrl: row.thumbnail_url,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapMotionAsset(row: DbMotionAssetRow): MotionAssetRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    action: row.action,
    scene: row.scene,
    sourceMediaId: row.source_media_id,
    sourceKeyframeId: row.source_keyframe_id,
    width: row.width,
    height: row.height,
    qualityScore: row.quality_score,
    createdAt: row.created_at
  };
}

export function mapAvatarAsset(row: DbAvatarAssetRow): AvatarAssetRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    style: row.style,
    provider: row.provider,
    providerModel: row.provider_model,
    providerRequestId: row.provider_request_id,
    sourceMediaId: row.source_media_id,
    sourceKeyframeId: row.source_keyframe_id,
    width: row.width,
    height: row.height,
    frameColumns: row.frame_columns,
    frameRows: row.frame_rows,
    frameActions: parseJson<AvatarAssetRecord["frameActions"]>(row.frame_actions_json, []),
    prompt: row.prompt,
    createdAt: row.created_at
  };
}

export function mapLikeness(row: DbLikenessRow): LikenessReport {
  return {
    id: row.id,
    petId: row.pet_id,
    sourceMediaId: row.source_media_id,
    reconstructionId: row.reconstruction_id,
    overallScore: row.overall_score,
    faceScore: row.face_score,
    coatPatternScore: row.coat_pattern_score,
    colorScore: row.color_score,
    proportionScore: row.proportion_score,
    identityMarksScore: row.identity_marks_score,
    decision: row.decision,
    notes: parseJson<string[]>(row.notes_json, []),
    createdAt: row.created_at
  };
}

export function getPetDetail(db: Database.Database, petId: string): PetDetailResponse | null {
  const pet = db.prepare("SELECT * FROM pets WHERE id = ?").get(petId) as DbPetRow | undefined;
  if (!pet) {
    return null;
  }

  const media = db.prepare("SELECT * FROM media WHERE pet_id = ? ORDER BY created_at DESC").all(petId) as DbMediaRow[];
  const mediaIds = media.map((item) => item.id);
  const keyframes = mediaIds.length
    ? (db
        .prepare(`SELECT * FROM keyframes WHERE media_id IN (${mediaIds.map(() => "?").join(",")}) ORDER BY created_at DESC`)
        .all(...mediaIds) as DbKeyframeRow[])
    : [];
  const reconstructions = db
    .prepare("SELECT * FROM reconstructions WHERE pet_id = ? ORDER BY created_at DESC")
    .all(petId) as DbReconstructionRow[];
  const motionAssets = db
    .prepare("SELECT * FROM motion_assets WHERE pet_id = ? ORDER BY created_at ASC")
    .all(petId) as DbMotionAssetRow[];
  const avatarAssets = db
    .prepare("SELECT * FROM avatar_assets WHERE pet_id = ? ORDER BY created_at DESC")
    .all(petId) as DbAvatarAssetRow[];
  const likenessReports = db
    .prepare("SELECT * FROM likeness_reports WHERE pet_id = ? ORDER BY created_at DESC")
    .all(petId) as DbLikenessRow[];

  return {
    pet: mapPet(pet),
    media: media.map(mapMedia),
    keyframes: keyframes.map(mapKeyframe),
    reconstructions: reconstructions.map(mapReconstruction),
    motionAssets: motionAssets.map(mapMotionAsset),
    avatarAssets: avatarAssets.map(mapAvatarAsset),
    likenessReports: likenessReports.map(mapLikeness)
  };
}

export function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
