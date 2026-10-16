import { FLATTEN_HYSTERESIS_PCT, FLATTEN_LIMIT } from "../constants";
import { floorDiv } from "../fixed/arithmetic";
import { compareKeys } from "../fixed/hash";
import type { LotSeed, TreeNode } from "../tree/tree";
import { isFlat, type DistrictForm, type FlatForm, type Form } from "./forms";
import type { Toggle } from "./toggles";

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
  /** Child folders that are packages, and their share of the mass (archipelago only; else 0). */
  readonly packages: number;
  readonly packageMille: number;
  /** The effective number of children, in per mille: one over the sum of squared shares (quarters only; else 0). */
  readonly neffMille: number;
}

/** What only some rules need: the packages' masses, and whether to measure the effective number of children. */
export interface MoreFeatures {
  readonly packageMasses?: readonly number[];
  readonly neff?: boolean;
}

const share = (part: number, whole: number) => (whole > 0 ? Math.floor((part * 1000) / whole) : 0);

/** One over the sum of squared shares of the parts (children and own files), in per mille; exact, in BigInt. */
function effectiveMille(massMille: number, parts: readonly number[]): number {
  const squares = parts.reduce((sum, m) => sum + BigInt(m) * BigInt(m), 0n);
  if (squares === 0n) return 0;
  return Number((BigInt(massMille) * BigInt(massMille) * 1000n) / squares);
}

export function features(
  massMille: number,
  childMasses: readonly number[],
  lots: number,
  more: MoreFeatures = {},
): Features {
  const sorted = childMasses.toSorted((a, b) => b - a);
  const own = Math.max(0, massMille - childMasses.reduce((sum, m) => sum + m, 0));
  const packageMasses = more.packageMasses ?? [];
  return {
    massMille,
    s1: share(sorted[0] ?? 0, massMille),
    s2: share(sorted[1] ?? 0, massMille),
    f0: share(own, massMille),
    lots,
    packages: packageMasses.length,
    packageMille: share(
      packageMasses.reduce((sum, m) => sum + m, 0),
      massMille,
    ),
    neffMille: more.neff ? effectiveMille(massMille, [...childMasses, own]) : 0,
  };
}

/** A corridor holds at least this share (‰) in its heaviest child, and under this share in its own files. */
export const CORRIDOR_SHARE = 900;
export const CORRIDOR_OWN = 100;
/** An archipelago has at least this many packages, holding at least this share (‰) of its mass. */
export const ARCHIPELAGO_PACKAGES = 3;
export const ARCHIPELAGO_COVER = 500;
/** Quarters need at least this many effective children (‰), and no child over this share (‰). */
export const QUARTERS_NEFF = 7000;
export const QUARTERS_MAX_SHARE = 250;

/** The incumbent holds down to this margin; a challenger needs this one. */
const STAY = 150;
const CHALLENGE = 100;
/** A corridor's own, narrower band: its features are thresholds. */
const CORRIDOR_STAY = 50;
const CORRIDOR_CHALLENGE = 20;

interface Rule {
  readonly form: Exclude<DistrictForm, "polycentric">;
  readonly margin: (f: Features) => number;
  /** The toggle that turns the rule on; none for the forms that are always on. */
  readonly toggle?: Toggle;
  readonly stay: number;
  readonly challenge: number;
}

// District forms in priority order, each with its margin in per mille; polycentric is the fallback, always open.
const RULES: readonly Rule[] = [
  {
    form: "corridor",
    toggle: "corridor",
    margin: (f) => Math.min(f.s1 - CORRIDOR_SHARE, CORRIDOR_OWN - 1 - f.f0),
    stay: CORRIDOR_STAY,
    challenge: CORRIDOR_CHALLENGE,
  },
  {
    form: "archipelago",
    toggle: "archipelago",
    margin: (f) =>
      Math.min(
        floorDiv((f.packages - ARCHIPELAGO_PACKAGES) * 1000, ARCHIPELAGO_PACKAGES),
        f.packageMille - ARCHIPELAGO_COVER,
      ),
    stay: STAY,
    challenge: CHALLENGE,
  },
  { form: "radial", margin: (f) => f.s1 - 600, stay: STAY, challenge: CHALLENGE },
  { form: "twin", margin: (f) => Math.min(f.s2 - 300, f.s1 + f.s2 - 750), stay: STAY, challenge: CHALLENGE },
  {
    form: "quarters",
    toggle: "quarters",
    margin: (f) => Math.min(floorDiv(f.neffMille - QUARTERS_NEFF, 7), QUARTERS_MAX_SHARE - f.s1),
    stay: STAY,
    challenge: CHALLENGE,
  },
];

/** The district form: a Schmitt trigger round the incumbent, over the rules whose toggles are on. */
export function districtForm(f: Features, previous: Form | undefined, toggles: readonly Toggle[]): DistrictForm {
  const rules = RULES.filter((rule) => rule.toggle === undefined || toggles.includes(rule.toggle));
  const challenger = (list: readonly Rule[], cold: boolean) =>
    list.find((rule) => rule.margin(f) >= (cold ? 0 : rule.challenge))?.form;
  // Polycentric ranks after every rule and never falls out of its band; a form whose toggle is off starts cold.
  const i = previous === "polycentric" ? rules.length : rules.findIndex((rule) => rule.form === previous);
  if (previous === undefined || isFlat(previous) || i < 0) return challenger(rules, true) ?? "polycentric";
  const earlier = challenger(rules.slice(0, i), false);
  if (earlier) return earlier;
  const incumbent = rules[i];
  if (!incumbent || incumbent.margin(f) >= -incumbent.stay) return previous;
  return challenger(rules.slice(i + 1), false) ?? "polycentric";
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
  const children = node.children.toSorted((a, b) => a.firstSeen - b.firstSeen || compareKeys(a.path, b.path));
  for (const child of children) {
    const inner = flatten(child);
    lots.push(...inner.lots);
    docs += inner.docs;
  }
  return { lots, docs };
}

/** A child folder an archipelago makes an island: a workspace member whose mass is at least half source. */
export const isPackage = (node: TreeNode) =>
  node.member && node.massMille > 0 && 2 * node.sourceMille >= node.massMille;

/** A folder's form given the form it had: flat (one neighbourhood) or a district form, each with hysteresis. */
export function classifyNode(node: TreeNode, previous: Form | undefined, toggles: readonly Toggle[]): Form {
  const leaf = node.children.length === 0;
  let flat = leaf || node.demand <= FLATTEN_LIMIT;
  if (previous !== undefined && isFlat(previous) && !leaf)
    flat = node.demand * 100 <= FLATTEN_LIMIT * FLATTEN_HYSTERESIS_PCT;
  if (previous !== undefined && !isFlat(previous))
    flat = leaf || node.demand * FLATTEN_HYSTERESIS_PCT <= FLATTEN_LIMIT * 100;
  const lots = flat ? flatten(node).lots.length : 0;
  const more: MoreFeatures = flat
    ? {}
    : {
        ...(toggles.includes("archipelago")
          ? { packageMasses: node.children.filter(isPackage).map((c) => c.massMille) }
          : {}),
        neff: toggles.includes("quarters"),
      };
  const f = features(
    node.massMille,
    node.children.map((c) => c.massMille),
    lots,
    more,
  );
  return flat ? flatForm(f, previous) : districtForm(f, previous, toggles);
}
