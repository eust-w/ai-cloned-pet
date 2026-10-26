import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";

export interface StoredFile {
  id: string;
  absolutePath: string;
  relativePath: string;
  fileName: string;
}

export function safeFileName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\w.-]+/g, "_");
  return base.length ? base : "upload";
}

export async function storeOriginal(config: AppConfig, petId: string, fileName: string, buffer: Buffer): Promise<StoredFile> {
  const id = randomUUID();
  const safe = safeFileName(fileName);
  const relativePath = path.join("originals", petId, `${id}-${safe}`);
  const absolutePath = path.join(config.storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { id, absolutePath, relativePath, fileName: safe };
}

export async function createDerivedPath(config: AppConfig, petId: string, fileName: string): Promise<StoredFile> {
  const id = randomUUID();
  const safe = safeFileName(fileName);
  const relativePath = path.join("derived", petId, `${id}-${safe}`);
  const absolutePath = path.join(config.storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  return { id, absolutePath, relativePath, fileName: safe };
}

export async function createAvatarPath(config: AppConfig, petId: string, avatarAssetId: string, fileName = "spritesheet.webp") {
  const relativePath = path.join("avatars", petId, avatarAssetId, safeFileName(fileName));
  const absolutePath = path.join(config.storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  return { absolutePath, relativePath };
}

export function resolveStoragePath(config: AppConfig, relativePath: string) {
  const absolutePath = path.resolve(config.storageRoot, relativePath);
  if (!absolutePath.startsWith(config.storageRoot)) {
    throw new Error("Storage path escapes root");
  }
  return absolutePath;
}
