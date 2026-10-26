import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server/index.js";
import { nowIso } from "../src/server/db.js";

type BuiltServer = Awaited<ReturnType<typeof buildServer>>;

describe("api", () => {
  let server: BuiltServer | null = null;
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pet-api-"));
    process.env.NODE_ENV = "test";
    process.env.DATABASE_PATH = path.join(tempDir, "app.sqlite");
    process.env.STORAGE_ROOT = path.join(tempDir, "storage");
    process.env.OPENAI_API_KEY = "";
    server = await buildServer();
  });

  afterEach(async () => {
    await server?.app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
    server = null;
  });

  it("reports real provider configuration state", async () => {
    const response = await server?.app.inject({ method: "GET", url: "/api/health" });
    expect(response?.statusCode).toBe(200);
    const body = response?.json();
    expect(body.providers).toEqual({ image: false, openai: false });
    expect(typeof body.ffmpeg).toBe("boolean");
  });

  it("creates a pet only with explicit consent", async () => {
    const rejected = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Mochi",
        species: "cat",
        personalityNotes: "quiet",
        consentAccepted: false
      }
    });
    expect(rejected?.statusCode).toBe(400);

    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Mochi",
        species: "cat",
        personalityNotes: "quiet",
        consentAccepted: true
      }
    });
    expect(created?.statusCode).toBe(201);
    expect(created?.json().pet.name).toBe("Mochi");
  });

  it("handles the QQ case with Chinese defaults", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "QQ",
        species: "dog",
        personalityNotes: "中文测试案例",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;
    expect(created?.statusCode).toBe(201);
    expect(created?.json().pet.name).toBe("QQ");

    const interaction = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/interactions`,
      payload: {
        touchZone: "head",
        message: "摸摸 QQ 的头"
      }
    });

    expect(interaction?.statusCode).toBe(200);
    expect(interaction?.json().provider).toBe("local");
    expect(interaction?.json().plan.reply).toContain("我");
    expect(interaction?.json().plan.safetyNote).toContain("没有消耗");
  });

  it("uses local interaction planning by default without provider tokens", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Coco",
        species: "dog",
        personalityNotes: "likes walks",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;

    const local = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/interactions`,
      payload: {
        touchZone: "head",
        message: "come here"
      }
    });

    expect(local?.statusCode).toBe(200);
    expect(local?.json().provider).toBe("local");
    expect(local?.json().plan.safetyNote).toContain("没有消耗");

    const english = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/interactions`,
      payload: {
        touchZone: "head",
        message: "come here",
        locale: "en"
      }
    });

    expect(english?.statusCode).toBe(200);
    expect(english?.json().provider).toBe("local");
    expect(english?.json().plan.safetyNote).toContain("no provider token");

    const provider = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/interactions`,
      payload: {
        touchZone: "head",
        message: "come here",
        useProvider: true
      }
    });

    expect(provider?.statusCode).toBe(503);
    expect(provider?.json().error.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("returns cached identity analysis without requiring provider tokens", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Coco",
        species: "dog",
        personalityNotes: "black and white",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;
    const updatedAt = "2026-06-08T08:00:00.000Z";
    const profile = {
      species: "dog",
      breedHints: ["Border Collie"],
      coatColors: ["black", "white"],
      eyeColor: "brown",
      faceShape: "triangular",
      bodyProportions: "medium",
      distinctiveMarks: ["white blaze"],
      collarOrAccessories: [],
      personalitySummary: "observed from user notes",
      missingAngles: [],
      selectedImageIndex: 0,
      confidence: 0.95,
      qualityNotes: ["cached profile"]
    };

    const db = new Database(server?.config.databasePath);
    db.prepare("UPDATE pets SET identity_profile_json = ?, status = 'profile_ready', updated_at = ? WHERE id = ?").run(
      JSON.stringify(profile),
      updatedAt,
      petId
    );
    db.close();

    const cached = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/analyze`,
      payload: {}
    });

    expect(cached?.statusCode).toBe(200);
    expect(cached?.json().pet.updatedAt).toBe(updatedAt);
    expect(cached?.json().pet.identityProfile.confidence).toBe(0.95);
  });

  it("keeps 3D reconstruction disabled and does not create a provider task", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Coco",
        species: "dog",
        personalityNotes: "",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;
    const mediaId = randomUUID();
    const createdAt = nowIso();
    const db = new Database(server?.config.databasePath);

    db.prepare(
      `INSERT INTO media
        (id, pet_id, kind, file_name, mime_type, size_bytes, storage_path, width, height, duration_seconds,
         quality_score, blur_score, lighting_score, perceptual_hash, validation_status, validation_issues_json, created_at)
       VALUES (?, ?, 'image', 'coco.jpg', 'image/jpeg', 1024, 'pets/coco/originals/coco.jpg', 640, 480, NULL,
        0.92, 0.1, 0.9, 'hash', 'accepted', '[]', ?)`
    ).run(mediaId, petId, createdAt);

    const before = db.prepare("SELECT COUNT(*) AS count FROM reconstructions WHERE pet_id = ?").get(petId) as { count: number };
    const response = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/reconstructions`,
      payload: { mediaId }
    });
    const after = db.prepare("SELECT COUNT(*) AS count FROM reconstructions WHERE pet_id = ?").get(petId) as { count: number };
    db.close();

    expect(response?.statusCode).toBe(410);
    expect(response?.json().error.code).toBe("THREE_D_DISABLED");
    expect(before.count).toBe(0);
    expect(after.count).toBe(0);
  });

  it("does not create a virtual pet avatar row when image generation is not configured", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Coco",
        species: "dog",
        personalityNotes: "",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;
    const mediaId = randomUUID();
    const db = new Database(server?.config.databasePath);

    db.prepare(
      `INSERT INTO media
        (id, pet_id, kind, file_name, mime_type, size_bytes, storage_path, width, height, duration_seconds,
         quality_score, blur_score, lighting_score, perceptual_hash, validation_status, validation_issues_json, created_at)
       VALUES (?, ?, 'image', 'coco-avatar.jpg', 'image/jpeg', 1024, 'originals/coco/avatar.jpg', 640, 480, NULL,
        0.92, 0.1, 0.9, 'avatar-hash', 'accepted', '[]', ?)`
    ).run(mediaId, petId, nowIso());

    const before = db.prepare("SELECT COUNT(*) AS count FROM avatar_assets WHERE pet_id = ?").get(petId) as { count: number };
    const response = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/avatar-assets`,
      payload: { style: "storybook", sourceMediaId: mediaId }
    });
    const after = db.prepare("SELECT COUNT(*) AS count FROM avatar_assets WHERE pet_id = ?").get(petId) as { count: number };
    db.close();

    expect(response?.statusCode).toBe(503);
    expect(response?.json().error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(before.count).toBe(0);
    expect(after.count).toBe(0);
  });

  it("builds reusable motion assets from stored media instead of a provider task", async () => {
    const created = await server?.app.inject({
      method: "POST",
      url: "/api/pets",
      payload: {
        name: "Coco",
        species: "dog",
        personalityNotes: "",
        consentAccepted: true
      }
    });
    const petId = created?.json().pet.id;
    const mediaId = randomUUID();
    const relativePath = path.join("originals", petId, "coco-action-source.jpg");
    const absolutePath = path.join(server?.config.storageRoot ?? "", relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await sharp({
      create: {
        width: 960,
        height: 720,
        channels: 3,
        background: { r: 248, g: 250, b: 252 }
      }
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="960" height="720" viewBox="0 0 960 720" xmlns="http://www.w3.org/2000/svg">
              <rect x="260" y="160" width="420" height="360" rx="160" fill="#111827"/>
              <rect x="360" y="180" width="140" height="320" rx="60" fill="#f8fafc"/>
              <circle cx="390" cy="300" r="28" fill="#7c2d12"/>
              <circle cx="590" cy="300" r="28" fill="#7c2d12"/>
              <ellipse cx="480" cy="440" rx="85" ry="60" fill="#f8fafc"/>
            </svg>`
          )
        }
      ])
      .jpeg({ quality: 90 })
      .toFile(absolutePath);

    const db = new Database(server?.config.databasePath);
    db.prepare(
      `INSERT INTO media
        (id, pet_id, kind, file_name, mime_type, size_bytes, storage_path, width, height, duration_seconds,
         quality_score, blur_score, lighting_score, perceptual_hash, validation_status, validation_issues_json, created_at)
       VALUES (?, ?, 'image', 'coco-action-source.jpg', 'image/jpeg', 2048, ?, 960, 720, NULL,
        0.94, 0.1, 0.9, 'atlas-hash', 'accepted', '[]', ?)`
    ).run(mediaId, petId, relativePath, nowIso());
    db.close();

    const response = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/motion-assets`,
      payload: {}
    });

    expect(response?.statusCode).toBe(200);
    expect(response?.json().pet.status).toBe("asset_ready");
    expect(response?.json().motionAssets).toHaveLength(8);
    expect(response?.json().motionAssets.map((asset: { action: string }) => asset.action)).toContain("head_tilt");

    const firstAsset = response?.json().motionAssets[0];
    const file = await server?.app.inject({ method: "GET", url: `/api/motion-assets/${firstAsset.id}/file` });
    expect(file?.statusCode).toBe(200);
    expect(file?.headers["content-type"]).toContain("image/webp");
    expect(file?.rawPayload.byteLength).toBeGreaterThan(1000);

    const reused = await server?.app.inject({
      method: "POST",
      url: `/api/pets/${petId}/motion-assets`,
      payload: {}
    });
    expect(reused?.json().motionAssets.map((asset: { id: string }) => asset.id)).toEqual(
      response?.json().motionAssets.map((asset: { id: string }) => asset.id)
    );
  });
});
