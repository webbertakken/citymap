# Separations: separate towns

Derived from [ground plan](../ground-plan.md) § Separate towns, § Edges and open land. Module:
`packages/ground-plan/src/region/separate.ts`; parts and highways in `region/compose.ts` (see [region](./region.md)).
Rust: `rust/crates/ground-plan/src/region/separate.rs`, byte for byte the same.

## Domain and naming

| Term (spec)      | Identifier                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| separation       | `Separation`, one of `SEPARATIONS`                                                             |
| separations on   | `Options.separate` (replaces `split`); `separationList(separate)` in `SEPARATIONS` order, once |
| member           | `SeparateMember { folder, by }`: a folder laid apart, and the separation that names it         |
| separate town    | a `Part` whose root is a member's folder                                                       |
| declared         | `declaresWorkspaces(snapshot)`: `snapshot.workspaces` holds at least one folder                |
| separable        | `separable(snapshot)`: the separations whose members, each alone, are not empty                |
| folder kind      | `FOLDER_KINDS`: the separations named by a folder (`apps` … `extensions`, `plugins`)           |
| unread submodule | a submodule laid as the one file `<folder>/.gitlink` (`GITLINK_FILE`)                          |

```ts
export const SEPARATIONS = [
  "workspaces", "submodules", "apps", "packages", "libs", "crates", "services", "modules", "extensions", "plugins",
] as const;
export type Separation = (typeof SEPARATIONS)[number];
export const DEFAULT_SEPARATIONS: readonly Separation[] = ["workspaces", "submodules", "apps"];
/** Separations named by a root folder of their own name. */
export const ROOT_KINDS = ["apps", "packages", "libs", "crates", "services", "modules", "extensions"] as const;
/** Declared workspaces override these. */
export const OVERRIDDEN = ["apps", "packages"] as const;
export const GITLINK_FILE = ".gitlink";
export const isSeparation = (name: string): name is Separation => ...;
export const separationList = (separate?: readonly Separation[]) =>
  SEPARATIONS.filter((s) => (separate ?? DEFAULT_SEPARATIONS).includes(s));
```

## Members

`separateMembers(snapshot, separate): SeparateMember[]`, pure, sorted by `compareKeys(folder)`.

1. `folders` = the keys of `snapshot.folderFirstSeen` other than `""` (folders that hold files at this commit or held
   them before; only those holding files now count, step 6).
2. For each separation `s` in `separationList(separate)`, its candidates:
   - `workspaces`: `snapshot.workspaces ?? []`.
   - `submodules`: `snapshot.submodules ?? []`.
   - `s` in `OVERRIDDEN`, when `separate` holds `workspaces` and `declaresWorkspaces(snapshot)`: none.
   - `s` in `ROOT_KINDS`: every folder `f` with `folderOf(f) === s`.
   - `plugins`: every folder `f` whose parent's last segment is `plugins` (`folderOf(f) === "plugins"` or
     `folderOf(f).endsWith("/plugins")`).
3. Within one separation, members nested inside another of its members are dropped (`outermost`).
4. Across separations, a folder named twice is one member; `by` is the first separation in `SEPARATIONS` order.
5. Members of different separations may nest (a submodule inside a package): both stay.
6. A candidate folder that holds no file at this commit is dropped (a member is a folder some file path starts with
   `${folder}/`).

`separable(snapshot)`: `SEPARATIONS.filter((s) => separateMembers(snapshot, [s]).length > 0)`. Each separation is judged
alone, so `apps` and `packages` count by their folders whether or not workspaces are declared.

## Parts

`layCity` builds its parts from the members and the workspace groups (see [region](./region.md) § Towns):

1. `members` = `separateMembers(snapshot, options.separate)`.
2. A workspace group is a town unless its folder is a member, or any of its direct workspace members is a member. A
   group inside a member stays a town of its own, joined to that member's town.
3. `roots` = the members' folders and the groups that are towns, deduplicated, sorted.
4. The main part: root `""`, `exclude` = the roots not inside another root.
5. Each root's part: key `${repository}/${root}`, name `root`, `exclude` = the roots inside it not inside another root
   inside it (its nearest nested roots).
