import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://127.0.0.1:5173"),
  DATABASE_PATH: z.string().default(".data/ai-cloned-pet.sqlite"),
  STORAGE_ROOT: z.string().default(".data/storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_VISION_MODEL: z.string().optional(),
  OPENAI_IMAGE_MODEL: z.string().optional(),
  DASHSCOPE_IMAGE_ENDPOINT: z.string().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  loadDotenvFile(path.resolve(process.cwd(), ".env"));
  const parsed = envSchema.parse(process.env);
  const cwd = process.cwd();
  const databasePath = path.resolve(cwd, parsed.DATABASE_PATH);
  const storageRoot = path.resolve(cwd, parsed.STORAGE_ROOT);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(path.join(storageRoot, "originals"), { recursive: true });
  fs.mkdirSync(path.join(storageRoot, "derived"), { recursive: true });
  fs.mkdirSync(path.join(storageRoot, "models"), { recursive: true });
  fs.mkdirSync(path.join(storageRoot, "avatars"), { recursive: true });

  const openaiBaseUrl = nonEmpty(parsed.OPENAI_BASE_URL);
  const defaultImageModel = openaiBaseUrl?.includes("dashscope") ? "wan2.6-image" : "gpt-image-1";

  return {
    nodeEnv: parsed.NODE_ENV,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    databasePath,
    storageRoot,
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
    openaiApiKey: nonEmpty(parsed.OPENAI_API_KEY),
    openaiBaseUrl,
    openaiModel: parsed.OPENAI_MODEL,
    openaiVisionModel: nonEmpty(parsed.OPENAI_VISION_MODEL) ?? parsed.OPENAI_MODEL,
    openaiImageModel: nonEmpty(parsed.OPENAI_IMAGE_MODEL) ?? defaultImageModel,
    dashscopeImageEndpoint: nonEmpty(parsed.DASHSCOPE_IMAGE_ENDPOINT) ?? deriveDashscopeImageEndpoint(openaiBaseUrl)
  };
}

function deriveDashscopeImageEndpoint(baseUrl: string | undefined) {
  if (baseUrl?.includes("dashscope-intl.aliyuncs.com")) {
    return "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  }
  return "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function loadDotenvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = unquoteEnvValue(line.slice(separator + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
