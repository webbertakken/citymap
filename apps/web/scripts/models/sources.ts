import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
// Where the models come from: plain downloads, itch.io's free-download flow, Sketchfab's download API (with a token,
// optional), and the entries of a zip, even one whose central directory is damaged (Wobble Blocks' OpenGameArt zip).
// Bun only; no shell.
import { inflateSync } from "bun";

/** Sources once fetched are kept here, so a rebuild fetches nothing again. */
const CACHE = join(homedir(), ".cache/citymap/models");

/** A source's bytes from the cache, else fetched and kept. */
async function cached(key: string, fetchIt: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const file = join(CACHE, encodeURIComponent(key));
  if (await Bun.file(file).exists()) return Bun.file(file).bytes();
  const bytes = await fetchIt();
  await mkdir(CACHE, { recursive: true });
  await Bun.write(file, new Blob([new Uint8Array(bytes)]));
  console.log(`[models] fetched ${key} (${(bytes.length / 1024).toFixed(0)} KB)`);
  return bytes;
}

/** A URL's bytes, from the cache or downloaded; fails with the status. */
export const download = (url: string): Promise<Uint8Array> => cached(url, () => fetchBytes(url));

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`models/download-failed ${url} status=${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Where a Sketchfab API token may be kept, when `SKETCHFAB_TOKEN` is not set. */
const SKETCHFAB_TOKEN_FILE = join(homedir(), ".secrets/sketchfab-api-token");

/** A Sketchfab API token, or null for none: building without one keeps the committed model. Never printed. */
async function sketchfabToken(): Promise<string | null> {
  const given = process.env.SKETCHFAB_TOKEN?.trim();
  if (given) return given;
  const file = Bun.file(SKETCHFAB_TOKEN_FILE);
  return (await file.exists()) ? (await file.text()).trim() || null : null;
}

/** The URL in Sketchfab's download answer, `{ "glb": { "url": … } }`. */
export function glbUrlIn(answer: unknown): string {
  const glb = typeof answer === "object" && answer !== null && "glb" in answer ? answer.glb : null;
  if (typeof glb === "object" && glb !== null && "url" in glb && typeof glb.url === "string") return glb.url;
  throw new Error("models/sketchfab-no-glb");
}

/**
 * A Sketchfab model's glb, from the cache or through Sketchfab's download API with a token (it answers a short-lived
 * signed URL); null when it is not cached and there is no token.
 */
export async function sketchfab(uid: string): Promise<Uint8Array | null> {
  const key = `https://sketchfab.com/models/${uid}#glb`;
  if (await Bun.file(join(CACHE, encodeURIComponent(key))).exists()) return cached(key, () => fetchBytes(key));
  const token = await sketchfabToken();
  if (!token) return null;
  return cached(key, async () => {
    const response = await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!response.ok) throw new Error(`models/sketchfab-failed ${uid} status=${response.status}`);
    return fetchBytes(glbUrlIn(await response.json()));
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A free file from an itch.io page, from the cache or through itch.io's flow: the page's CSRF token, the download page
 * it leads to, the upload whose name holds `wanted`, then the file. Three tries, five seconds apart, as itch.io now and
 * then answers a run of requests without its uploads.
 */
export const itch = (page: string, wanted: string): Promise<Uint8Array> =>
  cached(`${page}#${wanted}`, () => itchTries(page, wanted, 3));

async function itchTries(page: string, wanted: string, tries: number): Promise<Uint8Array> {
  try {
    return await itchOnce(page, wanted);
  } catch (failure) {
    if (tries <= 1) throw failure;
    console.warn(`[models] itch retry ${page}: ${String(failure)}`);
    await pause(5000);
    return itchTries(page, wanted, tries - 1);
  }
}

/** The URL in one of itch.io's answers, `{ "url": … }`. */
function urlIn(answer: unknown): string {
  if (typeof answer === "object" && answer !== null && "url" in answer && typeof answer.url === "string")
    return answer.url;
  throw new Error(`models/itch-no-url ${JSON.stringify(answer)}`);
}

/**
 * The uploads on an itch.io download page, each its id and its file's name: the name is the `title` of the element
 * classed `name` after the upload's id, whichever order the page writes the two attributes in.
 */
export function uploadsIn(page: string): { readonly id: string; readonly name: string }[] {
  return [...page.matchAll(/data-upload_id="(\d+)"[\s\S]*?<[a-z]+([^>]*\bclass="name"[^>]*)>/g)].flatMap((m) => {
    const name = m[2]?.match(/\btitle="([^"]+)"/)?.[1];
    return name ? [{ id: m[1]!, name }] : [];
  });
}

async function itchOnce(page: string, wanted: string): Promise<Uint8Array> {
  const jar = new Map<string, string>();
  const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (r: Response) => {
    for (const cookie of r.headers.getSetCookie()) {
      const pair = cookie.split(";")[0] ?? "";
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return r;
  };
  const form = (csrf: string) => ({
    method: "POST",
    headers: {
      cookie: cookies(),
      "content-type": "application/x-www-form-urlencoded",
      "x-requested-with": "XMLHttpRequest",
    },
    body: `csrf_token=${encodeURIComponent(csrf)}`,
  });
  const html = await keep(await fetch(page, { headers: { cookie: cookies() } })).text();
  const csrf = html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? html.match(/csrf_token":"([^"]+)"/)?.[1];
  if (!csrf) throw new Error(`models/itch-no-token ${page}`);
  const url = urlIn(await keep(await fetch(`${page}/download_url`, form(csrf))).json());
  const downloads = await keep(await fetch(url, { headers: { cookie: cookies() } })).text();
  const upload = uploadsIn(downloads).find((u) => u.name.includes(wanted));
  if (!upload) throw new Error(`models/itch-no-upload ${page} ${wanted}`);
  const token = downloads.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? csrf;
  const file = `${page}/file/${upload.id}?source=game_download&after_download_lightbox=1&as_props=1`;
  return fetchBytes(urlIn(await (await fetch(file, form(token))).json()));
}

/** A zip entry's data, stored or deflated. */
function inflated(method: number, data: Uint8Array): Uint8Array | null {
  if (method === 0) return data;
  if (method === 8) return inflateSync(new Uint8Array(data));
  return null;
}

/**
 * Every file in a zip: read through its central directory, which knows every size; or, where that directory is damaged
 * (Wobble Blocks' OpenGameArt zip), from its local headers one after another. Stored and deflated entries only.
 */
export function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  try {
    return throughDirectory(zip);
  } catch (failure) {
    console.warn(`[models] zip directory unreadable (${String(failure)}); reading its local headers`);
    return throughHeaders(zip);
  }
}

function throughDirectory(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("models/zip-no-directory");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("models/zip-bad-directory");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`models/zip-bad-entry ${name}`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = inflated(method, zip.subarray(start, start + size));
    if (data && !name.endsWith("/")) files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function throughHeaders(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files = new Map<string, Uint8Array>();
  for (let at = 0; at + 30 <= zip.length; at++) {
    if (view.getUint32(at, true) !== 0x04034b50) continue;
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + view.getUint16(at + 28, true);
    const data = inflated(method, zip.subarray(start, start + size));
    if (data && !name.endsWith("/")) files.set(name, data);
    at = start + size - 1;
  }
  return files;
}

/** The one file in a zip whose name ends so. */
export function entry(files: Map<string, Uint8Array>, ending: string): Uint8Array {
  const found = [...files].find(([name]) => name.endsWith(ending));
  if (!found) throw new Error(`models/no-entry ${ending}`);
  return found[1];
}
