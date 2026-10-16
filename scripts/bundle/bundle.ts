// The bundled cities: every combination of the toggles for each public city, laid by the CLI, and their index.
import { TOGGLES, type Toggle } from "@citymap/ground-plan";

/** All sixteen subsets of the toggles, in binary order (none first), each in the toggles' own order. */
export const combinations = (): Toggle[][] =>
  Array.from({ length: 2 ** TOGGLES.length }, (_unused, mask) => TOGGLES.filter((_toggle, bit) => (mask >> bit) & 1));

/** A variant's name: its toggles joined with dashes, or `none`. */
export const variantName = (toggles: readonly Toggle[]) => (toggles.length === 0 ? "none" : toggles.join("-"));

/** A variant's file under the bundle: one folder per city. */
export const variantFile = (name: string, toggles: readonly Toggle[]) => `${name}/${variantName(toggles)}.json`;

/** The command that folds a repository's history with a variant's toggles into its city file. */
export const layArgs = (cli: string, repo: string, out: string, toggles: readonly Toggle[]): string[] => [
  cli,
  repo,
  `--out=${out}`,
  `--toggles=${toggles.join(",")}`,
];

export interface Variant {
  readonly toggles: readonly Toggle[];
  readonly file: string;
  readonly lots: number;
}

/** A city's entry in the index: its name and every variant. */
export const indexEntry = (
  name: string,
  variants: readonly { readonly toggles: readonly Toggle[]; readonly lots: number }[],
): { name: string; variants: Variant[] } => ({
  name,
  variants: variants.map((v) => ({ toggles: v.toggles, file: variantFile(name, v.toggles), lots: v.lots })),
});

/** The closing line: how many cities and variants, and their bytes raw and gzipped. */
export const summary = (sizes: readonly { readonly bytes: number; readonly gzip: number }[], cities: number) =>
  `bundle/done cities=${cities} variants=${sizes.length} bytes=${sizes.reduce((s, v) => s + v.bytes, 0)} gzip=${sizes.reduce((s, v) => s + v.gzip, 0)}`;
