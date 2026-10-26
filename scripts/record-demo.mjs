import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const output = path.resolve(process.env.DEMO_OUTPUT ?? ".artifacts/launch");
const baseURL = process.env.PET_TEST_URL ?? "http://127.0.0.1:5173";
const petName = process.env.PET_TEST_NAME ?? "coco";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const viewport = { width: 1600, height: 1100 };
const videoSize = { width: 960, height: 660 };
const context = await browser.newContext({ viewport, recordVideo: { dir: output, size: videoSize } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const events = [];
const requests = [];
const errors = [];
const started = Date.now();
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.method() === "POST") requests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
});
const mark = (name) => { events.push({ name, seconds: (Date.now() - started) / 1000 }); console.log(name); };
let stageBox;
let viewerBox;
try {
  await page.goto(baseURL);
  await page.locator(".pet-list button").filter({ hasText: new RegExp(`^${petName}`, "i") }).click();
  const stage = page.locator(".virtual-stage");
  await expect(stage).toBeVisible();
  await page.locator(".virtual-sprite").evaluate(async (element) => {
    const image = new Image(); image.src = getComputedStyle(element).backgroundImage.slice(5, -2); await image.decode();
  });
  stageBox = await stage.boundingBox();
  viewerBox = await page.locator(".viewer-column").boundingBox();
  mark("ready");
  await page.waitForTimeout(5000);
  mark("approach");
  await stage.click({ position: { x: stageBox.width - 20, y: stageBox.height * 0.65 } });
  await page.waitForTimeout(5000);
  mark("touch");
  await page.locator(".virtual-sprite").click({ force: true });
  await page.waitForTimeout(4500);
  mark("rest");
  await page.getByPlaceholder("呼唤或和宠物说话").fill("坐下休息");
  console.log("message filled");
  await page.locator(".planner-form button").click();
  console.log("message sent");
  await expect(page.locator(".plan-output")).toContainText("local");
  await page.waitForTimeout(6500);
  mark("english");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.waitForTimeout(4000);
  mark("end");
  if (errors.length || requests.some((r) => !r.path.endsWith("/interactions") || r.body.useProvider)) throw new Error("Demo incurred an unexpected request or browser error");
} finally {
  console.log("saving recording");
  await fs.writeFile(path.join(output, "recording.json"), JSON.stringify({ baseURL, petName, viewport, videoSize, stageBox, viewerBox, events, requests, errors }, null, 2));
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(output, "real-ui.webm"));
  await browser.close();
  await fs.writeFile(path.join(output, "recording.json"), JSON.stringify({ baseURL, petName, viewport, videoSize, stageBox, viewerBox, events, requests, errors }, null, 2));
}
console.log(JSON.stringify({ output, events, requests, errors }, null, 2));
