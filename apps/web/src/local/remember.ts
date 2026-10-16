// The last folder picked through a directory handle, kept in IndexedDB so it can be opened again: the handle and
// nothing else. Reopening asks the browser's permission again.
import type { DirectoryHandle } from "./folder";

export const DATABASE = "citymap";
const VERSION = 1;
const STORE = "local";
const KEY = "last";

/** A directory handle as Chromium gives it: it can say, and ask, whether the page may read it. */
export interface PermissionHandle extends DirectoryHandle {
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}

/** The browser's own handles; elsewhere (tests) a guard of the caller's. */
const isBrowserHandle = (value: unknown): value is PermissionHandle =>
  typeof FileSystemDirectoryHandle === "function" && value instanceof FileSystemDirectoryHandle;

/** A request's result, or its error. */
const settled = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

async function store(factory: IDBFactory, mode: IDBTransactionMode) {
  const request = factory.open(DATABASE, VERSION);
  request.addEventListener("upgradeneeded", () => request.result.createObjectStore(STORE));
  const database = await settled(request);
  return { database, store: database.transaction(STORE, mode).objectStore(STORE) };
}

/** Keeps the handle as the last folder, in place of any before it. */
export async function rememberFolder(handle: unknown, factory: IDBFactory = indexedDB): Promise<void> {
  const { database, store: local } = await store(factory, "readwrite");
  try {
    await settled(local.put(handle, KEY));
  } finally {
    database.close();
  }
}

/** The last folder kept, or null when there is none (or what is kept is not a folder's handle). */
export async function recallFolder(
  factory: IDBFactory = indexedDB,
  isHandle: (value: unknown) => value is PermissionHandle = isBrowserHandle,
): Promise<PermissionHandle | null> {
  const { database, store: local } = await store(factory, "readonly");
  try {
    const value: unknown = await settled(local.get(KEY));
    return isHandle(value) ? value : null;
  } finally {
    database.close();
  }
}

/** Whether the page may read the handle: granted already, or granted when asked (within the person's click). */
export async function mayRead(handle: PermissionHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode: "read" })) === "granted") return true;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}
