import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isAncestor, resolveCommit } from "./ancestry";

const dir = mkdtempSync(join(tmpdir(), "citymap-ancestry-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
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
