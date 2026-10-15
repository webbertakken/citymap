// Road classes by the tier of the land a road divides: what a cut is laid as, how it follows its land, and the land
// a folder must budget for its own roads.
import { GROWTH_PCT, ROAD_WIDTH, TIER_BAND_PCT, TIER_MASS_MILLE, type RoadClass } from "./constants";
import { floorDiv } from "./fixed/arithmetic";

/** Road classes by tier (hamlet, village, town, city): a folder's first cut, and its others one class lower. */
const FIRST_CLASS: readonly RoadClass[] = ["street", "collector", "avenue", "boulevard"];
const OTHER_CLASS: readonly RoadClass[] = ["street", "street", "collector", "avenue"];

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
 * The width a folder's first cut can take beyond a street, in fixed units: the land its own roads need above the street
 * margin every lot already carries. A folder with one item has no cut, and needs none.
 */
export const roadExcess = (massMille: number, items: number) =>
  items < 2 ? 0 : ROAD_WIDTH[reserveFor(massMille, true)] - ROAD_WIDTH.street;
