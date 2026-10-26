export type Species = "cat" | "dog" | "unknown";

export type PetStatus =
  | "draft"
  | "media_uploaded"
  | "profile_ready"
  | "asset_ready"
  | "generation_queued"
  | "generation_running"
  | "model_ready"
  | "needs_more_media"
  | "needs_provider_configuration"
  | "failed";

export type MediaKind = "image" | "video" | "audio";

export type ValidationStatus = "accepted" | "warning" | "rejected";

export type ReconstructionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_provider_configuration";

export type TouchZone = "head" | "back" | "belly" | "paw" | "tail" | "face" | "none";

export type MotionAction =
  | "idle"
  | "look_at_user"
  | "head_tilt"
  | "tail_wag"
  | "approach_user"
  | "stay_near_user"
  | "play"
  | "sit";

export type AvatarStyle = "storybook" | "soft_3d" | "pixel" | "ink";

export interface HealthResponse {
  ok: boolean;
  storageRoot: string;
  databasePath: string;
  providers: {
    image: boolean;
    openai: boolean;
  };
  ffmpeg: boolean;
}

export interface PetRecord {
  id: string;
  name: string;
  species: Species;
  personalityNotes: string;
  status: PetStatus;
  identityProfile: PetIdentityProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRecord {
  id: string;
  petId: string;
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  qualityScore: number | null;
  blurScore: number | null;
  lightingScore: number | null;
  validationStatus: ValidationStatus;
  validationIssues: string[];
  createdAt: string;
}

export interface KeyframeRecord {
  id: string;
  mediaId: string;
  fileName: string;
  timestampSeconds: number;
  width: number;
  height: number;
  qualityScore: number;
  createdAt: string;
}

export interface ReconstructionRecord {
  id: string;
  petId: string;
  provider: string;
  providerEndpoint: string;
  providerRequestId: string | null;
  status: ReconstructionStatus;
  progress: number | null;
  inputMediaId: string | null;
  modelUrl: string | null;
  localModelAvailable: boolean;
  gaussianSplatUrl: string | null;
  thumbnailUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MotionAssetRecord {
  id: string;
  petId: string;
  action: MotionAction;
  scene: string;
  sourceMediaId: string | null;
  sourceKeyframeId: string | null;
  width: number;
  height: number;
  qualityScore: number | null;
  createdAt: string;
}

export interface AvatarAssetRecord {
  id: string;
  petId: string;
  style: AvatarStyle;
  provider: "openai" | "dashscope";
  providerModel: string;
  providerRequestId: string | null;
  sourceMediaId: string | null;
  sourceKeyframeId: string | null;
  width: number;
  height: number;
  frameColumns: number;
  frameRows: number;
  frameActions: MotionAction[];
  prompt: string;
  createdAt: string;
}

export interface AvatarStyleOption {
  id: AvatarStyle;
  label: string;
  description: string;
}

export interface PetIdentityProfile {
  species: Species;
  breedHints: string[];
  coatColors: string[];
  eyeColor: string;
  faceShape: string;
  bodyProportions: string;
  distinctiveMarks: string[];
  collarOrAccessories: string[];
  personalitySummary: string;
  missingAngles: string[];
  selectedImageIndex: number;
  confidence: number;
  qualityNotes: string[];
}

export interface LikenessReport {
  id: string;
  petId: string;
  sourceMediaId: string;
  reconstructionId: string;
  overallScore: number;
  faceScore: number;
  coatPatternScore: number;
  colorScore: number;
  proportionScore: number;
  identityMarksScore: number;
  decision: "approve" | "regenerate" | "needs_more_media";
  notes: string[];
  createdAt: string;
}

export interface PlannerAction {
  type: "animation" | "sound" | "move_to" | "emotion";
  name: string;
  intensity: number;
  target?: string;
  speed?: "slow" | "normal" | "fast";
}

export interface PlannerResponse {
  emotion: "calm" | "curious" | "happy" | "sleepy" | "playful" | "alert";
  actions: PlannerAction[];
  reply: string;
  safetyNote: string;
}

export interface PetDetailResponse {
  pet: PetRecord;
  media: MediaRecord[];
  keyframes: KeyframeRecord[];
  reconstructions: ReconstructionRecord[];
  motionAssets: MotionAssetRecord[];
  avatarAssets: AvatarAssetRecord[];
  likenessReports: LikenessReport[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
