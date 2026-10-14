import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitEnvironment } from "./env";
import { parseRawLog, readHistory, type HistoryEvent } from "./read";

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
const commit = (dir: string, message: string) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", message);
};
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-history-"));
  repos.push(dir);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}
const collect = async (dir: string, events?: HistoryEvent[]) => {
  const out = [];
  for await (const s of readHistory(dir, { onEvent: (e) => events?.push(e) })) out.push(s);
  return out;
};

describe("readHistory", () => {
  it("yields one snapshot per first-parent commit, oldest first, with births and folders", async () => {
    const dir = repo();
    write(dir, "a b.txt", "a");
    write(dir, "src/x.ts", "x");
    commit(dir, "one");
    write(dir, "src/deep/y.ts", "y");
    commit(dir, "two");
    const snaps = await collect(dir);
    expect(snaps.map((s) => s.index)).toEqual([0, 1]);
    expect(snaps[1]?.files).toEqual([
      { path: "a b.txt", identity: "a b.txt@0", firstSeen: 0 },
      { path: "src/deep/y.ts", identity: "src/deep/y.ts@1", firstSeen: 1 },
      { path: "src/x.ts", identity: "src/x.ts@0", firstSeen: 0 },
    ]);
    expect(Object.fromEntries(snaps[1]?.folderFirstSeen ?? [])).toEqual({ "": 0, src: 0, "src/deep": 1 });
    expect(snaps[0]?.repository).toMatch(/^citymap-history-/);
    expect(snaps[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("carries identity through an exact rename, and not through an edit", async () => {
    const dir = repo();
    write(dir, "old.ts", "same");
    write(dir, "edit.ts", "v1");
    commit(dir, "one");
    git(dir, "mv", "old.ts", "new.ts");
    rmSync(join(dir, "edit.ts"));
    write(dir, "edited.ts", "v2");
    commit(dir, "two");
    const [, second] = await collect(dir);
    expect(second?.files).toEqual([
      { path: "edited.ts", identity: "edited.ts@1", firstSeen: 1 },
      { path: "new.ts", identity: "old.ts@0", firstSeen: 0 },
    ]);
  });

  it("pairs identical files moved together in path order", async () => {
    const dir = repo();
    write(dir, "a.ts", "same");
    write(dir, "b.ts", "same");
    commit(dir, "one");
    git(dir, "mv", "a.ts", "y.ts");
    git(dir, "mv", "b.ts", "z.ts");
    commit(dir, "two");
    const [, second] = await collect(dir);
    expect(second?.files.map((f) => [f.path, f.identity])).toEqual([
      ["y.ts", "a.ts@0"],
      ["z.ts", "b.ts@0"],
    ]);
  });

  it("follows only the first parent of a merge, as one step", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    git(dir, "checkout", "-q", "-b", "side");
    write(dir, "s1.ts", "1");
    commit(dir, "s1");
    write(dir, "s2.ts", "2");
    commit(dir, "s2");
    git(dir, "checkout", "-q", "main");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "merge", "-q", "--no-ff", "side", "-m", "merge");
    const snaps = await collect(dir);
    expect(snaps).toHaveLength(2);
    expect(snaps[1]?.files.map((f) => f.identity)).toEqual(["a.ts@0", "s1.ts@1", "s2.ts@1"]);
  });

  it("skips submodules and reports them", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    const head = git(dir, "rev-parse", "HEAD").trim();
    git(dir, "update-index", "--add", "--cacheinfo", `160000,${head},vendor/lib`);
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "sub");
    const events: HistoryEvent[] = [];
    const snaps = await collect(dir, events);
    expect(snaps[1]?.files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(events).toContainEqual({ code: "history/skip-submodule", detail: { path: "vendor/lib", index: 1 } });
  });

  it("keeps an empty commit as a step, and an edited file's identity", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    commit(dir, "empty");
    write(dir, "a.ts", "edited");
    commit(dir, "edit");
    const snaps = await collect(dir);
    expect(snaps.map((s) => s.files.length)).toEqual([1, 1, 1]);
    expect(snaps[2]?.files[0]?.identity).toBe("a.ts@0");
  });

  it("drops a removed submodule and lays a file that replaces one", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    const head = git(dir, "rev-parse", "HEAD").trim();
    git(dir, "update-index", "--add", "--cacheinfo", `160000,${head},sub`);
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "sub");
    git(dir, "rm", "-q", "--cached", "sub");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "drop");
    write(dir, "sub", "now a file");
    commit(dir, "replace");
    const snaps = [];
    for await (const s of readHistory(dir)) snaps.push(s);
    expect(snaps[3]?.files.map((f) => [f.path, f.identity])).toEqual([
      ["a.ts", "a.ts@0"],
      ["sub", "sub@3"],
    ]);
  });

  it("starts yielding at a given index, with the tree as it stood", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    write(dir, "b.ts", "b");
    commit(dir, "two");
    write(dir, "c.ts", "c");
    commit(dir, "three");
    const snaps = [];
    for await (const s of readHistory(dir, { from: 1 })) snaps.push(s);
    expect(snaps.map((s) => s.index)).toEqual([1, 2]);
    expect(snaps[0]?.files.map((f) => f.identity)).toEqual(["a.ts@0", "b.ts@1"]);
  });

  it("rejects a folder that is not a repository, and a failing git", async () => {
    await expect(collect(join(tmpdir(), "citymap-no-such-dir"))).rejects.toThrow("history/not-a-repo");
    const dir = repo();
    await expect(collect(dir)).rejects.toThrow("history/git-failed");
  });
});

