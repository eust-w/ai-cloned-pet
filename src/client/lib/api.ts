import type {
  ApiErrorBody,
  AvatarStyle,
  AvatarStyleOption,
  HealthResponse,
  PetDetailResponse,
  PetRecord,
  PlannerResponse,
  Species,
  TouchZone
} from "../../shared/types.js";
import type { Locale } from "./i18n.js";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

export async function getHealth() {
  return fetchJson<HealthResponse>("/api/health");
}

export async function getAvatarStyles() {
  return fetchJson<{ styles: AvatarStyleOption[] }>("/api/avatar-styles");
}

export async function listPets() {
  return fetchJson<{ pets: PetRecord[] }>("/api/pets");
}

export async function createPet(input: {
  name: string;
  species: Species;
  personalityNotes: string;
  consentAccepted: true;
}) {
  return fetchJson<PetDetailResponse>("/api/pets", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getPet(petId: string) {
  return fetchJson<PetDetailResponse>(`/api/pets/${petId}`);
}

export async function deletePet(petId: string) {
  return fetchJson<{ ok: boolean }>(`/api/pets/${petId}`, { method: "DELETE" });
}

export async function uploadMedia(petId: string, files: FileList) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));
  return fetchJson<{ detail: PetDetailResponse }>(`/api/pets/${petId}/media`, {
    method: "POST",
    body: formData
  });
}

export async function analyzePet(petId: string, force = false) {
  return fetchJson<PetDetailResponse>(`/api/pets/${petId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ force })
  });
}

export async function createMotionAssets(petId: string, force = false) {
  return fetchJson<PetDetailResponse>(`/api/pets/${petId}/motion-assets`, {
    method: "POST",
    body: JSON.stringify({ force })
  });
}

export async function createAvatarAsset(petId: string, style: AvatarStyle, sourceMediaId?: string, forceRegenerate = false) {
  return fetchJson<PetDetailResponse>(`/api/pets/${petId}/avatar-assets`, {
    method: "POST",
    body: JSON.stringify({ style, ...(sourceMediaId ? { sourceMediaId } : {}), forceRegenerate })
  });
}

export async function planInteraction(petId: string, touchZone: TouchZone, message: string, useProvider = false, locale: Locale = "zh") {
  return fetchJson<{ plan: PlannerResponse; provider: "local" | "openai" }>(`/api/pets/${petId}/interactions`, {
    method: "POST",
    body: JSON.stringify({ touchZone, message, useProvider, locale })
  });
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody);
  }
  return body as T;
}
