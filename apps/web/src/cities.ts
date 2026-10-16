import { CitymapError, TOGGLES, isToggle, parseCity, toggleList, type City, type Toggle } from "@citymap/ground-plan";

/** One layout of a bundled city: the toggles it was laid with, its file under /cities/, and its lot count. */
export interface CityVariant {
  readonly toggles: readonly Toggle[];
  readonly file: string;
  readonly lots: number;
}

/** A bundled city: its name and a variant for every combination of the toggles. */
export interface CityEntry {
  readonly name: string;
  readonly variants: readonly CityVariant[];
}

/** The toggles as one text, whatever order they came in. */
const key = (toggles: readonly Toggle[]) => toggleList(toggles).join(",");

const isVariant = (value: unknown): value is CityVariant =>
  typeof value === "object" &&
  value !== null &&
  "toggles" in value &&
  Array.isArray(value.toggles) &&
  value.toggles.every((t: unknown) => typeof t === "string" && isToggle(t)) &&
  "file" in value &&
  typeof value.file === "string" &&
  /^\w[\w.-]*\/\w[\w.-]*\.json$/.test(value.file) &&
  "lots" in value &&
  typeof value.lots === "number";

const isEntry = (value: unknown): value is CityEntry => {
  if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string") return false;
  if (!("variants" in value) || !Array.isArray(value.variants) || !value.variants.every(isVariant)) return false;
  // Every combination of the toggles, once each.
  return new Set(value.variants.map((v) => key(v.toggles))).size === 2 ** TOGGLES.length;
};

/** The variant of a city laid with exactly these toggles; an index that passed `loadIndex` holds every one. */
export function variantOf(entry: CityEntry, toggles: readonly Toggle[]): CityVariant {
  const wanted = key(toggles);
  return entry.variants.find((v) => key(v.toggles) === wanted)!;
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

async function text(fetcher: Fetch, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** The bundled cities, from /cities/index.json under the site's base path. */
export async function loadIndex(fetcher: Fetch, base = ""): Promise<CityEntry[]> {
  const value: unknown = JSON.parse(await text(fetcher, `${base}/cities/index.json`));
  if (!Array.isArray(value) || !value.every(isEntry)) throw new Error("/cities/index.json is not a list of cities");
  return value;
}

/** A bundled city, in the variant the toggles name. */
export async function loadCity(fetcher: Fetch, entry: CityEntry, toggles: readonly Toggle[], base = ""): Promise<City> {
  return parseCity(await text(fetcher, `${base}/cities/${variantOf(entry, toggles).file}`));
}

/** A city file a person picked or dropped. */
export async function readCityFile(file: Blob): Promise<City> {
  return parseCity(await file.text());
}

/** The sentence to show for a failure: GitHub's in plain words, the engine's own message for a bad city, else the error's. */
export function describeFailure(error: unknown): string {
  if (!(error instanceof CitymapError)) return `The city could not load: ${String(error)}`;
  if (!error.code.startsWith("github/")) return `That file is not a city: ${error.message}`;
  const said = error.message.slice(error.code.length + 2);
  if (error.code !== "github/rate-limited") return `${said}.`;
  const reset = new Date(Number(error.detail.reset) * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${said}; it resets at ${reset}.`;
}
