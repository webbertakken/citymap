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

/**
 * The public cities the viewer bundles, each pinned to a commit so every deploy shows the same cities; move a pin on
 * purpose (and the end-to-end expectations with it) to show a newer state.
 */
export const BUNDLED = [
  {
    name: "takken.io",
    url: "https://github.com/webbertakken/takken.io.git",
    commit: "409d6e2a88ecb20137da2f32589b59734e83c634",
  },
  { name: "redux", url: "https://github.com/reduxjs/redux.git", commit: "56abca4749921d68f40cda20afd2043af9751f72" },
  {
    name: "game-ci-cli",
    url: "https://github.com/game-ci/cli.git",
    commit: "7da0cea2f31799a4cbd79c1d452c254023f4f678",
  },
  {
    name: "studio-worker",
    url: "https://github.com/webbertakken/studio-worker.git",
    commit: "3abfcd6bfdfe42ce707ee4fab464e89257545326",
  },
  {
    name: "livediagram",
    url: "https://github.com/livediagram-app/livediagram.app.git",
    commit: "d9c1cbfd76b93d0d953a76c1303b502cbd6c874b",
  },
  { name: "react", url: "https://github.com/facebook/react.git", commit: "b618bbb4422693bbb8d387180687b3f510300f42" },
] as const;

/** A clone with the history but no file contents and no checkout; checking out the pinned commit fetches only its files. */
export const cloneArgs = (url: string, into: string): string[] => [
  "git",
  "clone",
  "--filter=blob:none",
  "--no-checkout",
  "--quiet",
  url,
  into,
];

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

/**
 * The command that folds a repository's history up to its pinned commit, with a variant's toggles (and separations),
 * into its city file.
 */
export const layArgs = (
  cli: string,
  repo: string,
  out: string,
  toggles: readonly Toggle[],
  commit: string,
  separate: readonly Separation[] | null = null,
): string[] => [
  cli,
  repo,
  `--out=${out}`,
  `--to=${commit}`,
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
