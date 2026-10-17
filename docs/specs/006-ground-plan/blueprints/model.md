# Model: input, tree, plat and city

Derived from [ground plan](../ground-plan.md) § Input, Land use and mass, Order, Structure, Vocabulary. Modules:
`packages/ground-plan/src/{snapshot,land-use,tree,plat,city}/`.

## Snapshot (input)

```ts
interface Snapshot {
  readonly repository: string; // display name, e.g. "react"
  readonly commit: string; // 40-hex id, or "worktree"
  readonly index: number; // first-parent position, 0 = oldest
  readonly files: readonly FileEntry[]; // sorted by compareKeys(path)
  readonly folderFirstSeen: ReadonlyMap<string, number>; // folder path -> first commit index holding it
  readonly workspaces?: readonly string[]; // member folders declared by the root workspace manifests, when read
  readonly submodules?: readonly string[]; // submodule folders (gitlinks), sorted, when the tree holds any
}
interface FileEntry {
  readonly path: string; // repo-relative, "/" separated, no leading "./"
  readonly identity: string; // `${pathAtBirth}@${birthIndex}`, carried through exact renames
  readonly firstSeen: number; // birth index of the identity
}
```

- `parseSnapshot(unknown)` validates and returns a `Snapshot` or a named rejection: `snapshot/not-sorted`,
  `snapshot/duplicate-path`, `snapshot/bad-path` (empty segment, `.` or `..`, leading `/`, NUL, or over 4,096 bytes),
  `snapshot/too-large` (over `MAX_FILES` = 2,000,000 files), `snapshot/bad-index`; `workspaces` or `submodules` that are
  not arrays of folder paths are `snapshot/bad-shape`, and both are kept sorted.
- `stateSnapshot(repository, commit, paths, workspaces?, submodules?)` builds a single state; `submodules` is kept only
  when not empty.
- A submodule's files are ordinary entries under its folder; an unread one is `<folder>/.gitlink`.
- The root folder's path is `""`. A folder's path is its file's path up to the last `/`.

## Land use and weight

- `classifyLandUse(path)`: the prototype's rules in `land-use.ts`, earliest first (vendored, generated, fixtures, tests,
  examples, docs, ci, assets, config, source), with **binary detection by extension only** (assets), so the fold never
  reads no file contents to classify. `.gitattributes` overrides (`linguist-vendored`, `linguist-generated`,
  `linguist-documentation`) apply when the snapshot carries them (`Snapshot.attributes`, later).
- `WEIGHT_MILLE`: source 1000; config, assets, ci, docs 500; tests, examples 300; fixtures, generated, vendored 50.
- `lotCapacity(use) = max(1, roundDiv(1000, WEIGHT_MILLE[use]))`: source 1, config 2, tests 3, fixtures 20.
- `Options.landUses`: the land uses that take land; default all but `tests` and `fixtures` (spec: land dimension). The
  plat is keyed by the sorted set (`landKey`), so each setting is its own plat.

## Workspace members

