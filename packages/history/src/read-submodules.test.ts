import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readHistory, type HistoryEvent } from "./read";
import type { Strides } from "./schedule";
import { Pins, SubmoduleReader } from "./submodules";
import { commit, commitIndex, git, repoWith, removeRepos, write } from "./testing/repos";

afterEach(removeRepos);

/** Small strides: windows of 4 below commit 4 of a 10-commit history, of 2 up to 8, then every commit. */
const SMALL: Strides = { tail: 2, window: 2, coarseAfter: 4, coarseWindow: 4, grain: 4 };

async function read(dir: string, options: { from?: number; strides?: Strides } = {}) {
  const events: HistoryEvent[] = [];
  const snaps = [];
  for await (const s of readHistory(dir, { ...options, onEvent: (e) => events.push(e) })) snaps.push(s);
  return { snaps, events };
}
const identities = (snap: { files: readonly { path: string; identity: string }[] } | undefined) =>
  Object.fromEntries((snap?.files ?? []).map((f) => [f.path, f.identity]));

/** Moves a parent's submodule at `path` to a commit of its lib, fetching it into the submodule first. */
function pin(parent: string, path: string, sha: string, message: string) {
  git(join(parent, path), "fetch", "-q", "origin");
  git(parent, "update-index", "--cacheinfo", `160000,${sha},${path}`);
  commitIndex(parent, message);
}

