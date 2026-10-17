import { describe, expect, it } from "vitest";
import { matchReports, reportCandidates, USUAL_REPORTS } from "./match";
import type { Report, ReportFile } from "./report";

const file = (path: string, ...hits: number[]): ReportFile => ({
  path,
  lines: new Map(hits.map((h, i) => [i + 1, h])),
});
const lcov = (...files: ReportFile[]): Report => ({ format: "lcov", roots: [], files });

const paths = new Set([
  "src/a.ts",
  "packages/x/src/index.ts",
  "packages/y/src/index.ts",
  "src/main/java/com/x/Foo.java",
  "pkg/b.py",
  "a.ts",
]);

describe("reportCandidates", () => {
  it("looks at the root and in every folder holding a manifest", () => {
    const candidates = reportCandidates([
      "package.json",
      "packages/x/package.json",
      "packages/x/src/a.ts",
      "x/a.csproj",
    ]);
    expect(candidates).toHaveLength(3 * USUAL_REPORTS.length);
    expect(candidates.slice(0, 2)).toEqual(["coverage/lcov.info", "lcov.info"]);
    expect(candidates).toContain("packages/x/coverage/lcov.info");
    expect(candidates).toContain("x/build/reports/jacoco/test/jacocoTestReport.xml");
  });
});

describe("matchReports", () => {
  it("joins relative paths to the report's folders, deepest first", () => {
    const { files, reports } = matchReports(
      [{ report: lcov(file("src/index.ts", 1, 0)), at: "packages/x/coverage/lcov.info" }],
      paths,
    );
    expect([...files]).toEqual([["packages/x/src/index.ts", { covered: 1, executable: 2 }]]);
    expect(reports).toEqual([{ files: 1, matched: 1 }]);
  });

  it("matches an absolute path by its longest ending in the repository", () => {
    const { files } = matchReports(
      [
        {
          report: lcov(
            file("/home/ci/work/repo/src/a.ts", 1),
            file("C:\\ci\\repo\\pkg\\.\\x\\..\\b.py", 0),
            file("file:///ci/a.ts", 2),
          ),
          at: null,
        },
      ],
      paths,
    );
    expect(Object.fromEntries(files)).toEqual({
      "src/a.ts": { covered: 1, executable: 1 },
      "pkg/b.py": { covered: 0, executable: 1 },
      "a.ts": { covered: 1, executable: 1 },
    });
  });

  it("matches a path that ends exactly one repository path, or one under the report's folder", () => {
    const jacoco: Report = { format: "jacoco", roots: [], files: [file("com/x/Foo.java", 1), file("x/Foo.java", 1)] };
    expect([...matchReports([{ report: jacoco, at: "target/site/jacoco/jacoco.xml" }], paths).files.keys()]).toEqual([
      "src/main/java/com/x/Foo.java",
    ]);
    const twice = lcov(file("index.ts", 1));
    expect(matchReports([{ report: twice, at: null }], paths).files.size).toBe(0);
    expect(matchReports([{ report: twice, at: "lcov.info" }], paths).files.size).toBe(0);
    expect(matchReports([{ report: twice, at: "zzz/lcov.info" }], paths).files.size).toBe(0);
    expect([...matchReports([{ report: twice, at: "packages/y/lcov.info" }], paths).files.keys()]).toEqual([
      "packages/y/src/index.ts",
    ]);
    const deeper = new Set(["a/b/x/index.ts", "a/b/y/index.ts", "a/c/index.ts"]);
    expect(matchReports([{ report: twice, at: "a/lcov.info" }], deeper).files.size).toBe(0);
  });

  it("tries Cobertura's roots first, absolute or relative", () => {
    const cobertura: Report = {
      format: "cobertura",
      roots: ["/ci/repo/pkg", "."],
      files: [file("b.py", 1), file("a.ts", 0)],
    };
    expect(Object.fromEntries(matchReports([{ report: cobertura, at: "coverage.xml" }], paths).files)).toEqual({
      "pkg/b.py": { covered: 1, executable: 1 },
      "a.ts": { covered: 0, executable: 1 },
    });
  });

  it("leaves unmatched paths out, and joins lines across reports", () => {
    const { files, reports } = matchReports(
      [
        { report: lcov(file("src/a.ts", 0, 1, 0), file("nowhere.ts", 1), file("", 1)), at: null },
        { report: lcov(file("/x/src/a.ts", 2, 0)), at: null },
      ],
      paths,
    );
    expect(Object.fromEntries(files)).toEqual({ "src/a.ts": { covered: 2, executable: 3 } });
    expect(reports).toEqual([
      { files: 3, matched: 1 },
      { files: 1, matched: 1 },
    ]);
  });
});
