import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeImageFile, hammingDistance } from "../src/server/services/mediaQuality.js";

describe("media quality analysis", () => {
  it("scores a real image file and returns dimensions plus hash", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pet-quality-"));
    const filePath = path.join(dir, "sharp-photo.png");
    await sharp({
      create: {
        width: 1280,
        height: 900,
        channels: 3,
        background: { r: 180, g: 170, b: 150 }
      }
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1280" height="900" xmlns="http://www.w3.org/2000/svg">
              <rect x="260" y="180" width="760" height="520" rx="80" fill="#5b4036"/>
              <circle cx="480" cy="360" r="44" fill="#101820"/>
              <circle cx="800" cy="360" r="44" fill="#101820"/>
              <path d="M520 560 C620 620 700 620 780 560" stroke="#f8fafc" stroke-width="28" fill="none"/>
            </svg>`
          )
        }
      ])
      .png()
      .toFile(filePath);

    const result = await analyzeImageFile(filePath);

    expect(result.width).toBe(1280);
    expect(result.height).toBe(900);
    expect(result.qualityScore).toBeGreaterThan(0.2);
    expect(result.perceptualHash).toHaveLength(256);
  });

  it("computes hamming distance for perceptual hashes", () => {
    expect(hammingDistance("0101", "1100")).toBe(2);
    expect(hammingDistance("0101", "01010")).toBe(1);
  });
});
