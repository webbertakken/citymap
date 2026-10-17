// Tested by name: a source file counts as tested when a test file's name says it tests it, by the conventions of its
// language. A proxy, found from paths alone; tests inside a file are not knowable this way.
import { classifyLandUse } from "@citymap/ground-plan";
import { nameParts } from "./language";

type Family = "js" | "py" | "go" | "jvm" | "rs" | "rb" | "cs" | "php" | "c" | "swift" | "dart" | "ex";

const FAMILIES: readonly [Family, readonly string[]][] = [
  ["js", ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "vue", "svelte"]],
  ["py", ["py"]],
  ["go", ["go"]],
  ["jvm", ["java", "kt", "kts", "scala", "groovy"]],
  ["rs", ["rs"]],
  ["rb", ["rb"]],
  ["cs", ["cs"]],
  ["php", ["php"]],
  ["c", ["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "m", "mm"]],
  ["swift", ["swift"]],
  ["dart", ["dart"]],
  ["ex", ["ex", "exs"]],
];
const FAMILY_OF: ReadonlyMap<string, Family> = new Map(
  FAMILIES.flatMap(([family, extensions]) => extensions.map((ext) => [ext, family] as const)),
);

/** Markers that strip to the stem a test names: suffixes for any land use, prefixes for tests only. */
const MARKERS: Readonly<
  Record<Family, { readonly suffixes: readonly string[]; readonly prefixes: readonly string[] }>
> = {
  js: { suffixes: [".test", ".spec", ".tests", ".e2e", ".unit", "-test", "-spec", "_test", "_spec"], prefixes: [] },
  py: { suffixes: ["_test", "_tests"], prefixes: ["test_"] },
  go: { suffixes: ["_test"], prefixes: [] },
  jvm: { suffixes: ["Test", "Tests", "IT", "Spec"], prefixes: ["Test"] },
  rs: { suffixes: ["_test", "_tests"], prefixes: [] },
  rb: { suffixes: ["_spec", "_test"], prefixes: ["test_"] },
  cs: { suffixes: ["Test", "Tests"], prefixes: [] },
  php: { suffixes: ["Test"], prefixes: [] },
  c: { suffixes: ["_test", "_unittest", "_tests"], prefixes: ["test_"] },
  swift: { suffixes: ["Test", "Tests"], prefixes: [] },
  dart: { suffixes: ["_test"], prefixes: [] },
  ex: { suffixes: ["_test"], prefixes: [] },
};

/** Folders that hold tests: a test file inside one names its own stem. */
const TEST_FOLDERS = new Set(["test", "tests", "__tests__", "__test__", "spec", "specs", "testing"]);
/** Folders left out when a test's folder is compared with a source's: where sources and tests live, not what. */
const ROOT_FOLDERS = new Set([...TEST_FOLDERS, "src", "lib", "main", "source", "unit", "integration"]);
/** Land uses whose files never name a source: copies, output and test data. */
const NOT_TESTS = new Set(["vendored", "generated", "fixtures"]);

/** What test files name: per family and stem, the folders that name it, and every ending of those folders. */
export interface TestNames {
  readonly folders: ReadonlyMap<string, ReadonlySet<string>>;
  readonly endings: ReadonlyMap<string, ReadonlySet<string>>;
}

const familyOf = (path: string): Family | undefined => FAMILY_OF.get(nameParts(path).ext.toLowerCase());
const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** A folder with its source and test folders left out. */
const reduced = (folder: string) =>
  folder
    .split("/")
    .filter((segment) => segment !== "" && !ROOT_FOLDERS.has(segment.toLowerCase()))
    .join("/");

/** A folder's endings at segment boundaries, itself and the empty one included. */
function endingsOf(folder: string): string[] {
  const segments = folder === "" ? [] : folder.split("/");
  return segments.map((_, i) => segments.slice(i).join("/")).concat("");
}

/** The stems a test file names: its markers stripped, and its own stem inside a test folder. */
function stemsNamed(path: string, family: Family): string[] {
  const { stem } = nameParts(path);
  const use = classifyLandUse(path);
  const markers = MARKERS[family];
  const stems: string[] = [];
  for (const suffix of markers.suffixes)
    if (stem.length > suffix.length && stem.endsWith(suffix)) stems.push(stem.slice(0, -suffix.length));
  if (use === "tests") {
    for (const prefix of markers.prefixes)
      if (stem.length > prefix.length && stem.startsWith(prefix)) stems.push(stem.slice(prefix.length));
    if (
      folderOf(path)
        .split("/")
        .some((segment) => TEST_FOLDERS.has(segment.toLowerCase()))
    )
      stems.push(stem);
  }
  return stems;
}

/** Every stem the test files among the paths name, with the folders that name it. */
export function testNames(paths: Iterable<string>): TestNames {
  const folders = new Map<string, Set<string>>();
  const endings = new Map<string, Set<string>>();
  for (const path of paths) {
    const family = familyOf(path);
    if (!family || NOT_TESTS.has(classifyLandUse(path))) continue;
    const folder = reduced(folderOf(path));
    for (const stem of stemsNamed(path, family)) {
      const key = `${family}|${stem}`;
      if (!folders.has(key)) folders.set(key, new Set());
      folders.get(key)!.add(folder);
      if (!endings.has(key)) endings.set(key, new Set());
      for (const ending of endingsOf(folder)) endings.get(key)!.add(ending);
    }
  }
  return { folders, endings };
}

/**
 * Whether a test names a source file: the same family and stem, and either folder (source and test folders left out)
 * ends the other. Undefined for a path that is not a source file of a known family: it is not judged.
 */
export function namedBy(names: TestNames, path: string): boolean | undefined {
  const family = familyOf(path);
  if (!family || classifyLandUse(path) !== "source") return undefined;
  const key = `${family}|${nameParts(path).stem}`;
  const folder = reduced(folderOf(path));
  const named = names.folders.get(key);
  if (named && endingsOf(folder).some((ending) => named.has(ending))) return true;
  return names.endings.get(key)?.has(folder) ?? false;
}
