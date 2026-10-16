// A folder the person picked, read through one interface: a directory handle (Chromium), which reads only what is asked
// for, or the folder input's files (Firefox), which the browser listed whole before the page heard of them.
import { LocalError } from "./errors";

export type Kind = "file" | "directory";

export interface Entry {
  readonly name: string;
  readonly kind: Kind;
}

export interface Folder {
  /** The picked folder's own name. */
  readonly name: string;
  /** What is at a path from the folder (`""` is the folder itself), or null when nothing is. */
  kind(path: string): Promise<Kind | null>;
  /** A file's bytes. */
  read(path: string): Promise<Uint8Array>;
  /** A folder's entries, in no particular order. */
  list(path: string): Promise<readonly Entry[]>;
}

interface Readable {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** What the reader needs of a `FileSystemDirectoryHandle`; the browser's own satisfies it. */
export interface DirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle(name: string): Promise<DirectoryHandle>;
  getFileHandle(name: string): Promise<{ readonly kind: "file"; getFile(): Promise<Readable> }>;
  entries(): AsyncIterable<readonly [string, { readonly kind: Kind }]>;
}

/** What the reader needs of a folder input's `File`. */
export interface ListedFile extends Readable {
  readonly webkitRelativePath: string;
}

const named = (error: unknown, name: string) => error instanceof DOMException && error.name === name;

/** The browser's refusals and a file gone from under the reader as local failures; any other error as it was. */
function localised(error: unknown, path: string): unknown {
  if (named(error, "NotAllowedError") || named(error, "SecurityError"))
    return new LocalError("local/denied", "the browser did not allow reading the folder", { path });
  if (named(error, "NotFoundError") || named(error, "NotReadableError"))
    return new LocalError("local/vanished", `${path} changed or vanished while it was read`, { path });
  return error;
}

const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** A task's failure as a local failure where it is one. */
async function guarded<T>(path: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw localised(error, path);
  }
}

/** A folder read through a directory handle: each folder on the way is opened once, and only what is asked for. */
export function handleFolder(root: DirectoryHandle): Folder {
  const folders = new Map<string, Promise<DirectoryHandle>>([["", Promise.resolve(root)]]);
  const folder = (path: string): Promise<DirectoryHandle> => {
    const known = folders.get(path);
    if (known) return known;
    const opened = folder(parentOf(path)).then((parent) => parent.getDirectoryHandle(baseOf(path)));
    folders.set(path, opened);
    // A failed open is not kept, so a later question asks again.
    opened.catch(() => folders.delete(path));
    return opened;
  };
  return {
    name: root.name,
    kind: (path) =>
      guarded(path, async () => {
        if (path === "") return "directory";
        try {
          const parent = await folder(parentOf(path));
          try {
            await parent.getFileHandle(baseOf(path));
            return "file";
          } catch (error) {
            if (!named(error, "TypeMismatchError")) throw error;
            await folder(path);
            return "directory";
          }
        } catch (error) {
          if (named(error, "NotFoundError") || named(error, "TypeMismatchError")) return null;
          throw error;
        }
      }),
    read: (path) =>
      guarded(path, async () => {
        const parent = await folder(parentOf(path));
        const file = await (await parent.getFileHandle(baseOf(path))).getFile();
        return new Uint8Array(await file.arrayBuffer());
      }),
    list: (path) =>
      guarded(path, async () => {
        const entries: Entry[] = [];
        for await (const [name, handle] of (await folder(path)).entries()) entries.push({ name, kind: handle.kind });
        return entries;
      }),
  };
}

/** A folder from the folder input's files, each at its path below the picked folder. */
export function listedFolder(files: readonly ListedFile[]): Folder {
  const first = files[0];
  if (!first) throw new LocalError("local/empty", "the browser listed no files in that folder");
  const name = first.webkitRelativePath.split("/")[0]!;
  const byPath = new Map<string, ListedFile>();
  const children = new Map<string, Map<string, Kind>>([["", new Map()]]);
  for (const file of files) {
    const path = file.webkitRelativePath.slice(name.length + 1);
    byPath.set(path, file);
    // Every folder above the file holds the next name down.
    let kind: Kind = "file";
    for (let at = path; at !== ""; at = parentOf(at)) {
      const parent = parentOf(at);
      const known = children.get(parent) ?? new Map<string, Kind>();
      children.set(parent, known);
      known.set(baseOf(at), kind);
      kind = "directory";
    }
  }
  return {
    name,
    kind: async (path) => (byPath.has(path) ? "file" : children.has(path) ? "directory" : null),
    read: async (path) => {
      const file = byPath.get(path);
      try {
        if (!file) throw new DOMException(`${path} is not in the listing`, "NotFoundError");
        return new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        throw localised(error, path);
      }
    },
    list: async (path) => [...(children.get(path) ?? [])].map(([entry, kind]) => ({ name: entry, kind })),
  };
}
