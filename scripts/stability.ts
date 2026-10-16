// `bun scripts/stability.ts <repo> [from] [count] [--lock=<file>]`: lays `count` steps of the fold schedule from index
// `from` (a fresh plat at the first; the root's fold when 0), or from a lockfile's commit and plat, and reports how many
// lots move per laid step, overall and on steps that delete files.
import { readFileSync } from "node:fs";
import {
  DEFAULT_LAND_USES,
  DEFAULT_SPLIT,
  initialState,
  layCity,
  parseLock,
  type City,
  type Options,
} from "@citymap/ground-plan";
import { readHistory } from "@citymap/history";
import { compareCities, summarise, type Step } from "./stability/stability.ts";

const args = process.argv.slice(2);
const [repo, fromArg = "0", countArg = "300"] = args.filter((arg) => !arg.startsWith("--"));
const lockFile = args.find((arg) => arg.startsWith("--lock="))?.slice("--lock=".length);
if (!repo) throw new Error("usage: bun scripts/stability.ts <repo> [from] [count] [--lock=<file>]");
const options: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  split: DEFAULT_SPLIT,
};
const lock = lockFile === undefined ? null : parseLock(readFileSync(lockFile, "utf8"));
const from = lock?.index ?? Number(fromArg);
const count = Number(countArg);
let state = initialState(options, lock?.plat);
let previous: { city: City; identities: Set<string> } | null = null;
const steps: Step[] = [];
for await (const snapshot of readHistory(repo, from > 0 || lock ? { from } : {})) {
  const laid = layCity(snapshot, state, options);
  state = laid.state;
  const identities = new Set(snapshot.files.map((f) => f.identity));
  if (previous) {
    const deleting = [...previous.identities].some((id) => !identities.has(id));
    steps.push({ ...compareCities(previous.city, laid.city), deleting });
  }
  previous = { city: laid.city, identities };
  if (steps.length === count) break;
}
const s = summarise(steps);
console.log(
  `stability/done repo=${repo.split("/").pop()} from=${from} commits=${s.commits} deleting=${s.deleting} ` +
    `moved-per-commit=${(s.perCommitMille / 10).toFixed(1)}% moved-on-deleting=${(s.deletingMille / 10).toFixed(1)}%`,
);
