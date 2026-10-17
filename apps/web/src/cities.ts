import { CitymapError, TOGGLES, isToggle, toggleList, type Toggle } from "@citymap/ground-plan";
import { parseCityFile, type CityFile } from "@citymap/measures";
import { afterPaint } from "./load/paint";
import type { OnStep } from "./load/step";

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

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ReadOptions {
  /** Stops the read with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears `download` steps (bytes of bytes, where the total is known), then `parse`. */
  readonly onStep?: OnStep;
}

/** A stream's text, counting its bytes as they arrive. */
async function streamText(
  stream: ReadableStream<Uint8Array>,
  total: number | undefined,
  { signal, onStep }: ReadOptions,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  const tell = (done: number) => onStep?.({ phase: "download", done, ...(total === undefined ? {} : { of: total }) });
  // One chunk at a time, in order: each read waits for the one before.
  const pump = async (done: number): Promise<void> => {
    signal?.throwIfAborted();
    const chunk = await reader.read();
    if (chunk.done) return;
    parts.push(decoder.decode(chunk.value, { stream: true }));
    tell(done + chunk.value.byteLength);
    return pump(done + chunk.value.byteLength);
  };
  tell(0);
  await pump(0);
  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * The body's bytes count against its `content-length`, unless it is encoded (then the length counts compressed bytes
 * while the stream gives them decoded, so no total is known).
 */
const totalOf = (response: Response) => {
  const length = response.headers.get("content-length");
  return length === null || response.headers.has("content-encoding") ? undefined : Number(length);
};

async function text(fetcher: Fetch, url: string, options: ReadOptions = {}): Promise<string> {
  const response = await fetcher(url, { signal: options.signal ?? null });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.body ? streamText(response.body, totalOf(response), options) : response.text();
}

/** The bundled cities, from /cities/index.json under the site's base path. */
export async function loadIndex(fetcher: Fetch, base = ""): Promise<CityEntry[]> {
  const value: unknown = JSON.parse(await text(fetcher, `${base}/cities/index.json`));
  if (!Array.isArray(value) || !value.every(isEntry)) throw new Error("/cities/index.json is not a list of cities");
  return value;
}

/** The city file in a text, its layout and its measures, once the phase is said and painted. */
async function parsed(body: string, { signal, onStep }: ReadOptions): Promise<CityFile> {
  onStep?.({ phase: "parse" });
  await afterPaint();
  signal?.throwIfAborted();
  return parseCityFile(body);
}

/** A bundled city, in the variant the toggles name. */
export async function loadCity(
  fetcher: Fetch,
  entry: CityEntry,
  toggles: readonly Toggle[],
  base = "",
  options: ReadOptions = {},
): Promise<CityFile> {
  return parsed(await text(fetcher, `${base}/cities/${variantOf(entry, toggles).file}`, options), options);
}

/** A file's bytes in slices of `FILE_CHUNK`, as a stream: what every browser and jsdom alike can read. */
const FILE_CHUNK = 1 << 20;
const chunksOf = (file: Blob) => {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (at >= file.size) {
        controller.close();
        return;
      }
      const slice = file.slice(at, at + FILE_CHUNK);
      at += FILE_CHUNK;
      controller.enqueue(new Uint8Array(await slice.arrayBuffer()));
    },
  });
};

/** A city file a person picked or dropped. */
export async function readCityFile(file: Blob, options: ReadOptions = {}): Promise<CityFile> {
  return parsed(await streamText(chunksOf(file), file.size, options), options);
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
