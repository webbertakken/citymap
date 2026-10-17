// Lays the viewer's bundled cities: every combination of the toggles (16) times every state of the separations each
// city records, for each public city, folded by the Rust CLI from its clone under ~/.cache/citymap/repos (or
// $CITYMAP_REPOS), into apps/web/public/cities/<name>/, with an index. A first lay with the defaults learns what a
// city records. Only the public repositories named here are bundled. Run it under PM2: it folds many histories.
// Usage: bun scripts/bundle-cities.ts
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCity } from "@citymap/ground-plan";
import {
  combinations,
  indexEntry,
  layArgs,
  separateFor,
  statesOf,
  summary,
  variantFile,
  variantName,
} from "./bundle/bundle.ts";

const PUBLIC = ["takken.io", "redux", "game-ci-cli", "studio-worker", "livediagram", "react"] as const;
const root = join(import.meta.dirname, "..");
const repos = process.env.CITYMAP_REPOS ?? join(homedir(), ".cache/citymap/repos");
const target = join(root, "apps/web/public/cities");
const cli = join(root, "rust/target/release/citymap");

function run(command: string[], cwd = root) {
  const done = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0)
    throw new Error(`bundle/failed ${command.join(" ")}: ${done.stderr.toString().split("\n", 1)[0]}`);
}

run(["cargo", "build", "--release", "--quiet", "-p", "citymap-cli"], join(root, "rust"));
// Each repository is folded from its own shared clone, so no lockfile in the cache is read or written.
const scratch = mkdtempSync(join(tmpdir(), "citymap-bundle-"));
const sizes: { bytes: number; gzip: number }[] = [];
const index = [];
try {
  for (const name of PUBLIC) {
    const clone = join(scratch, name);
    run(["git", "clone", "--shared", "--no-checkout", "--quiet", join(repos, name), clone]);
    mkdirSync(join(target, name), { recursive: true });
    // What the city records at its last commit, from a lay with the defaults.
    const probe = join(scratch, `${name}.json`);
    run([cli, clone, `--out=${probe}`]);
    const laidDefault = parseCity(readFileSync(probe, "utf8"));
    const recorded = { separable: laidDefault.separable ?? [], declared: laidDefault.declared === true };
    console.log(
      `bundle/recorded name=${name} separable=${recorded.separable.join(",") || "none"} declared=${recorded.declared}`,
    );
    const variants = combinations().flatMap((toggles) =>
      statesOf(recorded).map((state) => {
        const out = join(target, variantFile(name, toggles, state));
        const started = performance.now();
        run(layArgs(cli, clone, out, toggles, state === null ? null : separateFor(state, recorded)));
        const text = readFileSync(out, "utf8");
        const lots = parseCity(text).towns.reduce((sum, t) => sum + t.stats.lots, 0);
        const size = { bytes: Buffer.byteLength(text), gzip: gzipSync(text).length };
        sizes.push(size);
        console.log(
          `bundle/laid name=${name} variant=${variantName(toggles, state)} lots=${lots} bytes=${size.bytes} gzip=${size.gzip} ms=${Math.round(performance.now() - started)}`,
        );
        return { toggles, state, lots };
      }),
    );
    const entry = indexEntry(name, recorded, variants);
    index.push(entry);
    // Variant files the index no longer names (a renamed or dropped variant) leave the bundle.
    const named = new Set(entry.variants.map((v) => v.file.slice(name.length + 1)));
    for (const file of readdirSync(join(target, name)).filter((f) => !named.has(f))) {
      rmSync(join(target, name, file));
      console.log(`bundle/pruned name=${name} file=${file}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
writeFileSync(join(target, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(summary(sizes, index.length));
