import sharp from "sharp";

export interface ImageQualityResult {
  width: number;
  height: number;
  qualityScore: number;
  blurScore: number;
  lightingScore: number;
  perceptualHash: string;
  issues: string[];
}

export async function analyzeImageFile(filePath: string): Promise<ImageQualityResult> {
  const image = sharp(filePath, { failOn: "none" }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions could not be read");
  }

  const sample = await image
    .clone()
    .resize(96, 96, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = sample.data;
  const lightingScore = calculateLightingScore(pixels);
  const blurScore = calculateFocusScore(pixels, sample.info.width, sample.info.height);
  const perceptualHash = averageHash(pixels, sample.info.width, sample.info.height);
  const sizeScore = clamp(Math.min(metadata.width / 1200, metadata.height / 900, 1), 0, 1);
  const qualityScore = round(clamp(blurScore * 0.45 + lightingScore * 0.35 + sizeScore * 0.2, 0, 1));
  const issues: string[] = [];

  if (metadata.width < 900 || metadata.height < 700) {
    issues.push("Image resolution is below the recommended 900x700 minimum.");
  }
  if (blurScore < 0.32) {
    issues.push("Image appears blurry; upload a sharper photo for avatar generation.");
  }
  if (lightingScore < 0.35) {
    issues.push("Lighting is weak or clipped; upload a brighter, evenly lit photo.");
  }

  return {
    width: metadata.width,
    height: metadata.height,
    qualityScore,
    blurScore: round(blurScore),
    lightingScore: round(lightingScore),
    perceptualHash,
    issues
  };
}

export function hammingDistance(hashA: string, hashB: string) {
  const length = Math.min(hashA.length, hashB.length);
  let distance = Math.abs(hashA.length - hashB.length);
  for (let index = 0; index < length; index += 1) {
    if (hashA[index] !== hashB[index]) {
      distance += 1;
    }
  }
  return distance;
}

function calculateLightingScore(pixels: Buffer) {
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (const value of pixels) {
    sum += value;
    if (value < 25) {
      dark += 1;
    }
    if (value > 240) {
      bright += 1;
    }
  }

  const mean = sum / pixels.length;
  const centered = 1 - Math.abs(mean - 132) / 132;
  const clippedRatio = (dark + bright) / pixels.length;
  return clamp(centered * (1 - clippedRatio * 1.8), 0, 1);
}

function calculateFocusScore(pixels: Buffer, width: number, height: number) {
  if (width < 3 || height < 3) {
    return 0;
  }

  const gradients: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const left = pixels[y * width + x - 1] ?? 0;
      const right = pixels[y * width + x + 1] ?? 0;
      const up = pixels[(y - 1) * width + x] ?? 0;
      const down = pixels[(y + 1) * width + x] ?? 0;
      gradients.push(Math.abs(right - left) + Math.abs(down - up));
    }
  }

  const mean = gradients.reduce((sum, value) => sum + value, 0) / gradients.length;
  const variance = gradients.reduce((sum, value) => sum + (value - mean) ** 2, 0) / gradients.length;
  return clamp(Math.log10(variance + 1) / 3.2, 0, 1);
}

function averageHash(pixels: Buffer, width: number, height: number) {
  const grid = 16;
  const values: number[] = [];
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const startX = Math.floor((gx / grid) * width);
      const endX = Math.max(startX + 1, Math.floor(((gx + 1) / grid) * width));
      const startY = Math.floor((gy / grid) * height);
      const endY = Math.max(startY + 1, Math.floor(((gy + 1) / grid) * height));
      let sum = 0;
      let count = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          sum += pixels[y * width + x] ?? 0;
          count += 1;
        }
      }
      values.push(sum / count);
    }
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => (value >= mean ? "1" : "0")).join("");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
