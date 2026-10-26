import fs from "node:fs/promises";
import OpenAI, { toFile } from "openai";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat";
import type {
  AvatarStyle,
  MotionAction,
  PetIdentityProfile,
  PetRecord,
  PlannerResponse,
  TouchZone
} from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import { AppError, providerNotConfigured } from "../errors.js";

interface IdentityInputImage {
  id: string;
  filePath: string;
  mimeType: string;
  label: string;
}

interface CartoonSpriteInput {
  pet: PetRecord;
  style: AvatarStyle;
  sourceImagePath: string;
  sourceMimeType: string;
  sourceFileName: string;
}

interface CartoonSpriteResult {
  frames: CartoonSpriteFrame[];
  provider: "openai" | "dashscope";
  providerModel: string;
  providerRequestId: string | null;
  prompt: string;
}

interface CartoonSpriteFrame {
  action: MotionAction;
  buffer: Buffer;
  prompt: string;
  providerRequestId: string | null;
}

interface GeneratedCartoonImage {
  buffer: Buffer;
  providerRequestId: string | null;
}

interface DashScopeImageResponse {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
          type?: string;
        }>;
      };
    }>;
  };
}

const identitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "species",
    "breedHints",
    "coatColors",
    "eyeColor",
    "faceShape",
    "bodyProportions",
    "distinctiveMarks",
    "collarOrAccessories",
    "personalitySummary",
    "missingAngles",
    "selectedImageIndex",
    "confidence",
    "qualityNotes"
  ],
  properties: {
    species: { type: "string", enum: ["cat", "dog", "unknown"] },
    breedHints: { type: "array", items: { type: "string" } },
    coatColors: { type: "array", items: { type: "string" } },
    eyeColor: { type: "string" },
    faceShape: { type: "string" },
    bodyProportions: { type: "string" },
    distinctiveMarks: { type: "array", items: { type: "string" } },
    collarOrAccessories: { type: "array", items: { type: "string" } },
    personalitySummary: { type: "string" },
    missingAngles: { type: "array", items: { type: "string" } },
    selectedImageIndex: { type: "integer", minimum: 0 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    qualityNotes: { type: "array", items: { type: "string" } }
  }
} as const;

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["emotion", "actions", "reply", "safetyNote"],
  properties: {
    emotion: {
      type: "string",
      enum: ["calm", "curious", "happy", "sleepy", "playful", "alert"]
    },
    actions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "intensity", "target", "speed"],
        properties: {
          type: { type: "string", enum: ["animation", "sound", "move_to", "emotion"] },
          name: { type: "string" },
          intensity: { type: "number", minimum: 0, maximum: 1 },
          target: { type: "string" },
          speed: { type: "string", enum: ["slow", "normal", "fast"] }
        }
      }
    },
    reply: { type: "string" },
    safetyNote: { type: "string" }
  }
} as const;

export class OpenAIProvider {
  private readonly config: AppConfig;
  private readonly client: OpenAI | null;

