import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { listTree, readBlobs } from "./contents";
import { gitEnvironment } from "./env";
import { commit, commitIndex, git as gitIn, repoWith, removeRepos } from "./testing/repos";

const dir = mkdtempSync(join(tmpdir(), "citymap-contents-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(removeRepos);
const git = (...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();

const byBlob = (a: [string, number | null], b: [string, number | null]) => a[0].localeCompare(b[0]);

describe("listTree and readBlobs", () => {
  it("lists a commit's files, an unread submodule as its .gitlink, and reads each distinct blob once", async () => {
    git("init", "-q", "-b", "main");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/a.ts"), "same\n");
    writeFileSync(join(dir, "b.ts"), "same\n");
    writeFileSync(join(dir, "big.txt"), "x".repeat(300_000));
    git("add", "-A");
    git("update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendor/sub`);
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "one");
    const files = await listTree(dir, "HEAD");
    expect(files.map((f) => f.path)).toEqual(["b.ts", "big.txt", "src/a.ts", "vendor/sub/.gitlink"]);
    // No git data holds the unread submodule: its .gitlink is never asked for.
    expect(files.at(-1)).toEqual({ path: "vendor/sub/.gitlink", blob: "1".repeat(40), store: null });
    const seen: [string, number | null][] = [];
    await readBlobs(dir, [...files, { blob: "0".repeat(40) }], (blob, bytes) =>
      seen.push([blob, bytes?.length ?? null]),
    );
    const expected: [string, number | null][] = [
      [files[0]!.blob, 5],
      [files[1]!.blob, 300_000],
      ["0".repeat(40), null],
      ["1".repeat(40), null],
    ];
    expect(seen.toSorted(byBlob)).toEqual(expected.toSorted(byBlob));
  });

  it("lists a submodule's files at its pin, read from its own git data, nested ones in turn", async () => {
    const inner = repoWith({ "deep.ts": "deep\n" });
    const lib = repoWith({ "l.ts": "lib\nlib\n" });
    gitIn(lib, "submodule", "add", "-q", inner, "deps/inner");
    commit(lib, "nest");
    const parent = repoWith({ "main.ts": "m\n" });
    gitIn(parent, "submodule", "add", "-q", lib, "vendor/lib");
    gitIn(parent, "submodule", "update", "-q", "--init", "--recursive");
    commitIndex(parent, "add lib");
    const files = await listTree(parent, "HEAD");
    expect(files.map((f) => f.path)).toEqual([
      ".gitmodules",
      "main.ts",
      "vendor/lib/.gitmodules",
      "vendor/lib/l.ts",
      "vendor/lib/deps/inner/deep.ts",
    ]);
    const own = files.filter((f) => !f.path.startsWith("vendor/"));
    expect(own.every((f) => f.store === undefined)).toBe(true);
    const [libStore, innerStore] = [files[3]!.store, files[4]!.store];
    expect(libStore).toMatch(/modules\/vendor\/lib$/);
    expect(innerStore).toMatch(/modules\/vendor\/lib\/modules\/deps\/inner$/);
    // Each blob is read from the git data that holds it; the repository's own holds none of them.
    const read = new Map<string, number | null>();
    await readBlobs(parent, files, (blob, bytes) => read.set(blob, bytes?.length ?? null));
    expect(read.get(files[3]!.blob)).toBe(8);
    expect(read.get(files[4]!.blob)).toBe(5);
    expect(read.size).toBe(new Set(files.map((f) => f.blob)).size);
  });
});
