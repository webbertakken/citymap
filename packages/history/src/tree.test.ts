import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitEnvironment } from "./env";
import type { HistoryEvent } from "./read";
import { commit as commitRepo, removeRepos, repoWith } from "./testing/repos";
import { readTree } from "./tree";

const repos: string[] = [];
afterEach(() => {
  removeRepos();
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();
const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const commit = (dir: string, message: string) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-tree-"));
  repos.push(dir);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}

describe("readTree", () => {
  it("reads one commit's files as born together, with every folder, and its declared workspace members", async () => {
    const dir = repo();
    write(dir, "package.json", JSON.stringify({ workspaces: ["packages/*"] }));
    write(dir, "packages/a/index.ts", "a");
    write(dir, "packages/b/deep/index.ts", "b");
    const first = commit(dir, "first");
    write(dir, "later.ts", "l");
    commit(dir, "second");
    const snapshot = await readTree(dir, first, { repository: "demo" });
    expect(snapshot).toMatchObject({
      repository: "demo",
      commit: first,
      index: 0,
      workspaces: ["packages/a", "packages/b"],
    });
    expect(snapshot.files.map((f) => [f.path, f.identity, f.firstSeen])).toEqual([
      ["package.json", "package.json@0", 0],
      ["packages/a/index.ts", "packages/a/index.ts@0", 0],
      ["packages/b/deep/index.ts", "packages/b/deep/index.ts@0", 0],
    ]);
    expect([...snapshot.folderFirstSeen.keys()]).toEqual([
      "",
      "packages",
      "packages/a",
      "packages/b",
      "packages/b/deep",
    ]);
  });

  it("lays an unread submodule as its .gitlink file, leaves workspaces out when no manifest declares any, and names the repository after its folder", async () => {
    const dir = repo();
    write(dir, "src/x.ts", "x");
    write(dir, "package.json", JSON.stringify({ name: "solo" }));
    const base = commit(dir, "base");
    // A submodule is a commit recorded in the tree; staged directly, as no checkout of it exists here.
    git(dir, "update-index", "--add", "--cacheinfo", `160000,${base},vendor/lib`);
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "one");
    const sha = git(dir, "rev-parse", "HEAD");
    const events: HistoryEvent[] = [];
    const snapshot = await readTree(dir, sha, { onEvent: (e) => events.push(e) });
    expect(snapshot.files.map((f) => f.path)).toEqual(["package.json", "src/x.ts", "vendor/lib/.gitlink"]);
    expect(snapshot.submodules).toEqual(["vendor/lib"]);
    expect(snapshot.workspaces).toBeUndefined();
    expect(snapshot.repository).toMatch(/^citymap-tree-/);
    expect(events).toEqual([
      { code: "history/submodule-unavailable", detail: { path: "vendor/lib", index: 0, reason: "no-git-data" } },
    ]);
    // Without a listener the events go nowhere, and the tree reads the same.
    expect(await readTree(dir, sha)).toEqual(snapshot);
  });

  it("logs a manifest it cannot read, and rejects a path longer than the engine reads", async () => {
    const source = repo();
    write(source, "package.json", JSON.stringify({ workspaces: ["apps/*"] }));
    write(source, "apps/web/index.ts", "w");
    const sha = commit(source, "apps");
    git(source, "config", "uploadpack.allowFilter", "true");
    const clone = mkdtempSync(join(tmpdir(), "citymap-tree-clone-"));
    repos.push(clone);
    execFileSync("git", ["clone", "-q", "--filter=blob:none", "--no-checkout", `file://${source}`, clone], {
      env: gitEnvironment(),
    });
    // Offline: the manifest cannot be fetched either.
    git(clone, "remote", "set-url", "origin", join(clone, "gone"));
    const events: HistoryEvent[] = [];
    const snapshot = await readTree(clone, sha, { onEvent: (e) => events.push(e) });
    expect(snapshot.workspaces).toBeUndefined();
    expect(snapshot.manifests).toBe("unfetchable");
    expect(events).toEqual([
      {
        code: "history/manifests",
        detail: { status: "unfetchable", blobs: 1, fetched: 0, reason: "exit-128", error: expect.any(String) },
      },
      { code: "history/manifest-unavailable", detail: { path: "package.json", index: 0 } },
    ]);
    const long = repo();
    const blob = execFileSync("git", ["-C", long, "hash-object", "-w", "--stdin"], {
      input: "x",
      encoding: "utf8",
      env: gitEnvironment(),
    }).trim();
    git(long, "update-index", "--add", "--cacheinfo", `100644,${blob},${`${"d".repeat(200)}/`.repeat(21)}f.ts`);
    const tooLong = commit(long, "long");
    await expect(readTree(long, tooLong)).rejects.toThrow("snapshot/bad-path");
  });

  it("lays an initialised submodule's files at its pin, and says so", async () => {
    const lib = repoWith({ "src/l.ts": "l" });
    const dir = repoWith({ "a.ts": "a" });
    git(dir, "-c", "protocol.file.allow=always", "submodule", "add", "-q", lib, "vendor/lib");
    const sha = commitRepo(dir, "add lib");
    const events: HistoryEvent[] = [];
    const snapshot = await readTree(dir, sha, { onEvent: (e) => events.push(e) });
    expect(snapshot.files.map((f) => f.path)).toEqual([".gitmodules", "a.ts", "vendor/lib/src/l.ts"]);
    expect(snapshot.submodules).toEqual(["vendor/lib"]);
    expect(events).toEqual([{ code: "history/submodule", detail: { path: "vendor/lib", index: 0, files: 1 } }]);
  });
});
