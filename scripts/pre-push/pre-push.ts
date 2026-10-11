import { BASE_REF, prePushPlan, pushedShas, type Step } from "./plan.ts";

/** The outside world the hook touches, passed in so every path is testable. */
export interface Ports {
  /** Runs git with the arguments and returns its trimmed stdout; throws when git fails. */
  readonly git: (args: readonly string[]) => string;
  /** Runs a step with inherited stdio and returns its exit code, or a description of why it did not exit cleanly. */
  readonly run: (step: Step) => number | string;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  /** Milliseconds since an arbitrary epoch, for the elapsed time. */
  readonly now: () => number;
}

const PREFIX = "[pre-push]";
const short = (sha: string): string => sha.slice(0, 9);

function mergeBase(ports: Ports): string | undefined {
  try {
    return ports.git(["merge-base", "HEAD", BASE_REF]);
  } catch {
    return undefined;
  }
}

/**
 * Runs the checks for the push described on stdin and returns the hook's exit code. The working tree is what gets
 * checked, so it only stands for the push when the push sends the checked-out HEAD; any other push is left to CI.
 */
export function prePush(stdin: string, ports: Ports): number {
  const shas = pushedShas(stdin);
  if (shas.length === 0) {
    ports.log(`${PREFIX} nothing to check: the push sends no branch commits`);
    return 0;
  }
  const head = ports.git(["rev-parse", "HEAD"]);
  const others = shas.filter((sha) => sha !== head);
  if (others.length > 0) {
    ports.log(
      `${PREFIX} skipped: the push sends ${others.map(short).join(", ")}, not the checked-out HEAD; CI checks it`,
    );
    return 0;
  }
  const base = mergeBase(ports);
  if (base === undefined) {
    ports.error(`${PREFIX} failed: no merge base with ${BASE_REF}; run \`git fetch origin\``);
    return 1;
  }
  const changed = ports.git(["diff", "--name-only", "--diff-filter=d", base, "HEAD"]).split("\n").filter(Boolean);
  const steps = prePushPlan(changed, base);
  if (steps.length === 0) {
    ports.log(`${PREFIX} nothing to check: no checked files changed since ${BASE_REF} (${short(base)})`);
    return 0;
  }
  ports.log(`${PREFIX} ${changed.length} files changed since ${BASE_REF} (${short(base)})`);
  const started = ports.now();
  for (const step of steps) {
    ports.log(`${PREFIX} ${step.label}: ${step.command} ${step.args.slice(0, 4).join(" ")}`);
    const result = ports.run(step);
    if (result !== 0) {
      ports.error(`${PREFIX} failed: ${step.label} (${typeof result === "number" ? `exit ${result}` : result})`);
      return 1;
    }
  }
  ports.log(`${PREFIX} passed in ${Math.round((ports.now() - started) / 1000)} s`);
  return 0;
}
