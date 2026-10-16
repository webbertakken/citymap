// Road classes by the tier of the land a road divides: what a cut is laid as, how it follows its land, and the land
// a folder must budget for its own roads.
import { GROWTH_PCT, ROAD_CLASSES, ROAD_WIDTH, TIER_BAND_PCT, TIER_MASS_MILLE, type RoadClass } from "./constants";
import { floorDiv } from "./fixed/arithmetic";

/** Road classes by tier (hamlet, village, town, city, metropolis): a folder's first cut, and its others. */
const FIRST_CLASS: readonly RoadClass[] = ["street", "collector", "avenue", "boulevard", "boulevard"];
const OTHER_CLASS: readonly RoadClass[] = ["street", "street", "collector", "avenue", "avenue"];

/** Settlement tiers by decade of mass, smallest first. */
export const TIERS = ["hamlet", "village", "town", "city", "metropolis"] as const;
export type Tier = (typeof TIERS)[number];

/** The tier of a mass, without hysteresis: how many thresholds it reaches. */
export const coldTier = (massMille: number) => TIER_MASS_MILLE.filter((threshold) => massMille >= threshold).length;

/** A town's tier as its mass moves: up at a threshold × the band, down below a threshold ÷ the band. */
export function townTier(massMille: number, previous: Tier | undefined): Tier {
  let tier = previous === undefined ? coldTier(massMille) : TIERS.indexOf(previous);
  while (tier < TIER_MASS_MILLE.length && massMille * 100 >= TIER_MASS_MILLE[tier]! * TIER_BAND_PCT) tier++;
  while (tier > 0 && massMille * TIER_BAND_PCT < TIER_MASS_MILLE[tier - 1]! * 100) tier--;
  return TIERS[tier]!;
}

/** A town's tier as its roads read it: the tier now, and the tier at the top of its band (never lower). */
export interface TierRule {
  readonly tier: number;
  readonly reach: number;
}

export const tierRule = (tier: Tier, rootMassMille: number): TierRule => ({
  tier: TIERS.indexOf(tier),
  reach: Math.max(TIERS.indexOf(tier), coldTier(floorDiv(rootMassMille * GROWTH_PCT, 100))),
});

const lesser = (a: RoadClass, b: RoadClass) => (ROAD_CLASSES.indexOf(a) <= ROAD_CLASSES.indexOf(b) ? a : b);

/** Road class by the tier of the land being cut: a folder's first cut is one class above its others. */
export function cutClass(massMille: number, first: boolean): RoadClass {
  const tier = TIER_MASS_MILLE.filter((threshold) => massMille >= threshold).length;
  return (first ? FIRST_CLASS : OTHER_CLASS)[tier]!;
}

/** A laid road's class as its land's mass moves: a tier up past its threshold × the band, down below it ÷ the band. */
export function reclass(cls: RoadClass, massMille: number, first: boolean): RoadClass {
  const classes = first ? FIRST_CLASS : OTHER_CLASS;
  let tier = classes.indexOf(cls);
  while (tier < TIER_MASS_MILLE.length && massMille * 100 >= TIER_MASS_MILLE[tier]! * TIER_BAND_PCT) tier++;
  while (tier > 0 && massMille * TIER_BAND_PCT < TIER_MASS_MILLE[tier - 1]! * 100) tier--;
  return classes[tier]!;
}

/** The class a cut's land is laid at: room for the land at the top of its band, so a reclass takes no lots. */
export const reserveFor = (massMille: number, first: boolean) => cutClass(floorDiv(massMille * GROWTH_PCT, 100), first);

/**
 * A cut's class under the town's tier, when tiers are on: the town's first cut takes the tier's class, every other cut
 * the mass rule's capped one class below it.
 */
export function classOf(massMille: number, first: boolean, townFirst: boolean, rule: TierRule | undefined): RoadClass {
  if (!rule) return cutClass(massMille, first);
  return townFirst ? FIRST_CLASS[rule.tier]! : lesser(cutClass(massMille, first), OTHER_CLASS[rule.tier]!);
}

/** A laid cut's class as its land's mass moves, under the town's tier when tiers are on. */
export function reclassOf(
  cls: RoadClass,
  massMille: number,
  first: boolean,
  townFirst: boolean,
  rule: TierRule | undefined,
): RoadClass {
  if (!rule) return reclass(cls, massMille, first);
  return townFirst ? FIRST_CLASS[rule.tier]! : lesser(reclass(cls, massMille, first), OTHER_CLASS[rule.tier]!);
}

/** A cut's right of way: the class the rule gives with the town and the land each at the top of its band. */
export function rightOfWayFor(
  massMille: number,
  first: boolean,
  townFirst: boolean,
  rule: TierRule | undefined,
): RoadClass {
  const reserve = reserveFor(massMille, first);
  return !rule || townFirst ? reserve : lesser(reserve, OTHER_CLASS[rule.reach]!);
}

/** The class of a road other than a cut (a street village's high street) under the town's tier. */
export const cappedClass = (cls: RoadClass, rule: TierRule | undefined) =>
  rule ? lesser(cls, OTHER_CLASS[rule.tier]!) : cls;

/**
 * The width a folder's first cut can take beyond a street, in fixed units: the land its own roads need above the street
 * margin every lot already carries. A folder with one item has no cut, and needs none.
 */
export const roadExcess = (massMille: number, items: number) =>
  items < 2 ? 0 : ROAD_WIDTH[reserveFor(massMille, true)] - ROAD_WIDTH.street;
