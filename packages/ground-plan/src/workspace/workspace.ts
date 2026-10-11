import { compareKeys } from "../fixed/hash";
import { classifyLandUse, type LandUse } from "../land-use/land-use";

const MANIFESTS = new Set([
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "mix.exs",
]);
const MANIFEST_SUFFIXES = [".csproj", ".gemspec"];

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const isManifest = (name: string) => MANIFESTS.has(name) || MANIFEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
/** The folders with no other folder of the set above them, sorted: linear in the set, walking each one's ancestors. */
function outermost(folders: ReadonlySet<string>): string[] {
  const nested = (folder: string) => {
    for (let up = folderOf(folder); up !== ""; up = folderOf(up)) if (folders.has(up)) return true;
    return false;
  };
  return [...folders].filter((f) => !nested(f)).toSorted(compareKeys);
}

/** Folders other than the root that directly hold a package manifest, outermost only, sorted. */
export function workspaceMembers(paths: readonly string[], declared?: readonly string[]): string[] {
  if (declared) return outermost(new Set(declared));
  const folders = new Set<string>();
  for (const path of paths) {
    const folder = folderOf(path);
    if (folder !== "" && isManifest(path.slice(path.lastIndexOf("/") + 1))) folders.add(folder);
  }
  return outermost(folders);
}

/** Folders holding two or more members whose land (tests, fixtures and docs aside) is at least half source. */
export function workspaceGroups(
  paths: readonly string[],
  useOf: (path: string) => LandUse = classifyLandUse,
  declared?: readonly string[],
): string[] {
  const byParent = new Map<string, number>();
  for (const member of workspaceMembers(paths, declared)) {
    const parent = folderOf(member);
    if (parent !== "") byParent.set(parent, (byParent.get(parent) ?? 0) + 1);
  }
  // One pass over the paths: each credits its land to every candidate folder above it.
  const tally = new Map(
    [...byParent].filter(([, members]) => members >= 2).map(([parent]) => [parent, { land: 0, source: 0 }]),
  );
  for (const path of paths) {
    const use = useOf(path);
    if (use === "tests" || use === "fixtures" || use === "docs") continue;
    for (let folder = folderOf(path); folder !== ""; folder = folderOf(folder)) {
      const counts = tally.get(folder);
      if (!counts) continue;
      counts.land++;
      if (use === "source") counts.source++;
    }
  }
  const groups = [...tally].filter(([, c]) => c.land > 0 && 2 * c.source >= c.land).map(([parent]) => parent);
  return outermost(new Set(groups));
}
