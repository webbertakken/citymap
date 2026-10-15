import { CitymapError, parseCity, type City } from "@citymap/ground-plan";

/** A bundled city: its name, its file under /cities/, and its lot count. */
export interface CityEntry {
  readonly name: string;
  readonly file: string;
  readonly lots: number;
}

const isEntry = (value: unknown): value is CityEntry =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "file" in value &&
  typeof value.file === "string" &&
  /^[\w.-]+\.json$/.test(value.file) &&
  "lots" in value &&
  typeof value.lots === "number";

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

async function text(fetcher: Fetch, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** The bundled cities, from /cities/index.json. */
export async function loadIndex(fetcher: Fetch): Promise<CityEntry[]> {
  const value: unknown = JSON.parse(await text(fetcher, "/cities/index.json"));
  if (!Array.isArray(value) || !value.every(isEntry)) throw new Error("/cities/index.json is not a list of cities");
  return value;
}

/** A bundled city by its file name. */
export async function loadCity(fetcher: Fetch, entry: CityEntry): Promise<City> {
  return parseCity(await text(fetcher, `/cities/${entry.file}`));
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
