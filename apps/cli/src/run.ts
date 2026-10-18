import { join, resolve } from "node:path";
import {
  DEFAULT_LAND_USES,
  initialState,
  settingKey,
  layCity,
  parseLock,
  serialiseLock,
  type City,
  type FoldState,
  type Options,
  type Snapshot,
} from "@citymap/ground-plan";
import {
  FOLD_STRIDES,
  FileHistory,
  isAncestor,
  readHistory,
  readTree,
  resolveCommit,
  type Strides,
} from "@citymap/history";
import { serialiseCityFile } from "@citymap/measures";
import { renderCity } from "@citymap/svg";
import type { LayCommand } from "./args";
import { measureCity, readNamedReports } from "./measures";

/** The outside world the CLI touches, injected so runs are testable. */
export interface Io {
  readonly readFile: (path: string) => string | null;
  readonly writeFile: (path: string, text: string) => void;
  readonly log: (line: string) => void;
  readonly now: () => number;
}

export const LOCKFILE = "citymap.lock.json";
/** With `--lock`, the lock is also saved every this many laid snapshots, so a long fold cut short resumes near its end. */
export const LOCK_EVERY = 1000;

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
  const { commit, index, plat } = parseLock(text);
  if (plat.setting !== settingKey(options)) {
    io.log(`lock/ignored reason=setting lock=${plat.setting}`);
    return null;
  }
  if (!(await isAncestor(repo, commit, target))) {
    io.log(`lock/ignored reason=not-an-ancestor commit=${commit}`);
    return null;
  }
  io.log(`lock/resume commit=${commit} index=${index}`);
  return { commit, index, state: initialState(options, plat) };
}

/** Folds the repository's history into its city and writes what the command asks for. Returns the city. */
export async function runLay(
  command: LayCommand,
  io: Io,
  lockEvery = LOCK_EVERY,
  strides: Strides = FOLD_STRIDES,
): Promise<City> {
  const started = io.now();
  const repo = resolve(command.repo);
  const options: Options = {
    densityPct: command.densityPct,
    landUses: command.tests ? [...DEFAULT_LAND_USES, "tests"] : DEFAULT_LAND_USES,
    order: "centre-out",
    jog: command.jog,
    warp: command.warp,
    loops: command.loops,
    split: command.split,
    toggles: command.toggles,
  };
  const target = await resolveCommit(repo, command.to);
  // Named reports are read first, so a bad one fails before the fold.
  const named = command.measures ? readNamedReports(repo, command.coverage, io) : [];
  const fileHistory = command.measures && command.history ? new FileHistory() : null;
  const lock = command.history ? await readLock(repo, target, options, io) : null;
  let state = lock?.state ?? initialState(options);
  let city: City | null = null;
  let last: Snapshot | null = null;
  let laidCount = 0;
  let index = 0;
  const onEvent = (e: { code: string; detail: Readonly<Record<string, string | number>> }) =>
    io.log(`${e.code} ${fields(e.detail)}`);
  const saveLock = (commit: string, at: number) => {
    io.writeFile(join(repo, LOCKFILE), serialiseLock({ commit, index: at, plat: state.plat }));
    io.log(`lock/saved commit=${commit} index=${at}`);
  };
  // One state, every file at once; or the history, folded on its schedule from the lock or the first commit.
  const snapshots = command.history
    ? readHistory(repo, {
        to: target,
        ...(lock ? { from: lock.index } : {}),
        strides,
        onEvent,
        ...(fileHistory ? { fileHistory } : {}),
      })
    : (async function* () {
        yield await readTree(repo, target, { onEvent });
      })();
  for await (const snapshot of snapshots) {
    const laid = layCity(snapshot, state, options);
    state = laid.state;
    city = laid.city;
    last = snapshot;
    index = snapshot.index;
    laidCount++;
    // The lock's own commit is laid again to restore the towns as they stood; its decisions are already in the plat.
    if (command.verbose) for (const event of laid.events) onEvent(event);
    if (command.lock && laidCount % lockEvery === 0 && snapshot.commit !== target) saveLock(snapshot.commit, index);
  }
  const laid = city!;
  const lots = laid.towns.reduce((sum, t) => sum + t.stats.lots, 0);
  const overflow = laid.towns.reduce((sum, t) => sum + t.stats.overflow, 0);
  const measures =
    command.measures && command.out
      ? await measureCity({
          repo,
          target,
          city: laid,
          plat: state.plat,
          snapshot: last!,
          history: fileHistory,
          named,
          io,
        })
      : null;
  if (command.out) io.writeFile(command.out, serialiseCityFile({ city: laid, measures }));
  if (command.svg)
    io.writeFile(
      command.svg,
      renderCity(laid, {
        title: laid.repository,
        subtitle: `${target.slice(0, 12)} · ${laid.towns.length} towns · ${lots} lots · ${overflow} without room`,
        theme: command.theme,
        camera: command.camera,
        regions: command.voronoi,
      }),
    );
  if (command.lock) saveLock(target, index);
  // The commits folded, the lock's own included; windows lay fewer of them.
  const commits = index + 1 - (lock?.index ?? 0);
  io.log(
    `fold/done repository=${laid.repository} commits=${commits} laid=${laidCount} lots=${lots} overflow=${overflow} ms=${Math.round(io.now() - started)}`,
  );
  return laid;
}
