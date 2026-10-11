/** Forms of a flattened folder: one neighbourhood. */
export type FlatForm = "hamlet" | "street-village" | "neighbourhood";
/** Forms of a folder that arranges its children. */
export type DistrictForm = "radial" | "twin" | "polycentric";
export type Form = FlatForm | DistrictForm;

export const FLAT_FORMS: readonly FlatForm[] = ["hamlet", "street-village", "neighbourhood"];
export const DISTRICT_FORMS: readonly DistrictForm[] = ["radial", "twin", "polycentric"];
export const FORMS: readonly Form[] = [...FLAT_FORMS, ...DISTRICT_FORMS];

export const isFlat = (form: Form | undefined): form is FlatForm => FLAT_FORMS.includes(form as FlatForm);
