import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAND_USES,
  LAND_USES,
  WEIGHT_MILLE,
  classifyLandUse,
  landKey,
  lotCapacity,
  type LandUse,
} from "./land-use";

describe("classifyLandUse", () => {
  const cases: [string, LandUse][] = [
    ["vendor/lib/a.js", "vendored"],
    ["src/node_modules/x/index.js", "vendored"],
    ["dist/bundle.js", "generated"],
    ["src/api.generated.ts", "generated"],
    ["app.min.js", "generated"],
    ["Cargo.lock", "generated"],
    ["bun.lock", "generated"],
    ["src/__fixtures__/case.json", "fixtures"],
    ["src/__snapshots__/a.snap", "fixtures"],
    ["tests/output.stderr", "fixtures"],
    ["tests/unit/a.ts", "tests"],
    ["src/button.test.tsx", "tests"],
    ["pkg/handler_test.go", "tests"],
    ["test_parser.py", "tests"],
    ["src/FooTest.java", "tests"],
    ["examples/basic/index.ts", "examples"],
    ["docs/guide/index.ts", "docs"],
    ["README.md", "docs"],
    ["src/notes.txt", "docs"],
    [".github/workflows/ci.yml", "ci"],
    ["scripts/build.ts", "ci"],
    ["public/logo.svg", "assets"],
    ["fonts/Inter.woff2", "assets"],
    ["tsconfig.json", "config"],
    [".editorconfig", "config"],
    ["src/.eslintrc", "config"],
    ["src/index.ts", "source"],
    ["Makefile", "source"],
  ];

  it.each(cases)("classifies %s as %s", (path, use) => {
    expect(classifyLandUse(path)).toBe(use);
  });

  it("applies the earliest rule first", () => {
    // A test inside vendored code is vendored; a doc inside tests is a test.
    expect(classifyLandUse("vendor/tests/a.test.ts")).toBe("vendored");
    expect(classifyLandUse("tests/README.md")).toBe("tests");
  });

  it("matches folder names case-insensitively", () => {
    expect(classifyLandUse("Docs/intro.ts")).toBe("docs");
  });
});

describe("weights and lot capacity", () => {
  it("weighs every land use", () => {
    expect(new Set(Object.keys(WEIGHT_MILLE))).toEqual(new Set(LAND_USES));
    expect(WEIGHT_MILLE.source).toBe(1000);
    expect(WEIGHT_MILLE.tests).toBe(300);
  });

  it("shares a lot among round(1 / weight) files", () => {
    expect(lotCapacity("source")).toBe(1);
    expect(lotCapacity("config")).toBe(2);
    expect(lotCapacity("tests")).toBe(3);
    expect(lotCapacity("fixtures")).toBe(20);
  });
});

describe("landKey", () => {
  it("names a land setting by its sorted uses", () => {
    expect(landKey(["source", "config"])).toBe("config,source");
    expect(landKey(DEFAULT_LAND_USES)).not.toContain("tests");
    expect(landKey(DEFAULT_LAND_USES)).not.toContain("fixtures");
  });
});
