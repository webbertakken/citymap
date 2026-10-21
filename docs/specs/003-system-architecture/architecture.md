# System architecture

How citymap is built: its packages, the data that flows between them, and the boundaries between languages and runtimes.
What the ground plan is lives in [ground plan](../006-ground-plan/ground-plan.md).

## Shape

One Bun workspace in this repository, and one Cargo workspace beside it. Domain packages hold the logic; apps only wire
them to a surface.

| Workspace               | Role                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ground-plan`  | The engine: tree snapshots in, plat and city model out. Pure, deterministic, integer core.                                                                                                                                                           |
| `packages/history`      | Reads a git repository into tree snapshots (first-parent history, trees, exact renames), each file's history, and a commit's contents without fetching (one named exception: a partial clone's missing `.mailmap`).                                  |
| `packages/measures`     | Measures of a city's files: the city file's measures section, tests by name, languages and comments, coverage reports, and buildings and their scales. Pure.                                                                                         |
| `packages/svg`          | Draws a city model as SVG, per theme.                                                                                                                                                                                                                |
| `packages/instructions` | Projects a repository of agent instructions into a tree of pages by their references, with its `instructions` section. Pure.                                                                                                                         |
| `packages/scene`        | Turns a city model into Three.js geometry (instanced lots, merged roads), framework free.                                                                                                                                                            |
| `apps/cli`              | `citymap`: a repository in, a city (JSON, SVG) and a lockfile out.                                                                                                                                                                                   |
| `apps/web`              | The viewer: Next.js with React and react-three-fiber, drawing `packages/scene` output; a static export on GitHub Pages that also lays any public GitHub repository's single state in the browser, and a repository's folder on the person's machine. |
| `rust/`                 | The Rust implementation of the CLI and the packages it uses (below).                                                                                                                                                                                 |

- Dependencies point one way: apps depend on packages; `svg` depends on `ground-plan`'s model types only, `scene` on
  them and on `measures`; `measures` depends on `ground-plan` only; `instructions` depends on nothing; `history` and
  `ground-plan` do not know each other, and the apps join them.
- The research prototype in `docs/research/city-layout/variants/` stays as research; the packages are a fresh, tested
  implementation of the specs, not a move of the prototype.

## Data flow

```text
git repository ──history──▶ snapshots ──ground-plan fold──▶ plat ──ground-plan lay──▶ city model ──▶ svg │ scene
      └──history: contents, file history; coverage reports──measures──▶ measures section (beside the city) ──▶ scene
```

- **Instructions**: with `--instructions`, the files of several sources and their edges are projected into a tree of
  pages, one per layout, before the fold sees it; an `instructions` section goes beside the measures, and usage,
  findings and contradictions in sections of their own; see
  [instruction cities](../010-instruction-cities/instruction-cities.md).
- **Measures**: each lot's files and their values (size, tested, history, comments), read where the city came from, in
  their own section of the city file beside the layout; see [buildings](../008-buildings/buildings.md).

- **Snapshot**: one commit's tree as sorted file records (path, identity, land use, binary flag) plus the commit's order
  index. Identities follow exact renames.
- **Fold**: the engine folds snapshots oldest first into the plat; each step lays the city and updates the plat.
- **City model**: plain data (towns, districts, wards, roads, blocks, lots, water, parks, plazas, old towns) in integer
  coordinates, serialisable as JSON. Every consumer reads only this.
- **Lockfile**: the plat serialised; committed to a repository, it overrides the fold.

## Runtimes and languages

- TypeScript 7, run with Bun 1.4 for packages, the CLI and scripts; the web app runs on Next.js 16 with React 19.
- The ground-plan core uses fixed-point integer arithmetic only, so the Rust implementation reproduces it bit for bit.
- The web app imports the engine directly; the same code runs in the CLI and in the browser.
- Rust, stable, pinned in `mise.toml` and `rust/rust-toolchain.toml`, for the second implementation of the CLI.

## Rust implementation

A second implementation of the `citymap` command, for speed: a full fold of a large history takes up to a quarter of an
hour on the TypeScript engine (linux), and a fold service needs it in a minute or two.

- It lives in `rust/`, one Cargo workspace whose crates mirror the TypeScript workspaces they implement:
  `citymap-ground-plan`, `citymap-history`, `citymap-instructions`, `citymap-measures`, `citymap-themes`, `citymap-svg`
  and `citymap-cli` (the `citymap` binary). The scene and the web app stay TypeScript only.
- The TypeScript packages are the reference implementation: the specs describe both, and a change lands in TypeScript
  and Rust in the same pull request.
- **Parity** is the contract: for the same repository, commit and flags, the Rust CLI writes the same bytes as the
  TypeScript CLI to the city JSON, the lockfile and the SVG, and logs the same lines apart from timings. Exit codes and
  error codes are the same.
- Parity is proven at three levels: the TypeScript unit tests ported to Rust; shared fixtures (the golden towns, and
  parity fixtures the TypeScript engine writes for land use, colours and SVG); and `bun run parity`, which runs both
  CLIs on local clones of the reference repositories and compares their outputs byte for byte.
- The Rust CLI may run work in parallel (the history read beside the fold) where the result cannot depend on it.
- It reads git the way the TypeScript reader does: `git` subprocesses with argument arrays and the same flags.
- Its allocator is the system's by default. mimalloc, which folds react about a quarter faster, is the CLI crate's
  `mimalloc` cargo feature, off by default, so a default build compiles no C. Parity holds with it on or off.
- The blueprint is [Rust implementation](blueprints/rust.md).

## Tooling

- Bun workspaces and `bun install`; one lockfile at the root. mise pins Bun, Node (which runs the tools' launchers and
  Vitest), actionlint, shellcheck and gitleaks.
- TypeScript 7 (`tsc`, the native compiler) for type checks, strict, with project references per workspace; the root
  `tsconfig.json` references every workspace, and the type check fails when one is missing.
- oxlint for linting, type-aware through oxlint-tsgolint, with zero warnings; oxfmt (print width 120, Markdown wrapped
  at 120) for formatting. Neither ESLint nor Prettier is used.
- Vitest for unit and property tests in every package, one project per workspace, with 100% coverage enforced;
  Playwright for the web app's end-to-end tests, dark mode.
- One gate, `bun run check`: format check, lint, type check, tests with coverage, then the Rust checks. A commit formats
  and lints its staged files, type checks and scans for secrets; a push runs the gate's checks for what it changes; CI
  runs the whole gate on every pull request and every push to `main`.
- Rust: rustfmt, clippy with pedantic lints denied as errors, and `cargo test`, run by `bun run rust:check`; `unsafe` is
  forbidden. They are part of `bun run check`; a commit with Rust files runs them; CI runs them in their own job, with a
  clippy pass over the `mimalloc` feature.

## Boundaries and trust

- The engine performs no input or output; `history` is the only package that runs git, through `git` subprocesses on a
  local clone, with arguments passed as arrays (never through a shell).
- Repository content is untrusted: paths are treated as data, never as code or as shell input, and the engine bounds its
  work by the size of the tree.
- Everything served runs over HTTPS; local servers listen on loopback only and ask for no credentials.
