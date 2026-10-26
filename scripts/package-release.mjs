import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const output = path.resolve(process.env.RELEASE_OUTPUT ?? ".artifacts/releases", new Date().toISOString().replace(/[:.]/g, "-"));
const folderName = `${manifest.name}-${manifest.version}-source`;
const stage = path.join(output, folderName);
const allowlist = ["src", "tests", "scripts", "docs", ".github", ".gitignore", ".env.example", ".nvmrc", "README.md", "README.zh-CN.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md", "package.json", "package-lock.json", "eslint.config.js", "index.html", "tsconfig.json", "tsconfig.client.json", "tsconfig.server.json", "vite.config.ts", "vitest.config.ts"];
await fs.mkdir(stage, { recursive: true });
for (const entry of allowlist) {
  await fs.cp(path.join(root, entry), path.join(stage, entry), {
    recursive: true,
    filter: async (source) => {
      const stat = await fs.lstat(source);
      if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${path.relative(root, source)}`);
      const name = path.basename(source);
      if (name === ".env" || name.startsWith(".env.") && name !== ".env.example" || /\.(sqlite|webp|mp4|mov|jpg|png)$/i.test(name)) {
        throw new Error(`Unexpected private/binary asset: ${path.relative(root, source)}`);
      }
      return true;
    }
  });
}
// Fail closed: packaging is not considered safe if the scanner is unavailable.
execFileSync("gitleaks", ["dir", stage, "--redact", "--no-banner", "--log-level", "error"], { stdio: "inherit" });
const archive = path.join(output, `${folderName}.tar.gz`);
execFileSync("tar", ["-czf", archive, "-C", output, folderName]);
const sha256 = createHash("sha256").update(await fs.readFile(archive)).digest("hex");
await fs.writeFile(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
console.log(JSON.stringify({ stage, archive, sha256 }, null, 2));
