import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = path.join(rootDir, "apps", "desktop");

function runOrThrow(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with code ${result.status ?? "unknown"}`);
  }
}

async function copyPreloads() {
  const srcDir = path.join(desktopDir, "src", "preload");
  const destDir = path.join(desktopDir, "dist", "preload");
  await mkdir(destDir, { recursive: true });
  await copyFile(path.join(srcDir, "runtime.cjs"), path.join(destDir, "runtime.cjs"));
  await copyFile(path.join(srcDir, "widget-webview.cjs"), path.join(destDir, "widget-webview.cjs"));
}

async function main() {
  runOrThrow("pnpm", ["--filter", "@localterm/desktop", "exec", "tsc", "-p", "tsconfig.json"]);
  await copyPreloads();
  console.log("[build-desktop] desktop dist prepared");
}

await main();
