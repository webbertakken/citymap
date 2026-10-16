// Folders for tests: a tree of names, read through a fake directory handle or as the folder input's files.
import type { DirectoryHandle, ListedFile } from "../folder";

/** A folder as a tree: text or bytes for a file, an object for a folder. */
export type Tree = { readonly [name: string]: string | Uint8Array | Tree };

const encoder = new TextEncoder();
const isFile = (value: string | Uint8Array | Tree) => typeof value === "string" || value instanceof Uint8Array;
const blob = (content: string | Uint8Array) => ({
  arrayBuffer: async () => (typeof content === "string" ? encoder.encode(content) : content.slice()).buffer,
});

const missing = (what: string) => new DOMException(`${what} is not there`, "NotFoundError");

/** A directory handle over a tree, recording every name it is asked for, as Chromium's would answer. */
export function fakeHandle(name: string, tree: Tree, asked: string[] = [], at = ""): DirectoryHandle {
  const child = (key: string) => {
    asked.push(at + key);
    if (!Object.hasOwn(tree, key)) throw missing(key);
    return tree[key]!;
  };
  return {
    kind: "directory",
    name,
    getDirectoryHandle: async (key) => {
      const found = child(key);
      if (typeof found === "string" || found instanceof Uint8Array)
        throw new DOMException(`${key} is a file`, "TypeMismatchError");
      return fakeHandle(key, found, asked, `${at}${key}/`);
    },
    getFileHandle: async (key) => {
      const found = child(key);
      if (!(typeof found === "string" || found instanceof Uint8Array))
        throw new DOMException(`${key} is a folder`, "TypeMismatchError");
      return { kind: "file", getFile: async () => blob(found) };
    },
    async *entries() {
      asked.push(`${at}*`);
      for (const [key, value] of Object.entries(tree))
        yield [key, { kind: isFile(value) ? "file" : "directory" }] as const;
    },
  };
}

/** The folder input's files for a tree under its folder's name. */
export function listedFiles(name: string, tree: Tree, at = `${name}/`): ListedFile[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" || value instanceof Uint8Array
      ? [{ webkitRelativePath: at + key, ...blob(value) }]
      : listedFiles(name, value, `${at}${key}/`),
  );
}
