import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const startupScript = join(repositoryRoot, ".devcontainer", "start-codespace.sh");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

describe("Codespaces one-click launch", () => {
  test("uses reproducible installation and opens the Wrestling Sim preview", () => {
    const config = JSON.parse(readFileSync(join(repositoryRoot, ".devcontainer", "devcontainer.json"), "utf8")) as {
      name?: string;
      postCreateCommand?: string;
      postStartCommand?: string;
      portsAttributes?: Record<string, { label?: string; onAutoForward?: string }>;
    };

    expect(config.name).toBe("Wrestling Sim");
    expect(config.postCreateCommand).toBe("npm ci --no-audit --no-fund");
    expect(config.postStartCommand).toContain("start-codespace.sh");
    expect(config.portsAttributes?.["5173"]).toEqual({ label: "Wrestling Sim", onAutoForward: "openPreview" });
    expect(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8")).toContain('"lockfileVersion": 3');
  });

  test("updates a clean main checkout but preserves a modified checkout", () => {
    const fixture = mkdtempSync(join(tmpdir(), "wrestling-sim-codespaces-"));
    const remote = join(fixture, "remote.git");
    const seed = join(fixture, "seed");
    const checkout = join(fixture, "checkout");
    mkdirSync(seed);
    git(fixture, "init", "--bare", remote);
    git(seed, "init", "--initial-branch=main");
    git(seed, "config", "user.name", "Wrestling Sim Test");
    git(seed, "config", "user.email", "test@example.com");
    writeFileSync(join(seed, "package-lock.json"), "{}\n");
    writeFileSync(join(seed, "version.txt"), "first\n");
    git(seed, "add", ".");
    git(seed, "commit", "-m", "First version");
    git(seed, "remote", "add", "origin", remote);
    git(seed, "push", "-u", "origin", "main");
    git(fixture, "clone", "--branch", "main", remote, checkout);

    writeFileSync(join(seed, "version.txt"), "second\n");
    git(seed, "add", "version.txt");
    git(seed, "commit", "-m", "Second version");
    git(seed, "push", "origin", "main");
    execFileSync("bash", [startupScript], {
      cwd: checkout,
      env: { ...process.env, WRESTLING_SIM_SKIP_DEPENDENCY_INSTALL: "1", WRESTLING_SIM_SKIP_SERVER: "1" },
    });
    expect(readFileSync(join(checkout, "version.txt"), "utf8")).toBe("second\n");

    writeFileSync(join(checkout, "version.txt"), "my local work\n");
    writeFileSync(join(seed, "version.txt"), "third\n");
    git(seed, "add", "version.txt");
    git(seed, "commit", "-m", "Third version");
    git(seed, "push", "origin", "main");
    const headBefore = git(checkout, "rev-parse", "HEAD");
    execFileSync("bash", [startupScript], {
      cwd: checkout,
      env: { ...process.env, WRESTLING_SIM_SKIP_DEPENDENCY_INSTALL: "1", WRESTLING_SIM_SKIP_SERVER: "1" },
    });

    expect(git(checkout, "rev-parse", "HEAD")).toBe(headBefore);
    expect(readFileSync(join(checkout, "version.txt"), "utf8")).toBe("my local work\n");
  });
});