6. Parts after the main one are ordered by `(folderFirstSeen(root), compareKeys(root))`, as today.
7. `parent(part)` = the part of the nearest root strictly containing its root, else the main part.

## Highways

- Each laid town other than the first joins the town of its `parent`; when that part laid no town (no demand), the
  nearest laid ancestor's, else the first town laid. A town is never joined to itself.
- Old towns join their successors as before. Pair order: the towns in laid order, then old towns.

## City record

```ts
interface City {
  readonly repository: string;
  readonly commit: string;
  readonly towns: readonly Town[];
  readonly highways: readonly Road[];
  readonly separable?: readonly Separation[]; // present when not empty, SEPARATIONS order
  readonly declared?: true; // present when the snapshot declares workspaces
}
```

- Serialised in this field order; `parseCity` checks `separable` (known names, `SEPARATIONS` order, no repeats, not
  empty) and `declared` (`true` only), rejecting with `city/bad-shape` at `/separable` or `/declared`.
- A city file written before carries neither: the viewer shows no "Separate towns" group for it.

## Setting key

`settingKey(options)` = `${landKey}|separate:${separationList(options.separate).join(",")}|toggles:${toggles}`. Every
lockfile written under `split:` is set aside by the setting mismatch and folded afresh, as a toggle change does.

## Errors and edge cases

- No members: the parts are the main town and the workspace groups, as with every separation off.
- Every file inside members: the main part has no demand and lays no town; highways join the first town laid.
- A member that is a workspace group's folder (`packages` on, `packages/` a group): the group is not a town; its
  members' child folders are towns and its own files stay in the town it lies in.
- An unread submodule: its folder holds only `.gitlink`; its town is one lot.
- A folder kind inside a member (`apps/web/plugins/x`): a member too, nested, joined to `apps/web`'s town.
- Thousands of members (ohmyzsh's plugins: about 300): one town each; placement cost is O(towns²) clear checks, measured
  in Performance.

## Performance and limits

- `separateMembers` is linear in folders plus members × depth; kept per file list as `derive` keeps groups.
- Placement: each new town checks every placed town; 300 towns cost under 10^5 checks a lay.

## Observability

- The CLI logs `fold/separate towns=<n> by=<separation>:<count>,…` once, after the fold, for the last commit laid
  (`SEPARATIONS` order, separations laying none left out); nothing when no town stands apart. `layCity` emits no event
  of its own for it, so a fold's log does not grow by a line per commit.

## Testing

| Rule                                                               | Test                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| defaults workspaces, submodules, apps; key and list order          | `separate.test.ts`                                   |
| each separation's members; plugins at any depth; root kinds only   | `separate.test.ts`                                   |
| declared workspaces override apps and packages, only when declared | `separate.test.ts`                                   |
| outermost per separation, nesting across, one member per folder    | `separate.test.ts`                                   |
| folders without files are no members                               | `separate.test.ts`                                   |
| `separable`, `declared` on the city; `parseCity` rejections        | `separate.test.ts`, `city/serialise.test.ts`         |
| nested parts exclude their nearest roots; highways to the parent   | `region/compose.test.ts`                             |
| groups with a separate member are no towns                         | `region/compose.test.ts`                             |
| every separation off lays the towns `split: []` laid               | golden towns (`separate: []`)                        |
| Rust lays the same bytes                                           | `bun run parity --separate=…`; Rust `separate` tests |

## Constants and configuration

| Constant              | Value                        | Provenance                     |
| --------------------- | ---------------------------- | ------------------------------ |
| `DEFAULT_SEPARATIONS` | workspaces, submodules, apps | spec § Separate towns (Webber) |
| `ROOT_KINDS`          | apps … extensions            | spec § Separate towns (Webber) |
| `OVERRIDDEN`          | apps, packages               | spec § Separate towns (Webber) |
| `GITLINK_FILE`        | `.gitlink`                   | spec § Submodules              |
