import { compareKeys } from "../fixed/hash";
import { classifyLandUse } from "../land-use/land-use";

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
const within = (path: string, folder: string) => path.startsWith(`${folder}/`);

/** Folders other than the root that directly hold a package manifest, outermost only, sorted. */
export function workspaceMembers(paths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const folder = folderOf(path);
    if (folder !== "" && isManifest(path.slice(path.lastIndexOf("/") + 1))) folders.add(folder);
  }
  const all = [...folders];
  return all.filter((m) => !all.some((o) => o !== m && within(m, o))).toSorted(compareKeys);
}

/** Folders holding two or more members whose land (tests, fixtures and docs aside) is at least half source. */
export function workspaceGroups(paths: readonly string[]): string[] {
  const byParent = new Map<string, number>();
  for (const member of workspaceMembers(paths)) {
    const parent = folderOf(member);
    if (parent !== "") byParent.set(parent, (byParent.get(parent) ?? 0) + 1);
  }
  const groups = [...byParent]
    .filter(([parent, members]) => {
      if (members < 2) return false;
      let land = 0;
      let source = 0;
      for (const path of paths) {
        if (!within(path, parent)) continue;
        const use = classifyLandUse(path);
        if (use === "tests" || use === "fixtures" || use === "docs") continue;
        land++;
        if (use === "source") source++;
      }
      return land > 0 && 2 * source >= land;
    })
    .map(([parent]) => parent);
  return groups.filter((g) => !groups.some((o) => o !== g && within(g, o))).toSorted(compareKeys);
}
