// `bun run parity [--long] [--repos=a,b] [--modes=state,fold,resume] [--features=mimalloc]`: runs the TypeScript and
// Rust CLIs on the repositories under ~/.cache/citymap/repos (or $CITYMAP_REPOS), each on its own shared clone so no
// lock lands in the cache, and compares their city JSON, SVG, lockfile and log byte for byte. The resume mode folds
// from a lock saved part way, and its city, SVG and lock must also match the uninterrupted fold of the same CLI. Run it
// under PM2: folds take minutes.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  OUTPUTS,
  RESUMED,
  buildArgs,
  cliArgs,
  parseSettings,
  resumePoint,
  resumeVerdict,
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

const results: Result[] = [];
let resumeFailed = false;
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
    const resumeDiffers =
      settings.modes.includes("fold") && settings.modes.includes("resume") && checkResume(repo, source, scratch);
    resumeFailed ||= resumeDiffers;
    if (failed.some(Boolean) || resumeDiffers) {
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
    const cloned = run(["git", "clone", "--shared", "--no-checkout", "--quiet", source, clone]);
    if (cloned.code !== 0) throw new Error(`parity/clone-failed repo=${repo} ${cloned.stderr.split("\n", 1)[0]}`);
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
    if (mode !== "state") copyFileSync(join(clone, "citymap.lock.json"), join(out, "citymap.lock.json"));
    ms[side] = laid.ms;
  }
  const differs = OUTPUTS[mode].filter(
    (file) => run(["cmp", "-s", join(dir, "ts-out", file), join(dir, "rs-out", file)]).code !== 0,
  );
  const result: Result = { repo, mode, tsMs: ms.ts ?? 0, rsMs: ms.rs ?? 0, differs };
  console.log(verdict(result));
  return result;
}

/** A resumed fold against the uninterrupted one, per CLI: city, SVG and lock byte for byte. True when one differs. */
function checkResume(repo: string, source: string, scratch: string): boolean {
  const differs = Object.keys(sides).flatMap((side) =>
    RESUMED.filter(
      (file) =>
        run(["cmp", "-s", join(scratch, "fold", `${side}-out`, file), join(scratch, "resume", `${side}-out`, file)])
          .code !== 0,
    ).map((file) => `${side}:${file}`),
  );
  console.log(resumeVerdict(repo, savePoint(source).index, differs));
  return differs.length > 0;
}

console.log(table(results));
process.exitCode = results.some((r) => r.differs.length > 0) || resumeFailed ? 1 : 0;
