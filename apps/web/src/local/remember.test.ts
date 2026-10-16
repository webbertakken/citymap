import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { DATABASE, mayRead, recallFolder, rememberFolder, type PermissionHandle } from "./remember";
import { fakeHandle } from "./testing/folders";

// A directory handle survives structured cloning in Chromium; a fake one keeps only its data, so the guard checks that.
const handleLike = (value: unknown): value is PermissionHandle =>
  typeof value === "object" && value !== null && Reflect.get(value, "kind") === "directory";
const stored = { kind: "directory", name: "repo" } as const;

describe("the remembered folder", () => {
  it("is nothing at first, then the last folder remembered", async () => {
    const factory = new IDBFactory();
    expect(await recallFolder(factory, handleLike)).toBeNull();
    await rememberFolder({ ...stored, name: "first" }, factory);
    await rememberFolder(stored, factory);
    expect(await recallFolder(factory, handleLike)).toEqual(stored);
  });

  it("recalls only the browser's own handles by default", async () => {
    const factory = new IDBFactory();
    await rememberFolder(stored, factory);
    expect(await recallFolder(factory)).toBeNull();
    vi.stubGlobal(
      "FileSystemDirectoryHandle",
      class Elsewhere {
        readonly kind = "directory";
      },
    );
    try {
      expect(await recallFolder(factory)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a record that is not a folder", async () => {
    const factory = new IDBFactory();
    await rememberFolder({ kind: "file", name: "x" }, factory);
    expect(await recallFolder(factory, handleLike)).toBeNull();
  });

  it("fails loudly when the database cannot open or store", async () => {
    const blocked = new IDBFactory();
    // An open at a newer version first, so opening at version 1 fails.
    await new Promise<void>((resolve) => {
      const request = blocked.open(DATABASE, 2);
      request.addEventListener("success", () => {
        request.result.close();
        resolve();
      });
    });
    await expect(recallFolder(blocked, handleLike)).rejects.toMatchObject({ name: "VersionError" });
    // A function cannot be stored.
    await expect(rememberFolder({ ...stored, read: () => {} }, new IDBFactory())).rejects.toMatchObject({
      name: "DataCloneError",
    });
  });
});

const asking = (query: PermissionState, request: PermissionState, asked: string[]): PermissionHandle => ({
  ...fakeHandle("repo", {}),
  queryPermission: async () => {
    asked.push("query");
    return query;
  },
  requestPermission: async () => {
    asked.push("request");
    return request;
  },
});

describe("mayRead", () => {
  it("asks only when the permission is not granted already", async () => {
    const asked: string[] = [];
    expect(await mayRead(asking("granted", "denied", asked))).toBe(true);
    expect(asked).toEqual(["query"]);
    expect(await mayRead(asking("prompt", "granted", asked))).toBe(true);
    expect(await mayRead(asking("prompt", "denied", asked))).toBe(false);
    expect(asked).toEqual(["query", "query", "request", "query", "request"]);
  });

  it("lets a handle without permissions read, and lets the read say no", async () => {
    expect(await mayRead(fakeHandle("repo", {}))).toBe(true);
  });
});
