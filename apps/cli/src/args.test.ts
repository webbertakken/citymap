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
      loops: true,
      voronoi: false,
      history: true,
      separate: ["workspaces", "submodules", "apps"],
      toggles: ["corridor", "tiers"],
      measures: true,
      coverage: [],
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
      "--no-loops",
      "--voronoi",
      "--separate=plugins,apps,plugins",
      "--toggles=tiers,archipelago",
      "--coverage=a.info",
      "--coverage=b.xml",
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
      loops: false,
      voronoi: true,
      separate: ["apps", "plugins"],
      toggles: ["archipelago", "tiers"],
      coverage: ["a.info", "b.xml"],
    });
    expect(parseCommandLine(["repo", "--no-measures"])).toMatchObject({ measures: false, coverage: [] });
    expect(parseCommandLine(["repo", "--toggles="])).toMatchObject({ toggles: [] });
    expect(parseCommandLine(["repo", "--separate="])).toMatchObject({ separate: [] });
    expect(parseCommandLine(["repo", "--no-history"])).toMatchObject({ history: false });
  });

  it("rejects a separation it does not know", () => {
    expect(() => parseCommandLine(["repo", "--separate=apps,split"])).toThrow(
      "--separate takes workspaces, submodules, apps, packages, libs, crates, services, modules, extensions and plugins, not split",
    );
  });

  it("rejects a toggle it does not know", () => {
    expect(() => parseCommandLine(["repo", "--toggles=corridor,gridiron"])).toThrow(
      "--toggles takes corridor, archipelago, quarters and tiers, not gridiron",
    );
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
    [["a", "--no-history", "--lock"], "cli/usage: --lock folds history"],
    [["a", "--no-measures", "--coverage=x"], "cli/usage: --coverage is read for the measures"],
  ])("rejects %j", (argv, message) => {
    expect(() => parseCommandLine(argv)).toThrow(message);
  });
});
