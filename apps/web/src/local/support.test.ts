import { describe, expect, it } from "vitest";
import { localSupport, type SupportScope } from "./support";

const scope = (over: Partial<SupportScope> = {}): SupportScope => ({
  navigator: { vendor: "Google Inc." },
  HTMLInputElement: { prototype: { webkitdirectory: false } },
  ...over,
});
const coarse = (pointer: boolean) => (query: string) => ({ matches: pointer && query === "(pointer: coarse)" });

describe("localSupport", () => {
  it("opens through a directory handle where there is one (Chromium)", () => {
    expect(localSupport(scope({ showDirectoryPicker: () => {}, matchMedia: coarse(false) }))).toBe("handle");
  });

  it("opens through the folder input elsewhere (Firefox)", () => {
    expect(localSupport(scope({ navigator: { vendor: "" } }))).toBe("input");
  });

  it("says Safari cannot, as its folder input hides .git and .gitignore", () => {
    expect(localSupport(scope({ navigator: { vendor: "Apple Computer, Inc." } }))).toBe("safari");
  });

  it("offers nothing on a phone, nor without folder access", () => {
    expect(localSupport(scope({ showDirectoryPicker: () => {}, matchMedia: coarse(true) }))).toBe("none");
    expect(localSupport(scope({ HTMLInputElement: { prototype: {} } }))).toBe("none");
  });
});
