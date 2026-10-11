import { DISTRICT_FORMS, FORMS } from "../archetype/forms";
import { ROAD_WIDTH, type RoadClass } from "../constants";
import { LAND_USES } from "../land-use/land-use";
import { array, bool, int, nat, object, oneOf, optional, str, type Check } from "../plat/validate";
import type { Town } from "./city";

export const ROAD_CLASSES = Object.keys(ROAD_WIDTH) as RoadClass[];

export const ptCheck = object({ x: int, y: int });
const ptsCheck = array(ptCheck);
export const roadCheck = object({ pts: ptsCheck, cls: oneOf(ROAD_CLASSES) });

export const townCheck: Check<Town> = object({
  key: str,
  name: str,
  form: oneOf(FORMS),
  old: bool,
  outline: ptsCheck,
  water: array(ptsCheck),
  roads: array(roadCheck),
  blocks: array(
    object({
      pts: ptsCheck,
      district: nat,
      kind: oneOf(["built", "reserve", "park", "plaza", "green"] as const),
      form: optional(oneOf(DISTRICT_FORMS)),
    }),
  ),
  lots: array(
    object({
      pts: ptsCheck,
      key: str,
      address: str,
      vacant: bool,
      path: str,
      use: oneOf(LAND_USES),
      district: nat,
      form: optional(oneOf(DISTRICT_FORMS)),
    }),
  ),
  districts: array(
    object({
      pts: ptsCheck,
      path: str,
      name: str,
      depth: nat,
      massMille: nat,
      form: optional(oneOf(FORMS)),
      ward: bool,
    }),
  ),
  stats: object({ lots: nat, overflow: nat, offLand: nat, docs: nat, lotArea2: nat, landArea2: nat }),
});