describe("readHistory with submodules", () => {
  it("lays a submodule's files at each pin, renames followed, births at the commit that laid them", async () => {
    const lib = repoWith({ "a.ts": "a", "b.ts": "b" });
    const first = git(lib, "rev-parse", "HEAD");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add lib");
    // The lib renames b.ts to c.ts unchanged, adds d.ts and deletes a.ts.
    git(lib, "mv", "b.ts", "c.ts");
    git(lib, "rm", "-q", "a.ts");
    write(lib, "d.ts", "d");
    const second = commit(lib, "move");
    pin(parent, "vendor/lib", second, "bump");
    const { snaps, events } = await read(parent);
    expect(snaps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(identities(snaps[1])).toEqual({
      ".gitmodules": ".gitmodules@1",
      "main.ts": "main.ts@0",
      "vendor/lib/a.ts": "vendor/lib/a.ts@1",
      "vendor/lib/b.ts": "vendor/lib/b.ts@1",
    });
    expect(identities(snaps[2])).toEqual({
      ".gitmodules": ".gitmodules@1",
      "main.ts": "main.ts@0",
      "vendor/lib/c.ts": "vendor/lib/b.ts@1",
      "vendor/lib/d.ts": "vendor/lib/d.ts@2",
    });
    expect(snaps[0]).not.toHaveProperty("submodules");
    expect(snaps[2]?.submodules).toEqual(["vendor/lib"]);
    // The same list while the submodules stay the same.
    expect(snaps[2]?.submodules).toBe(snaps[1]?.submodules);
    expect(snaps[2]?.folderFirstSeen.get("vendor/lib")).toBe(1);
    expect(events.filter((e) => e.code.startsWith("history/submodule"))).toEqual([
      { code: "history/submodule", detail: { path: "vendor/lib", index: 1, files: 2 } },
      { code: "history/submodule", detail: { path: "vendor/lib", index: 2, files: 2 } },
    ]);
    expect(first).not.toBe(second);
  });

  it("lays an unread submodule as its .gitlink file, its identity kept as the pin moves", async () => {
    const parent = repoWith({ "a.ts": "a" });
    const one = git(parent, "rev-parse", "HEAD");
    git(parent, "update-index", "--add", "--cacheinfo", `160000,${one},vendor/lib`);
    commitIndex(parent, "pin");
    write(parent, "b.ts", "b");
    git(parent, "add", "b.ts");
    const two = commitIndex(parent, "two");
    git(parent, "update-index", "--cacheinfo", `160000,${two},vendor/lib`);
    commitIndex(parent, "repin");
    const { snaps, events } = await read(parent);
    expect(identities(snaps[3])["vendor/lib/.gitlink"]).toBe("vendor/lib/.gitlink@1");
    expect(snaps[3]?.submodules).toEqual(["vendor/lib"]);
    expect(events).toContainEqual({
      code: "history/submodule-unavailable",
      detail: { path: "vendor/lib", index: 3, reason: "no-git-data" },
    });
    expect(events.some((e) => e.code === "history/submodule")).toBe(false);
  });

  it("clears a removed submodule's files, and lays a file that replaces a gitlink", async () => {
    const lib = repoWith({ "x.ts": "x" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add");
    git(parent, "rm", "-q", "--cached", "vendor/lib", ".gitmodules");
    commitIndex(parent, "drop");
    // A file where a gitlink stood, and a gitlink where a file stood.
    git(
      parent,
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${git(parent, "hash-object", "-w", "main.ts")},vendor/lib`,
    );
    git(parent, "update-index", "--cacheinfo", `160000,${git(lib, "rev-parse", "HEAD")},main.ts`);
    commitIndex(parent, "swap");
    const { snaps } = await read(parent);
    expect(Object.keys(identities(snaps[2]))).toEqual(["main.ts"]);
    expect(snaps[2]).not.toHaveProperty("submodules");
    expect(Object.keys(identities(snaps[3]))).toEqual(["main.ts/.gitlink", "vendor/lib"]);
    // With no .gitmodules, the gitlink at main.ts is named by its path; no git data lies there.
    expect(snaps[3]?.submodules).toEqual(["main.ts"]);
  });

  it("reads a pin moved several times inside a window once, at the window's end, and resumes the same", async () => {
    const lib = repoWith({ "v0.ts": "0" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add");
    const shas: string[] = [];
    for (let i = 1; i <= 8; i++) {
      write(lib, `v${i}.ts`, String(i));
      shas.push(commit(lib, `v${i}`));
      pin(parent, "vendor/lib", shas.at(-1)!, `bump ${i}`);
    }
    // Ten commits: laid at 3, 5, 7, 8 and 9.
    const whole = await read(parent, { strides: SMALL });
    expect(whole.snaps.map((s) => s.index)).toEqual([3, 5, 7, 8, 9]);
    const read3 = whole.events.filter((e) => e.code === "history/submodule").map((e) => e.detail.index);
    expect(read3).toEqual([3, 5, 7, 8, 9]);
    // v1 and v2 were born inside the first window, laid at its end.
    expect(identities(whole.snaps[0])["vendor/lib/v1.ts"]).toBe("vendor/lib/v1.ts@3");
    expect(identities(whole.snaps[0])["vendor/lib/v2.ts"]).toBe("vendor/lib/v2.ts@3");
    const resumed = await read(parent, { from: 7, strides: SMALL });
    expect(resumed.snaps.map((s) => s.index)).toEqual([7, 8, 9]);
    expect(resumed.snaps.at(-1)?.files).toEqual(whole.snaps.at(-1)?.files);
  });

  it("names submodules by their paths when .gitmodules cannot be read, as in a blob-less clone", async () => {
    const lib = repoWith({ "x.ts": "x" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    commit(parent, "add");
    const blob = git(parent, "rev-parse", "HEAD:.gitmodules");
    rmSync(join(parent, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    const { snaps } = await read(parent);
    expect(Object.keys(identities(snaps[1]))).toContain("vendor/lib/x.ts");
  });

  it("moves several pins in one commit, in path order", async () => {
    const one = repoWith({ "o.ts": "o" });
    const two = repoWith({ "t.ts": "t" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", one, "vendor/one");
    git(parent, "submodule", "add", "-q", two, "vendor/two");
    commit(parent, "add both");
    const { snaps, events } = await read(parent);
    expect(Object.keys(identities(snaps[1]))).toEqual([".gitmodules", "main.ts", "vendor/one/o.ts", "vendor/two/t.ts"]);
    expect(events.filter((e) => e.code === "history/submodule").map((e) => e.detail.path)).toEqual([
      "vendor/one",
      "vendor/two",
    ]);
  });
});

describe("Pins", () => {
  it("refuses to move a pin it was not prepared for", () => {
    const pins = new Pins(new SubmoduleReader("/nowhere"));
    pins.gitlinks.set("vendor/lib", "1".repeat(40));
    expect(() => pins.move(0, () => {})).toThrow("engine/invariant");
  });
});
