// Replays first-parent history and renders deletion and archetype-switch variants as a filmstrip.
// Usage: bun history.ts <repo> <date> [date ...]   (dates YYYY-MM-DD; "head" for the latest commit)
// Needs no blob contents: exact renames come from blob ids, lots are one class (count), GIT_NO_LAZY_FETCH guards it.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FileRecord, RepoData } from "./extract";
import { classifyLandUse } from "./land-use";
import {
  append,
  boundsOf,
  buildTree,
  emptyPlan,
  layout,
  translate,
  type Options,
  type Plan,
  type Rect,
} from "./layout";
import { render, type Scene } from "./render";
import { centroid } from "./geometry";
import { composeRegion } from "./region";

const CACHE = join(homedir(), ".cache/citymap");
const HERE = import.meta.dir;
const WATER = 36;
const RENEWAL_THRESHOLD = 0.5;

type Mode = "compaction" | "vacant" | "renewal" | "renewal+renames";
const MODES: { mode: Mode; caption: string }[] = [
  { mode: "compaction", caption: "compaction (path identity)" },
  { mode: "vacant", caption: "vacant lots forever (path identity)" },
  { mode: "renewal", caption: "vacant lots, renewal above 50% (path identity)" },
  { mode: "renewal+renames", caption: "vacant lots, renewal, identity follows exact renames" },
];

