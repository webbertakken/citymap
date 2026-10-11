// Renders the neighbourhood prototype. Usage: bun towns.ts <towns|density|hero|all> [repo ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoData } from "./extract";
import { composeRegion, regionStats } from "./region";
import { renderRegion, type ThemeName, type TownCamera } from "./render-town";
import { DEFAULT_NO_LAND, type Options } from "./town";

const CACHE = join(homedir(), ".cache/citymap");
const HERE = import.meta.dir;
const PRIVATE_LIST = join(CACHE, "private-repos");
const PRIVATE = new Set(
  existsSync(PRIVATE_LIST)
    ? readFileSync(PRIVATE_LIST, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [],
);
const BASE: Options = { density: 0.5, order: "centre-out", warp: true, noLand: DEFAULT_NO_LAND };

interface Shot {
  caption: string;
  options: Options;
  camera: TownCamera;
  theme?: ThemeName;
}
const SECTIONS: Record<string, { repos: string[]; shots: Shot[] }> = {
  towns: {
    repos: [
      "takken.io",
      "react",
      "redux",
      "next.js",
      "game-ci-cli",
      "livediagram",
      ...PRIVATE,
      "studio-worker",
      "home-assistant",
      "typescript",
      "rust",
    ],
    shots: [{ caption: "neighbourhoods", options: BASE, camera: "plan" }],
  },
  density: {
    repos: ["takken.io", "react", "home-assistant"],
    shots: [0.35, 0.5, 0.65].map((density) => ({
      caption: `density ${Math.round(density * 100)}%`,
      options: { ...BASE, density },
      camera: "plan" as const,
    })),
  },
  land: {
    repos: ["react", "next.js", "rust"],
    shots: [
      { caption: "land: tests off the map", options: BASE, camera: "plan" },
      { caption: "land: tests as land", options: { ...BASE, noLand: ["fixtures"] }, camera: "plan" },
    ],
  },
  themes: {
    repos: ["react", "home-assistant"],
    shots: [
      { caption: "Paper atlas", options: BASE, camera: "plan", theme: "paper-atlas" },
      { caption: "Dracula", options: BASE, camera: "plan", theme: "dracula" },
    ],
  },
  hero: {
    repos: ["takken.io", "react"],
    shots: [{ caption: "2:1 dimetric", options: BASE, camera: "dimetric" }],
  },
};

const [sectionArg = "all", ...repoArgs] = process.argv.slice(2);
for (const name of sectionArg === "all" ? Object.keys(SECTIONS) : [sectionArg]) {
  const section = SECTIONS[name];
  if (!section) throw new Error(`[towns] unknown section ${name}`);
  for (const repo of repoArgs.length ? repoArgs : section.repos) {
    const started = performance.now();
    const data: RepoData = JSON.parse(readFileSync(join(CACHE, "data", `${repo}.json`), "utf8"));
    const isPrivate = PRIVATE.has(repo);
    const workDir = join(CACHE, isPrivate ? "private" : "render", `towns-${name}`);
    mkdirSync(workDir, { recursive: true });
    const pngs: string[] = [];
    // Density shots share one scale (fitted to the loosest), so town size reads as the slider moves.
    const regions = section.shots.map((shot) => composeRegion(data, shot.options));
    const span = (r: (typeof regions)[number]) => {
      const xs = r.towns.flatMap((t) => t.outline.map((p) => p.y));
      const ys = r.towns.flatMap((t) => t.outline.map((p) => p.x));
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 80;
    };
    const sharedScale = name === "density" ? 1600 / Math.max(...regions.map(span)) : undefined;
    for (const [i, shot] of section.shots.entries()) {
      const region = regions[i];
      const stats = regionStats(region);
      const subtitle = `${region.towns.length} town${region.towns.length > 1 ? "s" : ""} · ${stats.lots} lots · lot coverage ${stats.lotCoverage}% · ${region.tests} files without land (${shot.options.noLand.join(", ")}) · ${region.docs} docs as parks · ${stats.longStraightRoads} long straight roads`;
      const svg = join(workDir, `${repo}-${i}.svg`);
      const png = join(workDir, `${repo}-${i}.png`);
      writeFileSync(
        svg,
        renderRegion(region, {
          theme: shot.theme,
          camera: shot.camera,
          width: 1600,
          scale: sharedScale,
          title: `${isPrivate ? "(private)" : repo} · ${shot.caption}`,
          subtitle,
        }),
      );
      const r = Bun.spawnSync(["inkscape", svg, "--export-type=png", `--export-filename=${png}`], {
        stdout: "pipe",
        stderr: "pipe",
      });
      if (r.exitCode !== 0) throw new Error(`[towns] inkscape failed: ${r.stderr.toString()}`);
      pngs.push(png);
      writeFileSync(join(workDir, `${repo}-${i}.json`), JSON.stringify({ repo, caption: shot.caption, ...stats }));
      console.log(
        `[towns] ${name}/${isPrivate ? "(private)" : repo} "${shot.caption}" towns=${region.towns.length} ${JSON.stringify(stats)}`,
      );
    }
    const sheetDir = isPrivate ? workDir : join(HERE, "img");
    mkdirSync(sheetDir, { recursive: true });
    const sheet = join(sheetDir, `towns-${name}-${repo}.webp`);
    const r = Bun.spawnSync(
      [
        "montage",
        ...pngs,
        "-tile",
        `${pngs.length}x`,
        "-geometry",
        "1600x2000>+10+10",
        "-background",
        "#D9D4CA",
        "-quality",
        "82",
        sheet,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (r.exitCode !== 0) throw new Error(`[towns] montage failed: ${r.stderr.toString()}`);
    console.log(
      `[towns] ${name}/${isPrivate ? "(private)" : repo} sheet ${isPrivate ? "(private cache)" : sheet} took=${Math.round(performance.now() - started)}ms`,
    );
  }
}
