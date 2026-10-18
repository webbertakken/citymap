# Development

How to set up citymap, keep the gate green, and what the hooks and CI run. The tooling choices themselves live in
[system architecture](../specs/003-system-architecture/architecture.md#tooling).

## Set up

1. Install [mise](https://mise.jdx.dev) and run `mise install` in the repository root: it installs the versions pinned
   in `mise.toml` (Bun, Node, Rust with rustfmt and clippy, actionlint, shellcheck, gitleaks).
2. Run `bun install`. Its `prepare` script points Git at the hooks in `.husky/`.
3. Run `bun run check` once; it must pass on a fresh clone.

## The gate

`bun run check` runs, in order, and stops at the first failure:

| Script                 | Runs                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `bun run format:check` | oxfmt over the repository (`.oxfmtrc.json`)                                  |
| `bun run lint`         | oxlint, type-aware, zero warnings (`.oxlintrc.json`)                         |
| `bun run typecheck`    | the workspace references check, then `tsc --build`                           |
| `bun run coverage`     | Vitest over every workspace, 100% coverage enforced (`vitest.config.ts`)     |
| `bun run rust:check`   | rustfmt check, clippy with warnings as errors, then `cargo test`, in `rust/` |

- The Rust checks stay in the gate: warm, `bun run rust:check` takes about 2 s (1.5 to 2.3 s measured). A cold build,
  after a toolchain or lockfile change, takes a minute or so once.
- `bun run format` writes the formatting; run it rather than formatting by hand.
- Vitest and the tools' launchers run on Node, not Bun: `@vitest/coverage-v8` needs V8. Code under test uses `node:`
  APIs; `Bun.*` APIs belong in entry points only.
- Coverage counts `src/**` of every workspace and `scripts/*/**`. Entry points (`scripts/*.ts`) only wire tested modules
  to the real world and are proved by running them.

## Rust

The Rust implementation of the CLI lives in `rust/`: see
[architecture](../specs/003-system-architecture/architecture.md) and its
[blueprint](../specs/003-system-architecture/blueprints/rust.md).

1. Build it with `cargo build --release --manifest-path rust/Cargo.toml`. The binary, `rust/target/release/citymap`,
   takes the same arguments as the TypeScript CLI.
2. For long folds, build it with mimalloc as its allocator:
   `cargo build --release --manifest-path rust/Cargo.toml -p citymap-cli --features mimalloc`. It needs a C compiler (it
   builds mimalloc's C sources) and writes the same bytes. Measured on a react fold (14,967 commits): 8.3 s to 6.1 s on
   a quiet machine, and best of five 7.8 s to 5.6 s on a loaded one, with the same 140 MB peak.
   `bun run rust:lint:mimalloc` lints the feature; CI runs it.
3. `bun run rust:format` writes the formatting; `bun run rust:check` runs what CI runs.
4. A change to the engine, the history reader, the themes, the SVG or the CLI lands in TypeScript and Rust together.
5. After a change to a rule the parity fixtures record (land use, the fold, colours, SVG, the usage), run
   `bun scripts/parity-fixtures.ts` and commit `rust/fixtures/`. The golden towns are shared with the TypeScript tests.
6. Prove parity with `bun run parity` under PM2. It runs both CLIs on the repositories under `~/.cache/citymap/repos`,
   each on its own shared clone (so no lock lands in the cache), and compares city, SVG, lockfile and log byte for byte.
   The `resume` mode also resumes each fold from a lock saved part way, and must match the uninterrupted fold. `--long`
   adds next.js (minutes on TypeScript); `--repos=a,b` and `--modes=state,fold,resume` narrow it; `--features=mimalloc`
   builds the Rust CLI with mimalloc; `--toggles=a,b` lays both CLIs with those toggles. Prove a change to a toggle's
   rules with the defaults, each toggle alone (`--toggles=corridor` and so on) and none (`--toggles=`).
7. A `parity/differs` line is a bug in one of the two implementations. Both runs' outputs stay in
   `/tmp/citymap-parity-<repo>`: find the first differing byte, then the rule behind it. A `parity/resume-differs` line
   is state a lockfile does not carry: find the first commit where the resumed plat leaves the uninterrupted one.

## Bundled cities

1. The bundled cities are built, never committed: the Pages workflow builds them before the site, and
   `apps/web/public/cities/` is ignored. Run `bun run bundle` under PM2 once before `next dev`, a local build or the
   end-to-end suite (which refuses to start without them).
2. It builds the Rust CLI, clones every city in `BUNDLED` (`scripts/bundle/bundle.ts`) from GitHub without contents,
   checks out its pinned commit, and folds it once per combination of the toggles (16 each) into
   `apps/web/public/cities/<name>/<variant>.json` with `index.json`; about four minutes.
3. It logs `bundle/cloned` per city, `bundle/laid` per variant and `bundle/done` with the total bytes, raw and gzipped.
4. To show a newer state of a city, move its pin in `BUNDLED` and update the end-to-end expectations that name its
   numbers, in one PR.

## Adding a workspace

1. Create `packages/<name>/` or `apps/<name>/` with a `package.json` and a `tsconfig.json` that extends
   `../../tsconfig.base.json`, sets `outDir` to `dist`, and includes `src`.
2. Add `{ "path": "./packages/<name>" }` to the root `tsconfig.json` references; `bun run typecheck` fails until it is
   there.
3. Put tests beside the code as `*.test.ts`. Vitest picks the workspace up as a project; add a `vitest.config.ts` to it
   only when it needs its own environment (the web app's DOM).
4. Keep Playwright specs out of Vitest: exclude them (`e2e/**/*.spec.ts`) in that workspace's `vitest.config.ts`.

## Performance

- `bun run bench` times the fold blueprint's budgets on the repositories under `~/.cache/citymap/repos`; a missing one
  is skipped by name. Run it under PM2: the linux HEAD and react fold take a few minutes together.
- The bench then lays the corpus at HEAD and holds its ratchet against `scripts/bench/baseline.json`. A change that
  earns better totals records them with `bun run bench --rebase` in the same commit; a rise fails the bench.
- `bun run bench --folds` adds full folds of the fast reference repositories (about a minute) and their own ratchet; run
  it for any change to the plat or the layout.

## Hooks

- **pre-commit**: lint-staged formats (oxfmt, rustfmt) and lints (oxlint) the staged files, shellchecks scripts and
  hooks, and actionlints workflows; then `bun run typecheck`; then `bun run rust:lint` when the commit touches `rust/`;
  then gitleaks scans the staged diff and blocks any secret.
- **pre-push**: `scripts/pre-push.ts` runs CI's checks for the files the push changes since its merge base with
  `origin/main`: format and lint of those files, the type check and the tests related to them with coverage (when code
  or configuration changed), actionlint (when workflows changed), shellcheck (when scripts or hooks changed) and
  `bun run rust:check` (when `rust/` or the golden towns changed). It checks the working tree, so it only runs when the
  push sends the checked-out `HEAD`; any other push is left to CI.
- A failing hook is fixed, never skipped: no `--no-verify`, no `HUSKY=0` locally.
- `[pre-push] failed: no merge base with origin/main` means the remote branch is missing locally: run
  `git fetch origin`.

## CI

- `.github/workflows/ci.yml` runs on every pull request and every push to `main`, as parallel jobs:
  - **Checks**: format check, lint, type check.
  - **Tests**: tests with coverage, then the report to Codecov over OIDC (no secret). Codecov informs and never gates
    (`codecov.yml`); the 100% thresholds gate in the job itself.
  - **Rust**: `bun run rust:check`, then `bun run rust:lint:mimalloc`, builds cached by `Swatinem/rust-cache` (written
    by runs on `main` only).
- `.github/workflows/workflows.yml` runs actionlint when a workflow or `mise.toml` changes; it is not a required check.
- A newer push to a pull request cancels its running checks; runs on `main` always finish.
- Every action is pinned by full commit SHA with its version in a comment; Dependabot (`.github/dependabot.yml`)
  proposes grouped updates weekly, for Bun packages, crates and actions alike.
- Workflows hold no logic: each step calls a `package.json` script or a TypeScript script in `scripts/` run by Bun, so
  the same command runs locally.
- Verify locally before pushing (`bun run check`); the pre-push hook does most of it for you.
- The Next.js build and Playwright end-to-end jobs are marked as `LATER` in `ci.yml`, to be added with `apps/web`.
