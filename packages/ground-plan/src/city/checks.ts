import * as v from "valibot";
import { DISTRICT_FORMS, FORMS } from "../archetype/forms";
import { ROAD_CLASSES } from "../constants";
import { LAND_USES } from "../land-use/land-use";
import { int, nat } from "../plat/schema";
import { SEPARATIONS } from "../region/separate";

export const ptSchema = v.strictObject({ x: int, y: int });
const ptsSchema = v.array(ptSchema);
export const roadSchema = v.strictObject({
  pts: ptsSchema,
  cls: v.picklist(ROAD_CLASSES),
  width: v.exactOptional(nat),
});

export const townSchema = v.strictObject({
  key: v.string(),
  name: v.string(),
  form: v.picklist(FORMS),
  old: v.boolean(),
  outline: ptsSchema,
  water: v.array(ptsSchema),
  canals: v.exactOptional(v.array(ptsSchema)),
  roads: v.array(roadSchema),
  blocks: v.array(
    v.strictObject({
      pts: ptsSchema,
      district: nat,
      kind: v.picklist(["built", "reserve", "park", "plaza", "green"]),
      form: v.exactOptional(v.picklist(DISTRICT_FORMS)),
    }),
  ),
  lots: v.array(
    v.strictObject({
      pts: ptsSchema,
      key: v.string(),
      address: v.string(),
      vacant: v.boolean(),
      path: v.string(),
      use: v.picklist(LAND_USES),
      district: nat,
      form: v.exactOptional(v.picklist(DISTRICT_FORMS)),
    }),
  ),
  districts: v.array(
    v.strictObject({
      pts: ptsSchema,
      path: v.string(),
      name: v.string(),
      depth: nat,
      massMille: nat,
      form: v.exactOptional(v.picklist(FORMS)),
      ward: v.boolean(),
    }),
  ),
  stats: v.strictObject({ lots: nat, overflow: nat, offLand: nat, docs: nat, lotArea2: nat, landArea2: nat }),
});

export const citySchema = v.strictObject({
  repository: v.string(),
  commit: v.string(),
  towns: v.pipe(
    v.array(townSchema),
    v.check((towns) => new Set(towns.map((t) => t.key)).size === towns.length, "every town has a key of its own"),
  ),
  highways: v.array(roadSchema),
  separable: v.exactOptional(
    v.pipe(
      v.array(v.picklist(SEPARATIONS)),
      v.check(
        (list) =>
          list.length > 0 &&
          list.every((s, i) => i === 0 || SEPARATIONS.indexOf(list[i - 1]!) < SEPARATIONS.indexOf(s)),
        "the separations a city records are named once each, in order",
      ),
    ),
  ),
  declared: v.exactOptional(v.literal(true)),
});
