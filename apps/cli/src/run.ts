import { join, resolve } from "node:path";
import {
  CitymapError,
  DEFAULT_LAND_USES,
  canonicalJson,
  initialState,
  landKey,
  layCity,
  parsePlat,
  serialiseCity,
  type City,
  type FoldState,
  type Options,
} from "@citymap/ground-plan";
import { isAncestor, readHistory, resolveCommit } from "@citymap/history";
import { renderCity } from "@citymap/svg";
import type { LayCommand } from "./args";

/** The outside world the CLI touches, injected so runs are testable. */
export interface Io {
  readonly readFile: (path: string) => string | null;
  readonly writeFile: (path: string, text: string) => void;
  readonly log: (line: string) => void;
  readonly now: () => number;
}

export const LOCKFILE = "citymap.lock.json";

interface Lock {
  readonly commit: string;
  readonly index: number;
  readonly state: FoldState;
}

const fields = (detail: Readonly<Record<string, string | number>>) =>
  Object.entries(detail)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

/** Reads the lockfile, if any, and keeps it only when it is for these options and in the history of the target. */
async function readLock(repo: string, target: string, options: Options, io: Io): Promise<Lock | null> {
  const text = io.readFile(join(repo, LOCKFILE));
  if (text === null) return null;
  let value: { commit?: unknown; index?: unknown; plat?: unknown };
  try {
    value = JSON.parse(text) as typeof value;
  } catch {
    throw new CitymapError("cli/lockfile", `${LOCKFILE} is not JSON`);
  }
  if (typeof value.commit !== "string" || !Number.isSafeInteger(value.index) || (value.index as number) < 0)
    throw new CitymapError("cli/lockfile", `${LOCKFILE} needs a commit and an index`);
  const plat = parsePlat(JSON.stringify(value.plat));
  if (plat.landKey !== landKey(options.landUses)) {
    io.log(`lock/ignored reason=land lock=${plat.landKey}`);
    return null;
  }
  if (!(await isAncestor(repo, value.commit, target))) {
    io.log(`lock/ignored reason=not-an-ancestor commit=${value.commit}`);
    return null;
  }
  io.log(`lock/resume commit=${value.commit} index=${value.index}`);
  return { commit: value.commit, index: value.index as number, state: initialState(options, plat) };
}

/** Folds the repository's history into its city and writes what the command asks for. Returns the city. */
export async function runLay(command: LayCommand, io: Io): Promise<City> {
  const started = io.now();
  const repo = resolve(command.repo);
  const options: Options = {
    densityPct: command.densityPct,
    landUses: command.tests ? [...DEFAULT_LAND_USES, "tests"] : DEFAULT_LAND_USES,
    order: "centre-out",
    jog: command.jog,
    warp: command.warp,
  };
  const target = await resolveCommit(repo, command.to);
  const lock = await readLock(repo, target, options, io);
  let state = lock?.state ?? initialState(options);
  let city: City | null = null;
  let commits = 0;
  let index = 0;
  const onEvent = (e: { code: string; detail: Readonly<Record<string, string | number>> }) => io.log(`${e.code} ${fields(e.detail)}`);
  for await (const snapshot of readHistory(repo, { to: target, from: lock?.index ?? 0, onEvent })) {
    const laid = layCity(snapshot, state, options);
    state = laid.state;
    city = laid.city;
    index = snapshot.index;
    commits++;
    // The lock's own commit is laid again to restore the towns as they stood; its decisions are already in the plat.
    if (command.verbose) for (const event of laid.events) onEvent(event);
  }
  const laid = city as City;
  const lots = laid.towns.reduce((sum, t) => sum + t.stats.lots, 0);
  const overflow = laid.towns.reduce((sum, t) => sum + t.stats.overflow, 0);
  if (command.out) io.writeFile(command.out, serialiseCity(laid));
  if (command.svg)
    io.writeFile(
      command.svg,
      renderCity(laid, {
        title: laid.repository,
        subtitle: `${target.slice(0, 12)} · ${laid.towns.length} towns · ${lots} lots · ${overflow} without room`,
        theme: command.theme,
        camera: command.camera,
      }),
    );
  if (command.lock) io.writeFile(join(repo, LOCKFILE), canonicalJson({ commit: target, index, plat: state.plat }));
  io.log(`fold/done repository=${laid.repository} commits=${commits} lots=${lots} overflow=${overflow} ms=${Math.round(io.now() - started)}`);
  return laid;
}
