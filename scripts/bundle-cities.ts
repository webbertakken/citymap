// Copies cities the CLI wrote into the viewer's bundle, with an index. Only the public repositories named here are
// bundled; anything else in the source folder is ignored.
// Usage: bun scripts/bundle-cities.ts [source folder, default ~/.cache/citymap/render/product]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseCity } from "@citymap/ground-plan";

const PUBLIC = ["takken.io", "redux", "game-ci-cli", "studio-worker", "livediagram", "react"] as const;
const source = process.argv[2] ?? join(homedir(), ".cache/citymap/render/product");
const target = join(import.meta.dirname, "../apps/web/public/cities");
mkdirSync(target, { recursive: true });
const index = PUBLIC.filter((name) => existsSync(join(source, `${name}.json`))).map((name) => {
  const file = `${name}.json`;
  const city = parseCity(readFileSync(join(source, file), "utf8"));
  copyFileSync(join(source, file), join(target, file));
  return { name, file, lots: city.towns.reduce((sum, t) => sum + t.stats.lots, 0) };
});
writeFileSync(join(target, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`[bundle] ${index.length} cities: ${index.map((c) => c.name).join(", ")}`);
