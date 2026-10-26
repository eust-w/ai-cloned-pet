import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PET_TEST_URL ?? "http://127.0.0.1:5173";
const petName = process.env.PET_TEST_NAME ?? "coco";
const output = path.resolve(process.env.PET_TEST_OUTPUT ?? ".artifacts/runtime");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
    const name = viewport.width > 1000 ? "desktop" : "mobile";
    const context = await browser.newContext({ viewport, ...(process.env.PET_RECORD_VIDEO === "1" ? { recordVideo: { dir: output, size: viewport } } : {}) });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") {
        mutations.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() });
      }
    });
    try {
      console.log(`${name}: load`);
      await page.goto(baseURL);
      await expect(page).toHaveTitle(/pet/i);
      await page.locator(".pet-list button").filter({ hasText: new RegExp(`^${petName}`, "i") }).click();
      const stage = page.locator(".virtual-stage");
      const sprite = page.locator(".virtual-sprite");
      await expect(stage).toBeVisible();
      await stage.scrollIntoViewIfNeeded();
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "中文", exact: true })).toBeVisible();
      const image = await sprite.evaluate(async (element) => {
        const url = getComputedStyle(element).backgroundImage.slice(5, -2);
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      });
      assert(image.width > 0 && image.height > 0, "Sprite asset must decode");
      const firstFrame = await sprite.evaluate((element) => element.style.backgroundPosition);
      await expect.poll(() => sprite.evaluate((element) => element.style.backgroundPosition)).not.toBe(firstFrame);
      await page.screenshot({ path: path.join(output, `${name}-initial.png`) });
      console.log(`${name}: move`);

      const stageBox = await stage.boundingBox();
      assert(stageBox);
      const readPosition = () => stage.evaluate((element) => ({
        x: parseFloat(element.style.getPropertyValue("--pet-x")),
        y: parseFloat(element.style.getPropertyValue("--pet-y"))
      }));
      const before = await readPosition();
      await stage.click({ position: { x: stageBox.width - 20, y: stageBox.height * 0.6 } });
      await expect.poll(async () => Math.hypot((await readPosition()).x - before.x, (await readPosition()).y - before.y)).toBeGreaterThan(15);
      await page.waitForTimeout(1700);
      const after = await readPosition();
      assert(Math.hypot(after.x - before.x, after.y - before.y) > 15, "Movement must persist, not reset after a transient frame");
      const anchorBox = await page.locator(".virtual-pet-anchor").boundingBox();
      assert(anchorBox && anchorBox.x >= stageBox.x && anchorBox.x + anchorBox.width <= stageBox.x + stageBox.width, "Pet must stay within stage");
      // Observe transient feedback even if a busy machine delays the next poll.
      await stage.evaluate((element) => {
        element.dataset.touchObserved = "false";
        const observer = new MutationObserver(() => {
          if (element.querySelector(".virtual-spark")) { element.dataset.touchObserved = "true"; observer.disconnect(); }
        });
        observer.observe(element, { childList: true });
      });
      await sprite.click({ force: true });
      await expect(stage).toHaveAttribute("data-touch-observed", "true");
      await page.screenshot({ path: path.join(output, `${name}-touch.png`) });
      console.log(`${name}: rest`);

      const input = page.getByPlaceholder("呼唤或和宠物说话");
      await expect(page.getByRole("checkbox", { name: "LLM", exact: true })).not.toBeChecked();
      await input.fill("坐下休息");
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/interactions") && response.request().method() === "POST");
      await stage.evaluate((element) => {
        let previous = { x: parseFloat(element.style.getPropertyValue("--pet-x")), y: parseFloat(element.style.getPropertyValue("--pet-y")), time: performance.now() };
        element.dataset.unexpectedJump = "0";
        const observer = new MutationObserver(() => {
          const current = { x: parseFloat(element.style.getPropertyValue("--pet-x")), y: parseFloat(element.style.getPropertyValue("--pet-y")), time: performance.now() };
          const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
          const allowance = (current.time - previous.time) / 1000 * 150 + 8;
          element.dataset.unexpectedJump = String(Math.max(Number(element.dataset.unexpectedJump), distance - allowance));
          previous = current;
        });
        observer.observe(element, { attributes: true, attributeFilter: ["style"] });
        setTimeout(() => observer.disconnect(), 15000);
      });
      await page.locator(".planner-form button").click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const payload = await response.json();
      assert.equal(payload.provider, "local");
      await expect(page.locator(".plan-output")).toContainText("local");
      await stage.scrollIntoViewIfNeeded();
      await expect(sprite).toHaveAttribute("aria-label", "坐下");
      const restAfter = await readPosition();
      assert.equal(await stage.getAttribute("data-unexpected-jump"), "0", "A command must not teleport the pet");
      await page.waitForTimeout(4200);
      const rested = await readPosition();
      assert(Math.hypot(rested.x - restAfter.x, rested.y - restAfter.y) < 2, "Rest must suspend autonomous travel");
      await page.screenshot({ path: path.join(output, `${name}-rest.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `Horizontal page overflow: ${overflow}px`);
      await page.getByRole("button", { name: "EN", exact: true }).click();
      await expect(page.getByPlaceholder("Call or talk to the pet")).toBeVisible();
      assert.equal(mutations.length, 1, "Playback/touch must not generate assets or invoke paid endpoints");
      assert.equal(mutations[0].body.useProvider, false);
      assert.deepEqual(errors, [], "No browser runtime errors");
      console.log(`${name}: passed`);
      results.push({ name, viewport, image, before, after, restAfter, rested, overflow, mutations, errors, passed: true });
    } finally {
      const video = page.video();
      await context.close();
      if (video) await video.saveAs(path.join(output, `${name}-real-interaction.webm`));
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify({ recordedAt: new Date().toISOString(), baseURL, petName, browser: "Playwright Chromium; Browser plugin not available", results }, null, 2));
}
console.log(JSON.stringify({ passed: results.length === 2, output, results }, null, 2));
