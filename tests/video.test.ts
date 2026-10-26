import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/server/config.js";
import { extractKeyframes, hasFfmpeg } from "../src/server/services/video.js";

const execFileAsync = promisify(execFile);

describe("video frame extraction", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pet-video-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts representative still images without requiring duration parsing", async () => {
    expect(await hasFfmpeg(), "Install ffmpeg to run the real video integration test").toBe(true);

    const videoPath = path.join(tempDir, "sample.mp4");
    await execFileAsync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=8", "-pix_fmt", "yuv420p", videoPath],
      { timeout: 60000 }
    );

    const config = {
      storageRoot: path.join(tempDir, "storage")
    } as AppConfig;
    const frames = await extractKeyframes(config, "video-pet", videoPath, 6);

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(6);
    expect(frames[0]?.timestampSeconds).toBe(0.35);
    for (const frame of frames) {
      await expect(fs.access(frame.absolutePath)).resolves.toBeUndefined();
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.qualityScore).toBeGreaterThan(0);
    }
  }, 30000);
});
