import { describe, expect, it } from "vitest";
import type { Step } from "./plan.ts";
import { prePush, type Ports } from "./pre-push.ts";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const OTHER = "c".repeat(40);
const ZERO = "0".repeat(40);
const pushOf = (sha: string): string => `refs/heads/x ${sha} refs/heads/x ${ZERO}\n`;

interface World {
  readonly changed?: string;
  readonly mergeBase?: string | Error;
  readonly results?: readonly (number | string)[];
}

function fakePorts({ changed = "", mergeBase = BASE, results = [] }: World) {
  const logs: string[] = [];
  const errors: string[] = [];
  const ran: Step[] = [];
  const clock = [1_000, 3_600];
  const ports: Ports = {
    git: (args) => {
      if (args[0] === "rev-parse") return HEAD;
      if (args[0] === "merge-base") {
        if (mergeBase instanceof Error) throw mergeBase;
        return mergeBase;
      }
      expect(args).toEqual(["diff", "--name-only", "--diff-filter=d", BASE, "HEAD"]);
      return changed;
    },
    run: (step) => {
      ran.push(step);
      return results[ran.length - 1] ?? 0;
    },
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    now: () => clock.shift() ?? 0,
  };
  return { ports, logs, errors, ran };
}

describe("prePush", () => {
  it("passes a push that sends no branch commits", () => {
    const { ports, logs, ran } = fakePorts({});

    expect(prePush("", ports)).toBe(0);
    expect(logs).toEqual(["[pre-push] nothing to check: the push sends no branch commits"]);
    expect(ran).toEqual([]);
  });

  it("leaves a push of another commit to CI", () => {
    const { ports, logs, ran } = fakePorts({});

    expect(prePush(pushOf(HEAD) + pushOf(OTHER), ports)).toBe(0);
    expect(logs).toEqual(["[pre-push] skipped: the push sends ccccccccc, not the checked-out HEAD; CI checks it"]);
    expect(ran).toEqual([]);
  });

  it("fails without a merge base", () => {
    const { ports, errors } = fakePorts({ mergeBase: new Error("no ref") });

    expect(prePush(pushOf(HEAD), ports)).toBe(1);
    expect(errors).toEqual(["[pre-push] failed: no merge base with origin/main; run `git fetch origin`"]);
  });

  it("passes when no checked file changed", () => {
    const { ports, logs, ran } = fakePorts({ changed: "LICENSE\n" });

    expect(prePush(pushOf(HEAD), ports)).toBe(0);
    expect(logs).toEqual(["[pre-push] nothing to check: no checked files changed since origin/main (bbbbbbbbb)"]);
    expect(ran).toEqual([]);
  });

  it("runs every planned step and reports the time taken", () => {
    const { ports, logs, ran, errors } = fakePorts({ changed: "a.ts\nb.md\n" });

    expect(prePush(pushOf(HEAD), ports)).toBe(0);
    expect(ran.map((s) => s.label)).toEqual(["format", "lint", "typecheck", "tests with coverage"]);
    expect(logs[0]).toBe("[pre-push] 2 files changed since origin/main (bbbbbbbbb)");
    expect(logs[1]).toBe(
      "[pre-push] format: node_modules/.bin/oxfmt --check --no-error-on-unmatched-pattern a.ts b.md",
    );
    expect(logs.at(-1)).toBe("[pre-push] passed in 3 s");
    expect(errors).toEqual([]);
  });

  it("stops at the first failing step with its exit code", () => {
    const { ports, ran, errors } = fakePorts({ changed: "a.ts", results: [0, 2] });

    expect(prePush(pushOf(HEAD), ports)).toBe(1);
    expect(ran.map((s) => s.label)).toEqual(["format", "lint"]);
    expect(errors).toEqual(["[pre-push] failed: lint (exit 2)"]);
  });

  it("reports a step that could not run", () => {
    const { ports, errors } = fakePorts({
      changed: ".github/workflows/ci.yml",
      results: [0, "spawn actionlint ENOENT"],
    });

    expect(prePush(pushOf(HEAD), ports)).toBe(1);
    expect(errors).toEqual(["[pre-push] failed: actionlint (spawn actionlint ENOENT)"]);
  });
});
