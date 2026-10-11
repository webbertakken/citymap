import { describe, expect, it } from "vitest";
import { USAGE, parseCommandLine } from "./args";

describe("parseCommandLine", () => {
  it("defaults to a plan-view city of the repository at HEAD", () => {
    expect(parseCommandLine(["./repo"])).toEqual({
      kind: "lay",
      repo: "./repo",
      to: "HEAD",
      out: null,
      svg: null,
      theme: "paper-atlas",
      camera: "plan",
      lock: false,
      verbose: false,
      tests: false,
      densityPct: 50,
      jog: "top-level",
      warp: true,
      split: ["apps"],
    });
  });

  it("reads every option", () => {
    const parsed = parseCommandLine([
      "repo",
      "--to=main",
      "--out=city.json",
      "--svg",
      "map.svg",
      "--theme=dracula",
      "--camera=dimetric",
      "--lock",
      "--verbose",
      "--tests",
      "--density=70",
      "--jog=all",
      "--no-warp",
      "--split=apps,packages",
    ]);
    expect(parsed).toMatchObject({
      to: "main",
      out: "city.json",
      svg: "map.svg",
      theme: "dracula",
      camera: "dimetric",
      lock: true,
      verbose: true,
      tests: true,
      densityPct: 70,
      jog: "all",
      warp: false,
      split: ["apps", "packages"],
    });
    expect(parseCommandLine(["repo", "--split="])).toMatchObject({ split: [] });
  });

  it("answers help with the usage", () => {
    expect(parseCommandLine(["--help"])).toEqual({ kind: "help" });
    expect(USAGE).toContain("citymap <repository>");
  });

  it.each([
    [[], "cli/usage: name one repository"],
    [["a", "b"], "cli/usage: name one repository"],
    [["a", "--theme=neon"], "cli/usage: --theme"],
    [["a", "--camera=fish"], "cli/usage: --camera"],
    [["a", "--density=90"], "cli/usage: --density"],
    [["a", "--density=x"], "cli/usage: --density"],
    [["a", "--jog=some"], "cli/usage: --jog"],
    [["a", "--bogus"], "cli/usage:"],
  ])("rejects %j", (argv, message) => {
    expect(() => parseCommandLine(argv)).toThrow(message);
  });
});
