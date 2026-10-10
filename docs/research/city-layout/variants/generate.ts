// Renders decision variants side by side. Usage: bun generate.ts <section|all> [repo ...]
// Public repos write contact sheets to ./img; private repos only to ~/.cache/citymap/private.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepoData } from "./extract";
import {
  boundsOf,
  buildTree,
  emptyPlan,
  append,
  fnv1a,
  layout,
  translate,
  type Options,
  type Plan,
  type Rect,
} from "./layout";
import { render, type Camera, type Edges, type Scene, type Style } from "./render";

const CACHE = join(homedir(), ".cache/citymap");
// Private repositories are named only in a local file outside this repository, one name per line.
const PRIVATE_LIST = join(CACHE, "private-repos");
const PRIVATE = new Set(
  existsSync(PRIVATE_LIST)
    ? readFileSync(PRIVATE_LIST, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [],
);
const HERE = import.meta.dir;
const WATER = 36;

interface Variant {
  caption: string;
  options: Options;
  style: Style;
  camera: Camera;
  edges: Edges;
}

const BASE: Omit<Variant, "caption"> = {
  options: { order: "first-seen", area: "lines", weighted: true, courts: true },
  style: "paper-atlas",
  camera: "plan",
  edges: "meaningful",
};

const SECTIONS: Record<string, { repos: string[]; variants: Variant[]; focus?: boolean }> = {
  area: {
    focus: true,
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
    variants: [
      { ...BASE, caption: "file count (weighted)", options: { ...BASE.options, area: "count" } },
      { ...BASE, caption: "lines of code (weighted)", options: { ...BASE.options, area: "lines" } },
      { ...BASE, caption: "bytes (weighted)", options: { ...BASE.options, area: "bytes" } },
      {
        ...BASE,
        caption: "file count, weighted by shared lots",
        options: { ...BASE.options, area: "count", sharedLots: true },
      },
    ],
  },
  courts: {
    repos: ["takken.io", "react", "next.js", "home-assistant"],
    variants: [
      { ...BASE, caption: "every folder a street (pure EvoStreets)", options: { ...BASE.options, courts: false } },
      { ...BASE, caption: "small leaf folders as courts (one block)", options: { ...BASE.options, courts: true } },
    ],
  },
  order: {
    repos: ["takken.io", "react", "next.js", "home-assistant"],
    variants: [
      { ...BASE, caption: "first-seen", options: { ...BASE.options, order: "first-seen" } },
      { ...BASE, caption: "alphabetical", options: { ...BASE.options, order: "alphabetical" } },
      { ...BASE, caption: "path hash", options: { ...BASE.options, order: "hash" } },
    ],
  },
  edges: {
    repos: ["react", "next.js", "livediagram", "rust"],
    variants: [
      { ...BASE, caption: "meaningful: workspaces as islands, docs and assets as parks", edges: "meaningful" },
      { ...BASE, caption: "aesthetic: one landmass, decorative parks", edges: "aesthetic" },
    ],
  },
  style: {
    repos: ["takken.io", "react"],
    variants: [
      { ...BASE, caption: "Paper atlas", style: "paper-atlas" },
      { ...BASE, caption: "Beck schematic", style: "beck-schematic" },
      { ...BASE, caption: "Nolli noir", style: "nolli-noir" },
    ],
  },
  camera: {
    repos: ["takken.io", "redux"],
    variants: [
      { ...BASE, caption: "plan (90°)", camera: "plan" },
      { ...BASE, caption: "2:1 dimetric (30°)", camera: "dimetric" },
      { ...BASE, caption: "true isometric (35.264°)", camera: "isometric" },
    ],
  },
};

const loadRepo = (name: string): RepoData => JSON.parse(readFileSync(join(CACHE, "data", `${name}.json`), "utf8"));

const outermost = (members: string[]) => members.filter((m) => !members.some((o) => o !== m && m.startsWith(`${o}/`)));

const orderMembers = (data: RepoData, members: string[], options: Options) => {
  const seen = (m: string) => data.folderFirstSeen[m] ?? 0;
  const keyed = members.map((m) => ({
    m,
    k: options.order === "first-seen" ? seen(m) : options.order === "hash" ? fnv1a(m) : 0,
  }));
  return keyed.sort((a, b) => a.k - b.k || (a.m < b.m ? -1 : 1)).map((x) => x.m);
};

const atOrigin = (plan: Plan): Plan => translate(plan, -plan.bounds.x0, -plan.bounds.y0);

// The most source-heavy folder holding 80 to 600 files: a district where lot sizes are visible.
function focusFolder(data: RepoData): string | undefined {
  const total = new Map<string, number>();
  const source = new Map<string, number>();
  for (const f of data.files)
    for (let i = f.path.indexOf("/"); i !== -1; i = f.path.indexOf("/", i + 1)) {
      const folder = f.path.slice(0, i);
      total.set(folder, (total.get(folder) ?? 0) + 1);
      if (f.landUse === "source") source.set(folder, (source.get(folder) ?? 0) + 1);
    }
  const candidates = [...total].filter(([, n]) => n >= 80 && n <= 600);
  candidates.sort(([a], [b]) => (source.get(b) ?? 0) - (source.get(a) ?? 0) || (a < b ? -1 : 1));
  return candidates[0]?.[0];
}

function landStats(plan: Plan) {
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const byUse: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  let built = 0;
  for (const lot of plan.lots) {
    built += area(lot);
    byUse[lot.landUse] = (byUse[lot.landUse] ?? 0) + area(lot);
    byClass[lot.lotClass] = (byClass[lot.lotClass] ?? 0) + 1;
  }
  const pct = (n: number) => Math.round((1000 * n) / built) / 10;
  return {
    builtShare: Math.round((1000 * built) / area(plan.bounds)) / 10,
    extent: [plan.bounds.x1 - plan.bounds.x0, plan.bounds.y1 - plan.bounds.y0],
    lotArea: built,
    areaShareByLandUse: Object.fromEntries(Object.entries(byUse).map(([k, v]) => [k, pct(v)])),
    lotsByClass: byClass,
  };
}

export function compose(data: RepoData, variant: Variant, focus?: string): Scene {
  const { options, edges } = variant;
  if (focus) {
    const plan = atOrigin(layout(buildTree(data, focus), options));
    return {
      plan,
      coasts: [plan.bounds],
      edges,
      title: `${PRIVATE.has(data.name) ? "(focus district)" : focus} \u00b7 ${variant.caption}`,
      subtitle: `zoomed district of ${data.name} \u00b7 lots by ${options.area}${options.weighted ? " (weighted)" : ""}`,
    };
  }
  const members = edges === "meaningful" ? outermost(data.members) : [];
  const inMember = (path: string) => members.some((m) => path.startsWith(`${m}/`));
  const mainland = atOrigin(
    layout(
      buildTree(data, "", (f) => !inMember(f.path)),
      options,
    ),
  );
  const islands = orderMembers(data, members, options).map((m) => atOrigin(layout(buildTree(data, m), options)));

  const scene = emptyPlan();
  append(scene, mainland);
  const coasts: Rect[] = [mainland.bounds];
  const width = (p: Plan) => p.bounds.x1 - p.bounds.x0;
  const height = (p: Plan) => p.bounds.y1 - p.bounds.y0;
  const area = islands.reduce((s, p) => s + (width(p) + WATER) * (height(p) + WATER), 0);
  const rowWidth = Math.max(width(mainland), Math.sqrt(area) * 1.4);
  let x = 0;
  let y = mainland.bounds.y1 + WATER;
  let rowHeight = 0;
  for (const island of islands) {
    if (x > 0 && x + width(island) > rowWidth) {
      x = 0;
      y += rowHeight + WATER;
      rowHeight = 0;
    }
    const moved = translate(island, x, y);
    append(scene, moved);
    coasts.push(moved.bounds);
    x += width(island) + WATER;
    rowHeight = Math.max(rowHeight, height(island));
  }
  if (edges === "aesthetic")
    for (const lot of scene.lots)
      if (fnv1a(lot.path.slice(0, lot.path.lastIndexOf("/") + 1)) % 13 === 0) lot.landUse = "assets";
  scene.bounds = boundsOf(scene);

  const files = data.files.length;
  return {
    plan: scene,
    coasts,
    edges,
    title: `${data.name} · ${variant.caption}`,
    subtitle: `${files.toLocaleString("en-GB")} files · ${members.length} islands · order ${options.order} · lots by ${options.area}${options.weighted ? " (weighted)" : ""} · ${variant.style} · ${variant.camera}`,
  };
}

function rasterise(svgFile: string, pngFile: string) {
  const result = Bun.spawnSync(["inkscape", svgFile, "--export-type=png", `--export-filename=${pngFile}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0 || !existsSync(pngFile))
    throw new Error(`[generate] inkscape failed for ${svgFile}: ${result.stderr.toString()}`);
}

function montage(inputs: string[], output: string, columns: number) {
  const result = Bun.spawnSync(
    [
      "montage",
      ...inputs,
      "-tile",
      `${columns}x`,
      "-geometry",
      "1100x1600>+10+10",
      "-background",
      "#D9D4CA",
      "-quality",
      "82",
      output,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(`[generate] montage failed: ${result.stderr.toString()}`);
}

const [sectionArg = "all", ...repoArgs] = process.argv.slice(2);
const sections = sectionArg === "all" ? Object.keys(SECTIONS) : [sectionArg];
for (const name of sections) {
  const section = SECTIONS[name];
  if (!section) throw new Error(`[generate] unknown section ${name}`);
  for (const repo of repoArgs.length ? repoArgs : section.repos) {
    const started = performance.now();
    const data = loadRepo(repo);
    const isPrivate = PRIVATE.has(repo);
    const workDir = join(CACHE, isPrivate ? "private" : "render", name);
    mkdirSync(workDir, { recursive: true });
    const pngs: string[] = [];
    const focus = section.focus ? focusFolder(data) : undefined;
    const rows: { focus?: string }[] = focus ? [{}, { focus }] : [{}];
    for (const row of rows)
      for (const [i, variant] of section.variants.entries()) {
        const scene = compose(data, variant, row.focus);
        const id = `${repo}-${row.focus ? "focus-" : ""}${i}`;
        const svg = join(workDir, `${id}.svg`);
        const png = join(workDir, `${id}.png`);
        writeFileSync(svg, render(scene, { style: variant.style, camera: variant.camera, width: 1600 }));
        rasterise(svg, png);
        pngs.push(png);
        const stats = landStats(scene.plan);
        writeFileSync(
          join(workDir, `${id}.json`),
          JSON.stringify({ repo, variant: variant.caption, focus: row.focus ?? null, ...stats }),
        );
        console.log(
          `[generate] ${name}/${isPrivate ? "(private)" : repo} variant=${i}${row.focus ? " focus" : ""} lots=${scene.plan.lots.length} roads=${scene.plan.roads.length} islands=${scene.coasts.length - 1} built=${stats.builtShare}%`,
        );
      }
    const sheetDir = isPrivate ? workDir : join(HERE, "img");
    mkdirSync(sheetDir, { recursive: true });
    const sheet = join(sheetDir, `${name}-${repo}.webp`);
    montage(pngs, sheet, section.variants.length);
    console.log(
      `[generate] ${name}/${repo} sheet=${isPrivate ? "(private cache)" : sheet} took=${Math.round(performance.now() - started)}ms`,
    );
  }
}
