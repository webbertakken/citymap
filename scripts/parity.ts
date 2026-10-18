// `bun run parity [--long] [--repos=a,b] [--modes=state,fold,resume,checkout] [--features=mimalloc]`: runs the
// TypeScript and Rust CLIs on the repositories under ~/.cache/citymap/repos (or $CITYMAP_REPOS), each on its own shared
// clone so no lock lands in the cache, and compares their city JSON, SVG, lockfile and log byte for byte. The resume
// mode folds from a lock saved part way, and its city, SVG and lock must also match the uninterrupted fold of the same
// CLI. The checkout mode folds a clone with a checkout whose working tree .mailmap (and mailmap.file) merges its
// authors, and its city, SVG, lock and log must match the fold of the clone without one. Run it under PM2: folds take
// minutes.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  OUTPUTS,
  SAME_AS_FOLD,
  buildArgs,
  checkoutMailmap,
  cliArgs,
  coverageReports,
  parseSettings,
  resumePoint,
  sameVerdict,
  saveArgs,
  table,
  verdict,
  withoutTimings,
  type Mode,
  type Result,
} from "./parity/parity.ts";

const root = join(import.meta.dirname, "..");
const repos = process.env.CITYMAP_REPOS ?? join(homedir(), ".cache/citymap/repos");
const settings = parseSettings(process.argv.slice(2));
const rust = join(root, "rust/target/release/citymap");
const sides = { ts: ["bun", join(root, "apps/cli/src/bin.ts")], rs: [rust] };

function run(command: string[], cwd = root): { code: number; stdout: string; stderr: string; ms: number } {
  const started = performance.now();
  const done = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    code: done.exitCode,
    stdout: done.stdout.toString(),
    stderr: done.stderr.toString(),
    ms: performance.now() - started,
  };
}

const build = run(buildArgs(settings.features), join(root, "rust"));
if (build.code !== 0) throw new Error(`parity/build-failed ${build.stderr.split("\n", 1)[0]}`);
console.log(`parity/built rust/target/release/citymap features=${settings.features.join(",") || "none"}`);