const [repo, ...dateArgs] = process.argv.slice(2);
if (!repo || dateArgs.length === 0) {
  console.error("[history] usage: bun history.ts <repo> <date> [date ...]");
  process.exit(2);
}
const repoDir = join(CACHE, "repos", repo);
const git = (args: string[], allowFetch = false): string => {
  const env = allowFetch ? process.env : { ...process.env, GIT_NO_LAZY_FETCH: "1" };
  const result = Bun.spawnSync(["git", "-c", "core.quotepath=off", "-C", repoDir, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  if (result.exitCode !== 0) throw new Error(`[history] git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
};
const unquote = (raw: string): string => (raw.startsWith('"') ? JSON.parse(raw) : raw);

// Frames: the last first-parent commit before each date, or "steps:<date>:<count>" for consecutive commits,
// or "switch" followed by the pre-switch date and later dates for the archetype-switch comparison.
const stepMode = dateArgs[0].startsWith("steps:");
const switchMode = dateArgs[0] === "switch";
if (switchMode) dateArgs.shift();
const frames = stepMode
  ? ((): { date: string; sha: string }[] => {
      const [, since, count] = dateArgs[0].split(":");
      const shas = git(["rev-list", "--first-parent", "--reverse", `--since=${since}`, "HEAD"])
        .trim()
        .split("\n")
        .slice(0, Number(count));
      return shas.map((sha, i) => ({ date: `step ${i}`, sha }));
    })()
  : dateArgs.map((date) => {
      const sha =
        date === "head"
          ? git(["rev-parse", "HEAD"]).trim()
          : git(["rev-list", "--first-parent", "-1", `--before=${date}`, "HEAD"]).trim();
      if (!sha) throw new Error(`[history] no commit before ${date}`);
      return { date, sha };
    });
const frameShas = new Set(frames.map((f) => f.sha));

// Fold: per path the first-seen time; per identity its birth time and current path; ghosts keep their last path.
interface Identity {
  id: string;
  born: number;
  path: string;
  alive: boolean;
}
const byPath = new Map<string, Identity>(); // live identities by current path
const identities: Identity[] = [];
const pathFirstSeen = new Map<string, number>();
const pathsEver = new Map<string, boolean>(); // path -> currently present
const snapshots = new Map<
  string,
  { identities: Identity[]; paths: Map<string, boolean>; pathFirstSeen: Map<string, number> }
>();

const started = performance.now();
let time = 0;
let sha = "";
let renames = 0;
const snapshot = () => {
  if (!frameShas.has(sha)) return;
  snapshots.set(sha, {
    identities: identities.map((i) => ({ ...i })),
    paths: new Map(pathsEver),
    pathFirstSeen: new Map(pathFirstSeen),
  });
};
const log = git([
  "log",
  "--first-parent",
  "--reverse",
  "--diff-merges=first-parent",
  "-M100%",
  "--name-status",
  "--format=@%H %ct",
]);
for (const line of log.split("\n")) {
  if (!line) continue;
  if (line.startsWith("@")) {
    snapshot();
    [sha, time] = ((s) => [s.slice(1, 41), Number(s.slice(42))] as [string, number])(line);
    continue;
  }
  const [status, a, b] = line.split("\t").map((part, i) => (i === 0 ? part : unquote(part)));
  const add = (path: string) => {
    if (!pathFirstSeen.has(path)) pathFirstSeen.set(path, time);
    pathsEver.set(path, true);
  };
  if (status === "A") {
    add(a);
    const identity = { id: `${a}@${time}`, born: time, path: a, alive: true };
    identities.push(identity);
    byPath.set(a, identity);
  } else if (status === "D") {
    pathsEver.set(a, false);
    const identity = byPath.get(a);
    if (identity) identity.alive = false;
    byPath.delete(a);
  } else if (status.startsWith("R")) {
    renames++;
    pathsEver.set(a, false);
    add(b);
    const identity = byPath.get(a);
    byPath.delete(a);
    if (identity) {
      identity.path = b;
      byPath.set(b, identity);
    }
  }
}
snapshot();
console.log(
  `[history] ${repo} identities=${identities.length} exactRenames=${renames} frames=${snapshots.size}/${frames.length} took=${Math.round(performance.now() - started)}ms`,
);

// Builds the file list for one frame and mode. Ghosts are deleted files kept as vacant lots.
function filesFor(frame: { sha: string }, mode: Mode): FileRecord[] {
  const snap = snapshots.get(frame.sha)!;
  const record = (path: string, firstSeen: number, ghost: boolean, identity: string): FileRecord => ({
    path,
    bytes: 0,
    lines: 0,
    binary: false,
    firstSeen,
    landUse: classifyLandUse(path, false),
    ghost,
    identity,
  });
  let files: FileRecord[];
  if (mode === "renewal+renames") files = snap.identities.map((i) => record(i.path, i.born, !i.alive, i.id));
  else
    files = [...snap.paths]
      .filter(([, present]) => present || mode !== "compaction")
      .map(([path, present]) => record(path, snap.pathFirstSeen.get(path)!, !present, path));
  return mode === "renewal" || mode === "renewal+renames" ? renew(files) : files;
}

// Renewal: when more than half of a folder's direct children are vacant, its vacant lots and vacant streets go.
function renew(files: FileRecord[]): FileRecord[] {
  const children = new Map<string, Map<string, boolean>>(); // folder -> child -> alive
  const mark = (folder: string, child: string, alive: boolean) => {
    const m = children.get(folder) ?? new Map<string, boolean>();
    m.set(child, (m.get(child) ?? false) || alive);
    children.set(folder, m);
  };
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 0; i < parts.length; i++) mark(parts.slice(0, i).join("/"), parts.slice(0, i + 1).join("/"), !f.ghost);
  }
  const renewed = new Set<string>();
  for (const [folder, kids] of children) {
    const vacant = [...kids.values()].filter((alive) => !alive).length;
    if (vacant / kids.size > RENEWAL_THRESHOLD) renewed.add(folder);
  }
  // Renewal is local: a renewed folder drops its own vacant frontage (vacant files and wholly vacant child
  // streets) and nothing deeper, so one renewal never cascades through a district.
  return files.filter((f) => {
    if (!f.ghost) return true;
    const parts = f.path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      const child = parts.slice(0, i + 1).join("/");
      if (renewed.has(folder) && children.get(folder)?.get(child) === false) return false;
    }
    return true;
  });
}

const globsByBlob = new Map<string, string[]>();
function membersAt(frameSha: string, paths: string[]): string[] {
  let globs: string[] = [];
  try {
    const blob = git(["rev-parse", `${frameSha}:package.json`]).trim();
    if (!globsByBlob.has(blob)) {
      const pkg = JSON.parse(git(["cat-file", "blob", blob], true));
      globsByBlob.set(blob, Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages ?? []));
    }
    globs = globsByBlob.get(blob)!;
  } catch {
    if (!stepMode) console.log(`[history] ${frameSha.slice(0, 9)} has no readable package.json workspaces`);
  }
  const regexes = globs.map(
    (g) =>
      new RegExp(
        "^" +
          g
            .replace(/\/$/, "")
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, "[^/]*") +
          "$",
      ),
  );
  const manifests = new Set(
    paths.filter((p) => p.endsWith("/package.json")).map((p) => p.slice(0, -"/package.json".length)),
  );
  return [...manifests].filter((d) => regexes.some((r) => r.test(d))).sort();
}

const OPTIONS: Options = { order: "first-seen", area: "count", weighted: true, courts: true };

// Like generate.compose, but anchored at the mainland's root street so positions compare across frames.
function composeFrame(data: RepoData, members: string[]): Plan {
  const inMember = (path: string) => members.some((m) => path.startsWith(`${m}/`));
  const mainland = layout(
    buildTree(data, "", (f) => !inMember(f.path)),
    OPTIONS,
  );
  const plan = emptyPlan();
  append(plan, mainland);
  let x = mainland.bounds.x0;
  let y = mainland.bounds.y1 + WATER;
  let rowHeight = 0;
  const rowWidth = Math.max(mainland.bounds.x1 - mainland.bounds.x0, 400);
  const coasts: Rect[] = [mainland.bounds];
  for (const m of members) {
    const island = layout(buildTree(data, m), OPTIONS);
    const w = island.bounds.x1 - island.bounds.x0;
    if (x > mainland.bounds.x0 && x + w > mainland.bounds.x0 + rowWidth) {
      x = mainland.bounds.x0;
      y += rowHeight + WATER;
      rowHeight = 0;
    }
    const moved = translate(island, x - island.bounds.x0, y - island.bounds.y0);
    append(plan, moved);
    coasts.push(moved.bounds);
    x += w + WATER;
    rowHeight = Math.max(rowHeight, island.bounds.y1 - island.bounds.y0);
  }
  plan.bounds = boundsOf(plan);
  (plan as Plan & { coasts: Rect[] }).coasts = coasts;
  return plan;
}

// Step mode: per-commit share of surviving files that moved, split by whether the commit deleted anything.
// LAYOUT=towns measures the neighbourhood prototype (snapshot only, no vacant lots) instead of the street tree.
const townLayout = process.env.LAYOUT === "towns";
if (stepMode) {
  const rows: string[] = [];
  for (const { mode, caption } of townLayout ? MODES.slice(0, 1) : MODES) {
    let previous: Map<string, [number, number]> | null = null;
    let previousLive = new Set<string>();
    const all: number[] = [];
    const deleting: number[] = [];
    for (const frame of frames) {
      const files = filesFor(frame, mode);
      const folderFirstSeen: Record<string, number> = {};
      for (const f of files)
        for (let k = f.path.indexOf("/"); k !== -1; k = f.path.indexOf("/", k + 1)) {
          const folder = f.path.slice(0, k);
          folderFirstSeen[folder] = Math.min(folderFirstSeen[folder] ?? Infinity, f.firstSeen);
        }
      const live = files.filter((f) => !f.ghost);
      if (townLayout) {
        const region = composeRegion(
          {
            name: repo,
            head: frame.sha,
            files: live,
            folderFirstSeen,
            members: membersAt(
              frame.sha,
              live.map((f) => f.path),
            ),
          },
          { density: 0.5, order: "centre-out", warp: true },
        );
        const townCentres = new Map(
          region.towns.flatMap((town) =>
            town.lots.map((l) => [l.path, [centroid(l.pts).x, centroid(l.pts).y] as [number, number]]),
          ),
        );
        const ids = new Set(townCentres.keys());
        if (previous) {
          let survivors = 0;
          let shifted = 0;
          for (const [id, [x, y]] of townCentres) {
            const before = previous.get(id);
            if (!before) continue;
            survivors++;
            if (Math.hypot(x - before[0], y - before[1]) > 2) shifted++;
          }
          const share = survivors ? shifted / survivors : 0;
          all.push(share);
          if ([...previousLive].some((id) => !ids.has(id))) deleting.push(share);
        }
        previous = townCentres;
        previousLive = ids;
        continue;
      }
      const plan = composeFrame(
        { name: repo, head: frame.sha, files, folderFirstSeen, members: [] },
        membersAt(
          frame.sha,
          live.map((f) => f.path),
        ),
      );
      const centres = new Map(
        plan.lots
          .filter((l) => !l.ghost)
          .map((l) => [l.identity, [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2] as [number, number]]),
      );
      const liveIds = new Set(centres.keys());
      if (previous) {
        let survivors = 0;
        let shifted = 0;
        for (const [id, [x, y]] of centres) {
          const before = previous.get(id);
          if (!before) continue;
          survivors++;
          if (Math.hypot(x - before[0], y - before[1]) > 2) shifted++;
        }
        const share = survivors ? shifted / survivors : 0;
        all.push(share);
        if ([...previousLive].some((id) => !liveIds.has(id))) deleting.push(share);
      }
      previous = centres;
      previousLive = liveIds;
    }
    const mean = (xs: number[]) =>
      xs.length ? Math.round((1000 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 10 : 0;
    const calm = (xs: number[]) => Math.round((1000 * xs.filter((x) => x === 0).length) / Math.max(1, xs.length)) / 10;
    rows.push(`| ${caption} | ${mean(all)}% | ${calm(all)}% | ${deleting.length} | ${mean(deleting)}% |`);
    console.log(
      `[history] steps ${mode}: mean moved ${mean(all)}%, steps with no movement ${calm(all)}%, deleting steps ${deleting.length} mean moved ${mean(deleting)}%`,
    );
  }
  const table = [
    "| Variant | Mean share moved per commit | Commits with no movement | Commits deleting files | Mean moved on those |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
  writeFileSync(
    join(CACHE, "render", `stability-${repo}.md`),
    `${dateArgs[0]} over ${frames.length} commits\n\n${table}\n`,
  );
  console.log(table);
  process.exit(0);
}

// Switch mode: the first frame's city is frozen as the old town; later frames show three readings of it.
if (switchMode) {
  const outDir = join(CACHE, "render", "switch", repo);
  mkdirSync(outDir, { recursive: true });
  const [before, ...after] = frames;
  const oldFiles = filesFor(before, "renewal+renames");
  const oldData = (files: FileRecord[]): RepoData => {
    const folderFirstSeen: Record<string, number> = {};
    for (const f of files)
      for (let k = f.path.indexOf("/"); k !== -1; k = f.path.indexOf("/", k + 1)) {
        const folder = f.path.slice(0, k);
        folderFirstSeen[folder] = Math.min(folderFirstSeen[folder] ?? Infinity, f.firstSeen);
      }
    return { name: repo, head: "", files, folderFirstSeen, members: [] };
  };
  const oldTown = composeFrame(
    oldData(oldFiles.filter((f) => !f.ghost)),
    membersAt(
      before.sha,
      oldFiles.map((f) => f.path),
    ),
  );
  const oldPaths = new Set(oldFiles.filter((f) => !f.ghost).map((f) => f.path));
  const oldIds = new Set(oldFiles.filter((f) => !f.ghost).map((f) => f.identity!));
  const pngs: string[] = [];
  const readings = [
    "full relayout",
    "old town island, path identity",
    "old town island, identity follows renames",
  ] as const;
  for (const frame of after) {
    const now = filesFor(frame, "renewal+renames").filter((f) => !f.ghost);
    const nowPaths = new Set(now.map((f) => f.path));
    const nowIds = new Set(now.map((f) => f.identity!));
    for (const reading of readings) {
      let plan: Plan;
      let coasts: Rect[];
      let lit = 0;
      if (reading === "full relayout") {
        plan = composeFrame(
          oldData(now),
          membersAt(
            frame.sha,
            now.map((f) => f.path),
          ),
        );
        coasts = (plan as Plan & { coasts: Rect[] }).coasts;
      } else {
        const byPath = reading === "old town island, path identity";
        const island = {
          ...oldTown,
          lots: oldTown.lots.map((l) => ({ ...l, ghost: byPath ? !nowPaths.has(l.path) : !nowIds.has(l.identity) })),
        };
        lit = island.lots.filter((l) => !l.ghost).length;
        const rest = now.filter((f) => (byPath ? !oldPaths.has(f.path) : !oldIds.has(f.identity!)));
        const restPlan = composeFrame(
          oldData(rest),
          membersAt(
            frame.sha,
            rest.map((f) => f.path),
          ),
        );
        const dx = island.bounds.x1 + WATER * 2 - restPlan.bounds.x0;
        const moved = translate(restPlan, dx, island.bounds.y0 - restPlan.bounds.y0);
        plan = emptyPlan();
        append(plan, island);
        append(plan, moved);
        plan.bounds = boundsOf(plan);
        coasts = [
          ...(oldTown as Plan & { coasts: Rect[] }).coasts,
          ...(restPlan as Plan & { coasts: Rect[] }).coasts.map((c) => ({
            x0: c.x0 + dx,
            x1: c.x1 + dx,
            y0: c.y0 + island.bounds.y0 - restPlan.bounds.y0,
            y1: c.y1 + island.bounds.y0 - restPlan.bounds.y0,
          })),
        ];
      }
      const scene: Scene = {
        plan,
        coasts,
        edges: "meaningful",
        title: `${repo} ${frame.date} \u00b7 ${reading}`,
        subtitle:
          reading === "full relayout"
            ? `${now.length} files laid out by today's paths`
            : `old town (${before.date}) keeps ${lit} of ${oldTown.lots.length} lots lit \u00b7 new city holds the rest, on the right`,
      };
      const id = `${frame.date}-${readings.indexOf(reading)}`;
      writeFileSync(join(outDir, `${id}.svg`), render(scene, { style: "paper-atlas", camera: "plan", width: 1400 }));
      const r = Bun.spawnSync(
        ["inkscape", join(outDir, `${id}.svg`), "--export-type=png", `--export-filename=${join(outDir, `${id}.png`)}`],
        { stdout: "pipe", stderr: "pipe" },
      );
      if (r.exitCode !== 0) throw new Error(`[history] inkscape failed: ${r.stderr.toString()}`);
      pngs.push(join(outDir, `${id}.png`));
      console.log(`[history] switch ${frame.date} "${reading}" lots=${plan.lots.length} oldTownLit=${lit}`);
    }
  }
  const sheet = join(HERE, "img", `switch-${repo}.webp`);
  const r = Bun.spawnSync(
    [
      "montage",
      ...pngs,
      "-tile",
      `${readings.length}x`,
      "-geometry",
      "1000x1000>+8+8",
      "-background",
      "#D9D4CA",
      "-quality",
      "82",
      sheet,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (r.exitCode !== 0) throw new Error(`[history] montage failed: ${r.stderr.toString()}`);
  console.log(`[history] sheet=${sheet}`);
  process.exit(0);
}

const outDir = join(CACHE, "render", "history", repo);
mkdirSync(outDir, { recursive: true });
const pngs: string[] = [];
const summary: string[] = [];
for (const { mode, caption } of MODES) {
  let previous: Map<string, [number, number]> | null = null;
  const moved: string[] = [];
  for (const [i, frame] of frames.entries()) {
    const files = filesFor(frame, mode);
    const live = files.filter((f) => !f.ghost);
    const folderFirstSeen: Record<string, number> = {};
    for (const f of files)
      for (let k = f.path.indexOf("/"); k !== -1; k = f.path.indexOf("/", k + 1)) {
        const folder = f.path.slice(0, k);
        folderFirstSeen[folder] = Math.min(folderFirstSeen[folder] ?? Infinity, f.firstSeen);
      }
    const data: RepoData = { name: repo, head: frame.sha, files, folderFirstSeen, members: [] };
    const members = membersAt(
      frame.sha,
      live.map((f) => f.path),
    );
    const plan = composeFrame(data, members);
    const centres = new Map(
      plan.lots
        .filter((l) => !l.ghost)
        .map((l) => [l.identity, [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2] as [number, number]]),
    );
    let note = "first frame";
    if (previous) {
      let survivors = 0;
      let shifted = 0;
      for (const [id, [x, y]] of centres) {
        const before = previous.get(id);
        if (!before) continue;
        survivors++;
        if (Math.hypot(x - before[0], y - before[1]) > 2) shifted++;
      }
      const pct = survivors ? Math.round((1000 * shifted) / survivors) / 10 : 0;
      note = `${pct}% of ${survivors} surviving files moved`;
      moved.push(`${frame.date}: ${pct}%`);
    }
    previous = centres;
    const ghosts = files.length - live.length;
    const scene: Scene = {
      plan,
      coasts: (plan as Plan & { coasts: Rect[] }).coasts,
      edges: "meaningful",
      title: `${repo} ${frame.date} · ${caption}`,
      subtitle: `${live.length} files · ${ghosts} vacant lots · ${members.length} islands · ${note}`,
    };
    const svg = join(outDir, `${mode}-${i}.svg`);
    const png = join(outDir, `${mode}-${i}.png`);
    writeFileSync(svg, render(scene, { style: "paper-atlas", camera: "plan", width: 1200 }));
    const r = Bun.spawnSync(["inkscape", svg, "--export-type=png", `--export-filename=${png}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (r.exitCode !== 0) throw new Error(`[history] inkscape failed: ${r.stderr.toString()}`);
    pngs.push(png);
    console.log(
      `[history] ${mode} ${frame.date} live=${live.length} ghosts=${ghosts} islands=${members.length} ${note}`,
    );
  }
  summary.push(`${caption}: ${moved.join(", ")}`);
}
const sheet = join(HERE, "img", `history-${repo}.webp`);
const r = Bun.spawnSync(
  [
    "montage",
    ...pngs,
    "-tile",
    `${frames.length}x`,
    "-geometry",
    "700x900>+8+8",
    "-background",
    "#D9D4CA",
    "-quality",
    "82",
    sheet,
  ],
  { stdout: "pipe", stderr: "pipe" },
);
if (r.exitCode !== 0) throw new Error(`[history] montage failed: ${r.stderr.toString()}`);
writeFileSync(join(outDir, "summary.txt"), summary.join("\n") + "\n");
console.log(`[history] sheet=${sheet}\n${summary.join("\n")}`);