  constructor(config: AppConfig) {
    this.config = config;
    this.client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey, baseURL: config.openaiBaseUrl }) : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async createIdentityProfile(pet: PetRecord, images: IdentityInputImage[]): Promise<PetIdentityProfile> {
    const client = this.requireClient();
    if (images.length === 0) {
      throw new Error("At least one accepted image or keyframe is required for identity analysis");
    }

    const content: ChatCompletionContentPart[] = [
      {
        type: "text",
        text:
          "Build a subject-specific pet identity profile for cartoon virtual pet generation. " +
          "Use only visible evidence in the provided photos. Do not invent markings, breed, or personality. " +
          `Pet name: ${pet.name}. User notes: ${pet.personalityNotes || "none"}. ` +
          "The selectedImageIndex must identify the best single reference image for avatar generation. " +
          jsonSchemaInstruction("pet_identity_profile", identitySchema)
      }
    ];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      if (!image) {
        continue;
      }
      content.push({
        type: "text",
        text: `Image ${index}: media_id=${image.id}; label=${image.label}`
      });
      content.push({
        type: "image_url",
        image_url: {
          url: await toDataUri(image.filePath, image.mimeType),
          detail: "high"
        }
      });
    }

    const response = await client.chat.completions.create({
      model: this.config.openaiVisionModel,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1400
    });

    return parseStructured<PetIdentityProfile>(choiceText(response));
  }

  async planInteraction(pet: PetRecord, touchZone: TouchZone, userText: string): Promise<PlannerResponse> {
    const client = this.requireClient();
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a structured action planner for an interactive AI pet. " +
          "Return only feasible animation, sound, movement, and emotion actions for a browser virtual pet sprite runtime. " +
          "Do not claim to be the real animal. " +
          jsonSchemaInstruction("pet_action_plan", plannerSchema)
      },
      {
        role: "user",
        content:
          `Pet profile JSON: ${JSON.stringify(pet.identityProfile ?? {})}\n` +
          `Pet name: ${pet.name}\nTouch zone: ${touchZone}\nUser message: ${userText}`
      }
    ];
    const response = await client.chat.completions.create({
      model: this.config.openaiModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 800
    });

    return parseStructured<PlannerResponse>(choiceText(response));
  }

  async createCartoonSpriteSheet(input: CartoonSpriteInput): Promise<CartoonSpriteResult> {
    this.requireClient();
    const frames: CartoonSpriteFrame[] = [];
    for (const row of spriteActionRows) {
      const prompt = buildCartoonSpriteFramePrompt(input.pet, input.style, row.prompt);
      const image = this.shouldUseDashScopeImageApi()
        ? await this.createDashScopeCartoonFrame(input, prompt)
        : await this.createOpenAICartoonFrame(input, prompt);
      frames.push({
        action: row.action,
        buffer: image.buffer,
        prompt,
        providerRequestId: image.providerRequestId
      });
    }

    const requestIds = frames.map((frame) => frame.providerRequestId).filter((value): value is string => Boolean(value));
    return {
      frames,
      provider: this.shouldUseDashScopeImageApi() ? "dashscope" : "openai",
      providerModel: this.config.openaiImageModel,
      providerRequestId: requestIds.length > 0 ? requestIds.join(",") : null,
      prompt: frames.map((frame, index) => `row ${index + 1}: ${frame.prompt}`).join("\n---\n")
    };
  }

  private requireClient() {
    if (!this.client) {
      throw providerNotConfigured("OpenAI");
    }
    return this.client;
  }

  private async createOpenAICartoonFrame(input: CartoonSpriteInput, prompt: string): Promise<GeneratedCartoonImage> {
    const client = this.requireClient();
    const source = await fs.readFile(input.sourceImagePath);
    const response = await client.images.edit({
      image: await toFile(source, input.sourceFileName, { type: input.sourceMimeType }),
      prompt,
      model: this.config.openaiImageModel,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      background: "transparent",
      input_fidelity: this.supportsInputFidelity() ? "high" : undefined,
      output_format: "png",
      response_format: "b64_json"
    });

    const image = response.data?.[0];
    if (!image) {
      throw new AppError("PROVIDER_EMPTY_IMAGE", "Image provider returned no generated image.", 502);
    }

    const buffer = image.b64_json ? Buffer.from(image.b64_json, "base64") : await downloadImageFromUrl(image.url);
    return {
      buffer,
      providerRequestId: null
    };
  }

  private async createDashScopeCartoonFrame(input: CartoonSpriteInput, prompt: string): Promise<GeneratedCartoonImage> {
    if (!this.config.openaiApiKey) {
      throw providerNotConfigured("DashScope");
    }
    const sourceDataUri = await toDataUri(input.sourceImagePath, input.sourceMimeType);
    const response = await fetch(this.config.dashscopeImageEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.config.openaiImageModel,
        input: {
          messages: [
            {
              role: "user",
              content: [{ image: sourceDataUri }, { text: prompt }]
            }
          ]
        },
        parameters: {
          size: "1024*1024",
          n: 1,
          enable_interleave: false,
          prompt_extend: false,
          negative_prompt: dashScopeSpriteNegativePrompt,
          watermark: false
        }
      })
    });
    const body = (await response.json()) as DashScopeImageResponse;
    if (!response.ok || body.code) {
      throw new AppError(
        "PROVIDER_ERROR",
        body.message ?? `DashScope image generation failed with HTTP ${response.status}.`,
        response.ok ? 502 : response.status,
        { provider: "dashscope", code: body.code }
      );
    }
    const imageUrl = body.output?.choices?.[0]?.message?.content?.find((item) => item.type === "image" && item.image)?.image;
    if (!imageUrl) {
      throw new AppError("PROVIDER_EMPTY_IMAGE", "DashScope returned no generated image URL.", 502);
    }
    const buffer = imageUrl.startsWith("data:") ? bufferFromDataUri(imageUrl).buffer : await downloadImageFromUrl(imageUrl);
    return {
      buffer,
      providerRequestId: body.request_id ?? null
    };
  }

  private shouldUseDashScopeImageApi() {
    return this.config.openaiBaseUrl?.includes("dashscope") || this.config.openaiImageModel.startsWith("wan");
  }

  private supportsInputFidelity() {
    return !this.config.openaiImageModel.includes("mini") && !this.config.openaiImageModel.startsWith("dall-e");
  }
}

async function toDataUri(filePath: string, mimeType: string) {
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function choiceText(response: OpenAI.Chat.Completions.ChatCompletion) {
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Provider returned an empty chat completion response");
  }
  return content;
}

const spriteActionRows: Array<{ action: MotionAction; prompt: string }> = [
  { action: "idle", prompt: "idle breathing loop, front view, tiny blink and body bob" },
  { action: "approach_user", prompt: "walking toward the viewer, friendly and eager, clear leg cadence" },
  { action: "stay_near_user", prompt: "gentle side-step companion loop, calm and close to the user" },
  { action: "look_at_user", prompt: "front attention loop, eye contact, ears and head subtly reacting" },
  { action: "play", prompt: "happy play bow and small hop loop, playful but not chaotic" },
  { action: "tail_wag", prompt: "tail wag loop, consistent body pose, visible tail movement" },
  { action: "head_tilt", prompt: "curious head tilt loop, alternating tilt and blink" },
  { action: "sit", prompt: "sit and calm blink loop, relaxed companion pose" },
  { action: "idle", prompt: "sleepy calm idle loop, soft blink, quiet breathing" }
];

