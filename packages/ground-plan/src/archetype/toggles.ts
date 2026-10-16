/** The archetypes that are settings: three district forms and the tier rule, each on or off. */
export const TOGGLES = ["corridor", "archipelago", "quarters", "tiers"] as const;
export type Toggle = (typeof TOGGLES)[number];

/** Corridor and tiers are on unless a setting says otherwise. */
export const DEFAULT_TOGGLES: readonly Toggle[] = ["corridor", "tiers"];

export const isToggle = (name: string): name is Toggle => TOGGLES.some((toggle) => toggle === name);

/** The toggles named, in `TOGGLES` order and once each; the defaults when none are named. */
export const toggleList = (toggles: readonly Toggle[] | undefined): Toggle[] =>
  TOGGLES.filter((toggle) => (toggles ?? DEFAULT_TOGGLES).includes(toggle));
