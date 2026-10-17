import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { listTree, readBlobs } from "./contents";
import { gitEnvironment } from "./env";

const dir = mkdtempSync(join(tmpdir(), "citymap-contents-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();

const byBlob = (a: [string, number | null], b: [string, number | null]) => a[0].localeCompare(b[0]);

describe("listTree and readBlobs", () => {
  it("lists a commit's files without submodules, and reads each distinct blob once", async () => {
    git("init", "-q", "-b", "main");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/a.ts"), "same\n");
    writeFileSync(join(dir, "b.ts"), "same\n");
    writeFileSync(join(dir, "big.txt"), "x".repeat(300_000));
    git("add", "-A");
    git("update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendor/sub`);
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "one");
    const files = await listTree(dir, "HEAD");
    expect(files.map((f) => f.path)).toEqual(["b.ts", "big.txt", "src/a.ts"]);
    const seen: [string, number | null][] = [];
    await readBlobs(dir, [...files.map((f) => f.blob), "0".repeat(40)], (blob, bytes) =>
      seen.push([blob, bytes?.length ?? null]),
    );
    const expected: [string, number | null][] = [
      [files[0]!.blob, 5],
      [files[1]!.blob, 300_000],
      ["0".repeat(40), null],
    ];
    expect(seen.toSorted(byBlob)).toEqual(expected.toSorted(byBlob));
  });
});
