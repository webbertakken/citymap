import { join, resolve } from "node:path";
import {
  DEFAULT_LAND_USES,
  initialState,
  settingKey,
  layCity,
  parseLock,
  serialiseCity,
  serialiseLock,
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
/** With `--lock`, the lock is also saved every this many laid commits, so a long fold cut short resumes near its end. */
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
export async function runLay(command: LayCommand, io: Io, lockEvery = LOCK_EVERY): Promise<City> {
  const started = io.now();
  const repo = resolve(command.repo);
  const options: Options = {
    densityPct: command.densityPct,
    landUses: command.tests ? [...DEFAULT_LAND_USES, "tests"] : DEFAULT_LAND_USES,
    order: "centre-out",
    jog: command.jog,
    warp: command.warp,
    split: command.split,
  };
  const target = await resolveCommit(repo, command.to);
  const lock = await readLock(repo, target, options, io);
  let state = lock?.state ?? initialState(options);
  let city: City | null = null;
  let commits = 0;
  let index = 0;
  const onEvent = (e: { code: string; detail: Readonly<Record<string, string | number>> }) =>
    io.log(`${e.code} ${fields(e.detail)}`);
  const saveLock = (commit: string, at: number) => {
    io.writeFile(join(repo, LOCKFILE), serialiseLock({ commit, index: at, plat: state.plat }));
    io.log(`lock/saved commit=${commit} index=${at}`);
  };
  for await (const snapshot of readHistory(repo, { to: target, from: lock?.index ?? 0, onEvent })) {
    const laid = layCity(snapshot, state, options);
    state = laid.state;
    city = laid.city;
    index = snapshot.index;
    commits++;
    // The lock's own commit is laid again to restore the towns as they stood; its decisions are already in the plat.
    if (command.verbose) for (const event of laid.events) onEvent(event);
    if (command.lock && commits % lockEvery === 0 && snapshot.commit !== target) saveLock(snapshot.commit, index);
  }
  const laid = city!;
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
  if (command.lock) saveLock(target, index);
  io.log(
    `fold/done repository=${laid.repository} commits=${commits} lots=${lots} overflow=${overflow} ms=${Math.round(io.now() - started)}`,
  );
  return laid;
}
