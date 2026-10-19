# 0016 Partial clone manifests

A clone without file contents (a blob-less partial clone) lays the towns a full clone lays: it fetches exactly the root
workspace manifest blobs the commits it lays name, and nothing else, as it fetches the laid commit's `.mailmap`. A fetch
that fails says so in the city. A submodule whose files the clone does not hold lays as one folder, and its cards say
why. Spec: [ground plan](../docs/specs/006-ground-plan/ground-plan.md) § Input, § Submodules;
[buildings](../docs/specs/008-buildings/buildings.md) § The fetches;
[viewer](../docs/specs/004-interface-design/viewer.md) § Separate towns, Hover and select. Blueprints:
[fold](../docs/specs/006-ground-plan/blueprints/fold.md), [model](../docs/specs/006-ground-plan/blueprints/model.md),
[viewer](../docs/specs/004-interface-design/blueprints/viewer.md),
[Rust](../docs/specs/003-system-architecture/blueprints/rust.md).

Branch `fix/partial-clone-manifests`, from main after #37.

## Phase 0: specification

- [x] Answers from Webber (fetch the root manifests as the `.mailmap` is fetched; unread submodules as one folder with
      the reason on its card; a failed fetch said in the city; parity's partial mode matching the full clone's towns)
- [x] Spec: ground plan (input, submodules), buildings (the fetches), viewer (the group's line, the cards)
- [x] Blueprints: fold (the manifests' prefetch, its event), model (`Snapshot.manifests`, `City.manifests`), viewer (the
      line, the submodule rows), Rust; DEFAULTS rows
- [x] Commit

## Phase 1: history, both CLIs

- [x] Laid commits' root manifest blobs from their root trees (`git log --format=%T`, `git cat-file --batch`),
      test-first
- [x] Missing ones fetched in one batch from the promisor remotes (`git fetch --stdin`, noop negotiation, blob filter),
      within `MANIFESTS_FETCH_TIMEOUT`; `history/manifests` event; nothing asked of a full clone
- [x] The fold and the single state fetch before reading; `manifests: "unfetchable"` on every snapshot when it fails
- [x] Engine: `City.manifests` recorded from the snapshot; city schema, `parseCity`, Rust city and city file writers
- [x] Rust port, case for case; `bun run rust:check`
- [x] Commit

## Phase 2: viewer

- [x] Separate towns group: the line when the city's manifests could not be fetched, the group shown for it alone
- [x] Cards: an unread submodule's lot, folder and town say "This submodule's files are not in this clone" (GitHub:
      "This submodule's files could not be read from GitHub")
- [x] Commit

## Phase 3: parity and verification

- [x] Parity's partial mode: the blob-less clone's layout (city without measures, SVG, lock) and people match the fold's
- [ ] `bun run check`; `bun run parity` (every mode on the six cities, rust and deno); end to end on port 5198
- [ ] PR; fold-back
