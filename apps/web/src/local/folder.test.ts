import { describe, expect, it } from "vitest";
import { handleFolder, listedFolder, type DirectoryHandle } from "./folder";
import { fakeHandle, listedFiles, type Tree } from "./testing/folders";

const TREE: Tree = { ".git": { HEAD: "ref: refs/heads/main\n", index: "x" }, src: { "a.ts": "a", b: {} }, "c.md": "c" };
const text = async (bytes: Promise<Uint8Array>) => new TextDecoder().decode(await bytes);

describe.each([
  ["a directory handle", () => handleFolder(fakeHandle("repo", TREE))],
  ["the folder input's files", () => listedFolder(listedFiles("repo", TREE))],
])("a folder read through %s", (_, open) => {
  it("names the folder, tells files from folders, and reads files", async () => {
    const folder = open();
    expect(folder.name).toBe("repo");
    expect(await folder.kind("")).toBe("directory");
    expect(await folder.kind(".git")).toBe("directory");
    expect(await folder.kind(".git/HEAD")).toBe("file");
    expect(await folder.kind("src/a.ts")).toBe("file");
    expect(await folder.kind("src/missing.ts")).toBeNull();
    expect(await folder.kind("c.md/inside")).toBeNull();
    expect(await folder.kind("nowhere/at/all")).toBeNull();
    expect(await text(folder.read(".git/HEAD"))).toBe("ref: refs/heads/main\n");
    expect(await text(folder.read("src/a.ts"))).toBe("a");
  });

  it("lists a folder's entries", async () => {
    const folder = open();
    const names = async (path: string) =>
      (await folder.list(path)).map((e) => `${e.name}:${e.kind}`).toSorted((a, b) => a.localeCompare(b));
    expect(await names("")).toEqual([".git:directory", "c.md:file", "src:directory"]);
    expect(await names("src")).toEqual(expect.arrayContaining(["a.ts:file"]));
  });

  it("names a file that is not there as vanished", async () => {
    await expect(open().read("src/gone.ts")).rejects.toMatchObject({ code: "local/vanished" });
  });
});

/** A handle whose every question fails with `error`. */
const failing = (error: Error): DirectoryHandle => ({
  ...fakeHandle("repo", {}),
  getDirectoryHandle: () => Promise.reject(error),
  getFileHandle: () => Promise.reject(error),
});

describe("handleFolder", () => {
  it("asks only for the names on the way to what it reads, each folder once", async () => {
    const asked: string[] = [];
    const folder = handleFolder(fakeHandle("repo", TREE, asked));
    await folder.read(".git/HEAD");
    await folder.read(".git/index");
    await folder.kind("src/a.ts");
    expect(asked).toEqual([".git", ".git/HEAD", ".git/index", "src", "src/a.ts"]);
  });

  it("names a refusal as denied and a file that changed as vanished, and passes anything else on", async () => {
    const refused = handleFolder(failing(new DOMException("no", "NotAllowedError")));
    await expect(refused.kind(".git")).rejects.toMatchObject({ code: "local/denied" });
    await expect(handleFolder(failing(new DOMException("no", "SecurityError"))).read("a")).rejects.toMatchObject({
      code: "local/denied",
    });
    const changed = handleFolder(failing(new DOMException("changed", "NotReadableError")));
    await expect(changed.read("a")).rejects.toMatchObject({ code: "local/vanished" });
    const odd = handleFolder(failing(new Error("odd")));
    await expect(odd.kind("a")).rejects.toThrow("odd");
    await expect(handleFolder(failing(new DOMException("x", "AbortError"))).list("a")).rejects.toThrow("x");
  });
});

describe("listedFolder", () => {
  it("cannot name an empty listing, so it is empty", () => {
    expect(() => listedFolder([])).toThrow("local/empty");
  });

  it("names a file that fails to read as vanished", async () => {
    const folder = listedFolder([
      { webkitRelativePath: "repo/a", arrayBuffer: () => Promise.reject(new DOMException("gone", "NotFoundError")) },
    ]);
    await expect(folder.read("a")).rejects.toMatchObject({ code: "local/vanished" });
    expect(await folder.list("nowhere")).toEqual([]);
  });
});
