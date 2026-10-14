// Archetypes: each folder's urban form, from continuous shape features with a Schmitt trigger (tree-shape research §2-4).
// Small folders flatten into one of three neighbourhood forms; larger ones take a district form that arranges children.

export type FlatForm = "hamlet" | "street-village" | "neighbourhood";
export type DistrictForm = "radial" | "twin" | "polycentric" | "corridor" | "archipelago" | "quarters";
export type Form = FlatForm | DistrictForm;

/**
 * Opt-in archetypes beyond the approved set (hamlet, street village, neighbourhood, radial, twin, polycentric). Each
 * is off unless named in `Options.archetypes`; with none named, every form and every road is as approved.
 */
export type Archetype = "corridor" | "archipelago" | "quarters" | "tiers";
export const ARCHETYPES: Archetype[] = ["corridor", "archipelago", "quarters", "tiers"];

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
  /** Child folders that are packages (a workspace member or a manifest of their own) with mostly source land. */
  members?: number;
  /** Those packages' share of the mass. */
  memberCover?: number;
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

const STAY = 0.15;
const CHALLENGE = 0.1;

interface Rule {
  form: DistrictForm;
  margin: (f: Features) => number;
  /** The opt-in archetype that enables this rule; approved rules have none. */
  archetype?: Archetype;
  /** A rule's own Schmitt band, for thresholded features (research §3.2: corridor). */
  stay?: number;
  challenge?: number;
}

// District forms in priority order; a margin of 0 or more enters on a cold start (research §4.1).
const RULES: Rule[] = [
  // Corridor: a dominant child holds 90% of the mass and the folder's own files under 10%; a narrow band of its own.
  {
    form: "corridor",
    archetype: "corridor",
    margin: (f) => Math.min(f.s1 - 0.9, 0.1 - f.f0),
    stay: 0.05,
    challenge: 0.02,
  },
  // Archipelago: three or more packages holding half the mass or more (research §3.2, §4.4).
  {
    form: "archipelago",
    archetype: "archipelago",
    margin: (f) => Math.min(((f.members ?? 0) - 3) / 3, (f.memberCover ?? 0) - 0.5),
  },
  { form: "radial", margin: (f) => f.s1 - 0.6 },
  { form: "twin", margin: (f) => Math.min(f.s2 - 0.3, f.s1 + f.s2 - 0.75) },
  // Quarters: many comparable children, none dominant (the research's gridiron condition).
  { form: "quarters", archetype: "quarters", margin: (f) => Math.min(Math.log(f.neff / 7), 0.25 - f.s1) },
  { form: "polycentric", margin: () => 1 },
];

const NONE: ReadonlySet<Archetype> = new Set();

/** The district form, with the incumbent kept inside its stay band and challengers needing a clear margin. */
export function districtForm(
  f: Features,
  previous: Form | undefined,
  enabled: ReadonlySet<Archetype> = NONE,
): DistrictForm {
  const rules = RULES.filter((r) => !r.archetype || enabled.has(r.archetype));
  const i = rules.findIndex((r) => r.form === previous);
  if (!previous || isFlat(previous) || i === -1) return rules.find((r) => r.margin(f) >= 0)!.form;
  const earlier = rules.slice(0, i).find((r) => r.margin(f) >= (r.challenge ?? CHALLENGE));
  if (earlier) return earlier.form;
  if (rules[i].margin(f) >= -(rules[i].stay ?? STAY)) return previous as DistrictForm;
  return rules.slice(i + 1).find((r) => r.margin(f) >= (r.challenge ?? CHALLENGE))?.form ?? "polycentric";
}

/** Settlement tiers by decade of mass (research §3.1), lowest first. */
export type Tier = "hamlet" | "village" | "town" | "city" | "metropolis";
export const TIERS: [Tier, number][] = [
  ["hamlet", 0],
  ["village", 30],
  ["town", 300],
  ["city", 3000],
  ["metropolis", 30000],
];

/** The tier of a mass, moving up at a threshold times 1.25 and down at a threshold divided by 1.25. */
export function tierOf(mass: number, previous: Tier | undefined): Tier {
  const cold = [...TIERS].reverse().find(([, threshold]) => mass >= threshold)![0];
  if (!previous) return cold;
  const at = TIERS.findIndex(([t]) => t === previous);
  const up = TIERS[at + 1];
  if (up && mass >= up[1] * BAND) return tierOf(mass, up[0]);
  if (at > 0 && mass < TIERS[at][1] / BAND) return tierOf(mass, TIERS[at - 1][0]);
  return previous;
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