/** The lockfile a fold writes at the clone's root. */
const LOCK = "citymap.lock.json";
const results: Result[] = [];
let foldDiffers = false;
for (const repo of settings.repos) {
  const source = join(repos, repo);
  if (!existsSync(source)) {
    console.log(`parity/skipped repo=${repo} reason=no-repository`);
    continue;
  }
  const scratch = mkdtempSync(join(tmpdir(), "citymap-parity-"));
  try {
    const failed = settings.modes.map((mode) => {
      const result = compare(repo, source, mode, join(scratch, mode));
      results.push(result);
      return result.differs.length > 0;
    });
    const againstFold = settings.modes.includes("fold")
      ? (["resume", "checkout"] as const)
          .filter((mode) => settings.modes.includes(mode))
          .map((mode) => checkSameAsFold(repo, source, scratch, mode))
      : [];
    const sameDiffers = againstFold.some(Boolean);
    foldDiffers ||= sameDiffers;
    if (failed.some(Boolean) || sameDiffers) {
      const kept = join(tmpdir(), `citymap-parity-${repo}`);
      rmSync(kept, { recursive: true, force: true });
      run(["cp", "-r", scratch, kept]);
      console.log(`parity/kept repo=${repo} dir=${kept}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The commit a resume saves its lock at, from the history's length. */
function savePoint(clone: string): { index: number; commit: string } {
  const count = Number(run(["git", "-C", clone, "rev-list", "--first-parent", "--count", "HEAD"]).stdout.trim());
  const index = resumePoint(count);
  const commits = run(["git", "-C", clone, "rev-list", "--first-parent", "--reverse", "HEAD"]).stdout.split("\n");
  return { index, commit: commits[index]! };
}

/** One repository in one mode: both CLIs, each on its own shared clone under the repository's own name. */
function compare(repo: string, source: string, mode: Mode, dir: string): Result {
  const ms: Record<string, number> = {};
  for (const [side, cli] of Object.entries(sides)) {
    const clone = join(dir, side, repo);
    mkdirSync(join(dir, side), { recursive: true });
    const checkout = mode === "checkout" ? [] : ["--no-checkout"];
    const cloned = run(["git", "clone", "--shared", ...checkout, "--quiet", source, clone]);
    if (cloned.code !== 0) throw new Error(`parity/clone-failed repo=${repo} ${cloned.stderr.split("\n", 1)[0]}`);
    if (mode === "checkout") mergeAuthorsInWorkingTree(clone, join(dir, side, "everyone.mailmap"));
    if (mode === "coverage") {
      const listed = run([
        "git",
        "-C",
        clone,
        "-c",
        "core.quotepath=off",
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        "HEAD",
      ]);
      for (const [path, text] of Object.entries(coverageReports(listed.stdout.split("\0").filter(Boolean), repo))) {
        mkdirSync(dirname(join(clone, path)), { recursive: true });
        writeFileSync(join(clone, path), text);
      }
    }
    const out = join(dir, `${side}-out`);
    mkdirSync(out);
    if (mode === "resume") {
      const saved = run([...cli, ...saveArgs(clone, savePoint(clone).commit, settings.toggles)]);
      if (saved.code !== 0)
        throw new Error(`parity/cli-failed side=${side} repo=${repo} mode=save ${saved.stderr.split("\n", 1)[0]}`);
    }
    const laid = run([...cli, ...cliArgs(clone, out, mode, settings.toggles)]);
    if (laid.code !== 0)
      throw new Error(`parity/cli-failed side=${side} repo=${repo} mode=${mode} ${laid.stderr.split("\n", 1)[0]}`);
    writeFileSync(join(out, "log.txt"), withoutTimings(laid.stdout));
    if (OUTPUTS[mode].includes(LOCK)) copyFileSync(join(clone, LOCK), join(out, LOCK));
    ms[side] = laid.ms;
  }
  const differs = OUTPUTS[mode].filter(
    (file) => run(["cmp", "-s", join(dir, "ts-out", file), join(dir, "rs-out", file)]).code !== 0,
  );
  const result: Result = { repo, mode, tsMs: ms.ts ?? 0, rsMs: ms.rs ?? 0, differs };
  console.log(verdict(result));
  return result;
}

/**
 * Makes a checked-out clone's working tree .mailmap, and its mailmap.file, merge its authors into one: a CLI that read
 * either would count fewer authors than the laid commit's own .mailmap names.
 */
function mergeAuthorsInWorkingTree(clone: string, elsewhere: string): void {
  const emails = run(["git", "-C", clone, "log", "--format=%ae", "-n", "5000", "HEAD"]).stdout.split("\n");
  const text = checkoutMailmap(emails);
  writeFileSync(join(clone, ".mailmap"), text);
  writeFileSync(elsewhere, text);
  const configured = run(["git", "-C", clone, "config", "mailmap.file", elsewhere]);
  if (configured.code !== 0) throw new Error(`parity/config-failed ${configured.stderr.split("\n", 1)[0]}`);
  console.log(`parity/checkout-mailmap clone=${clone} lines=${text.split("\n").length - 1}`);
}

/**
 * A resumed fold, or a fold of a clone with a checkout, against the uninterrupted fold of a clone without one, per
 * CLI, byte for byte. True when one differs.
 */
function checkSameAsFold(repo: string, source: string, scratch: string, mode: "resume" | "checkout"): boolean {
  const differs = Object.keys(sides).flatMap((side) =>
    (SAME_AS_FOLD[mode] ?? [])
      .filter(
        (file) =>
          run(["cmp", "-s", join(scratch, "fold", `${side}-out`, file), join(scratch, mode, `${side}-out`, file)])
            .code !== 0,
      )
      .map((file) => `${side}:${file}`),
  );
  const at = mode === "resume" ? `saved=${savePoint(source).index}` : "";
  console.log(sameVerdict(mode, repo, differs, at));
  return differs.length > 0;
}

console.log(table(results));
process.exitCode = results.some((r) => r.differs.length > 0) || foldDiffers ? 1 : 0;
