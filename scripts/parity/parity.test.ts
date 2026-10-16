import { describe, expect, it } from "vitest";
import {
  LONG,
  PARITY,
  buildArgs,
  cliArgs,
  resumePoint,
  resumeVerdict,
  saveArgs,
  parseSettings,
  table,
  verdict,
  withoutTimings,
  type Result,
} from "./parity.ts";

describe("parseSettings", () => {
  it("covers the parity repositories in both modes by default, and next.js with --long", () => {
    expect(parseSettings([])).toEqual({
      repos: [...PARITY],
      modes: ["state", "fold", "resume"],
      features: [],
      toggles: null,
    });
    expect(parseSettings(["--long"]).repos).toEqual([...PARITY, ...LONG]);
  });

  it("takes the repositories and modes it is given", () => {
    expect(parseSettings(["--repos=redux,react", "--modes=fold"])).toEqual({
      repos: ["redux", "react"],
      modes: ["fold"],
      features: [],
      toggles: null,
    });
    expect(parseSettings(["--features=mimalloc"]).features).toEqual(["mimalloc"]);
    expect(parseSettings(["--toggles=quarters"]).toggles).toBe("quarters");
    expect(parseSettings(["--toggles="]).toggles).toBe("");
  });

  it("rejects a mode it does not know", () => {
    expect(() => parseSettings(["--modes=state,quick"])).toThrow(
      "parity/usage: --modes takes state, fold and resume, not quick",
    );
  });
});

describe("buildArgs", () => {
  it("builds the release CLI, with the features asked for", () => {
    expect(buildArgs([])).toEqual(["cargo", "build", "--release", "--quiet", "-p", "citymap-cli"]);
    expect(buildArgs(["mimalloc"]).slice(-2)).toEqual(["--features", "mimalloc"]);
  });
});

describe("cliArgs", () => {
  it("writes the outputs into the run's folder, with the mode's own flag", () => {
    expect(cliArgs("/c/redux", "/o", "state")).toEqual([
      "/c/redux",
      "--out=/o/city.json",
      "--svg=/o/city.svg",
      "--no-history",
    ]);
    expect(cliArgs("/c/redux", "/o", "fold").at(-1)).toBe("--lock");
    expect(cliArgs("/c/redux", "/o", "resume").at(-1)).toBe("--lock");
    expect(cliArgs("/c/redux", "/o", "fold", "corridor").at(-1)).toBe("--toggles=corridor");
  });
});

describe("saveArgs", () => {
  it("folds to the save point and writes its lock, and nothing else", () => {
    expect(saveArgs("/c/redux", "abc")).toEqual(["/c/redux", "--to=abc", "--lock"]);
    expect(saveArgs("/c/redux", "abc", "").at(-1)).toBe("--toggles=");
  });
});

describe("resumePoint", () => {
  it("halves a history that folds every commit", () => {
    expect(resumePoint(239)).toBe(119);
    expect(resumePoint(1999)).toBe(999);
    expect(resumePoint(1)).toBe(0);
  });

  it("saves where a fold to that commit lays the same windows as the whole history", () => {
    // 14,967 commits: windows up to 13,000; a fold of 14,000 to 14,967 commits lays the same ones.
    expect(resumePoint(14_967)).toBe(14_482);
    expect(resumePoint(2262)).toBe(2130);
    // A count on a boundary: only the last commit folds the same windows, so the resume lays it again.
    expect(resumePoint(14_000)).toBe(13_999);
  });
});

describe("resumeVerdict", () => {
  it("names a resumed fold that matches the uninterrupted one, and the sides and files of one that does not", () => {
    expect(resumeVerdict("redux", 2130, [])).toBe("parity/resumed repo=redux saved=2130 same");
    expect(resumeVerdict("redux", 2130, ["ts:citymap.lock.json", "rs:citymap.lock.json"])).toBe(
      "parity/resume-differs repo=redux saved=2130 files=ts:citymap.lock.json,rs:citymap.lock.json",
    );
  });
});

describe("withoutTimings", () => {
  it("drops only the summary's milliseconds", () => {
    expect(
      withoutTimings("lock/saved commit=a index=1\nfold/done repository=r commits=2 lots=3 overflow=0 ms=125\n"),
    ).toBe("lock/saved commit=a index=1\nfold/done repository=r commits=2 lots=3 overflow=0 ms=…\n");
  });
});

const result = (differs: string[], tsMs = 12_345, rsMs = 1234): Result => ({
  repo: "redux",
  mode: "fold",
  tsMs,
  rsMs,
  differs,
});

describe("verdict", () => {
  it("names a run that matches, and the files of one that does not", () => {
    expect(verdict(result([]))).toBe("parity/same repo=redux mode=fold ts-ms=12345 rs-ms=1234");
    expect(verdict(result(["city.svg", "log.txt"]))).toBe(
      "parity/differs repo=redux mode=fold files=city.svg,log.txt ts-ms=12345 rs-ms=1234",
    );
  });
});

describe("table", () => {
  it("sets the timings side by side with the speed-up", () => {
    expect(table([result([]), result(["city.json"], 900, 0)])).toBe(
      [
        "| Repository | Mode | Output | TypeScript | Rust | Speed-up |",
        "| --- | --- | --- | --- | --- | --- |",
        "| redux | fold | identical | 12 s | 1.23 s | 10.0× |",
        "| redux | fold | differs: city.json | 0.90 s | 0.00 s | – |",
      ].join("\n"),
    );
  });
});
