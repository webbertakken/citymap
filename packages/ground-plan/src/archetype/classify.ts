import { FLATTEN_LIMIT } from "../constants";
import { compareKeys } from "../fixed/hash";
import type { LotSeed, TreeNode } from "../tree/tree";
import { isFlat, type DistrictForm, type FlatForm, type Form } from "./forms";

/** The shape of a folder, in per mille of its mass. */
export interface Features {
  readonly massMille: number;
  /** Shares of the heaviest and second-heaviest child folder. */
  readonly s1: number;
  readonly s2: number;
  /** Share in the folder's own files. */
  readonly f0: number;
  /** Lots the folder holds when flattened. */
  readonly lots: number;
}

const share = (part: number, whole: number) => (whole > 0 ? Math.floor((part * 1000) / whole) : 0);

export function features(massMille: number, childMasses: readonly number[], lots: number): Features {
  const sorted = [...childMasses].sort((a, b) => b - a);
  const own = Math.max(0, massMille - childMasses.reduce((sum, m) => sum + m, 0));
  return {
    massMille,
    s1: share(sorted[0] ?? 0, massMille),
    s2: share(sorted[1] ?? 0, massMille),
    f0: share(own, massMille),
    lots,
  };
}

// District forms in priority order, each with its margin in per mille; polycentric always qualifies.
const RULES: readonly { form: DistrictForm; margin: (f: Features) => number }[] = [
  { form: "radial", margin: (f) => f.s1 - 600 },
  { form: "twin", margin: (f) => Math.min(f.s2 - 300, f.s1 + f.s2 - 750) },
  { form: "polycentric", margin: () => 1000 },
];
/** The incumbent holds down to this margin; a challenger needs this one. */
const STAY = 150;
const CHALLENGE = 100;

/** The district form: a Schmitt trigger round the incumbent. */
export function districtForm(f: Features, previous: Form | undefined): DistrictForm {
  const first = (rules: typeof RULES, at: number) => rules.find((rule) => rule.margin(f) >= at)?.form;
  if (previous === undefined || isFlat(previous)) return first(RULES, 0) as DistrictForm;
  const i = RULES.findIndex((rule) => rule.form === previous);
  const earlier = first(RULES.slice(0, i), CHALLENGE);
  if (earlier) return earlier;
  if ((RULES[i] as (typeof RULES)[number]).margin(f) >= -STAY) return previous;
  return first(RULES.slice(i + 1), CHALLENGE) as DistrictForm;
}

const HAMLET_MASS = 25_000;
const STREET_LOTS = 40;
const STREET_F0 = 600;

/** The neighbourhood form, each threshold with a ±25 % band round the incumbent. */
export function flatForm(f: Features, previous: Form | undefined): FlatForm {
  const hamlet = previous === "hamlet" ? f.massMille * 4 < HAMLET_MASS * 5 : f.massMille < HAMLET_MASS;
  if (hamlet) return "hamlet";
  const street =
    previous === "street-village"
      ? f.lots * 5 >= STREET_LOTS * 4 && f.f0 * 5 >= STREET_F0 * 4
      : f.lots >= STREET_LOTS && f.f0 >= STREET_F0;
  return street ? "street-village" : "neighbourhood";
}

/** A folder's lots in order: its own, then each child's by first appearance and path; and all its docs. */
export function flatten(node: TreeNode): { lots: LotSeed[]; docs: number } {
  const lots = [...node.lots];
  let docs = node.docs;
  const children = [...node.children].sort((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.path, b.path));
  for (const child of children) {
    const inner = flatten(child);
    lots.push(...inner.lots);
    docs += inner.docs;
  }
  return { lots, docs };
}

/** A folder's form given the form it had: flat (one neighbourhood) or a district form, each with hysteresis. */
export function classifyNode(node: TreeNode, previous: Form | undefined): Form {
  const leaf = node.children.length === 0;
  let flat = leaf || node.demand <= FLATTEN_LIMIT;
  if (previous !== undefined && isFlat(previous) && !leaf) flat = node.demand * 2 <= FLATTEN_LIMIT * 3;
  if (previous !== undefined && !isFlat(previous)) flat = leaf || node.demand * 3 <= FLATTEN_LIMIT * 2;
  const lots = flat ? flatten(node).lots.length : 0;
  const f = features(
    node.massMille,
    node.children.map((c) => c.massMille),
    lots,
  );
  return flat ? flatForm(f, previous) : districtForm(f, previous);
}
