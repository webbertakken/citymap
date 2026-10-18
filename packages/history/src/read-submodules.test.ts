import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlobReader } from "./blobs";
import { parseRawLog, readHistory, type HistoryEvent } from "./read";
import type { Strides } from "./schedule";
import { Pins, SubmoduleReader, gitmodulesAfter } from "./submodules";
import { commit, commitIndex, git, repo, repoWith, removeRepos, write } from "./testing/repos";

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
  it("folds a blob-less clone that does not hold its .gitmodules, and reads every pin whatever it says to ignore", async () => {
    const lib = repoWith({ "a.ts": "a" });
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", lib, "vendor/lib");
    // A .gitmodules that would have git leave the submodule's changes out of every diff.
    git(parent, "config", "-f", ".gitmodules", "submodule.vendor/lib.ignore", "all");
    git(parent, "add", ".gitmodules");
    commit(parent, "add lib");
    write(lib, "b.ts", "b");
    pin(parent, "vendor/lib", commit(lib, "more"), "bump");
    const whole = await read(parent);
    expect(whole.snaps.at(-1)?.files.map((f) => f.path)).toContain("vendor/lib/b.ts");
    // A blob-less clone without a checkout holds no .gitmodules blob, and never fetches one.
    git(parent, "config", "uploadpack.allowFilter", "true");
    const clone = repo("citymap-partial-");
    rmSync(clone, { recursive: true, force: true });
    git(tmpdir(), "clone", "-q", "--no-checkout", "--filter=blob:none", `file://${parent}`, clone);
    const partial = await read(clone);
    expect(partial.snaps.map((s) => s.commit)).toEqual(whole.snaps.map((s) => s.commit));
    expect(partial.snaps.at(-1)?.files.map((f) => f.path)).toEqual(
      ["main.ts", ".gitmodules", "vendor/lib/.gitlink"].toSorted(),
    );
  });

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

/** The parent's first-parent history as raw commits, as `readHistory` parses git's log. */
const rawLog = (dir: string) => [
  ...parseRawLog(
    git(
      dir,
      "log",
      "--first-parent",
      "--reverse",
      "--raw",
      "-z",
      "--no-renames",
      "--no-abbrev",
      "--format=%x01%H",
      "HEAD",
      "--",
    ).split("\u0000"),
  ),
];

/**
 * A parent whose submodule `vendor/lib` (git data in `.git/modules/one`, no working tree) is pinned at A, moved to B,
 * then back to A while `.gitmodules` renames it `two`, a name with no git data.
 */
function renamed() {
  const lib = repoWith({ "a.ts": "a" });
  const a = git(lib, "rev-parse", "HEAD");
  write(lib, "b.ts", "b");
  const b = commit(lib, "b");
  const parent = repoWith({ "main.ts": "m" });
  git(parent, "submodule", "add", "-q", "--name", "one", lib, "vendor/lib");
  git(parent, "update-index", "--cacheinfo", `160000,${a},vendor/lib`);
  commitIndex(parent, "add at a");
  git(parent, "update-index", "--cacheinfo", `160000,${b},vendor/lib`);
  commitIndex(parent, "to b");
  write(parent, ".gitmodules", `[submodule "two"]\n\tpath = vendor/lib\n\turl = ${lib}\n`);
  git(parent, "add", ".gitmodules");
  git(parent, "update-index", "--cacheinfo", `160000,${a},vendor/lib`);
  commitIndex(parent, "rename, back to a");
  rmSync(join(parent, "vendor/lib"), { recursive: true, force: true });
  return parent;
}

/** The pin of `vendor/lib` moved, as a raw entry. */
const link = (commitId: string) => ({ mode: "160000", blob: commitId, status: "M", path: "vendor/lib" });
const noTexts = () => Promise.resolve(new Map<string, string | null>());
const rawEntry = (path: string, mode: string, status: string) => ({ path, mode, status, blob: "x" });

/** What `move` says at each commit when the log is handed to `prepare` in the given chunks, as `readHistory` applies it. */
async function movesIn(dir: string, sizes: readonly number[]) {
  const commits = rawLog(dir);
  const pins = new Pins(new SubmoduleReader(dir));
  const blobs = new BlobReader(dir);
  const out: unknown[] = [];
  let names: string | null = null;
  const firsts = sizes.map((_, i) => sizes.slice(0, i).reduce((sum, n) => sum + n, 0));
  // Chunk after chunk, as the reader hands them over: each prepared, then its commits applied and moved in order.
  await firsts.reduce(async (done, first, i) => {
    await done;
    const chunk = commits.slice(first, first + sizes[i]!);
    await pins.prepare(
      chunk,
      first,
      () => true,
      names,
      (b) => blobs.readAll(b),
    );
    chunk.forEach((c, at) => {
      for (const entry of c.entries) {
        names = gitmodulesAfter(entry, names);
        if (entry.status === "D") pins.gitlinks.delete(entry.path);
        else if (entry.mode === "160000") pins.gitlinks.set(entry.path, entry.blob);
        else pins.gitlinks.delete(entry.path);
      }
      const events: unknown[] = [];
      out.push({ changes: pins.move(first + at, names, (e) => events.push(e)), events });
    });
  }, Promise.resolve());
  await blobs.close();
  expect(pins.held.ready).toBe(0);
  return out;
}

