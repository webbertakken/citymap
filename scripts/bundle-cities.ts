// Lays the viewer's bundled cities: every combination of the toggles (16 variants) for each public city pinned in
// `BUNDLED`, folded by the Rust CLI from a fresh clone at its pinned commit, into apps/web/public/cities/<name>/, with an
// index. The Pages workflow runs it before building the site; the cities are not committed. Locally, run it under PM2.
// Usage: bun run bundle
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCityFile } from "@citymap/measures";
import {
  BUNDLED,
  cloneArgs,
  combinations,
  indexEntry,
  layArgs,
  summary,
  variantFile,
  variantName,
} from "./bundle/bundle.ts";

const root = join(import.meta.dirname, "..");
const target = join(root, "apps/web/public/cities");
const cli = join(root, "rust/target/release/citymap");

function run(command: string[], cwd = root) {
  const done = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0)
    throw new Error(`bundle/failed ${command.join(" ")}: ${done.stderr.toString().split("\n", 1)[0]}`);
}

run(["cargo", "build", "--release", "--quiet", "-p", "citymap-cli"], join(root, "rust"));
// Each repository is cloned afresh and checked out at its pinned commit, so its files are present for the measures and
// a local run writes the same bytes as the Pages workflow.
rmSync(target, { recursive: true, force: true });
const scratch = mkdtempSync(join(tmpdir(), "citymap-bundle-"));
const sizes: { bytes: number; gzip: number }[] = [];
const index = [];
try {
  for (const { name, url, commit } of BUNDLED) {
    const clone = join(scratch, name);
    const cloning = performance.now();
    run(cloneArgs(url, clone));
    run(["git", "-C", clone, "checkout", "--quiet", "--detach", commit]);
    console.log(
      `bundle/cloned name=${name} commit=${commit.slice(0, 12)} ms=${Math.round(performance.now() - cloning)}`,
    );
    mkdirSync(join(target, name), { recursive: true });
    const variants = combinations().map((toggles) => {
      const out = join(target, variantFile(name, toggles));
      const started = performance.now();
      run(layArgs(cli, clone, out, toggles, commit));
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
