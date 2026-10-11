import * as v from "valibot";
import { DISTRICT_FORMS, FORMS } from "../archetype/forms";
import { ROAD_CLASSES } from "../constants";
import { LAND_USES } from "../land-use/land-use";
import { int, nat } from "../plat/schema";

export const ptSchema = v.strictObject({ x: int, y: int });
const ptsSchema = v.array(ptSchema);
export const roadSchema = v.strictObject({ pts: ptsSchema, cls: v.picklist(ROAD_CLASSES) });

export const townSchema = v.strictObject({
  key: v.string(),
  name: v.string(),
  form: v.picklist(FORMS),
  old: v.boolean(),
  outline: ptsSchema,
  water: v.array(ptsSchema),
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
  towns: v.array(townSchema),
  highways: v.array(roadSchema),
});
