# System architecture

How citymap is built: its packages, the data that flows between them, and the boundaries between languages and runtimes.
What the ground plan is lives in [ground plan](../006-ground-plan/ground-plan.md).

## Shape

One Bun workspace in this repository. Domain packages hold the logic; apps only wire them to a surface.

| Workspace              | Role                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ground-plan` | The engine: tree snapshots in, plat and city model out. Pure, deterministic, integer core.                                                                                                        |
| `packages/history`     | Reads a git repository into tree snapshots (first-parent history, trees, exact renames).                                                                                                          |
| `packages/svg`         | Draws a city model as SVG, per theme.                                                                                                                                                             |
| `packages/scene`       | Turns a city model into Three.js geometry (instanced lots, merged roads), framework free.                                                                                                         |
| `apps/cli`             | `citymap`: a repository in, a city (JSON, SVG) and a lockfile out.                                                                                                                                |
| `apps/web`             | The viewer: Next.js with React and react-three-fiber, drawing `packages/scene` output; a static export on GitHub Pages that also lays any public GitHub repository's single state in the browser. |

- Dependencies point one way: apps depend on packages; `svg` and `scene` depend on `ground-plan`'s model types only;
  `history` and `ground-plan` do not know each other, and the apps join them.
- The research prototype in `docs/research/city-layout/variants/` stays as research; the packages are a fresh, tested
  implementation of the specs, not a move of the prototype.

## Data flow

```text
git repository ──history──▶ snapshots ──ground-plan fold──▶ plat ──ground-plan lay──▶ city model ──▶ svg │ scene
```

- **Snapshot**: one commit's tree as sorted file records (path, identity, land use, binary flag) plus the commit's order
  index. Identities follow exact renames.
- **Fold**: the engine folds snapshots oldest first into the plat; each step lays the city and updates the plat.
- **City model**: plain data (towns, districts, wards, roads, blocks, lots, water, parks, plazas, old towns) in integer
  coordinates, serialisable as JSON. Every consumer reads only this.
- **Lockfile**: the plat serialised; committed to a repository, it overrides the fold.

## Runtimes and languages

- TypeScript 7, run with Bun 1.4 for packages, the CLI and scripts; the web app runs on Next.js 16 with React 19.
- The ground-plan core uses fixed-point integer arithmetic only, so a later Rust port reproduces it bit for bit.
- The web app imports the engine directly; the same code runs in the CLI and in the browser.

## Tooling

- Bun workspaces and `bun install`; one lockfile at the root. mise pins Bun, Node (which runs the tools' launchers and
  Vitest), actionlint, shellcheck and gitleaks.
- TypeScript 7 (`tsc`, the native compiler) for type checks, strict, with project references per workspace; the root
  `tsconfig.json` references every workspace, and the type check fails when one is missing.
- oxlint for linting, type-aware through oxlint-tsgolint, with zero warnings; oxfmt (print width 120, Markdown wrapped
  at 120) for formatting. Neither ESLint nor Prettier is used.
- Vitest for unit and property tests in every package, one project per workspace, with 100% coverage enforced;
  Playwright for the web app's end-to-end tests, dark mode.
- One gate, `bun run check`: format check, lint, type check, tests with coverage. A commit formats and lints its staged
  files, type checks and scans for secrets; a push runs the gate's checks for what it changes; CI runs the whole gate on
  every pull request and every push to `main`.

## Boundaries and trust

- The engine performs no input or output; `history` is the only package that runs git, through `git` subprocesses on a
  local clone, with arguments passed as arrays (never through a shell).
- Repository content is untrusted: paths are treated as data, never as code or as shell input, and the engine bounds its
  work by the size of the tree.
- Everything served runs over HTTPS; local servers listen on loopback only and ask for no credentials.
