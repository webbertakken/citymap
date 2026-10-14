# Development

How to set up citymap, keep the gate green, and what the hooks and CI run. The tooling choices themselves live in
[system architecture](../specs/003-system-architecture/architecture.md#tooling).

## Set up

1. Install [mise](https://mise.jdx.dev) and run `mise install` in the repository root: it installs the versions pinned
   in `mise.toml` (Bun, Node, actionlint, shellcheck, gitleaks).
2. Run `bun install`. Its `prepare` script points Git at the hooks in `.husky/`.
3. Run `bun run check` once; it must pass on a fresh clone.

## The gate

`bun run check` runs, in order, and stops at the first failure:

| Script                 | Runs                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `bun run format:check` | oxfmt over the repository (`.oxfmtrc.json`)                              |
| `bun run lint`         | oxlint, type-aware, zero warnings (`.oxlintrc.json`)                     |
| `bun run typecheck`    | the workspace references check, then `tsc --build`                       |
| `bun run coverage`     | Vitest over every workspace, 100% coverage enforced (`vitest.config.ts`) |

- `bun run format` writes the formatting; run it rather than formatting by hand.
- Vitest and the tools' launchers run on Node, not Bun: `@vitest/coverage-v8` needs V8. Code under test uses `node:`
  APIs; `Bun.*` APIs belong in entry points only.
- Coverage counts `src/**` of every workspace and `scripts/*/**`. Entry points (`scripts/*.ts`) only wire tested modules
  to the real world and are proved by running them.

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

## Hooks

- **pre-commit**: lint-staged formats (oxfmt) and lints (oxlint) the staged files, shellchecks scripts and hooks, and
  actionlints workflows; then `bun run typecheck`; then gitleaks scans the staged diff and blocks any secret.
- **pre-push**: `scripts/pre-push.ts` runs CI's checks for the files the push changes since its merge base with
  `origin/main`: format and lint of those files, the type check and the tests related to them with coverage (when code
  or configuration changed), actionlint (when workflows changed) and shellcheck (when scripts or hooks changed). It
  checks the working tree, so it only runs when the push sends the checked-out `HEAD`; any other push is left to CI.
- A failing hook is fixed, never skipped: no `--no-verify`, no `HUSKY=0` locally.
- `[pre-push] failed: no merge base with origin/main` means the remote branch is missing locally: run
  `git fetch origin`.

## CI

- `.github/workflows/ci.yml` runs on every pull request and every push to `main`, as parallel jobs:
  - **Checks**: format check, lint, type check.
  - **Tests**: tests with coverage, then the report to Codecov over OIDC (no secret). Codecov informs and never gates
    (`codecov.yml`); the 100% thresholds gate in the job itself.
- `.github/workflows/workflows.yml` runs actionlint when a workflow or `mise.toml` changes; it is not a required check.
- A newer push to a pull request cancels its running checks; runs on `main` always finish.
- Every action is pinned by full commit SHA with its version in a comment; Dependabot (`.github/dependabot.yml`)
  proposes grouped updates weekly, for Bun packages and actions alike.
- Workflows hold no logic: each step calls a `package.json` script or a TypeScript script in `scripts/` run by Bun, so
  the same command runs locally.
- Verify locally before pushing (`bun run check`); the pre-push hook does most of it for you.
- The Next.js build and Playwright end-to-end jobs are marked as `LATER` in `ci.yml`, to be added with `apps/web`.
