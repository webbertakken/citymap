// Proves the local reader lays what `citymap --no-history` lays: for each checkout, the snapshot read from its folder
// (as the page reads a picked folder) against the CLI's `readTree` at HEAD, byte for byte as JSON; then again with its
// index rewritten by git as versions 3 and 4.
// Usage: bun scripts/local-equals-cli.ts [checkout …]   (default: every checkout with an index in ~/.cache/citymap/repos)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Snapshot } from "@citymap/ground-plan";
import { readTree } from "@citymap/history";
import type { Folder } from "../src/local/folder";
import { readLocal } from "../src/local/read";

/** A folder on disk read as the page reads a picked one; `swap` stands one file in for another. */
function diskFolder(dir: string, swap: ReadonlyMap<string, string> = new Map()): Folder {
  const real = (path: string) => swap.get(path) ?? join(dir, path);
  return {
    name: basename(dir),
    kind: async (path) => {
      const found = await stat(real(path)).catch(() => null);
      return found?.isFile() ? "file" : found?.isDirectory() ? "directory" : null;
    },
    read: async (path) => new Uint8Array(await readFile(real(path))),
    list: async (path) =>
      (await readdir(real(path), { withFileTypes: true }))
        .filter((e) => e.isFile() || e.isDirectory())
        .map((e) => ({ name: e.name, kind: e.isFile() ? "file" : "directory" })),
  };
}

const json = (snapshot: Snapshot) =>
  JSON.stringify({ ...snapshot, folderFirstSeen: [...snapshot.folderFirstSeen] }, null, 1);

/** The first line where two texts part, for the log. */
const firstDifference = (a: string, b: string) => {
  const left = a.split("\n");
  const right = b.split("\n");
  const at = left.findIndex((line, i) => line !== right[i]);
  return JSON.stringify({ line: at, local: left[at]?.slice(0, 120), cli: right[at]?.slice(0, 120) });
};

const root = join(homedir(), ".cache/citymap/repos");
const checkouts =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(root)
        .map((name) => join(root, name))
        .filter((dir) => existsSync(join(dir, ".git/index")));
const scratch = mkdtempSync(join(tmpdir(), "citymap-local-equals-"));
/** The index at `version` (0: as it stands; 3 and 4: a copy rewritten by git, so the checkout is never touched). */
function indexAt(dir: string, version: number): Map<string, string> {
  if (version === 0) return new Map();
  const copy = join(scratch, `${basename(dir)}-v${version}`);
  copyFileSync(join(dir, ".git/index"), copy);
  const env = { ...process.env, GIT_INDEX_FILE: copy, GIT_OPTIONAL_LOCKS: "0" };
  execFileSync("git", ["-C", dir, "update-index", "--index-version", String(version)], { env });
  // Git writes version 3 only when an entry needs its extended flags: one skip-worktree entry does.
  if (version === 3) {
    const listed = execFileSync("git", ["-C", dir, "ls-files", "-z"], { env, encoding: "utf8", maxBuffer: 1 << 30 });
    execFileSync("git", ["-C", dir, "update-index", "--skip-worktree", "--", listed.split("\0")[0]], { env });
  }
  return new Map([[".git/index", copy]]);
}

/** Whether the folder's snapshot, at each index version, is the CLI's; one line each. */
async function prove(dir: string): Promise<number> {
  const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const cli = json(await readTree(dir, head));
  const differing = await Promise.all(
    [0, 3, 4].map(async (version) => {
      const swap = indexAt(dir, version);
      const started = performance.now();
      const local = await readLocal(diskFolder(dir, swap), () => {});
      const ms = Math.round(performance.now() - started);
      const ours = json(local.snapshot);
      const fields = `repo=${basename(dir)} version=${local.index?.version} files=${local.snapshot.files.length} ms=${ms}`;
      if (ours === cli) console.log(`local-equals/same ${fields}`);
      else console.log(`local-equals/differs ${fields} first=${firstDifference(ours, cli)}`);
      return ours === cli ? 0 : 1;
    }),
  );
  return differing.reduce((a, b) => a + b, 0);
}

// One checkout at a time, so its timings and memory are its own.
const differs = await checkouts.reduce(async (sum, dir) => (await sum) + (await prove(dir)), Promise.resolve(0));
rmSync(scratch, { recursive: true, force: true });
console.log(`local-equals/done checkouts=${checkouts.length} differs=${differs}`);
process.exitCode = differs > 0 ? 1 : 0;
