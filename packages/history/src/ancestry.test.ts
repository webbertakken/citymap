import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { countCommits, isAncestor, resolveCommit } from "./ancestry";
import { gitEnvironment } from "./env";

const dir = mkdtempSync(join(tmpdir(), "citymap-ancestry-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();
git("init", "-q", "-b", "main");
const commit = (name: string) => {
  writeFileSync(join(dir, name), name);
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", name);
  return git("rev-parse", "HEAD");
};
const first = commit("a");
const second = commit("b");
git("checkout", "-q", "-b", "side", first);
const side = commit("c");
git("checkout", "-q", "-b", "merged", second);
git("-c", "user.email=t@t", "-c", "user.name=t", "merge", "-q", "--no-ff", "side", "-m", "merge");
const merged = git("rev-parse", "HEAD");

describe("isAncestor", () => {
  it("tells whether one commit is in another's history", async () => {
    expect(await isAncestor(dir, first, second)).toBe(true);
    expect(await isAncestor(dir, second, second)).toBe(true);
    expect(await isAncestor(dir, side, second)).toBe(false);
  });

  it("rejects an unknown commit", async () => {
    await expect(isAncestor(dir, "f".repeat(40), second)).rejects.toThrow("history/git-failed");
  });
});

describe("git that cannot start", () => {
  it("is reported by name", async () => {
    const path = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(resolveCommit(dir, "main")).rejects.toThrow("history/git-failed: git rev-parse exited with -1");
    } finally {
      process.env.PATH = path;
    }
  });
});

describe("resolveCommit", () => {
  it("resolves a ref to its commit id", async () => {
    expect(await resolveCommit(dir, "main")).toBe(second);
    await expect(resolveCommit(dir, "no-such-ref")).rejects.toThrow("history/git-failed");
  });
});

describe("countCommits", () => {
  it("counts a commit's first-parent history, the commit included", async () => {
    expect(await countCommits(dir, first)).toBe(1);
    expect(await countCommits(dir, side)).toBe(2);
    expect(await countCommits(dir, merged)).toBe(3);
  });

  it("rejects an unknown commit", async () => {
    await expect(countCommits(dir, "f".repeat(40))).rejects.toThrow("history/git-failed: git rev-list exited with 128");
  });
});
