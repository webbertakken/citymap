import { CitymapError, parseCity, type City } from "@citymap/ground-plan";
import { afterPaint } from "./load/paint";
import type { OnStep } from "./load/step";

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

/** The city in a text, once the phase is said and painted. */
async function parsed(body: string, { signal, onStep }: ReadOptions): Promise<City> {
  onStep?.({ phase: "parse" });
  await afterPaint();
  signal?.throwIfAborted();
  return parseCity(body);
}

/** A bundled city by its file name. */
export async function loadCity(fetcher: Fetch, entry: CityEntry, base = "", options: ReadOptions = {}): Promise<City> {
  return parsed(await text(fetcher, `${base}/cities/${entry.file}`, options), options);
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
export async function readCityFile(file: Blob, options: ReadOptions = {}): Promise<City> {
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
