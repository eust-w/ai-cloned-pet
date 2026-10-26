import type { AvatarStyle, MotionAction, PetStatus, ReconstructionStatus, TouchZone, ValidationStatus } from "../../shared/types.js";

export type Locale = "zh" | "en";

export type StatusKey = PetStatus | ReconstructionStatus | ValidationStatus | "configured" | "missing";

export interface I18nMessages {
  localeName: string;
  languageSwitch: string;
  brandTitle: string;
  brandSubtitle: string;
  providers: {
    image: string;
    openai: string;
    ffmpeg: string;
  };
  topbar: {
    workbench: string;
    createProject: string;
    exportJson: string;
    deletePet: string;
  };
  create: {
    name: string;
    species: string;
    unknown: string;
    cat: string;
    dog: string;
    personalityNotes: string;
    consent: string;
    create: string;
  };
  steps: {
    createPet: string;
    uploadMedia: string;
    analyze: string;
    buildAssets: string;
    reviewLikeness: string;
    interact: string;
  };
  identity: {
    title: string;
    species: string;
    confidence: string;
    coat: string;
    eyes: string;
    unknown: string;
    noMarks: string;
    empty: string;
  };
  media: {
    title: string;
    subtitle: string;
    upload: string;
    profileReady: string;
    analyze: string;
    noMedia: string;
    quality: string;
    kind: Record<"image" | "video" | "audio", string>;
  };
  generation: {
    title: string;
    subtitle: string;
    atlasReady: string;
    buildAtlas: string;
    providerMissing: string;
    noTasks: string;
  };
  virtualPet: {
    title: string;
    subtitle: string;
    sourceImage: string;
    sourceAuto: string;
    style: string;
    generate: string;
    regenerate: string;
    ready: string;
    noAvatar: string;
    noTokenRuntime: string;
    cachedAsset: string;
    oldAssets: string;
    styleLabel: Record<AvatarStyle, string>;
  };
  runtime: {
    title: string;
    subtitle: string;
    llm: string;
    inputPlaceholder: string;
    planAction: string;
    noTokenNote: string;
  };
  empty: {
    title: string;
    body: string;
  };
  status: Record<StatusKey, string>;
  species: Record<"cat" | "dog" | "unknown", string>;
  touchZone: Record<TouchZone, string>;
  motionAction: Record<MotionAction, string>;
  errors: Partial<Record<string, string>> & {
    unexpected: string;
  };
}

export const defaultLocale: Locale = "zh";