- When the snapshot carries `workspaces` (members declared by the root manifests, resolved by the history reader), those
  are the members. Otherwise a **workspace member** is a folder other than the root that directly holds a manifest:
  `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `composer.json`, `pom.xml`, `build.gradle`,
  `build.gradle.kts`, `mix.exs`, `*.csproj`, `*.gemspec`. Read from paths only.
- Members nested inside another member are dropped. A **workspace group** is a folder holding at least two direct member
  children whose land files are at least half source (`2 × source ≥ land`, land excluding tests, fixtures, docs). Groups
  nested in groups are dropped. Sorted by `compareKeys`.

## Tree

```ts
interface TreeNode {
  readonly path: string;
  readonly name: string; // last segment, or the chain "a/b" after collapse, or the repository name at the root
  readonly depth: number;
  readonly firstSeen: number;
  readonly lots: readonly LotSeed[]; // own lots after sharing, by (firstSeen, path)
  readonly docs: number; // own doc files
  readonly children: readonly TreeNode[]; // by compareKeys(path)
  readonly massMille: number; // Σ own WEIGHT_MILLE + Σ children
  readonly demand: number; // land in fixed units², see Land
  readonly member: boolean; // it, or a folder of its collapsed chain, is a workspace member
  readonly sourceMille: number; // mass of its subtree's source files
}
interface LotSeed {
  readonly key: string;
  readonly path: string;
  readonly use: LandUse;
  readonly firstSeen: number;
}
```

- `buildTree(snapshot, root, exclude, options, shares)`: files under `root/` not under any `exclude/`; files whose use
  takes no land count into `stats.offLand`; docs count into their folder's `docs` and take no lot.
- **Sharing**: per folder and land use, the plat's `ShareRecord[]` (key `${folder}|${use}`) keeps each lot's members.
  Dead members drop; empty lots drop; each unplaced identity, in `(firstSeen, path)` order, joins the first lot with
  room or founds a lot keyed by its identity. A lot's seed is its oldest live member, with the lot key.
- **Chain collapse**: below the root, a node without own lots or docs and with one child merges into it, the name joined
  with `/`, the depth kept, firstSeen the minimum.
- **Land**: `landFor(lotArea) = (isqrt(lotArea × 100 / densityPct) + 2 × MARGIN)²`, 0 when `lotArea = 0`;
  `items = landFor(lots × LOT_AREA) + landFor(docs × LOT_AREA / 2) + Σ children`; with two or more items (children, own
  lots, docs) the folder's own roads need land beyond a street:
  `excess = ROAD_WIDTH[reserveFor(mass, first)] − ROAD_WIDTH.street` (`roadExcess` in `roads.ts`) and
  `demand = (isqrt(items) + excess)²`; otherwise `demand = items`.

## Plat

```ts
interface Plat {
  readonly version: 1;
  readonly setting: string; // landKey(uses) + "|separate:" + separations + "|toggles:" + toggles
  towns: Record<string, TownPlat>; // key: repository name, or `${name}/${root}` (a group or a member)
  old: Record<string, OldTown[]>;
  rootForms: Record<string, Form>;
}
interface TownPlat {
  centre: Pt | null;
  area2: number;
  cap2: number;
  diameter: number;
  cuts: Record<string, CutRecord>;
  grids: Record<string, GridRecord>;
  shares: Record<string, ShareRecord[]>;
  forms: Record<string, Form>;
  radial: Record<string, RadialRecord>;
  addresses: Record<string, string>;
  tier?: Tier; // with tiers on
  islands?: Record<string, string[][]>; // an archipelago's islands, per folder
  quarters?: Record<string, string[][]>; // a folder's quarters
}
interface CutRecord {
  n: Dir;
  c: number;
  cls: RoadClass;
  left: string[];
  right: string[];
  capLeft: number;
  capRight: number;
  row?: RoadClass;
  river?: true;
  canal?: true;
}
interface RadialRecord {
  core: string;
  start: number;
  order: string[];
  bounds: number[];
  scaleMille: number;
  caps: Record<string, number>;
}
interface GridRecord {
  dir: Dir;
  a0: number;
  b0: number;
  rowPitch: number;
  colPitch: number;
  span: number;
  green?: string;
  high?: number;
  park: { n: Dir; c: number } | null;
  slots: Record<string, string>;
}
interface ShareRecord {
  key: string;
  members: string[];
}
interface OldTown {
  town: Town;
  members: Record<string, string[]>;
}
```

- Every field is an integer, a string, or a record/array of them. `Dir` is `[x, y]` from the direction table or
  `normalise`.
- **Serialisation** (`serialisePlat`): JSON with object keys sorted by `compareKeys` at every level, no whitespace,
  trailing newline. `parsePlat` validates the shape and `version`; rejections `plat/bad-json`, `plat/bad-version`,
  `plat/bad-shape` (with the JSON pointer). Round-trip is the identity (property test).
- **Migration**: a newer `version` is rejected with `plat/too-new`; an older one is migrated by a chain of pure
  `migrate<N>` functions (each from version N to N + 1), each tested on a stored fixture. Version 1 has none.
- **Lockfile**: `citymap.lock.json` at the repository root holds `{ commit, plat }`; when present and its commit is an
  ancestor-or-equal of the laid commit, the fold starts from it instead of commit 0. It is written at the end of a fold
  and every 1,000 laid snapshots along the way.

## City model (output)

```ts
interface City {
  repository: string;
  commit: string;
  towns: Town[];
  highways: Road[];
}
interface Town {
  key: string;
  name: string;
  form: Form;
  old: boolean;
  outline: Pt[];
  water: Pt[][];
  canals?: Pt[][]; // an archipelago's canals, when there are any
  roads: Road[];
  blocks: Block[];
  lots: Lot[];
  districts: District[];
  stats: TownStats; // lots, overflow, offLand, docs, lotArea2, landArea2 (doubled areas, fixed units²)
}
interface Road {
  pts: Pt[];
  cls: RoadClass;
  width?: number; // fixed units, when its right of way draws it narrower than its class
}
interface Block {
  pts: Pt[];
  district: number;
  kind: "built" | "reserve" | "park" | "plaza" | "green";
  form?: DistrictForm;
}
interface Lot {
  pts: Pt[];
  key: string;
  address: string;
  vacant: boolean;
  path: string;
  use: LandUse;
  district: number;
  form?: DistrictForm;
}
interface District {
  pts: Pt[];
  path: string;
  name: string;
  depth: number;
  massMille: number;
  form?: Form;
  ward: boolean;
}
```

- `district` on blocks and lots is the tint seed (`seedOf` of the district key), an unsigned 32-bit integer.
- Coordinates are fixed units; renderers divide by `UNIT` (u) only for display.
- `serialiseCity` uses the same sorted-key JSON. The city carries no floats.

## Errors

Every rejection is a `CitymapError { code, message, detail }`, `code` one of the names above; the engine never throws
anything else (an internal assertion failure is `engine/invariant` with the invariant's name).
