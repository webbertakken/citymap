// `bun scripts/untouched.ts [--repos=a,b] [--modes=state,fold]`: lays each repository under ~/.cache/citymap/repos (or
// $CITYMAP_REPOS) with the Rust CLI twice, with and without its measures, and checks that the layout and the lockfile
// are the same bytes; it reports the city file's size both ways. Run it under PM2: folds take minutes.
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const repos = process.env.CITYMAP_REPOS ?? join(homedir(), ".cache/citymap/repos");
const value = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const names = (value("repos") ?? "takken.io,redux,game-ci-cli,livediagram,react").split(",");
const modes = (value("modes") ?? "state,fold").split(",");
const cli = join(root, "rust/target/release/citymap");

const run = (command: string[]) => {
  const started = performance.now();
  const done = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0) throw new Error(`untouched/failed ${command.join(" ")}: ${done.stderr.toString()}`);
  return performance.now() - started;
};

/** The city file's layout: its text without the measures key. */
const layoutOf = (text: string) => {
  const start = text.indexOf('"measures":');
  return start < 0 ? text : text.slice(0, start) + text.slice(text.indexOf(',"repository":') + 1);
};

let failed = false;
for (const name of names) {
  for (const mode of modes) {
    const scratch = mkdtempSync(join(tmpdir(), "citymap-untouched-"));
    try {
      const sides = ["with", "without"].map((side) => {
        const clone = join(scratch, side, name);
        run(["git", "clone", "--shared", "--no-checkout", "--quiet", join(repos, name), clone]);
        const out = join(scratch, `${side}.json`);
        const flags = [
          ...(mode === "state" ? ["--no-history"] : ["--lock"]),
          ...(side === "without" ? ["--no-measures"] : []),
        ];
        const ms = run([cli, clone, `--out=${out}`, ...flags]);
        const lock = mode === "state" ? "" : readFileSync(join(clone, "citymap.lock.json"), "utf8");
        return { text: readFileSync(out, "utf8"), bytes: statSync(out).size, lock, ms };
      });
      const withMeasures = sides[0]!;
      const without = sides[1]!;
      const layout = layoutOf(withMeasures.text) === without.text;
      const lock = withMeasures.lock === without.lock;
      failed ||= !layout || !lock;
      console.log(
        `untouched/${layout && lock ? "same" : "differs"} repo=${name} mode=${mode} layout=${layout} lock=${lock} bytes-with=${withMeasures.bytes} bytes-without=${without.bytes} growth-pct=${Math.round((100 * (withMeasures.bytes - without.bytes)) / without.bytes)} ms-with=${Math.round(withMeasures.ms)} ms-without=${Math.round(without.ms)}`,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
process.exitCode = failed ? 1 : 0;
