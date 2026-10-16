/**
 * What a push must pass before it leaves the machine: the checks CI's Checks and Tests jobs (and its actionlint job)
 * would fail on, scoped to the files the push changes since its merge base with the base branch.
 */

/** The branch CI compares pull requests against. */
export const BASE_REF = "origin/main";

/** One command the hook runs from the repository root. */
export interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

const BIN = "node_modules/.bin";
const ZERO_SHA = /^0+$/;

/** Files oxfmt formats (`bun run format:check`); it skips its own ignore patterns. */
const FORMATTED = /\.(?:[cm]?[jt]sx?|jsonc?|json5|md|mdx|ya?ml|toml|css|scss|less|html)$/;

/** Files oxlint lints (`bun run lint`). */
const LINTED = /\.[cm]?[jt]sx?$/;

/** Files whose change can break the type check or a test: code, manifests, the lockfile, compiler and test configs. */
const BUILT = /\.[cm]?[jt]sx?$|(?:^|\/)(?:package\.json|tsconfig[^/]*\.json)$|^bun\.lock$/;

/** Workflows actionlint checks (CI's actionlint job). */
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/** Shell scripts, including the extensionless Git hooks in `.husky/`. */
const SHELL = /\.(?:sh|bash)$|^\.husky\/[^/_][^/]*$/;

/** The Rust workspace, and the TypeScript outputs its parity tests replay (golden towns). */
const RUST = /^rust\/|\/__golden__\//;

/**
 * The local commits a push sends. Git writes one line per ref, `<local ref> <local sha> <remote ref> <remote sha>`;
 * deletions (a zero local sha) and tags carry nothing to check.
 */
export function pushedShas(stdin: string): string[] {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .flatMap(([localRef, localSha]) =>
      localRef?.startsWith("refs/heads/") && localSha && !ZERO_SHA.test(localSha) ? [localSha] : [],
    );
}

/** The checks for a push, in the order they run; empty when nothing changed. */
export function prePushPlan(changedFiles: readonly string[], base: string): Step[] {
  const matching = (pattern: RegExp): string[] => changedFiles.filter((file) => pattern.test(file));
  const formatted = matching(FORMATTED);
  const linted = matching(LINTED);
  const built = matching(BUILT);
  const workflows = matching(WORKFLOW);
  const shell = matching(SHELL);
  const rust = matching(RUST);

  const steps: Step[] = [];
  if (formatted.length > 0) {
    steps.push({
      label: "format",
      command: `${BIN}/oxfmt`,
      args: ["--check", "--no-error-on-unmatched-pattern", ...formatted],
    });
  }
  if (linted.length > 0) {
    steps.push({ label: "lint", command: `${BIN}/oxlint`, args: ["--no-error-on-unmatched-pattern", ...linted] });
  }
  if (built.length > 0) {
    steps.push(
      { label: "typecheck", command: "bun", args: ["run", "typecheck"] },
      { label: "tests with coverage", command: `${BIN}/vitest`, args: ["run", "--coverage", "--changed", base] },
    );
  }
  if (workflows.length > 0) steps.push({ label: "actionlint", command: "actionlint", args: workflows });
  if (shell.length > 0) steps.push({ label: "shellcheck", command: "shellcheck", args: shell });
  if (rust.length > 0) steps.push({ label: "rust", command: "bun", args: ["run", "rust:check"] });
  return steps;
}
