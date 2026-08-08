import { execFileSync } from "node:child_process";
import { defineConfig } from "vitest/config";

function gitOutput(args: string[], fallback: string): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildCommit = (process.env.GITHUB_SHA || gitOutput(["rev-parse", "--short", "HEAD"], "unknown")).slice(0, 7);
const buildHasChanges = gitOutput(["status", "--porcelain"], "") !== "";

export default defineConfig({
  define: {
    __APP_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __APP_BUILD_HAS_CHANGES__: JSON.stringify(buildHasChanges),
    __APP_RELEASE_LABEL__: JSON.stringify("Phase 6B21"),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  optimizeDeps: {
    include: ["buffer", "mdb-reader"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
