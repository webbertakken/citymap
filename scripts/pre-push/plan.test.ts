import { describe, expect, it } from "vitest";
import { BASE_REF, prePushPlan, pushedShas } from "./plan.ts";

const BASE = "b".repeat(40);
const labels = (files: string[]): string[] => prePushPlan(files, BASE).map((step) => step.label);
const step = (files: string[], label: string) => prePushPlan(files, BASE).find((s) => s.label === label);

describe("BASE_REF", () => {
  it("names the branch CI compares against", () => {
    expect(BASE_REF).toBe("origin/main");
  });
});

describe("pushedShas", () => {
  it("returns the local sha of each pushed branch", () => {
    const newBranch = `refs/heads/a ${"1".repeat(40)} refs/heads/a ${"0".repeat(40)}`;
    const update = `refs/heads/b ${"2".repeat(40)} refs/heads/b ${"3".repeat(40)}`;
    const stdin = `${newBranch}\n${update}\n`;

    expect(pushedShas(stdin)).toEqual(["1".repeat(40), "2".repeat(40)]);
  });

  it("skips branch deletions", () => {
    expect(pushedShas(`(delete) ${"0".repeat(40)} refs/heads/a ${"1".repeat(40)}\n`)).toEqual([]);
    expect(pushedShas(`refs/heads/a ${"0".repeat(40)} refs/heads/a ${"1".repeat(40)}`)).toEqual([]);
  });

  it("skips tags", () => {
    expect(pushedShas(`refs/tags/v1 ${"1".repeat(40)} refs/tags/v1 ${"0".repeat(40)}`)).toEqual([]);
  });

  it("handles empty input and blank lines", () => {
    expect(pushedShas("")).toEqual([]);
    expect(pushedShas("\n  \n")).toEqual([]);
  });

  it("skips a ref line without a sha", () => {
    expect(pushedShas("refs/heads/a")).toEqual([]);
  });
});

describe("prePushPlan", () => {
  it("plans nothing when nothing changed", () => {
    expect(prePushPlan([], BASE)).toEqual([]);
  });

  it("plans nothing for files no check covers", () => {
    expect(prePushPlan(["LICENSE", "docs/img/city.png"], BASE)).toEqual([]);
  });

  it("checks only the format of changed prose", () => {
    expect(labels(["docs/README.md"])).toEqual(["format"]);
  });

  it("runs format, lint, typecheck and tests for changed code", () => {
    expect(labels(["packages/a/src/a.ts"])).toEqual(["format", "lint", "typecheck", "tests with coverage"]);
  });

  it("passes only the formatted files to oxfmt", () => {
    expect(step(["a.md", "b.png", "c.ts"], "format")).toEqual({
      label: "format",
      command: "node_modules/.bin/oxfmt",
      args: ["--check", "--no-error-on-unmatched-pattern", "a.md", "c.ts"],
    });
  });

  it("passes only code to oxlint", () => {
    expect(step(["a.md", "b.tsx", "c.mjs"], "lint")).toEqual({
      label: "lint",
      command: "node_modules/.bin/oxlint",
      args: ["--no-error-on-unmatched-pattern", "b.tsx", "c.mjs"],
    });
  });

  it("builds every project and tests what changed since the base", () => {
    const steps = prePushPlan(["a.ts"], BASE);

    expect(steps).toContainEqual({ label: "typecheck", command: "bun", args: ["run", "typecheck"] });
    expect(steps).toContainEqual({
      label: "tests with coverage",
      command: "node_modules/.bin/vitest",
      args: ["run", "--coverage", "--changed", BASE],
    });
  });

  it.each(["package.json", "packages/a/package.json", "tsconfig.json", "packages/a/tsconfig.build.json", "bun.lock"])(
    "builds and tests when %s changes",
    (file) => {
      expect(labels([file])).toEqual(expect.arrayContaining(["typecheck", "tests with coverage"]));
    },
  );

  it("does not treat a lockfile in a subfolder as the root lockfile", () => {
    expect(labels(["docs/bun.lock"])).toEqual([]);
  });

  it("lints changed workflows with actionlint", () => {
    expect(step([".github/workflows/ci.yml", ".github/dependabot.yml"], "actionlint")).toEqual({
      label: "actionlint",
      command: "actionlint",
      args: [".github/workflows/ci.yml"],
    });
  });

  it("checks shell scripts and Git hooks with shellcheck", () => {
    expect(step(["a.sh", "b.bash", ".husky/pre-push", ".husky/_/h", "c.ts"], "shellcheck")).toEqual({
      label: "shellcheck",
      command: "shellcheck",
      args: ["a.sh", "b.bash", ".husky/pre-push"],
    });
  });

  it("checks the Rust workspace when Rust or the golden towns it replays change", () => {
    expect(step(["rust/crates/cli/src/main.rs"], "rust")).toEqual({
      label: "rust",
      command: "bun",
      args: ["run", "rust:check"],
    });
    expect(labels(["packages/ground-plan/src/town/__golden__/twin.json"])).toContain("rust");
    expect(labels(["src/rust.ts", "trust/a.rs"])).not.toContain("rust");
  });
});
