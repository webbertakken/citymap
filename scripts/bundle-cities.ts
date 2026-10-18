// Lays the viewer's bundled cities: every combination of the toggles (16) times every state of the separations each
// city records, for each public city pinned in `BUNDLED`, folded by the Rust CLI from a fresh clone at its pinned
// commit, into apps/web/public/cities/<name>/, with an index. A first lay with the defaults learns what a city records.
// The lays run in parallel, as many at once as the machine has cores (fewer with CITYMAP_BUNDLE_JOBS); each writes its
// own file, and the index follows the variants' order, so the bytes are those of a serial run. The Pages workflow runs
// it before building the site; the cities are not committed. Locally, run it under PM2.
// Usage: bun run bundle
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Separation, Toggle } from "@citymap/ground-plan";
import { parseCityFile } from "@citymap/measures";
import {
  BUNDLED,
  cloneArgs,
  combinations,
  inPool,
  indexEntry,
  layArgs,
  poolSize,
  separateFor,
  statesOf,
  summary,
  variantFile,
  variantName,
  type Recorded,
} from "./bundle/bundle.ts";

const root = join(import.meta.dirname, "..");
const target = join(root, "apps/web/public/cities");
const cli = join(root, "rust/target/release/citymap");

const failure = (command: string[], stderr: string) =>
  new Error(`bundle/failed ${command.join(" ")}: ${stderr.split("\n", 1)[0]}`);

function run(command: string[], cwd = root) {
  const done = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0) throw failure(command, done.stderr.toString());
}

/** One command in its own process, without holding the others back. */
async function runAside(command: string[]) {
  const child = Bun.spawn(command, { cwd: root, stdout: "ignore", stderr: "pipe" });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw failure(command, stderr);
}

interface Lay {
  readonly name: string;
  readonly toggles: readonly Toggle[];
  readonly state: readonly Separation[] | null;
  readonly args: string[];
  readonly out: string;
}

run(["cargo", "build", "--release", "--quiet", "-p", "citymap-cli"], join(root, "rust"));
const cores = availableParallelism();
const jobs = poolSize(cores, process.env.CITYMAP_BUNDLE_JOBS);
console.log(`bundle/pool jobs=${jobs} cores=${cores}`);
// Each repository is cloned afresh and checked out at its pinned commit, so its files are present for the measures and
// a local run writes the same bytes as the Pages workflow.
rmSync(target, { recursive: true, force: true });
const scratch = mkdtempSync(join(tmpdir(), "citymap-bundle-"));
const started = performance.now();
try {
  const cities: { name: string; recorded: Recorded }[] = [];
  const lays: Lay[] = [];
  for (const { name, url, commit } of BUNDLED) {
    const clone = join(scratch, name);
    const cloning = performance.now();
    run(cloneArgs(url, clone));
    run(["git", "-C", clone, "checkout", "--quiet", "--detach", commit]);
    console.log(
      `bundle/cloned name=${name} commit=${commit.slice(0, 12)} ms=${Math.round(performance.now() - cloning)}`,
    );
    mkdirSync(join(target, name), { recursive: true });
    // What the city records at its pinned commit, from a lay with the defaults.
    const probe = join(scratch, `${name}.json`);
    run([cli, clone, `--out=${probe}`, `--to=${commit}`, "--no-measures"]);
    const laidDefault = parseCityFile(readFileSync(probe, "utf8")).city;
    const recorded = { separable: laidDefault.separable ?? [], declared: laidDefault.declared === true };
    console.log(
      `bundle/recorded name=${name} separable=${recorded.separable.join(",") || "none"} declared=${recorded.declared}`,
    );
    cities.push({ name, recorded });
    for (const toggles of combinations())
      for (const state of statesOf(recorded)) {
        const out = join(target, variantFile(name, toggles, state));
        const separate = state === null ? null : separateFor(state, recorded);
        lays.push({ name, toggles, state, out, args: layArgs(cli, clone, out, toggles, commit, separate) });
      }
  }
  const laid = await inPool(lays, jobs, async ({ name, toggles, state, args, out }) => {
    const begun = performance.now();
    await runAside(args);
    const text = readFileSync(out, "utf8");
    const lots = parseCityFile(text).city.towns.reduce((sum, t) => sum + t.stats.lots, 0);
    const size = { bytes: Buffer.byteLength(text), gzip: gzipSync(text).length };
    console.log(
      `bundle/laid name=${name} variant=${variantName(toggles, state)} lots=${lots} bytes=${size.bytes} gzip=${size.gzip} ms=${Math.round(performance.now() - begun)}`,
    );
    return { name, toggles, state, lots, size };
  });
  const index = cities.map(({ name, recorded }) =>
    indexEntry(
      name,
      recorded,
      laid.filter((v) => v.name === name),
    ),
  );
  writeFileSync(join(target, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(
    `${summary(
      laid.map((v) => v.size),
      index.length,
    )} jobs=${jobs} ms=${Math.round(performance.now() - started)}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
