import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AppConfig } from "../config.js";
import { createDerivedPath } from "../storage/files.js";
import { analyzeImageFile } from "./mediaQuality.js";

const execFileAsync = promisify(execFile);

export interface ExtractedKeyframe {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  timestampSeconds: number;
  width: number;
  height: number;
  qualityScore: number;
}

export async function hasFfmpeg() {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function extractKeyframes(config: AppConfig, petId: string, videoPath: string, count = 6): Promise<ExtractedKeyframe[]> {
  const timestamps = fixedTimestamps(count);
  const frames: ExtractedKeyframe[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index] ?? 0;
    const frame = await tryExtractFrame(config, petId, videoPath, timestamp, index + 1);
    if (frame) {
      frames.push(frame);
    }
  }

  if (frames.length === 0) {
    const firstFrame = await tryExtractFrame(config, petId, videoPath, 0, 1);
    if (firstFrame) {
      frames.push(firstFrame);
    }
  }

  return frames;
}

async function tryExtractFrame(config: AppConfig, petId: string, videoPath: string, timestampSeconds: number, index: number) {
  const target = await createDerivedPath(config, petId, `frame-${index}.jpg`);
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        timestampSeconds.toFixed(2),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1400,iw)':-2",
        "-q:v",
        "2",
        target.absolutePath
      ],
      { timeout: 60000 }
    );
    const analysis = await analyzeImageFile(target.absolutePath);
    return {
      absolutePath: target.absolutePath,
      relativePath: target.relativePath,
      fileName: path.basename(target.fileName),
      timestampSeconds,
      width: analysis.width,
      height: analysis.height,
      qualityScore: analysis.qualityScore
    };
  } catch {
    return null;
  }
}

function fixedTimestamps(count: number) {
  return [0.35, 1.2, 2.4, 3.8, 5.4, 7.2, 9.6, 12, 15, 20, 26, 34].slice(0, Math.max(1, count));
}
