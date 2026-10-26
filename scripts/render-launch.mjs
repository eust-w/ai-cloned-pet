import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const dir = path.resolve(process.env.DEMO_OUTPUT ?? ".artifacts/launch");
const photo = process.env.DEMO_PHOTO;
if (!photo) throw new Error("Set DEMO_PHOTO to an approved local pet photo. This script never uploads it.");
const recording = JSON.parse(await fs.readFile(path.join(dir, "recording.json"), "utf8"));
if (recording.errors.length) throw new Error("Refusing a recording with application errors");
const events = Object.fromEntries(recording.events.map((event) => [event.name, event.seconds]));
const scenes = [
  { duration: 5, title: "这只 Coco，来屏幕里陪我了", subtitle: "真实宠物照片 → 卡通伙伴", note: "ALPHA · 真实照片 / 已有生成资产", source: "photo" },
  { duration: 5, title: "点击空白处，它会靠近", subtitle: "浏览器实际操作 · 原速录屏", source: "video", start: events.approach, crop: true },
  { duration: 4.5, title: "碰一碰，会有即时反馈", subtitle: "鼠标 / 触摸驱动本地状态", source: "video", start: events.touch, crop: true },
  { duration: 8, title: "说一句：坐下休息", subtitle: "这条指令用本地规则，不调用 LLM", source: "video", start: events.rest },
  { duration: 4, title: "中文默认，也支持英文", subtitle: "生成后复用资产，不重复生成", source: "video", start: events.english },
  { duration: 6, title: "不是 3D，也不是真实性格克隆", subtitle: "当前：9 张姿态图 + 变换补帧", note: "图像生成 / 可选 LLM 仍可能收费", source: "summary" },
  { duration: 6, title: "AI Cloned Pet", subtitle: "开源 Alpha · 动作连贯性仍在打磨", note: "github.com/eust-w/ai-cloned-pet", source: "summary" }
];
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-threads", "2", ...args], { stdio: "inherit", timeout: 240000 });

for (const [format, width, height] of [["landscape", 1920, 1080], ["portrait", 1080, 1920]]) {
  const portrait = format === "portrait";
  const paths = [];
  for (const [index, scene] of scenes.entries()) {
    const work = path.join(dir, `${format}-${index}`);
    const titleSize = portrait ? 50 : 58;
    const titleY = scene.source === "summary" ? height * 0.4 : portrait ? 205 : 120;
    const subtitleY = scene.source === "summary" ? height * 0.53 : height - (portrait ? 320 : 140);
    const noteY = scene.source === "summary" ? height * 0.66 : height - (portrait ? 220 : 70);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <g font-family="PingFang SC, Noto Sans CJK SC, sans-serif" text-anchor="middle">
        <text x="${width / 2}" y="${portrait ? 115 : 53}" font-size="${portrait ? 28 : 26}" fill="#14766b">AI CLONED PET / ALPHA</text>
        <text x="${width / 2}" y="${titleY}" font-size="${titleSize}" font-weight="700" fill="#1b2327">${escape(scene.title)}</text>
        <text x="${width / 2}" y="${subtitleY}" font-size="${portrait ? 36 : 38}" fill="#223b3b">${escape(scene.subtitle)}</text>
        <text x="${width / 2}" y="${noteY}" font-size="${portrait ? 30 : 28}" fill="#76547a">${escape(scene.note ?? "本地实录 · 生成形象含 AI 内容")}</text>
      </g></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`${work}.png`);
    const inputs = ["-f", "lavfi", "-i", `color=c=0xf3f7f6:s=${width}x${height}:r=30:d=${scene.duration}`];
    let mediaFilter = "";
    let overlayIndex = 1;
    const mediaTop = portrait ? 330 : 165;
    const mediaW = portrait ? 940 : 1420;
    const mediaH = portrait ? 1120 : 710;
    if (scene.source !== "summary") {
      if (scene.source === "photo") inputs.push("-loop", "1", "-i", path.resolve(photo));
      else inputs.push("-ss", String(scene.start), "-i", path.join(dir, "real-ui.webm"));
      const ratio = (recording.videoSize?.width ?? recording.viewport.width) / recording.viewport.width;
      const scaledBox = (box) => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, value * ratio]));
      const box = scaledBox(recording.stageBox);
      const viewer = scaledBox(recording.viewerBox);
      const crop = scene.crop ? `crop=${Math.floor(box.width / 2) * 2}:${Math.floor(box.height / 2) * 2}:${Math.floor(box.x)}:${Math.floor(box.y)},` : "";
      const mobileCrop = portrait && scene.source === "video" && !scene.crop ? `crop=${Math.floor(viewer.width / 2) * 2}:${Math.floor(1000 * ratio)}:${Math.floor(viewer.x)}:${Math.floor(90 * ratio)},` : "";
      mediaFilter = `[1:v]${crop || mobileCrop}scale=${mediaW}:${mediaH}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[m];[0:v][m]overlay=(W-w)/2:${mediaTop}+( ${mediaH}-h)/2:shortest=1[base];`;
      overlayIndex = 2;
    }
    inputs.push("-loop", "1", "-i", `${work}.png`);
    const filter = `${mediaFilter}[${mediaFilter ? "base" : "0:v"}][${overlayIndex}:v]overlay=0:0:shortest=1,format=yuv420p[v]`;
    const target = `${work}.mp4`;
    run([...inputs, "-filter_complex_threads", "1", "-filter_complex", filter, "-map", "[v]", "-t", String(scene.duration), "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-an", target]);
    paths.push(target);
  }
  const concatPath = path.join(dir, `${format}-concat.txt`);
  await fs.writeFile(concatPath, paths.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  run(["-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", "-movflags", "+faststart", path.join(dir, `ai-cloned-pet-${format}.mp4`)]);
}
let time = 0;
const srtTime = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23).replace(".", ",");
await fs.writeFile(path.join(dir, "captions.zh-CN.srt"), scenes.map((scene, index) => {
  const start = time; time += scene.duration;
  return `${index + 1}\n${srtTime(start)} --> ${srtTime(time)}\n${scene.title}\n${scene.subtitle}\n`;
}).join("\n"));
await fs.writeFile(path.join(dir, "edit-manifest.json"), JSON.stringify({ scenes, duration: time, audio: "None: captioned preview", source: "Live local app recording; existing generated Coco assets", output: ["ai-cloned-pet-landscape.mp4", "ai-cloned-pet-portrait.mp4"] }, null, 2));
console.log(`Rendered ${time}s captioned videos in ${dir}`);
