import { describe, expect, it } from "vitest";
import {
  CHECKOUT_AUTHORS,
  UPLOAD_PACK,
  authorsOf,
  cloneArgs,
  LONG,
  PARITY,
  buildArgs,
  checkoutMailmap,
  cliArgs,
  sameVerdict,
  coverageReports,
  resumePoint,
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
      modes: ["state", "fold", "resume", "checkout", "partial", "coverage"],
      features: [],
      toggles: null,
      separate: null,
    });
    expect(parseSettings(["--long"]).repos).toEqual([...PARITY, ...LONG]);
  });

  it("takes the repositories and modes it is given", () => {
    expect(parseSettings(["--repos=redux,react", "--modes=fold"])).toEqual({
      repos: ["redux", "react"],
      modes: ["fold"],
      features: [],
      toggles: null,
      separate: null,
    });
    expect(parseSettings(["--features=mimalloc"]).features).toEqual(["mimalloc"]);
    expect(parseSettings(["--toggles=quarters"]).toggles).toBe("quarters");
    expect(parseSettings(["--toggles="]).toggles).toBe("");
    expect(parseSettings(["--separate=plugins,apps"]).separate).toBe("plugins,apps");
    expect(parseSettings(["--separate="]).separate).toBe("");
  });

  it("rejects a mode it does not know", () => {
    expect(() => parseSettings(["--modes=state,quick"])).toThrow(
      "parity/usage: --modes takes state, fold, resume, checkout, partial and coverage, not quick",
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
    expect(cliArgs("/c/redux", "/o", "checkout").at(-1)).toBe("--lock");
    expect(cliArgs("/c/redux", "/o", "partial").at(-1)).toBe("--lock");
    expect(cliArgs("/c/redux", "/o", "fold", { toggles: "corridor", separate: null }).at(-1)).toBe(
      "--toggles=corridor",
    );
    expect(cliArgs("/c/redux", "/o", "fold", { toggles: "", separate: "plugins" }).slice(-2)).toEqual([
      "--toggles=",
      "--separate=plugins",
    ]);
  });
});