const dashScopeSpriteNegativePrompt = [
  "text",
  "letters",
  "numbers",
  "caption",
  "label",
  "watermark",
  "frame border",
  "grid line",
  "checkerboard background",
  "white card",
  "gray card",
  "black card",
  "UI",
  "human",
  "scenery",
  "horizontal stripe",
  "vertical stripe",
  "shadow cast on background",
  "background pattern"
].join(", ");

function buildCartoonSpriteFramePrompt(pet: PetRecord, style: AvatarStyle, motionPrompt: string) {
  const profile = pet.identityProfile;
  const styleText = cartoonStylePrompt(style);
  const visibleProfile = profile
    ? [
        `species: ${profile.species}`,
        `coat colors: ${profile.coatColors.join(", ") || "unknown"}`,
        `eye color: ${profile.eyeColor || "unknown"}`,
        `distinctive marks: ${profile.distinctiveMarks.join(", ") || "none"}`,
        `body proportions: ${profile.bodyProportions || "unknown"}`
      ].join("; ")
    : `species: ${pet.species}; user notes: ${pet.personalityNotes || "none"}`;
  return [
    "Create exactly one production-ready full-body cartoon virtual pet sprite from the reference pet image.",
    `Visible identity profile: ${visibleProfile}.`,
    `Style: ${styleText}.`,
    `Pose and mood: ${motionPrompt}.`,
    "Make a single consistent character based on the real pet, preserving coat colors, markings, eye color, and recognizable face pattern.",
    "The output must contain one pet only, centered, compact, with the entire body visible from ears to paws and tail.",
    "Use one plain solid bright chroma green background behind the pet for later compositing.",
    "Do not draw any text, letters, numbers, labels, captions, titles, UI, humans, watermark, scenery, frame borders, grid lines, speech bubbles, transparent checkerboard pattern, white card, white square, black card, gray card, or patterned background.",
    "Leave clean empty padding around the pet so the sprite can be placed into a small game cell.",
    "Do not invent collars or accessories unless visible in the reference image."
  ].join(" ");
}

function cartoonStylePrompt(style: AvatarStyle) {
  switch (style) {
    case "soft_3d":
      return "soft 3D toy character, rounded forms, tactile fur, gentle lighting, premium app mascot";
    case "pixel":
      return "high-resolution pixel art mascot, crisp blocky silhouette, readable 32-bit game sprite feel";
    case "ink":
      return "clean ink-and-watercolor character, expressive linework, light paper texture, warm storybook energy";
    case "storybook":
      return "modern storybook cartoon, expressive but calm, polished children's book illustration, soft edges";
  }
}

async function downloadImageFromUrl(url: string | undefined) {
  if (!url) {
    throw new AppError("PROVIDER_EMPTY_IMAGE", "Image provider returned no image payload.", 502);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError("IMAGE_DOWNLOAD_FAILED", `Generated image download failed with HTTP ${response.status}.`, 502);
  }
  return Buffer.from(await response.arrayBuffer());
}

function bufferFromDataUri(dataUri: string) {
  const match = dataUri.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new AppError("INVALID_PROVIDER_IMAGE", "Provider returned an invalid image data URI.", 502);
  }
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function jsonSchemaInstruction(name: string, _schema: unknown) {
  if (name === "pet_identity_profile") {
    return (
      "Return exactly one JSON object with these keys: " +
      "species as cat, dog, or unknown; breedHints string array; coatColors string array; " +
      "eyeColor string; faceShape string; bodyProportions string; distinctiveMarks string array; " +
      "collarOrAccessories string array; personalitySummary string; missingAngles string array; " +
      "selectedImageIndex integer; confidence number between 0 and 1; qualityNotes string array. " +
      "No markdown and no extra wrapper key."
    );
  }

  if (name === "pet_action_plan") {
    return (
      "Return exactly one JSON object with keys emotion, actions, reply, safetyNote. " +
      "emotion must be calm, curious, happy, sleepy, playful, or alert. " +
      "actions must be an array of at most 4 objects with keys type, name, intensity, target, speed. " +
      "type must be animation, sound, move_to, or emotion; intensity is 0 to 1; speed is slow, normal, or fast. " +
      "No markdown and no extra wrapper key."
    );
  }

  return (
    "Return exactly one JSON object with keys overallScore, faceScore, coatPatternScore, colorScore, " +
    "proportionScore, identityMarksScore, decision, notes. Scores are numbers from 0 to 1. " +
    "decision must be approve, regenerate, or needs_more_media. notes is a string array. " +
    "No markdown and no extra wrapper key."
  );
}

function parseStructured<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Provider returned an empty structured response");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Provider did not return JSON");
    }
    return JSON.parse(match[0]) as T;
  }
}
