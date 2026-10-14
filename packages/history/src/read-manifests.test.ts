import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitEnvironment } from "./env";
import { readHistory, type HistoryEvent } from "./read";

const repos: string[] = [];
afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() });
const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const remove = (dir: string, path: string) => rmSync(join(dir, path));
const commit = (dir: string, message: string) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", message);
};
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-manifests-"));
  repos.push(dir);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}
const collect = async (dir: string, events?: HistoryEvent[], from?: number) => {
  const out = [];
  for await (const s of readHistory(dir, { from: from ?? 0, onEvent: (e) => events?.push(e) })) out.push(s);
  return out;
};

describe("readHistory workspaces", () => {
  it("lists the folders a root package.json declares, following it as it changes and goes", async () => {
    const dir = repo();
    write(dir, "src/index.ts", "x");
    commit(dir, "no manifest");
    write(dir, "package.json", JSON.stringify({ workspaces: ["packages/*", "!packages/skip"] }));
    write(dir, "packages/a/index.ts", "a");
    write(dir, "packages/skip/index.ts", "s");
    write(dir, "tools/t/index.ts", "t");
    commit(dir, "workspaces");
    write(dir, "packages/b/deep/index.ts", "b");
    commit(dir, "a new member");
    write(dir, "packages/b/deep/index.ts", "b2");
    commit(dir, "an edit, no folder changes");
    write(dir, "package.json", JSON.stringify({ workspaces: { packages: ["packages/*", "tools/*"] } }));
    commit(dir, "more patterns");
    remove(dir, "packages/a/index.ts");
    commit(dir, "a member goes");
    remove(dir, "package.json");
    commit(dir, "manifest goes");
    const snaps = await collect(dir);
    expect(snaps.map((s) => s.workspaces)).toEqual([
      undefined,
      ["packages/a"],
      ["packages/a", "packages/b"],
      ["packages/a", "packages/b"],
      ["packages/a", "packages/b", "packages/skip", "tools/t"],
      ["packages/b", "packages/skip", "tools/t"],
      undefined,
    ]);
  });

  it("joins the members of every root manifest, and ignores manifests below the root", async () => {
    const dir = repo();
    write(dir, "Cargo.toml", '[workspace]\nmembers = ["crates/*"]\n');
    write(dir, "go.work", "go 1.22\nuse ./cmd/tool\n");
    write(dir, "crates/x/src/lib.rs", "x");
    write(dir, "cmd/tool/main.go", "m");
    write(dir, "nested/package.json", JSON.stringify({ workspaces: ["nested/*"] }));
    write(dir, "nested/n/index.ts", "n");
    commit(dir, "polyglot");
    const [snap] = await collect(dir);
    expect(snap?.workspaces).toEqual(["cmd/tool", "crates/x"]);
  });

  it("leaves workspaces out while the root manifest declares none", async () => {
    const dir = repo();
    write(dir, "package.json", JSON.stringify({ name: "solo" }));
    write(dir, "packages/a/package.json", "{}");
    commit(dir, "one package");
    const [snap] = await collect(dir);
    expect(snap?.workspaces).toBeUndefined();
  });

  it("reads the manifest as it stands at the first commit yielded", async () => {
    const dir = repo();
    write(dir, "package.json", JSON.stringify({ workspaces: ["apps/*"] }));
    write(dir, "apps/web/index.ts", "w");
    commit(dir, "apps");
    write(dir, "README.md", "r");
    commit(dir, "readme");
    const snaps = await collect(dir, undefined, 1);
    expect(snaps.map((s) => [s.index, s.workspaces])).toEqual([[1, ["apps/web"]]]);
  });

  it("logs a manifest it cannot read, and keeps what it knew", async () => {
    const source = repo();
    write(source, "package.json", JSON.stringify({ workspaces: ["apps/*"] }));
    write(source, "apps/web/index.ts", "w");
    commit(source, "apps");
    write(source, "package.json", JSON.stringify({ workspaces: ["apps/*", "packages/*"] }));
    write(source, "packages/p/index.ts", "p");
    commit(source, "packages");
    // A blob-less clone with no checkout holds no blobs at all, and never fetches one.
    const clone = mkdtempSync(join(tmpdir(), "citymap-manifests-clone-"));
    repos.push(clone);
    git(source, "config", "uploadpack.allowFilter", "true");
    execFileSync("git", ["clone", "-q", "--filter=blob:none", "--no-checkout", `file://${source}`, clone], {
      env: gitEnvironment(),
    });
    // Only the first manifest is put back.
    write(clone, "first.json", JSON.stringify({ workspaces: ["apps/*"] }));
    git(clone, "hash-object", "-w", "first.json");
    const events: HistoryEvent[] = [];
    const snaps = await collect(clone, events);
    expect(snaps.map((s) => s.workspaces)).toEqual([["apps/web"], ["apps/web"]]);
    expect(events).toEqual([{ code: "history/manifest-unavailable", detail: { path: "package.json", index: 1 } }]);
  });
});