describe("readHistory with a renamed submodule", () => {
  it("names each reading by the .gitmodules in force at its own commit", async () => {
    const { events } = await read(renamed());
    expect(events.filter((e) => e.code.startsWith("history/submodule"))).toEqual([
      { code: "history/submodule", detail: { path: "vendor/lib", index: 1, files: 1 } },
      { code: "history/submodule", detail: { path: "vendor/lib", index: 2, files: 2 } },
      { code: "history/submodule-unavailable", detail: { path: "vendor/lib", index: 3, reason: "no-git-data" } },
    ]);
  });

  it("reads the same whatever the chunks the log arrives in", async () => {
    const dir = renamed();
    const whole = await movesIn(dir, [4]);
    expect(await movesIn(dir, [1, 1, 1, 1])).toEqual(whole);
    expect(await movesIn(dir, [2, 2])).toEqual(whole);
    expect(await movesIn(dir, [1, 3])).toEqual(whole);
  });

  it("names nothing by a .gitmodules that is a gitlink", async () => {
    const lib = repoWith({ "a.ts": "a" });
    const a = git(lib, "rev-parse", "HEAD");
    write(lib, "b.ts", "b");
    const b = commit(lib, "b");
    const parent = repoWith({ "main.ts": "m" });
    git(parent, "submodule", "add", "-q", "--name", "custom", lib, "vendor/lib");
    git(parent, "update-index", "--cacheinfo", `160000,${a},vendor/lib`);
    commitIndex(parent, "add at a");
    git(parent, "rm", "-q", "--cached", ".gitmodules");
    git(parent, "update-index", "--add", "--cacheinfo", `160000,${a},.gitmodules`);
    git(parent, "update-index", "--cacheinfo", `160000,${b},vendor/lib`);
    commitIndex(parent, "gitmodules as a gitlink");
    rmSync(join(parent, "vendor/lib"), { recursive: true, force: true });
    const { snaps, events } = await read(parent);
    // Named custom by the file at 1; named by its path, with no git data there, once .gitmodules is a gitlink.
    expect(events.filter((e) => e.code.startsWith("history/submodule"))).toEqual([
      { code: "history/submodule", detail: { path: "vendor/lib", index: 1, files: 1 } },
      { code: "history/submodule-unavailable", detail: { path: ".gitmodules", index: 2, reason: "no-git-data" } },
      { code: "history/submodule-unavailable", detail: { path: "vendor/lib", index: 2, reason: "no-git-data" } },
    ]);
    expect(Object.keys(identities(snaps[2]))).toEqual([".gitmodules/.gitlink", "main.ts", "vendor/lib/.gitlink"]);
  });
});

describe("gitmodulesAfter", () => {
  it("follows the .gitmodules file, and takes a gitlink there for no file", () => {
    expect(gitmodulesAfter(rawEntry(".gitmodules", "100644", "M"), "w")).toBe("x");
    expect(gitmodulesAfter(rawEntry(".gitmodules", "100644", "D"), "w")).toBeNull();
    expect(gitmodulesAfter(rawEntry(".gitmodules", "160000", "A"), "w")).toBeNull();
    expect(gitmodulesAfter(rawEntry("a.ts", "100644", "A"), "w")).toBe("w");
  });
});

describe("Pins", () => {
  it("refuses to move a pin it was not prepared for", () => {
    const pins = new Pins(new SubmoduleReader("/nowhere"));
    pins.gitlinks.set("vendor/lib", "1".repeat(40));
    expect(() => pins.move(0, null, () => {})).toThrow("engine/invariant");
  });

  it("holds no reading past the move that takes it, across 50 moves of one pin", async () => {
    const dir = repoWith({ "a.ts": "a" });
    const pins = new Pins(new SubmoduleReader(dir));
    // One chunk after another, each moving the pin.
    await Array.from({ length: 50 }, (_, i) => i).reduce(async (done, i) => {
      await done;
      const commitId = String(i % 7).repeat(40);
      await pins.prepare([{ entries: [link(commitId)] }], i, () => true, null, noTexts);
      expect(pins.held).toEqual({ ready: 1, read: 0, expanded: Math.min(i, 1) });
      pins.gitlinks.set("vendor/lib", commitId);
      pins.move(i, null, () => {});
      expect(pins.held).toEqual({ ready: 0, read: 0, expanded: 1 });
    }, Promise.resolve());
  });

  it("keeps a reading two expansions take until the second, and one prepared twice for both", async () => {
    const dir = repoWith({ "a.ts": "a" });
    const pins = new Pins(new SubmoduleReader(dir));
    const [a, b] = ["a".repeat(40), "b".repeat(40)];
    // A, B, A in one chunk: the reading of A is taken twice.
    await pins.prepare(
      [{ entries: [link(a)] }, { entries: [link(b)] }, { entries: [link(a)] }],
      0,
      () => true,
      null,
      noTexts,
    );
    expect(pins.held.ready).toBe(2);
    for (const [i, commitId] of [a, b, a].entries()) {
      pins.gitlinks.set("vendor/lib", commitId);
      pins.move(i, null, () => {});
    }
    expect(pins.held.ready).toBe(0);
    // Two prepares before their moves: the second counts on the reading the first left.
    await pins.prepare([{ entries: [link(b)] }], 3, () => true, null, noTexts);
    await pins.prepare([{ entries: [link(b)] }], 3, () => true, null, noTexts);
    pins.gitlinks.set("vendor/lib", b);
    pins.move(3, null, () => {});
    expect(pins.held.ready).toBe(1);
  });
});
