// Writes src/local/testing/indexes/: git indexes written by git itself, one per version and extension the local reader
// meets, each beside what `git ls-files` says it tracks, so the reader is tested against git and never against itself.
// Usage: bun scripts/index-fixtures.ts   (needs git 2.38 or later; run it again after changing a case, then commit)
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(import.meta.dirname, "../src/local/testing/indexes");
const home = mkdtempSync(join(tmpdir(), "citymap-index-home-"));
const env = {
  PATH: process.env.PATH ?? "",
  HOME: home,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "citymap",
  GIT_AUTHOR_EMAIL: "citymap@example.org",
  GIT_COMMITTER_NAME: "citymap",
  GIT_COMMITTER_EMAIL: "citymap@example.org",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

/** Runs git in `dir`, failing loudly; returns its standard output. */
function git(dir: string, ...args: string[]): string {
  const run = Bun.spawnSync(["git", "-C", dir, ...args], { env, stdin: "ignore" });
  if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${run.stderr.toString()}`);
  return run.stdout.toString();
}

/** A fresh repository holding `files`, committed, with `init` flags. */
function repository(name: string, files: Record<string, string>, init: string[] = []): string {
  const dir = join(home, name);
  mkdirSync(dir);
  git(dir, "init", "--quiet", "--initial-branch=main", ...init);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, "add", "--all");
  git(dir, "commit", "--quiet", "--allow-empty", "--message", "start");
  return dir;
}

/** Adds an index entry by mode and object, with no file on disk: paths a disk could not hold, links and submodules. */
function entry(dir: string, mode: string, path: string, content = path): void {
  const object = Bun.spawnSync(["git", "-C", dir, "hash-object", "-w", "--stdin"], { env, stdin: Buffer.from(content) })
    .stdout.toString()
    .trim();
  git(dir, "update-index", "--add", "--cacheinfo", `${mode},${object},${path}`);
}

/** What git says the index tracks, as `{ mode, stage, path }`, in the index's order. */
function listed(dir: string): { mode: string; stage: number; path: string }[] {
  return git(dir, "-c", "core.quotepath=off", "ls-files", "--stage", "-z")
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta = "", path = ""] = line.split("\t");
      const [mode = "", , stage = "0"] = meta.split(" ");
      return { mode, stage: Number(stage), path };
    });
}

/** Saves the repository's index and git's own listing of it under `name`. */
function save(name: string, dir: string, note: string, refused?: string): void {
  writeFileSync(join(out, `${name}.index`), readFileSync(join(dir, ".git/index")));
  const version = Number(git(dir, "update-index", "--show-index-version").trim());
  const entries = refused ? null : listed(dir);
  const expected = { note, version, ...(refused ? { refused } : { entries }) };
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`[index-fixtures] ${name} v${version} ${refused ?? `${entries?.length} entries`}`);
}

const BASE = {
  "README.md": "# fixture\n",
  "package.json": '{ "workspaces": ["packages/*"] }\n',
  "packages/a/index.ts": "export {};\n",
  "packages/a/index.test.ts": "export {};\n",
  "packages/b/src/main.ts": "export {};\n",
  "docs/naïve café.md": "non-ASCII\n",
  "space name/file with spaces.txt": "spaces\n",
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Version 2, as a plain clone writes it: a cache tree (TREE), a link, an executable, a submodule, and a path of 4,096
// bytes, whose length the entry's flags can only say is 4,095 or more.
const v2 = repository("v2", BASE);
entry(v2, "120000", "link-to-readme", "README.md");
entry(v2, "100755", "bin/run.sh", "#!/bin/sh\n");
entry(v2, "160000", "vendor/sub", "submodule");
entry(v2, "100644", `deep/${"d".repeat(250)}/${"e".repeat(250)}/`.repeat(9).slice(0, 4093) + ".md");
git(v2, "write-tree");
save("v2", v2, "version 2: TREE, a link, an executable, a submodule, a 4,096-byte path");

// Version 3: an intent-to-add file and a skip-worktree file carry extended flags, which raise the index to version 3.
const v3 = repository("v3", BASE);
writeFileSync(join(v3, "later.ts"), "export {};\n");
git(v3, "add", "--intent-to-add", "later.ts");
git(v3, "update-index", "--skip-worktree", "README.md");
save("v3", v3, "version 3: intent-to-add and skip-worktree, extended flags");

// Version 4: paths prefix-compressed against the entry before.
const v4 = repository("v4", BASE);
git(v4, "update-index", "--index-version", "4");
entry(v4, "100644", `deep/${"d".repeat(250)}/${"e".repeat(250)}/`.repeat(9).slice(0, 4093) + ".md");
git(v4, "update-index", "--skip-worktree", "packages/a/index.ts");
save("v4", v4, "version 4: prefix-compressed paths, a 4,096-byte path, an extended entry");

// A merge in conflict: one path at stages 1, 2 and 3.
const conflict = repository("conflict", { "both.txt": "base\n", "other.txt": "x\n" });
git(conflict, "checkout", "--quiet", "-b", "side");
writeFileSync(join(conflict, "both.txt"), "side\n");
git(conflict, "commit", "--quiet", "--all", "--message", "side");
git(conflict, "checkout", "--quiet", "main");
writeFileSync(join(conflict, "both.txt"), "main\n");
git(conflict, "commit", "--quiet", "--all", "--message", "main");
Bun.spawnSync(["git", "-C", conflict, "merge", "--quiet", "side"], { env });
save("conflict", conflict, "a merge in conflict: one path at stages 1 to 3");

// The conflict resolved: a resolve-undo record (REUC).
git(conflict, "add", "both.txt");
save("resolved", conflict, "the conflict resolved: REUC");

// The optional extensions a busy repository writes: untracked cache (UNTR), end of entries (EOIE) and the offset table
// (IEOT), and the file system monitor's token (FSMN).
const busy = repository(
  "busy",
  Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`f/${String(i).padStart(3, "0")}.ts`, `${i}\n`])),
);
const hook = join(busy, ".git/fsmonitor-hook");
writeFileSync(hook, '#!/bin/sh\nprintf "token\\0"\n', { mode: 0o755 });
git(busy, "config", "core.fsmonitor", hook);
git(busy, "config", "core.untrackedCache", "true");
git(busy, "config", "index.threads", "4");
git(busy, "config", "index.recordEndOfIndexEntries", "true");
git(busy, "config", "index.recordOffsetTable", "true");
git(busy, "update-index", "--untracked-cache", "--fsmonitor");
git(busy, "status", "--porcelain");
git(busy, "update-index", "--really-refresh");
save("busy", busy, "UNTR, EOIE, IEOT and FSMN");

// SHA-256 objects: 32-byte ids in every entry.
const sha256 = repository("sha256", BASE, ["--object-format=sha256"]);
save("sha256", sha256, "SHA-256 object ids");

// No trailing checksum (index.skipHash, on with feature.manyFiles): twenty zero bytes instead.
const skip = repository("skip", BASE);
git(skip, "config", "index.skipHash", "true");
git(skip, "update-index", "--really-refresh");
git(skip, "rm", "--quiet", "--cached", "README.md");
save("skip", skip, "index.skipHash: no checksum");

// An empty index.
const empty = repository("empty", {});
save("empty", empty, "no entries");

// A split index: the entries live in a shared index elsewhere (link), so the reader refuses it.
const split = repository("split", BASE);
git(split, "update-index", "--split-index");
save("split", split, "split index (link)", "local/split-index");

// A sparse index: folders stand for their files (sdir), so the reader refuses it.
const sparse = repository("sparse", BASE);
git(sparse, "sparse-checkout", "init", "--cone", "--sparse-index");
git(sparse, "sparse-checkout", "set", "packages/a");
save("sparse", sparse, "sparse index (sdir)", "local/sparse-index");

rmSync(home, { recursive: true, force: true });
