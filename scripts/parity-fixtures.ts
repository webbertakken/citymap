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

// A synthetic history, folded: workspace groups, split apps, edits, deletions, a rename, docs, and a root switch that
// freezes an old town. Rust replays the snapshots and must log the same events and write the same city and plat.
import {
  canonicalJson,
  initialState,
  layCity,
  DEFAULT_LAND_USES,
  type FileEntry,
  type Options,
  type Snapshot,
} from "@citymap/ground-plan";

const born = (path: string, at: number): FileEntry => ({ path, identity: `${path}@${at}`, firstSeen: at });
const many = (folder: string, n: number, at: number, ext = "ts") =>
  Array.from({ length: n }, (_, i) => born(`${folder}/f${String(i).padStart(4, "0")}.${ext}`, at));

function history(): Snapshot[] {
  const steps: FileEntry[][] = [];
  let files: FileEntry[] = [
    ...many("src", 60, 0),
    ...many("src/util", 25, 0),
    born("packages/a/package.json", 0),
    ...many("packages/a/src", 40, 0),
    born("packages/b/package.json", 0),
    ...many("packages/b/src", 30, 0),
    born("apps/web/package.json", 0),
    ...many("apps/web/pages", 20, 0),
    born("apps/api/package.json", 0),
    ...many("apps/api/routes", 15, 0),
    ...many("docs", 6, 0, "md"),
    born("package.json", 0),
    born("tsconfig.json", 0),
  ];
  steps.push(files);
  files = [...files, ...many("src/feature", 30, 1), ...many("src", 10, 1, "test.ts")];
  steps.push(files);
  files = files.filter((f) => !(f.path.startsWith("packages/a/src/f00") && f.path < "packages/a/src/f0030"));
  steps.push(files);
  // A rename: the identity follows the file to its new folder.
  files = files.map((f) =>
    f.path.startsWith("src/util/") ? { ...f, path: f.path.replace("src/util/", "src/lib/") } : f,
  );
  steps.push(files);
  files = [...files, ...many("tools/cli", 12, 4), ...many("examples/demo", 8, 4)];
  steps.push(files);
  // One folder outgrows every other: the root turns radial and the town as it stood becomes an old town.
  files = [...files, ...many("core", 900, 5), ...many("core/engine", 600, 5)];
  steps.push(files);
  files = [...files, ...many("core/io", 80, 6)];
  steps.push(files);
  files = files.filter((f) => !f.path.startsWith("src/feature/"));
  steps.push(files);
  return steps.map((list, index) => {
    const sorted = list.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const folderFirstSeen = new Map<string, number>();
    for (const f of sorted)
      for (
        let folder = f.path.slice(0, Math.max(0, f.path.lastIndexOf("/")));
        ;
        folder = folder.slice(0, Math.max(0, folder.lastIndexOf("/")))
      ) {
        if (!folderFirstSeen.has(folder)) folderFirstSeen.set(folder, Math.min(index, f.firstSeen));
        if (folder === "") break;
      }
    return {
      repository: "synthetic",
      commit: index.toString(16).padStart(40, "0"),
      index,
      files: sorted,
      folderFirstSeen,
    };
  });
}

const foldOptions: Options = {
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
  split: ["apps"],
};
const snapshots = history();
let state = initialState(foldOptions);
const events: string[][] = [];
let last = "";
for (const snapshot of snapshots) {
  const laid = layCity(snapshot, state, foldOptions);
  state = laid.state;
  events.push(
    laid.events.map(
      (e) =>
        `${e.code} ${Object.entries(e.detail)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")}`,
    ),
  );
  last = canonicalJson(laid.city);
}
const fold = {
  snapshots: snapshots.map((s) => ({ ...s, folderFirstSeen: Object.fromEntries(s.folderFirstSeen) })),
  events,
  city: last,
  plat: canonicalJson(state.plat),
};
await Bun.write(out("fold.json"), `${JSON.stringify(fold)}\n`);
console.log(
  `[parity-fixtures] fold.json: ${snapshots.length} snapshots, ${events.flat().length} events, old towns ${Object.keys(state.plat.old).length}`,
);
