// `bun run parity [--long] [--repos=a,b] [--modes=state,fold]`: runs the TypeScript and Rust CLIs on the repositories
// under ~/.cache/citymap/repos (or $CITYMAP_REPOS), each on its own shared clone so no lock lands in the cache, and
// compares their city JSON, SVG, lockfile and log byte for byte. Run it under PM2: folds take minutes to hours.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  OUTPUTS,
  cliArgs,
  parseSettings,
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

const build = run(["cargo", "build", "--release", "--quiet", "-p", "citymap-cli"], join(root, "rust"));
if (build.code !== 0) throw new Error(`parity/build-failed ${build.stderr.split("\n", 1)[0]}`);
console.log("parity/built rust/target/release/citymap");

const results: Result[] = [];
for (const repo of settings.repos) {
  const source = join(repos, repo);
  if (!existsSync(source)) {
    console.log(`parity/skipped repo=${repo} reason=no-repository`);
    continue;
  }
  for (const mode of settings.modes) results.push(compare(repo, source, mode));
}

/** One repository in one mode: both CLIs, each on its own shared clone under the repository's own name. */
function compare(repo: string, source: string, mode: Mode): Result {
  const scratch = mkdtempSync(join(tmpdir(), "citymap-parity-"));
  try {
    const sides = { ts: ["bun", join(root, "apps/cli/src/bin.ts")], rs: [rust] };
    const ms: Record<string, number> = {};
    for (const [side, cli] of Object.entries(sides)) {
      const clone = join(scratch, side, repo);
      mkdirSync(join(scratch, side), { recursive: true });
      const cloned = run(["git", "clone", "--shared", "--no-checkout", "--quiet", source, clone]);
      if (cloned.code !== 0) throw new Error(`parity/clone-failed repo=${repo} ${cloned.stderr.split("\n", 1)[0]}`);
      const out = join(scratch, `${side}-out`);
      mkdirSync(out);
      const laid = run([...cli, ...cliArgs(clone, out, mode)]);
      if (laid.code !== 0)
        throw new Error(`parity/cli-failed side=${side} repo=${repo} mode=${mode} ${laid.stderr.split("\n", 1)[0]}`);
      writeFileSync(join(out, "log.txt"), withoutTimings(laid.stdout));
      if (mode === "fold") copyFileSync(join(clone, "citymap.lock.json"), join(out, "citymap.lock.json"));
      ms[side] = laid.ms;
    }
    const differs = OUTPUTS[mode].filter(
      (file) => run(["cmp", "-s", join(scratch, "ts-out", file), join(scratch, "rs-out", file)]).code !== 0,
    );
    const result: Result = { repo, mode, tsMs: ms.ts ?? 0, rsMs: ms.rs ?? 0, differs };
    console.log(verdict(result));
    if (differs.length > 0) {
      const kept = join(tmpdir(), `citymap-parity-${repo}-${mode}`);
      rmSync(kept, { recursive: true, force: true });
      run(["cp", "-r", scratch, kept]);
      console.log(`parity/kept repo=${repo} mode=${mode} dir=${kept}`);
    }
    return result;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log(table(results));
process.exitCode = results.some((r) => r.differs.length > 0) ? 1 : 0;
