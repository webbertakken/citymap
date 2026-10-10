// Extracts the ground-plan input for one repository: HEAD files with bytes, lines and land use, the first-seen time
// of every path ever added (first-parent history fold) and the workspace members declared by manifests.
// Usage: bun extract.ts <repoDir> <outFile>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { classifyLandUse, type LandUse } from "./land-use";

export interface FileRecord {
  path: string;
  bytes: number;
  lines: number;
  binary: boolean;
  firstSeen: number;
  landUse: LandUse;
  /** History replay only: a deleted file kept as a vacant lot. */
  ghost?: boolean;
  /** History replay only: identity carried through exact renames; defaults to the path. */
  identity?: string;
}

export interface RepoData {
  name: string;
  head: string;
  files: FileRecord[];
  folderFirstSeen: Record<string, number>;
  members: string[];
}

const [repoDir, outFile] = process.argv.slice(2);
if (!repoDir || !outFile) {
  console.error("[extract] usage: bun extract.ts <repoDir> <outFile>");
  process.exit(2);
}

const git = (args: string[]): string => {
  const result = Bun.spawnSync(["git", "-c", "core.quotepath=off", "-C", repoDir, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`[extract] git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
};

const unquote = (raw: string): string => (raw.startsWith('"') ? JSON.parse(raw) : raw);
const started = performance.now();
const head = git(["rev-parse", "HEAD"]).trim();

// 1. HEAD snapshot: mode, type, size and path per entry.
const entries = git(["ls-tree", "-r", "-l", "-z", "HEAD"]).split("\0").filter(Boolean);
console.log(`[extract] ${repoDir} head=${head.slice(0, 12)} entries=${entries.length}`);

// 2. First-seen per path: fold over first-parent history, oldest first; the first addition wins.
const firstSeen = new Map<string, number>();
const folderFirstSeen = new Map<string, number>();
let commitTime = 0;
let commits = 0;
for (const line of git([
  "log",
  "--first-parent",
  "--reverse",
  "--no-renames",
  "--diff-filter=A",
  "--name-only",
  "--format=@%ct",
]).split("\n")) {
  if (!line) continue;
  if (line.startsWith("@")) {
    commitTime = Number(line.slice(1));
    commits++;
    continue;
  }
  const path = unquote(line);
  if (!firstSeen.has(path)) firstSeen.set(path, commitTime);
  for (let i = path.indexOf("/"); i !== -1; i = path.indexOf("/", i + 1)) {
    const folder = path.slice(0, i);
    if (!folderFirstSeen.has(folder)) folderFirstSeen.set(folder, commitTime);
  }
}
console.log(`[extract] history commits=${commits} pathsEverAdded=${firstSeen.size} folders=${folderFirstSeen.size}`);

// 3. Files with bytes, lines and land use.
const files: FileRecord[] = [];
let missingFirstSeen = 0;
for (const entry of entries) {
  const tab = entry.indexOf("\t");
  const [mode, type, , size] = entry.slice(0, tab).split(/\s+/);
  const path = entry.slice(tab + 1);
  const bytes = type === "blob" ? Number(size) : 0;
  let lines = 0;
  let binary = type !== "blob" || mode === "120000";
  if (!binary) {
    const full = join(repoDir, path);
    if (existsSync(full)) {
      const content = readFileSync(full);
      binary = content.subarray(0, 8000).includes(0);
      if (!binary) {
        for (let i = 0; i < content.length; i++) if (content[i] === 10) lines++;
        if (content.length > 0 && content[content.length - 1] !== 10) lines++;
      }
    }
  }
  const seen = firstSeen.get(path);
  if (seen === undefined) missingFirstSeen++;
  files.push({ path, bytes, lines, binary, firstSeen: seen ?? commitTime, landUse: classifyLandUse(path, binary) });
}
if (missingFirstSeen > 0)
  console.warn(`[extract] ${missingFirstSeen} HEAD paths had no first-parent addition; using last commit time`);

// 4. Workspace members from manifests.
const folders = new Set<string>();
for (const f of files)
  for (let i = f.path.indexOf("/"); i !== -1; i = f.path.indexOf("/", i + 1)) folders.add(f.path.slice(0, i));
const fileSet = new Set(files.map((f) => f.path));
const readText = (path: string) => (fileSet.has(path) ? readFileSync(join(repoDir, path), "utf8") : "");
const globs: string[] = [];
try {
  const pkg = readText("package.json");
  if (pkg) {
    const ws = JSON.parse(pkg).workspaces;
    globs.push(...(Array.isArray(ws) ? ws : (ws?.packages ?? [])));
  }
} catch (error) {
  console.warn(`[extract] package.json unreadable: ${(error as Error).message}`);
}
for (const m of readText("pnpm-workspace.yaml").matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)) globs.push(m[1]);
const cargoWorkspace = readText("Cargo.toml").match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/);
if (cargoWorkspace) for (const m of cargoWorkspace[1].matchAll(/"([^"]+)"/g)) globs.push(m[1]);
const goWork = readText("go.work").match(/use\s*\(([\s\S]*?)\)/);
if (goWork) for (const m of goWork[1].matchAll(/\S+/g)) globs.push(m[0].replace(/^\.\//, ""));

const toRegex = (glob: string) =>
  new RegExp(
    "^" +
      glob
        .replace(/^\.\//, "")
        .replace(/\/$/, "")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*") +
      "$",
  );
const include = globs.filter((g) => !g.startsWith("!")).map(toRegex);
const exclude = globs.filter((g) => g.startsWith("!")).map((g) => toRegex(g.slice(1)));
const manifests = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"];
const members = [...folders]
  .filter((d) => include.some((r) => r.test(d)) && !exclude.some((r) => r.test(d)))
  .filter((d) => manifests.some((m) => fileSet.has(`${d}/${m}`)))
  .sort();
console.log(`[extract] workspace globs=${globs.length} members=${members.length}`);

const data: RepoData = {
  name: repoDir.split("/").filter(Boolean).pop()!,
  head,
  files,
  folderFirstSeen: Object.fromEntries(folderFirstSeen),
  members,
};
writeFileSync(outFile, JSON.stringify(data));
const counts: Record<string, number> = {};
for (const f of files) counts[f.landUse] = (counts[f.landUse] ?? 0) + 1;
console.log(
  `[extract] files=${files.length} landUse=${JSON.stringify(counts)} took=${Math.round(performance.now() - started)}ms -> ${outFile}`,
);