describe("saveArgs", () => {
  it("folds to the save point and writes its lock, and nothing else", () => {
    expect(saveArgs("/c/redux", "abc")).toEqual(["/c/redux", "--to=abc", "--lock"]);
    expect(saveArgs("/c/redux", "abc", { toggles: "", separate: null }).at(-1)).toBe("--toggles=");
    expect(saveArgs("/c/redux", "abc", { toggles: null, separate: "" }).at(-1)).toBe("--separate=");
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

describe("sameVerdict", () => {
  it("names a run that matches the uninterrupted fold, and the sides and files of one that does not", () => {
    expect(sameVerdict("resume", "redux", [], "saved=2130")).toBe("parity/resumed repo=redux saved=2130 same");
    expect(sameVerdict("resume", "redux", ["ts:citymap.lock.json", "rs:citymap.lock.json"], "saved=2130")).toBe(
      "parity/resume-differs repo=redux saved=2130 files=ts:citymap.lock.json,rs:citymap.lock.json",
    );
    expect(sameVerdict("checkout", "react", [])).toBe("parity/checkout repo=react same");
    expect(sameVerdict("checkout", "react", ["rs:city.json"])).toBe(
      "parity/checkout-differs repo=react files=rs:city.json",
    );
    expect(sameVerdict("partial", "react", [])).toBe("parity/partial repo=react same");
    expect(sameVerdict("partial", "react", ["ts:authors"])).toBe("parity/partial-differs repo=react files=ts:authors");
  });
});

describe("checkoutMailmap", () => {
  it("maps every author it is given to one, so a CLI that read the working tree would count one person", () => {
    expect(checkoutMailmap(["ann@x.org", "Bob@x.org", "ann@x.org", "", "a>b@x", "c\nd@x"])).toBe(
      "Parity <parity@citymap.invalid> <ann@x.org>\nParity <parity@citymap.invalid> <Bob@x.org>\n",
    );
    const many = Array.from({ length: CHECKOUT_AUTHORS + 50 }, (_, i) => `p${i}@x`);
    expect(checkoutMailmap(many).split("\n").length - 1).toBe(CHECKOUT_AUTHORS);
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

describe("coverageReports", () => {
  it("writes the four formats over a quarter of the sources each, by their usual paths", () => {
    const sources = Array.from({ length: 7 }, (_, i) => `src/a&<"/f${i}.ts`);
    const paths = ["README.md", "top.ts", ...sources.slice(0, 3), "pkg/x.py", ...sources.slice(3)];
    const reports = coverageReports(paths, "demo");
    expect(Object.keys(reports)).toEqual([
      "coverage/lcov.info",
      "coverage/coverage-final.json",
      "coverage.xml",
      "target/site/jacoco/jacoco.xml",
    ]);
    expect(reports["coverage/lcov.info"]).toContain(
      'SF:/home/runner/work/demo/demo/src/a&<"/f0.ts\nDA:1,0\nend_of_record',
    );
    expect(reports["coverage/lcov.info"]).toContain("SF:/home/runner/work/demo/demo/nowhere/at/all.ts");
    expect(JSON.parse(reports["coverage/coverage-final.json"]!)).toMatchObject({
      '/home/runner/work/demo/demo/src/a&<"/f1.ts': { s: { 0: 0 } },
    });
    expect(reports["coverage.xml"]).toContain('filename="src/a&amp;&lt;&quot;/f2.ts"');
    expect(reports["target/site/jacoco/jacoco.xml"]).toContain(
      '<package name="a&amp;&lt;&quot;"><sourcefile name="f6.ts">',
    );
    expect(reports["target/site/jacoco/jacoco.xml"]).toContain('<package name=""><sourcefile name="x.py">');
    const many = coverageReports(
      Array.from({ length: 2000 }, (_, i) => `s/f${i}.go`),
      "big",
    );
    expect(many["coverage/lcov.info"]!.split("SF:").length - 1).toBe(101);
  });
});

describe("cloneArgs", () => {
  it("shares a clone without a checkout, checks one out, or clones without blobs from a filtering upload-pack", () => {
    expect(cloneArgs("fold", "/cache/redux", "/s/redux")).toEqual([
      "git",
      "clone",
      "--shared",
      "--no-checkout",
      "--quiet",
      "/cache/redux",
      "/s/redux",
    ]);
    expect(cloneArgs("checkout", "/cache/redux", "/s/redux")).toEqual([
      "git",
      "clone",
      "--shared",
      "--quiet",
      "/cache/redux",
      "/s/redux",
    ]);
    expect(cloneArgs("partial", "/cache/redux", "/s/redux")).toEqual([
      "git",
      "clone",
      "--no-checkout",
      "--filter=blob:none",
      "--quiet",
      `--upload-pack=${UPLOAD_PACK}`,
      "file:///cache/redux",
      "/s/redux",
    ]);
    expect(UPLOAD_PACK).toBe("git -c uploadpack.allowFilter=true -c uploadpack.allowAnySHA1InWant=true upload-pack");
  });
});

/** A small city file's text, with or without its authors, its one file of `bytes`. */
const cityWith = (authors: boolean, bytes: number) =>
  JSON.stringify({
    towns: [],
    measures: {
      available: authors ? ["size", "authors"] : ["size"],
      lots: { t: { a: { files: [{ path: "x", bytes, ...(authors ? { authors: 2 } : {}) }], authors: 2 } } },
    },
  });

describe("authorsOf", () => {
  it("keeps a city's people only: whether it has authors, and every lot's and file's count", () => {
    const city = cityWith;
    expect(authorsOf(city(true, 1))).toBe(authorsOf(city(true, 9)));
    expect(authorsOf(city(true, 1))).toBe(JSON.stringify({ authors: true, lots: [["t/a", 2, [2]]] }));
    expect(authorsOf(city(false, 1))).not.toBe(authorsOf(city(true, 1)));
    expect(authorsOf("{}")).toBe(JSON.stringify({ authors: false, lots: [] }));
    expect(authorsOf(JSON.stringify({ measures: { lots: { t: { a: {} } } } }))).toBe(
      JSON.stringify({ authors: false, lots: [["t/a", null, []]] }),
    );
  });
});