describe("readHistory type changes", () => {
  it("lays a file that replaces a submodule in the same commit", async () => {
    const dir = repo();
    write(dir, "a.ts", "a");
    commit(dir, "one");
    const head = git(dir, "rev-parse", "HEAD").trim();
    git(dir, "update-index", "--add", "--cacheinfo", `160000,${head},sub`);
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "sub");
    git(dir, "rm", "-q", "--cached", "sub");
    write(dir, "sub", "now a file");
    commit(dir, "replace");
    const snaps = await collect(dir);
    expect(snaps[2]?.files.map((f) => f.identity)).toEqual(["a.ts@0", "sub@2"]);
  });
});

describe("parseRawLog", () => {
  it("yields nothing for no tokens", () => {
    expect([...parseRawLog([])]).toEqual([]);
  });

  it("skips empty tokens and yields every commit", () => {
    const commits = [
      ...parseRawLog(["\u0001" + "a".repeat(40), "", "\n:100644 100644 x y M", "f.ts", "\n\u0001" + "b".repeat(40)]),
    ];
    expect(commits).toEqual([
      { sha: "a".repeat(40), entries: [{ mode: "100644", blob: "y", status: "M", path: "f.ts" }] },
      { sha: "b".repeat(40), entries: [] },
    ]);
  });

  it("rejects a stream that does not start with a commit", () => {
    expect(() => [...parseRawLog([":100644 100644 a b M", "x"])]).toThrow("history/parse");
  });
});

describe("readHistory inside a git hook", () => {
  it("reads the folder it is given, whatever repository the environment names", async () => {
    const hook = repo();
    write(hook, "hook.ts", "h");
    commit(hook, "hook");
    const dir = repo();
    write(dir, "mine.ts", "m");
    commit(dir, "mine");
    const before = process.env.GIT_DIR;
    process.env.GIT_DIR = join(hook, ".git");
    try {
      const snaps = await collect(dir);
      expect(snaps.at(-1)?.files.map((f) => f.path)).toEqual(["mine.ts"]);
    } finally {
      if (before === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = before;
    }
  });
});

describe("readHistory bounds", () => {
  it("rejects a path longer than the engine reads, by name", async () => {
    const dir = repo();
    // Too long for any file system to hold, so it goes straight into the index.
    const blob = execFileSync("git", ["-C", dir, "hash-object", "-w", "--stdin"], {
      input: "x",
      encoding: "utf8",
      env: gitEnvironment(),
    }).trim();
    const long = `${"d".repeat(200)}/`.repeat(21) + "f.ts";
    git(dir, "update-index", "--add", "--cacheinfo", `100644,${blob},${long}`);
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "long");
    await expect(collect(dir)).rejects.toThrow("snapshot/bad-path");
  });
});
