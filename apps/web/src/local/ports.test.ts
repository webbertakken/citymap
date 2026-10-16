import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirectoryHandle } from "./folder";
import { PICKER_ID, browserPorts } from "./ports";
import { fakeHandle } from "./testing/folders";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "showDirectoryPicker");
});

describe("browserPorts", () => {
  it("decides support from the window", () => {
    vi.stubGlobal("navigator", { vendor: "" });
    expect(browserPorts.support()).toBe("webkitdirectory" in HTMLInputElement.prototype ? "input" : "none");
  });

  it("opens Chromium's folder dialog, read only, under one id", async () => {
    const handle = fakeHandle("repo", {});
    const pick = vi.fn<() => Promise<DirectoryHandle>>(async () => handle);
    Object.assign(window, { showDirectoryPicker: pick });
    expect(await browserPorts.pickFolder()).toBe(handle);
    expect(pick).toHaveBeenCalledWith({ id: PICKER_ID, mode: "read" });
  });

  it("refuses to pick where there is no folder dialog", async () => {
    await expect(browserPorts.pickFolder()).rejects.toMatchObject({ code: "local/denied" });
  });

  it("remembers and recalls through the page's IndexedDB", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    // A fake handle cannot be cloned into the database as Chromium's own can; nothing is kept.
    await expect(browserPorts.remember(fakeHandle("repo", {}))).rejects.toMatchObject({ name: "DataCloneError" });
    expect(await browserPorts.recall()).toBeNull();
  });
});
