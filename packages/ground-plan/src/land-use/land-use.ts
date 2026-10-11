import { roundDiv } from "../fixed/arithmetic";
import { compareKeys } from "../fixed/hash";

/** The role of a file, from path rules; earlier rules win. */
export type LandUse =
  | "vendored"
  | "generated"
  | "fixtures"
  | "tests"
  | "examples"
  | "docs"
  | "ci"
  | "assets"
  | "config"
  | "source";

export const LAND_USES: readonly LandUse[] = [
  "vendored",
  "generated",
  "fixtures",
  "tests",
  "examples",
  "docs",
  "ci",
  "assets",
  "config",
  "source",
];

/** Weight of one file in mass, in per mille. */
export const WEIGHT_MILLE: Readonly<Record<LandUse, number>> = {
  source: 1000,
  config: 500,
  assets: 500,
  ci: 500,
  docs: 500,
  tests: 300,
  examples: 300,
  fixtures: 50,
  generated: 50,
  vendored: 50,
};

/** The land uses that take land by default: all but tests and fixtures. */
export const DEFAULT_LAND_USES: readonly LandUse[] = LAND_USES.filter((use) => use !== "tests" && use !== "fixtures");

/** Files of one land use in one folder share a lot, round(1 / weight) per lot. */
export const lotCapacity = (use: LandUse): number => Math.max(1, roundDiv(1000, WEIGHT_MILLE[use]));

/** The key of a land setting: its uses, sorted. Each setting has its own plat. */
export const landKey = (uses: readonly LandUse[]): string => [...uses].sort(compareKeys).join(",");

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
const GENERATED_FOLDERS = new Set(["dist", "generated", "__generated__"]);
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

/** The land use of a path, from its folders and file name alone (binary files are assets by extension). */
export function classifyLandUse(path: string): LandUse {
  const segments = path.split("/");
  const file = segments.pop() as string;
  const folders = segments.map((segment) => segment.toLowerCase());
  const inAny = (names: ReadonlySet<string>) => folders.some((folder) => names.has(folder));
  if (inAny(VENDORED)) return "vendored";
  if (GENERATED_FILE.test(file) || inAny(GENERATED_FOLDERS)) return "generated";
  if (inAny(FIXTURES) || SNAPSHOT_FILE.test(file)) return "fixtures";
  if (inAny(TESTS) || TEST_FILE.test(file)) return "tests";
  if (inAny(EXAMPLES)) return "examples";
  if (inAny(DOCS) || DOC_EXT.test(file)) return "docs";
  if (inAny(CI)) return "ci";
  if (ASSET_EXT.test(file)) return "assets";
  if (CONFIG_EXT.test(file) || file.startsWith(".")) return "config";
  return "source";
}
