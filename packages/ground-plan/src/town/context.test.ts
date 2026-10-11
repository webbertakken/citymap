import { describe, expect, it } from "vitest";
import { emptyCtx } from "../testing/fixtures";
import { forget, owned, road, type Ctx } from "./context";

const ctx = (): Ctx => emptyCtx();

describe("context helpers", () => {
  it("adds a road only when there is one", () => {
    const c = ctx();
    road(c, null, "street");
    road(c, [{ x: 0, y: 0 }], "lane");
    expect(c.roads).toEqual([{ pts: [{ x: 0, y: 0 }], cls: "lane" }]);
  });

  it("forgets a folder's records, and says so only when there were any", () => {
    const c = ctx();
    forget(c, "src");
    expect(c.events).toEqual([]);
    c.plat.forms.src = "hamlet";
    c.plat.radial["src>L"] = { core: "a", start: 0, order: [], bounds: [], scaleMille: 0, caps: {} };
    c.plat.radial["srcx"] = { core: "a", start: 0, order: [], bounds: [], scaleMille: 0, caps: {} };
    forget(c, "src");
    expect(Object.keys(c.plat.radial)).toEqual(["srcx"]);
    expect(c.events).toEqual([{ code: "plat/forget", detail: { key: "src", count: 1 } }]);
  });

  it("owns a folder's own keys, descendants and sub-keys; the root owns everything", () => {
    expect(["src", "src/a", "src>L", "src#lots"].every((k) => owned(k, "src"))).toBe(true);
    expect(owned("srcx", "src")).toBe(false);
    expect(owned("anything", "")).toBe(true);
  });
});