export const messages: Record<Locale, I18nMessages> = {
  zh: {
    localeName: "中文",
    languageSwitch: "语言",
    brandTitle: "AI 克隆宠物",
    brandSubtitle: "真实媒体生成可互动资产",
    providers: {
      image: "卡通图像生成",
      openai: "百炼视觉/规划",
      ffmpeg: "ffmpeg 视频处理"
    },
    topbar: {
      workbench: "工作台",
      createProject: "创建宠物项目",
      exportJson: "导出 JSON",
      deletePet: "删除宠物数据"
    },
    create: {
      name: "名称",
      species: "物种",
      unknown: "未知",
      cat: "猫",
      dog: "狗",
      personalityNotes: "性格备注",
      consent: "我有权并同意处理这些媒体。",
      create: "创建"
    },
    steps: {
      createPet: "创建宠物",
      uploadMedia: "上传媒体",
      analyze: "分析画像",
      buildAssets: "构建资产",
      reviewLikeness: "相似度审核",
      interact: "互动"
    },
    identity: {
      title: "身份",
      species: "物种",
      confidence: "置信度",
      coat: "毛色",
      eyes: "眼睛",
      unknown: "未知",
      noMarks: "还没有确认特殊标记。",
      empty: "身份画像会基于已接受媒体通过已配置视觉模型生成。"
    },
    media: {
      title: "媒体",
      subtitle: "上传与校验",
      upload: "上传照片、视频或声音样本",
      profileReady: "画像已就绪",
      analyze: "分析",
      noMedia: "还没有上传媒体。",
      quality: "质量",
      kind: {
        image: "图片",
        video: "视频",
        audio: "音频"
      }
    },
    generation: {
      title: "生成",
      subtitle: "卡通形象与动作图集",
      atlasReady: "图集已就绪",
      buildAtlas: "构建图集",
      providerMissing: "缺少服务",
      noTasks: "还没有备用动作图集。"
    },
    virtualPet: {
      title: "虚拟宠物",
      subtitle: "卡通形象与实时互动",
      sourceImage: "参考图片",
      sourceAuto: "自动选择最佳图片/视频帧",
      style: "风格",
      generate: "生成卡通宠物",
      regenerate: "重新生成",
      ready: "虚拟宠物已就绪",
      noAvatar: "先选择风格并生成 Coco 的卡通精灵图。",
      noTokenRuntime: "运行时播放缓存精灵图；不会反复消耗图像生成 token。",
      cachedAsset: "缓存资产",
      oldAssets: "备用动作图集",
      styleLabel: {
        storybook: "绘本",
        soft_3d: "软萌 3D",
        pixel: "像素",
        ink: "水墨线稿"
      }
    },
    runtime: {
      title: "运行",
      subtitle: "动作规划",
      llm: "LLM",
      inputPlaceholder: "呼唤或和宠物说话",
      planAction: "规划动作",
      noTokenNote: "本地确定性规划；本次没有消耗模型 token。"
    },
    empty: {
      title: "未选择宠物项目",
      body: "先创建宠物并确认授权，然后上传真实媒体开始构建资产。"
    },
    status: {
      draft: "草稿",
      media_uploaded: "已上传媒体",
      profile_ready: "画像已就绪",
      asset_ready: "资产已就绪",
      generation_queued: "生成排队中",
      generation_running: "生成中",
      model_ready: "模型已就绪",
      needs_more_media: "需要更多媒体",
      needs_provider_configuration: "需要配置服务",
      failed: "失败",
      queued: "排队中",
      running: "运行中",
      succeeded: "成功",
      accepted: "已接受",
      warning: "警告",
      rejected: "已拒绝",
      configured: "已配置",
      missing: "缺失"
    },
    species: {
      cat: "猫",
      dog: "狗",
      unknown: "未知"
    },
    touchZone: {
      none: "无",
      head: "头",
      back: "背",
      belly: "肚子",
      paw: "爪子",
      tail: "尾巴",
      face: "脸"
    },
    motionAction: {
      idle: "待机",
      look_at_user: "看向用户",
      head_tilt: "歪头",
      tail_wag: "摇尾巴",
      approach_user: "靠近",
      stay_near_user: "陪伴",
      play: "玩耍",
      sit: "坐下"
    },
    errors: {
      PROVIDER_NOT_CONFIGURED: "服务尚未配置。请先配置对应 API Key。",
      THREE_D_DISABLED: "3D 重建已关闭；当前使用缓存的卡通虚拟宠物形象。",
      NO_ACCEPTED_MEDIA: "请先上传已通过校验的照片或视频。",
      NO_RECONSTRUCTION_INPUT: "请先上传可用于生成的图片或视频帧。",
      NO_MOTION_SOURCES: "请先上传可用于构建动作图集的媒体。",
      NO_AVATAR_INPUT: "请先上传可用于生成虚拟宠物的照片或视频。",
      INVALID_AVATAR_INPUT: "虚拟宠物参考图必须属于当前宠物并通过校验。",
      PROVIDER_ERROR: "图像生成服务返回错误，请检查服务配置或模型权限。",
      unexpected: "发生未知错误"
    }
  },
  en: {
    localeName: "English",
    languageSwitch: "Language",
    brandTitle: "AI Cloned Pet",
    brandSubtitle: "Real media to interactive assets",
    providers: {
      image: "Cartoon image generation",
      openai: "OpenAI vision/planner",
      ffmpeg: "ffmpeg video ingest"
    },
    topbar: {
      workbench: "Workbench",
      createProject: "Create a pet project",
      exportJson: "Export JSON",
      deletePet: "Delete pet data"
    },
    create: {
      name: "Name",
      species: "Species",
      unknown: "Unknown",
      cat: "Cat",
      dog: "Dog",
      personalityNotes: "Personality notes",
      consent: "I have rights and consent to process this media.",
      create: "Create"
    },
    steps: {
      createPet: "Create Pet",
      uploadMedia: "Upload Media",
      analyze: "Analyze",
      buildAssets: "Build Assets",
      reviewLikeness: "Review Likeness",
      interact: "Interact"
    },
    identity: {
      title: "Identity",
      species: "Species",
      confidence: "Confidence",
      coat: "Coat",
      eyes: "Eyes",
      unknown: "unknown",
      noMarks: "No distinctive marks confirmed yet.",
      empty: "Identity profile will be created from accepted media through the configured vision provider."
    },
    media: {
      title: "Media",
      subtitle: "Uploads and validation",
      upload: "Upload photos, video, or sound samples",
      profileReady: "Profile Ready",
      analyze: "Analyze",
      noMedia: "No media uploaded.",
      quality: "quality",
      kind: {
        image: "image",
        video: "video",
        audio: "audio"
      }
    },
    generation: {
      title: "Generation",
      subtitle: "Cartoon avatar and action atlas",
      atlasReady: "Atlas Ready",
      buildAtlas: "Build Atlas",
      providerMissing: "Provider Missing",
      noTasks: "No backup action atlas yet."
    },
    virtualPet: {
      title: "Virtual Pet",
      subtitle: "Cartoon avatar and live runtime",
      sourceImage: "Reference image",
      sourceAuto: "Auto-select best photo/video frame",
      style: "Style",
      generate: "Generate cartoon pet",
      regenerate: "Regenerate",
      ready: "Virtual pet ready",
      noAvatar: "Choose a style and generate Coco's cartoon sprite sheet first.",
      noTokenRuntime: "Runtime plays the cached sprite sheet; image-generation tokens are not spent repeatedly.",
      cachedAsset: "Cached asset",
      oldAssets: "Backup action atlas",
      styleLabel: {
        storybook: "Storybook",
        soft_3d: "Soft 3D",
        pixel: "Pixel",
        ink: "Ink"
      }
    },
    runtime: {
      title: "Runtime",
      subtitle: "Action planner",
      llm: "LLM",
      inputPlaceholder: "Call or talk to the pet",
      planAction: "Plan action",
      noTokenNote: "Local deterministic planner; no provider token was used."
    },
    empty: {
      title: "No pet project selected",
      body: "Create a pet with consent, then upload real media to start the asset pipeline."
    },
    status: {
      draft: "draft",
      media_uploaded: "media uploaded",
      profile_ready: "profile ready",
      asset_ready: "asset ready",
      generation_queued: "generation queued",
      generation_running: "generation running",
      model_ready: "model ready",
      needs_more_media: "needs more media",
      needs_provider_configuration: "needs provider configuration",
      failed: "failed",
      queued: "queued",
      running: "running",
      succeeded: "succeeded",
      accepted: "accepted",
      warning: "warning",
      rejected: "rejected",
      configured: "configured",
      missing: "missing"
    },
    species: {
      cat: "cat",
      dog: "dog",
      unknown: "unknown"
    },
    touchZone: {
      none: "none",
      head: "head",
      back: "back",
      belly: "belly",
      paw: "paw",
      tail: "tail",
      face: "face"
    },
    motionAction: {
      idle: "idle",
      look_at_user: "look at user",
      head_tilt: "head tilt",
      tail_wag: "tail wag",
      approach_user: "approach user",
      stay_near_user: "stay near user",
      play: "play",
      sit: "sit"
    },
    errors: {
      PROVIDER_NOT_CONFIGURED: "Provider is not configured. Add the required API key first.",
      THREE_D_DISABLED: "3D reconstruction is disabled; this app uses cached cartoon virtual pet avatars.",
      NO_ACCEPTED_MEDIA: "Upload accepted photos or videos first.",
      NO_RECONSTRUCTION_INPUT: "Upload a usable image or video frame first.",
      NO_MOTION_SOURCES: "Upload media before building an action atlas.",
      NO_AVATAR_INPUT: "Upload media before generating a virtual pet avatar.",
      INVALID_AVATAR_INPUT: "Virtual pet reference image must belong to this pet and pass validation.",
      PROVIDER_ERROR: "Image provider returned an error. Check provider configuration or model permissions.",
      unexpected: "Unexpected error"
    }
  }
};

export function getInitialLocale(): Locale {
  return defaultLocale;
}
