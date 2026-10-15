// Writes rust/fixtures/: what the TypeScript engine says for inputs the Rust tests replay, so the Rust implementation is
// held to the reference byte for byte. Run it after any change to the rules it records, and commit the result.
// Usage: bun scripts/parity-fixtures.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyLandUse } from "@citymap/ground-plan";

const root = join(import.meta.dirname, "..");
const out = (name: string) => join(root, "rust/fixtures", name);

/** Paths that probe each land-use rule's edges: case, extensions, line terminators, non-ASCII folder names. */
const EDGE_PATHS = [
  "README",
  "README.MD",
  "docs.md/x.ts",
  "a.test.ts",
  "a.test.tsx",
  "a.spec.cjs",
  "a.spec.mts",
  "a.test.jsx",
  "a.test.js.snap",
  "a.test.tx",
  "a.tests.ts",
  "test_.py",
  "test_x.py",
  "test_x\n.py",
  "test_x\u2028.py",
  "Test_x.py",
  "x_test.go",
  "x_test.rs",
  "FooTest.java",
  "FooTests.cs",
  "FooTest.cs",
  "Foo.Test.cs",
  "a.generated.ts",
  "a.g.dart",
  "a.min.js",
  "a.min.css.map",
  "a.pb.go",
  "a_pb2.py",
  "pnpm-lock.yaml",
  "x/package-lock.json",
  "yarn.lock",
  "Cargo.lock",
  "bun.lock",
  "bun.lockb",
  "logo.PNG",
  "logo.Jpeg",
  "font.WOFF2",
  ".png",
  "png",
  "a.png.ts",
  "config.JSON",
  "a.editorconfig",
  ".editorconfig",
  ".env",
  "x.ENV",
  "Vendor/x.ts",
  "THIRD_PARTY/x.ts",
  "NODE_MODULES/x.ts",
  "Dist/x.ts",
  "__GENERATED__/x.ts",
  "Fixtures/x.ts",
  "x/Golden/y.ts",
  "Spec/x.ts",
  "E2E/x.ts",
  "Examples/x.ts",
  "Docs/x.ts",
  "Website/x.ts",
  ".GitHub/x.ts",
  "Scripts/x.ts",
  "HACK/x.ts",
  "hac\u212a/x.ts",
  "\u212aeep/x.ts",
  "\u0130nternal/x.ts",
  "do\u0441s/x.ts",
  "\u00e9/x.ts",
  "a/b/c/d.rs",
  "a.snap",
  "a.stderr",
  "a.stdout",
  "a.baseline",
  "Makefile",
  ".gitignore",
  "tests",
  "tests/",
  "x/tests",
];

const reactPaths = readFileSync(join(root, "packages/ground-plan/src/testing/react-head-paths.txt"), "utf8")
  .split("\n")
  .filter((line) => line !== "");
const landUse = [...reactPaths, ...EDGE_PATHS].map((path) => `${JSON.stringify(path)}\t${classifyLandUse(path)}`);
await Bun.write(out("land-use.tsv"), `${landUse.join("\n")}\n`);
console.log(`[parity-fixtures] land-use.tsv: ${landUse.length} paths`);
