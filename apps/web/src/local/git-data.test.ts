import { describe, expect, it } from "vitest";
import { listedFolder } from "./folder";
import { findGit, headCommit, objectIdBytes } from "./git-data";
import { listedFiles, type Tree } from "./testing/folders";

const A = "a".repeat(40);
const B = "b".repeat(40);
const folder = (tree: Tree) => listedFolder(listedFiles("repo", { "README.md": "#", ...tree }));

describe("findGit", () => {
  it("finds a .git folder", async () => {
    expect(await findGit(folder({ ".git": { HEAD: "ref: refs/heads/main" } }))).toEqual({ dir: ".git", idBytes: 20 });
  });

  it("reads the object format from the config", async () => {
    const sha256 = { HEAD: "x", config: "[core]\n\tbare = false\n[Extensions]\n\tobjectFormat = SHA256\n" };
    expect(await findGit(folder({ ".git": sha256 }))).toEqual({ dir: ".git", idBytes: 32 });
    const elsewhere = { HEAD: "x", config: "[core]\n\tobjectformat = sha256\n[extensions]\n\tworktreeConfig = true\n" };
    expect(await findGit(folder({ ".git": elsewhere }))).toEqual({ dir: ".git", idBytes: 20 });
  });

  it("follows a .git file to git data inside the folder", async () => {
    const inside = folder({ ".git": "gitdir: ./meta/../store\n", store: { HEAD: "x" } });
    expect(await findGit(inside)).toEqual({ dir: "store", idBytes: 20 });
  });

  it.each([
    ["a linked worktree", "gitdir: /home/me/repo/.git/worktrees/feature\n"],
    ["a submodule", "gitdir: ../.git/modules/sub\n"],
    ["a Windows path", "gitdir: C:/src/repo/.git/worktrees/x\n"],
  ])("refuses %s whose git data lies outside", async (_, text) => {
    await expect(findGit(folder({ ".git": text }))).rejects.toMatchObject({ code: "local/outside" });
  });

  it("refuses a .git file that does not say where", async () => {
    await expect(findGit(folder({ ".git": "nonsense\n" }))).rejects.toMatchObject({ code: "local/bad-git-file" });
  });

  it("refuses git's own data: a bare repository or a .git folder", async () => {
    const bare = folder({ HEAD: "ref: refs/heads/main", objects: { pack: { p: "" } }, refs: { heads: { main: A } } });
    await expect(findGit(bare)).rejects.toMatchObject({ code: "local/no-working-tree" });
  });

  it("is null for a folder without git, even one with a HEAD file", async () => {
    expect(await findGit(folder({ src: { "a.ts": "" } }))).toBeNull();
    expect(await findGit(folder({ HEAD: "notes", objects: { o: "" } }))).toBeNull();
  });
});

describe("objectIdBytes", () => {
  it("is 20 without a config", async () => {
    expect(await objectIdBytes(folder({ ".git": { HEAD: "x" } }), ".git")).toBe(20);
  });
});

const git = (tree: Tree) => headCommit(folder({ ".git": tree }), ".git");

describe("headCommit", () => {
  it("reads a detached HEAD, a loose ref, and a packed one", async () => {
    expect(await git({ HEAD: `${A}\n` })).toEqual({ commit: A, how: "detached" });
    expect(await git({ HEAD: "ref: refs/heads/main\n", refs: { heads: { main: `${B}\n` } } })).toEqual({
      commit: B,
      how: "ref",
    });
    const packed = `# pack-refs with: peeled fully-peeled sorted\n${A} refs/heads/other\n${B} refs/heads/main\n^${A}\n`;
    expect(await git({ HEAD: "ref: refs/heads/main\n", "packed-refs": packed })).toEqual({ commit: B, how: "packed" });
  });

  it("reads a SHA-256 commit", async () => {
    const long = "c".repeat(64);
    expect(await git({ HEAD: `${long}\n` })).toEqual({ commit: long, how: "detached" });
  });

  it("lays an unborn branch, a reftable or no HEAD as the worktree", async () => {
    const worktree = { commit: "worktree", how: "none" };
    expect(await git({ HEAD: "ref: refs/heads/main\n" })).toEqual(worktree);
    expect(await git({ HEAD: "ref: refs/heads/.invalid\n", reftable: { "tables.list": "" } })).toEqual(worktree);
    expect(await git({ index: "" })).toEqual(worktree);
    expect(await git({ HEAD: "ref: ../../outside\n" })).toEqual(worktree);
    expect(await git({ HEAD: "ref: refs/heads/main\n", refs: { heads: { main: "not a commit\n" } } })).toEqual(
      worktree,
    );
  });
});
