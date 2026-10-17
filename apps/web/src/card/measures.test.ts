import type { Building, Measures } from "@citymap/measures";
import { describe, expect, it } from "vitest";
import { agoText, bytesText, filesRow, measureRows } from "./measures";

const building = (over: Partial<Building> = {}): Building => ({
  files: ["src/a.ts"],
  size: 1240,
  bytes: 30_500,
  lines: 1240,
  tested: 0.62,
  changed: 1_000_000 - 3 * 86_400,
  commits: 142,
  authors: 5,
  comments: 120,
  todos: 2,
  ...over,
});
const cli: Measures = {
  version: 1,
  source: "cli",
  size: "lines",
  tested: "coverage",
  available: ["size", "tested", "kind", "recency", "churn", "authors", "comments"],
  lots: {},
};
const github: Measures = {
  ...cli,
  source: "github",
  size: "bytes",
  tested: "name",
  available: ["size", "tested", "kind"],
};
const NOW = 1_000_000_000;

describe("bytesText and agoText", () => {
  it("says sizes in bytes, kB, MB and GB", () => {
    expect(bytesText(1)).toBe("1 byte");
    expect(bytesText(830)).toBe("830 bytes");
    expect(bytesText(12_400)).toBe("12.4 kB");
    expect(bytesText(3_100_000)).toBe("3.1 MB");
    expect(bytesText(5_000_000_000_000)).toBe("5,000 GB");
  });

  it("says how long ago, in the largest whole unit", () => {
    expect(agoText(NOW / 1000 - 3 * 86_400, NOW)).toBe("3 days ago");
    expect(agoText(NOW / 1000 - 400 * 86_400, NOW)).toBe("last year");
    expect(agoText(NOW / 1000 - 30, NOW)).toBe("30 seconds ago");
  });
});

describe("measureRows", () => {
  it("says every measure of a CLI city with where it came from", () => {
    const rows = measureRows(building(), cli, NOW);
    expect(rows.map((r) => [r.label, r.value, r.note])).toEqual([
      ["Size", "1,240 lines", "30.5 kB"],
      ["Tested", "62 %", "Coverage report"],
      ["Changed", "3 days ago", expect.stringMatching(/1970/)],
      ["Commits", "142", undefined],
      ["Authors", "5", undefined],
      ["Comments", "120 lines", "2 TODOs"],
    ]);
  });

  it("says what is not known and why, and names the files of a lot of several", () => {
    const unknown = building({
      files: ["a/x.json", "a/y.json"],
      size: null,
      bytes: null,
      lines: null,
      tested: null,
      changed: null,
      commits: null,
      authors: null,
      comments: null,
    });
    expect(measureRows(unknown, cli, NOW).map((r) => [r.label, r.value, r.note])).toEqual([
      ["Size", "Not known", "Its contents were not read here"],
      ["Tested", "Not known", "The coverage report does not cover it"],
      ["Changed", "Not known", "No commit read changed it"],
      ["Commits", "Not known", "No commit read changed it"],
      ["Authors", "Not known", "No commit read changed it"],
      ["Comments", "Not known", "Its language's comments are not known"],
      ["2 files", "x.json, y.json", undefined],
    ]);
  });

  it("says a live city's sizes in bytes, tests by name, and what it cannot know", () => {
    const rows = measureRows(building({ lines: null, tested: 1 }), github, NOW);
    expect(rows.map((r) => [r.label, r.value, r.note])).toEqual([
      ["Size", "30.5 kB", undefined],
      ["Tested", "A test names it", "By name"],
      ["Changed, commits, authors", "Not known", "Needs the CLI's history"],
      ["Comments", "Not known", "Needs the files' contents"],
    ]);
    expect(measureRows(building({ tested: 0, bytes: 9 }), github, NOW)[1]!.value).toBe("No test names it");
    expect(measureRows(building({ tested: null }), github, NOW)[1]!.note).toBe("Only source files are judged by name");
    expect(measureRows(building({ todos: null }), cli, NOW).at(-1)!.note).toBe("0 TODOs");
    expect(measureRows(building({ bytes: null }), cli, NOW)[0]!.note).toBeUndefined();
  });

  it("adds nothing without measures or a building", () => {
    expect(measureRows(building(), null, NOW)).toEqual([]);
    expect(measureRows(undefined, cli, NOW)).toEqual([]);
  });
});

describe("filesRow", () => {
  it("lists seven names, then how many more", () => {
    const files = Array.from({ length: 9 }, (_, i) => `f/${i}.json`);
    expect(filesRow(files)).toEqual({
      label: "9 files",
      value: "0.json, 1.json, 2.json, 3.json, 4.json, 5.json, 6.json",
      note: "and 2 more",
    });
  });
});
