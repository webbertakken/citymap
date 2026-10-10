// Linguist-style land-use rules, after tree-shape-to-archetype.md §6. Earlier rules win.
export type LandUse =
  "vendored" | "generated" | "fixtures" | "tests" | "examples" | "docs" | "ci" | "assets" | "config" | "source";

export const LAND_USE_WEIGHT: Record<LandUse, number> = {
  source: 1,
  config: 0.5,
  assets: 0.5,
  ci: 0.5,
  docs: 0.5,
  tests: 0.3,
  examples: 0.3,
  fixtures: 0.05,
  generated: 0.05,
  vendored: 0.05,
};

const VENDORED = new Set([
  "vendor",
  "vendored",
  "third_party",
  "third-party",
  "thirdparty",
  "node_modules",
  "external",
  "deps",
]);
const FIXTURES = new Set([
  "fixtures",
  "__fixtures__",
  "fixture",
  "testdata",
  "test-data",
  "__snapshots__",
  "snapshots",
  "baselines",
  "golden",
  "goldens",
]);
const TESTS = new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "e2e",
  "integration-tests",
  "testing",
  "__mocks__",
]);
const EXAMPLES = new Set(["examples", "example", "demo", "demos", "playground", "playgrounds", "samples", "sample"]);
const DOCS = new Set(["docs", "doc", "documentation", "website", "site"]);
const CI = new Set([
  ".github",
  ".circleci",
  ".gitlab",
  "scripts",
  "script",
  "tools",
  "tooling",
  "hack",
  "ci",
  ".husky",
  ".devcontainer",
  ".vscode",
  ".changeset",
]);
const ASSET_EXT =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov|glb|gltf|fbx|obj|blend|psd|pdf|zip)$/i;
const DOC_EXT = /\.(md|mdx|rst|adoc|txt)$/i;
const CONFIG_EXT = /\.(json|jsonc|ya?ml|toml|ini|cfg|conf|lock|properties|editorconfig|env|xml|plist|gradle)$/i;
const GENERATED_FILE =
  /(\.generated\.|\.g\.|\.min\.(js|css)$|\.map$|\.pb\.go$|_pb2\.py$|pnpm-lock\.yaml$|package-lock\.json$|yarn\.lock$|Cargo\.lock$|bun\.lockb?$)/;
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs)$|^test_.*\.py$|Test\.java$|Tests?\.cs$)/;
const SNAPSHOT_FILE = /\.(snap|stderr|stdout|baseline)$/;

export function classifyLandUse(path: string, binary: boolean): LandUse {
  const segments = path.split("/");
  const file = segments[segments.length - 1];
  const folders = segments.slice(0, -1).map((s) => s.toLowerCase());
  if (folders.some((s) => VENDORED.has(s))) return "vendored";
  if (GENERATED_FILE.test(file) || folders.some((s) => s === "dist" || s === "generated" || s === "__generated__"))
    return "generated";
  if (folders.some((s) => FIXTURES.has(s)) || SNAPSHOT_FILE.test(file)) return "fixtures";
  if (folders.some((s) => TESTS.has(s)) || TEST_FILE.test(file)) return "tests";
  if (folders.some((s) => EXAMPLES.has(s))) return "examples";
  if (folders.some((s) => DOCS.has(s)) || DOC_EXT.test(file)) return "docs";
  if (folders.some((s) => CI.has(s))) return "ci";
  if (binary || ASSET_EXT.test(file)) return "assets";
  if (CONFIG_EXT.test(file) || file.startsWith(".")) return "config";
  return "source";
}
