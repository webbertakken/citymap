/** Forms of a flattened folder: one neighbourhood. */
export type FlatForm = "hamlet" | "street-village" | "neighbourhood";
/** Forms of a folder that arranges its children; corridor, archipelago and quarters only with their toggles on. */
export type DistrictForm = "radial" | "twin" | "polycentric" | "corridor" | "archipelago" | "quarters";
export type Form = FlatForm | DistrictForm;

export const FLAT_FORMS: readonly FlatForm[] = ["hamlet", "street-village", "neighbourhood"];
export const DISTRICT_FORMS: readonly DistrictForm[] = [
  "radial",
  "twin",
  "polycentric",
  "corridor",
  "archipelago",
  "quarters",
];
export const FORMS: readonly Form[] = [...FLAT_FORMS, ...DISTRICT_FORMS];

export const isFlat = (form: Form | undefined): form is FlatForm => FLAT_FORMS.some((flat) => flat === form);
