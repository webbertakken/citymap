import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SUBMODULE_DEPTH, SubmoduleReader } from "./submodules";
import { commit, git, repo, repoWith, removeRepos, write } from "./testing/repos";

afterEach(removeRepos);

/** A parent repository with `lib` added as a submodule at `vendor/lib`; the parent, the lib, and the lib's pin. */
function withSubmodule(path = "vendor/lib") {
  const lib = repoWith({ "src/a.ts": "a", "src/b.ts": "b" });
  const parent = repoWith({ "main.ts": "m" });
  git(parent, "submodule", "add", "-q", lib, path);
  commit(parent, "add lib");
  return { parent, lib, pin: git(lib, "rev-parse", "HEAD") };
}
const gitlinks = (dir: string) =>
  new Map(
    git(dir, "ls-tree", "-r", "HEAD")
      .split("\n")
      .filter((l) => l.startsWith("160000"))
      .map((l) => [l.split("\t")[1]!, l.split(" ")[2]!.split("\t")[0]!] as const),
  );
const gitmodules = (dir: string) => git(dir, "show", "HEAD:.gitmodules");

describe("SubmoduleReader", () => {
  it("reads an initialised submodule's pinned tree from .git/modules, under its folder", async () => {
    const { parent, pin } = withSubmodule();
    const expanded = await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent));
    const lib = expanded.get("vendor/lib")!;
    expect(lib.commit).toBe(pin);
    expect([...lib.files.keys()]).toEqual(["vendor/lib/src/a.ts", "vendor/lib/src/b.ts"]);
    expect(lib.submodules).toEqual(["vendor/lib"]);
    expect(lib.unread).toEqual([]);
  });

  it("reads a submodule whose working folder is gone from its git data", async () => {
    const { parent, pin } = withSubmodule();
    // The git data names the folder as its working tree; the reader does not need it.
    rmSync(join(parent, "vendor/lib"), { recursive: true, force: true });
    const lib = (await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent))).get("vendor/lib")!;
    expect(lib.commit).toBe(pin);
    expect([...lib.files.keys()]).toEqual(["vendor/lib/src/a.ts", "vendor/lib/src/b.ts"]);
    expect(lib.unread).toEqual([]);
  });

  it("lays a submodule without git data as one .gitlink file, its blob the pin", async () => {
    const { parent, pin } = withSubmodule();
    const clone = repo();
    git(clone, "pull", "-q", parent, "main");
    const lib = (await new SubmoduleReader(clone).expandAll(gitlinks(clone), gitmodules(clone))).get("vendor/lib")!;
    expect([...lib.files]).toEqual([["vendor/lib/.gitlink", pin]]);
    expect(lib.unread).toEqual([{ path: "vendor/lib", reason: "no-git-data" }]);
  });

  it("says when the pinned commit is not in the submodule's git data", async () => {
    const { parent } = withSubmodule();
    const missing = "1".repeat(40);
    const lib = (
      await new SubmoduleReader(parent).expandAll(new Map([["vendor/lib", missing]]), gitmodules(parent))
    ).get("vendor/lib")!;
    expect(lib.unread).toEqual([{ path: "vendor/lib", reason: "missing-commit" }]);
    expect([...lib.files]).toEqual([["vendor/lib/.gitlink", missing]]);
  });

  it("reads nested submodules from their parent's git data", async () => {
    const deep = repoWith({ "d.ts": "d" });
    const lib = repoWith({ "l.ts": "l" });
    git(lib, "submodule", "add", "-q", deep, "inner/deep");
    commit(lib, "add deep");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    git(parent, "submodule", "update", "-q", "--init", "--recursive");
    commit(parent, "add lib");
    const expanded = (await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent))).get(
      "vendor/lib",
    )!;
    expect([...expanded.files.keys()].toSorted()).toEqual([
      "vendor/lib/.gitmodules",
      "vendor/lib/inner/deep/d.ts",
      "vendor/lib/l.ts",
    ]);
    expect(expanded.submodules).toEqual(["vendor/lib", "vendor/lib/inner/deep"]);
  });

  it("reads a submodule whose git data is its own .git folder in the working tree", async () => {
    const lib = repoWith({ "x.ts": "x" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "clone", "-q", lib, "vendor/lib");
    write(parent, ".gitmodules", '[submodule "lib"]\n\tpath = vendor/lib\n\turl = ../lib\n');
    git(parent, "add", ".gitmodules", "vendor/lib");
    commit(parent, "embed");
    const found = (await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent))).get(
      "vendor/lib",
    )!;
    expect([...found.files.keys()]).toEqual(["vendor/lib/x.ts"]);
  });

  it("follows a .git file only to git data inside the repository", async () => {
    const { parent } = withSubmodule();
    const other = repoWith({ "y.ts": "y" });
    const reader = new SubmoduleReader(parent);
    // A gitlink named by no section takes its path as its name; here no modules/<name> exists, so its .git file decides.
    mkdirSync(join(parent, "vendor/far"), { recursive: true });
    writeFileSync(join(parent, "vendor/far/.git"), `gitdir: ${join(other, ".git")}\n`);
    const pin = git(other, "rev-parse", "HEAD");
    const far = (await reader.expandAll(new Map([["vendor/far", pin]]), null)).get("vendor/far")!;
    expect(far.unread).toEqual([{ path: "vendor/far", reason: "no-git-data" }]);
    writeFileSync(join(parent, "vendor/far/.git"), "not a gitdir line\n");
    const bad = (await new SubmoduleReader(parent).expandAll(new Map([["vendor/far", pin]]), null)).get("vendor/far")!;
    expect(bad.unread).toEqual([{ path: "vendor/far", reason: "no-git-data" }]);
    // Inside the repository, a .git file leads to the submodule's git data.
    const { pin: libPin } = { pin: gitlinks(parent).get("vendor/lib")! };
    writeFileSync(join(parent, "vendor/far/.git"), "gitdir: ../../.git/modules/vendor/lib\n");
    const near = (await new SubmoduleReader(parent).expandAll(new Map([["vendor/far", libPin]]), null)).get(
      "vendor/far",
    )!;
    expect([...near.files.keys()]).toEqual(["vendor/far/src/a.ts", "vendor/far/src/b.ts"]);
    // A gitdir that names no git data is none.
    writeFileSync(join(parent, "vendor/far/.git"), "gitdir: ../lib\n");
    const none = (await new SubmoduleReader(parent).expandAll(new Map([["vendor/far", libPin]]), null)).get(
      "vendor/far",
    )!;
    expect(none.unread[0]?.reason).toBe("no-git-data");
  });

  it("refuses names and paths that climb out, and nesting past the limit", async () => {
    const { parent, pin } = withSubmodule();
    const reader = new SubmoduleReader(parent);
    const evil = (
      await reader.expandAll(new Map([["vendor/lib", pin]]), '[submodule "../x"]\n path = vendor/lib\n')
    ).get("vendor/lib")!;
    expect(evil.unread).toEqual([{ path: "vendor/lib", reason: "bad-name" }]);
    const deep = await reader.expand(null, "vendor/lib", undefined, pin, SUBMODULE_DEPTH);
    expect(deep.unread).toEqual([{ path: "vendor/lib", reason: "depth" }]);
  });

  it("reads a pin once, however often it is asked for", async () => {
    const { parent, pin } = withSubmodule();
    const reader = new SubmoduleReader(parent);
    const first = await reader.expand(null, "vendor/lib", undefined, pin, 0);
    expect(await reader.expand(null, "vendor/lib", undefined, pin, 0)).toBe(first);
  });

  it("reads a nested submodule's .gitmodules as empty when its blob cannot be read", async () => {
    const deep = repoWith({ "d.ts": "d" });
    const lib = repoWith({ "l.ts": "l" });
    git(lib, "submodule", "add", "-q", deep, "inner");
    commit(lib, "add deep");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add lib");
    // Not initialised recursively: the nested one has no git data, and is named by its path.
    const found = (await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent))).get(
      "vendor/lib",
    )!;
    expect(found.unread).toEqual([{ path: "vendor/lib/inner", reason: "no-git-data" }]);
    expect(found.files.has("vendor/lib/inner/.gitlink")).toBe(true);
  });

  it("reads several gitlinks, and a nested .gitmodules it cannot read as naming none", async () => {
    const one = repoWith({ "o.ts": "o" });
    const two = repoWith({ "t.ts": "t" });
    const lib = repoWith({ "l.ts": "l" });
    git(lib, "submodule", "add", "-q", one, "b-one");
    git(lib, "submodule", "add", "-q", two, "a-two");
    commit(lib, "add two");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    git(parent, "submodule", "add", "-q", one, "vendor/one");
    commit(parent, "add both");
    // The lib's .gitmodules blob is gone from its git data (as in a blob-less clone).
    const blob = git(lib, "rev-parse", "HEAD:.gitmodules");
    const loose = join(parent, ".git/modules/vendor/lib/objects", blob.slice(0, 2), blob.slice(2));
    expect(existsSync(loose)).toBe(true);
    rmSync(loose);
    const expanded = await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent));
    expect([...expanded.keys()]).toEqual(["vendor/lib", "vendor/one"]);
    expect(expanded.get("vendor/lib")!.unread).toEqual([
      { path: "vendor/lib/a-two", reason: "no-git-data" },
      { path: "vendor/lib/b-one", reason: "no-git-data" },
    ]);
  });

  it("names a nested gitlink by its path when its submodule has no .gitmodules", async () => {
    const emb = repoWith({ "e.ts": "e" });
    const lib = repoWith({ "l.ts": "l" });
    git(lib, "clone", "-q", emb, "emb");
    git(lib, "add", "emb");
    commit(lib, "embed without gitmodules");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add lib");
    const found = (await new SubmoduleReader(parent).expandAll(gitlinks(parent), gitmodules(parent))).get(
      "vendor/lib",
    )!;
    expect(found.unread).toEqual([{ path: "vendor/lib/emb", reason: "no-git-data" }]);
  });
});
