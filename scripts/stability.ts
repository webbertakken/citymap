// `bun scripts/stability.ts <repo> [from] [count]`: lays `count` commits from index `from` (a fresh plat at the first)
// and reports how many lots move per commit, overall and on commits that delete files.
import { DEFAULT_LAND_USES, DEFAULT_SPLIT, initialState, layCity, type City, type Options } from "@citymap/ground-plan";
import { readHistory } from "@citymap/history";
import { compareCities, summarise, type Step } from "./stability/stability.ts";

const [repo, fromArg = "0", countArg = "300"] = process.argv.slice(2);
if (!repo) throw new Error("usage: bun scripts/stability.ts <repo> [from] [count]");
const options: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  split: DEFAULT_SPLIT,
};
const from = Number(fromArg);
const count = Number(countArg);
let state = initialState(options);
let previous: { city: City; identities: Set<string> } | null = null;
const steps: Step[] = [];
for await (const snapshot of readHistory(repo, { from })) {
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
