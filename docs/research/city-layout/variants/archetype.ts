// Archetypes: each folder's urban form, from continuous shape features with a Schmitt trigger (tree-shape research §2-4).
// Small folders flatten into one of three neighbourhood forms; larger ones take a district form that arranges children.

export type FlatForm = "hamlet" | "street-village" | "neighbourhood";
export type DistrictForm = "radial" | "twin" | "gridiron" | "polycentric";
export type Form = FlatForm | DistrictForm;

export const FLAT_FORMS: FlatForm[] = ["hamlet", "street-village", "neighbourhood"];
export const isFlat = (form: Form | undefined): form is FlatForm => FLAT_FORMS.includes(form as FlatForm);

export interface Features {
  mass: number;
  /** Mass shares of the largest and second-largest child folder. */
  s1: number;
  s2: number;
  /** Share of the mass in the folder's own files. */
  f0: number;
  /** Inverse Simpson over child folders plus own files: how many centres the folder really has. */
  neff: number;
  /** Child folder count. */
  k: number;
  /** Lots the folder would hold if flattened. */
  lots: number;
}

export function features(mass: number, childMasses: number[], lots: number): Features {
  const own = Math.max(0, mass - childMasses.reduce((s, m) => s + m, 0));
  const sorted = [...childMasses].sort((a, b) => b - a);
  const share = (m: number) => (mass > 0 ? m / mass : 0);
  const parts = [...childMasses, own].map(share);
  const simpson = parts.reduce((s, p) => s + p * p, 0);
  return {
    mass,
    s1: share(sorted[0] ?? 0),
    s2: share(sorted[1] ?? 0),
    f0: share(own),
    neff: simpson > 0 ? 1 / simpson : 1,
    k: childMasses.length,
    lots,
  };
}

// District forms in priority order; a margin of 0 or more enters on a cold start (research §4.1).
const RULES: { form: DistrictForm; margin: (f: Features) => number }[] = [
  { form: "radial", margin: (f) => f.s1 - 0.6 },
  { form: "twin", margin: (f) => Math.min(f.s2 - 0.3, f.s1 + f.s2 - 0.75) },
  { form: "gridiron", margin: (f) => Math.min(Math.log(f.neff / 7), 0.25 - f.s1) },
  { form: "polycentric", margin: () => 1 },
];
const STAY = 0.15;
const CHALLENGE = 0.1;

/** The district form, with the incumbent kept inside its stay band and challengers needing a clear margin. */
export function districtForm(f: Features, previous: Form | undefined): DistrictForm {
  if (!previous || isFlat(previous)) return RULES.find((r) => r.margin(f) >= 0)!.form;
  const i = RULES.findIndex((r) => r.form === previous);
  const earlier = RULES.slice(0, i).find((r) => r.margin(f) >= CHALLENGE);
  if (earlier) return earlier.form;
  if (RULES[i].margin(f) >= -STAY) return previous as DistrictForm;
  return RULES.slice(i + 1).find((r) => r.margin(f) >= CHALLENGE)?.form ?? "polycentric";
}

const HAMLET_MASS = 25;
const STREET_LOTS = 40;
const STREET_F0 = 0.6;
const BAND = 1.25;

/** The neighbourhood form of a flattened folder, each threshold with a ±25% band around the incumbent. */
export function flatForm(f: Features, previous: Form | undefined): FlatForm {
  const hamlet = previous === "hamlet" ? f.mass < HAMLET_MASS * BAND : f.mass < HAMLET_MASS;
  if (hamlet) return "hamlet";
  const street =
    previous === "street-village"
      ? f.lots >= STREET_LOTS / BAND && f.f0 >= STREET_F0 / BAND
      : f.lots >= STREET_LOTS && f.f0 >= STREET_F0;
  return street ? "street-village" : "neighbourhood";
}
