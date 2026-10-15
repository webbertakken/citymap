import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";

const dir = mkdtempSync(join(tmpdir(), "citymap-blobs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();
git("init", "-q");

describe("BlobReader", () => {
  it("reads blobs in one pass, empty ones included, an absent one as null, and again after", async () => {
    writeFileSync(join(dir, "a"), "first\nline\n");
    writeFileSync(join(dir, "b"), "");
    const [a, b] = [git("hash-object", "-w", "a"), git("hash-object", "-w", "b")];
    const absent = "0".repeat(40);
    const reader = new BlobReader(dir);
    expect(await reader.readAll([a, absent, b])).toEqual(
      new Map([
        [a, "first\nline\n"],
        [absent, null],
        [b, ""],
      ]),
    );
    expect(await reader.readAll([])).toEqual(new Map());
    expect(await reader.readAll([b])).toEqual(new Map([[b, ""]]));
    await reader.close();
    await reader.close();
  });

  it("asks a fresh process for the blobs after one that ended it", async () => {
    // Outside a repository, git cat-file exits at once: every blob is unavailable, each after a fresh start.
    const nowhere = mkdtempSync(join(tmpdir(), "citymap-blobs-none-"));
    const reader = new BlobReader(nowhere);
    expect(await reader.readAll(["1".repeat(40), "2".repeat(40)])).toEqual(
      new Map([
        ["1".repeat(40), null],
        ["2".repeat(40), null],
      ]),
    );
    await reader.close();
    rmSync(nowhere, { recursive: true, force: true });
  });
});
