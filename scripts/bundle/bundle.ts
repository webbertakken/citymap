// The bundled cities: for each public city, every combination of the toggles times every state of the separations it
// records, laid by the CLI, and their index.
import {
  DEFAULT_SEPARATIONS,
  SEPARATIONS,
  TOGGLES,
  separationStates,
  type Separation,
  type Toggle,
} from "@citymap/ground-plan";

/** All sixteen subsets of the toggles, in binary order (none first), each in the toggles' own order. */
export const combinations = (): Toggle[][] =>
  Array.from({ length: 2 ** TOGGLES.length }, (_unused, mask) => TOGGLES.filter((_toggle, bit) => (mask >> bit) & 1));

/** What a city records of its separations: those that would change it, and whether it declares workspaces. */
export interface Recorded {
  readonly separable: readonly Separation[];
  readonly declared: boolean;
}

/** The separation states a city is laid in: one per state of what it records; none recorded, the defaults alone. */
export const statesOf = (recorded: Recorded): (Separation[] | null)[] =>
  recorded.separable.length === 0 ? [null] : separationStates(recorded.separable, recorded.declared);

/**
 * A variant's name: its toggles joined with dashes, or `none`; for a city that records separations, `~` and the
 * separations of its state, or `none`.
 */
export const variantName = (toggles: readonly Toggle[], state: readonly Separation[] | null = null) =>
  `${toggles.length === 0 ? "none" : toggles.join("-")}${state === null ? "" : `~${state.join("-") || "none"}`}`;

/** A variant's file under the bundle: one folder per city. */
export const variantFile = (name: string, toggles: readonly Toggle[], state: readonly Separation[] | null = null) =>
  `${name}/${variantName(toggles, state)}.json`;

/** The separations a state is laid with: the state, and the defaults of those the city does not record. */
export const separateFor = (state: readonly Separation[], recorded: Recorded): Separation[] =>
  SEPARATIONS.filter((s) => (recorded.separable.includes(s) ? state.includes(s) : DEFAULT_SEPARATIONS.includes(s)));

/** The command that folds a repository's history with a variant's toggles (and separations) into its city file. */
export const layArgs = (
  cli: string,
  repo: string,
  out: string,
  toggles: readonly Toggle[],
  separate: readonly Separation[] | null = null,
): string[] => [
  cli,
  repo,
  `--out=${out}`,
  `--toggles=${toggles.join(",")}`,
  ...(separate === null ? [] : [`--separate=${separate.join(",")}`]),
];

export interface Variant {
  readonly toggles: readonly Toggle[];
  readonly separate?: readonly Separation[];
  readonly file: string;
  readonly lots: number;
}

/** A city's entry in the index: its name, what it records of its separations, and every variant. */
export const indexEntry = (
  name: string,
  recorded: Recorded,
  variants: readonly {
    readonly toggles: readonly Toggle[];
    readonly state: readonly Separation[] | null;
    readonly lots: number;
  }[],
) => ({
  name,
  ...(recorded.separable.length > 0 ? { separable: recorded.separable } : {}),
  ...(recorded.declared ? { declared: true as const } : {}),
  variants: variants.map((v): Variant =>
    v.state === null
      ? { toggles: v.toggles, file: variantFile(name, v.toggles), lots: v.lots }
      : { toggles: v.toggles, separate: v.state, file: variantFile(name, v.toggles, v.state), lots: v.lots },
  ),
});

/** The closing line: how many cities and variants, and their bytes raw and gzipped. */
export const summary = (sizes: readonly { readonly bytes: number; readonly gzip: number }[], cities: number) =>
  `bundle/done cities=${cities} variants=${sizes.length} bytes=${sizes.reduce((s, v) => s + v.bytes, 0)} gzip=${sizes.reduce((s, v) => s + v.gzip, 0)}`;
