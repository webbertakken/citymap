// Lays the viewer's bundled cities: every combination of the toggles (16 variants) for each public city, folded by the
// Rust CLI from its clone under ~/.cache/citymap/repos (or $CITYMAP_REPOS), into apps/web/public/cities/<name>/, with
// an index. Only the public repositories named here are bundled. Run it under PM2: it folds 96 histories.
// Usage: bun scripts/bundle-cities.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCityFile } from "@citymap/measures";
import { combinations, indexEntry, layArgs, summary, variantFile, variantName } from "./bundle/bundle.ts";

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
    const variants = combinations().map((toggles) => {
      const out = join(target, variantFile(name, toggles));
      const started = performance.now();
      run(layArgs(cli, clone, out, toggles));
      const text = readFileSync(out, "utf8");
      const lots = parseCityFile(text).city.towns.reduce((sum, t) => sum + t.stats.lots, 0);
      const size = { bytes: Buffer.byteLength(text), gzip: gzipSync(text).length };
      sizes.push(size);
      console.log(
        `bundle/laid name=${name} variant=${variantName(toggles)} lots=${lots} bytes=${size.bytes} gzip=${size.gzip} ms=${Math.round(performance.now() - started)}`,
      );
      return { toggles, lots };
    });
    index.push(indexEntry(name, variants));
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
writeFileSync(join(target, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(summary(sizes, index.length));
