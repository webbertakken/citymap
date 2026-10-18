import { describe, expect, it } from "vitest";
import { namedBy, testNames } from "./by-name";

/** Whether each source is named by a test, given every path of the repository. */
const verdicts = (paths: readonly string[], sources: readonly string[]) => {
  const names = testNames(paths);
  return Object.fromEntries(sources.map((source) => [source, namedBy(names, source)]));
};

describe("namedBy", () => {
  it("finds tests beside a file, in __tests__, and by each language's markers", () => {
    const paths = [
      "src/a.test.ts",
      "src/a.spec.ts",
      "src/b.spec.tsx",
      "src/__tests__/c.ts",
      "lib/d-test.js",
      "pkg/test_e.py",
      "pkg/f_test.py",
      "cmd/g_test.go",
      "src/main/java/x/HTest.java",
      "src/test/java/x/TestI.java",
      "tests/j.rs",
      "spec/k_spec.rb",
      "Tests/LTests.cs",
      "tests/MTest.php",
      "src/n_unittest.cc",
      "Tests/OTests.swift",
      "test/p_test.dart",
      "test/q_test.exs",
    ];
    const sources = [
      "src/a.ts",
      "src/b.tsx",
      "src/c.ts",
      "lib/d.js",
      "pkg/e.py",
      "pkg/f.py",
      "cmd/g.go",
      "src/main/java/x/H.java",
      "src/main/java/x/I.java",
      "src/j.rs",
      "lib/k.rb",
      "L.cs",
      "src/M.php",
      "src/n.cc",
      "Sources/O.swift",
      "lib/p.dart",
      "lib/q.ex",
    ];
    expect(Object.values(verdicts(paths, sources))).toEqual(sources.map(() => true));
  });

  it("finds mirrored and flat test trees, the folders ending one another", () => {
    const paths = ["tests/components/x/test_sensor.py", "tests/test_util.py", "test/utils/fmt.spec.ts"];
    expect(
      verdicts(paths, [
        "homeassistant/components/x/sensor.py",
        "homeassistant/components/y/sensor.py",
        "any/where/util.py",
        "src/utils/fmt.ts",
        "src/other/fmt.ts",
      ]),
    ).toEqual({
      "homeassistant/components/x/sensor.py": true,
      "homeassistant/components/y/sensor.py": false,
      "any/where/util.py": true,
      "src/utils/fmt.ts": true,
      "src/other/fmt.ts": false,
    });
    // A test folder deeper than the source's also ends it the other way round.
    expect(verdicts(["tests/deep/x/a_test.go"], ["x/a.go"])).toEqual({ "x/a.go": true });
  });

  it("keeps markers to their own family, and prefixes to test files", () => {
    const paths = ["src/a.test.py", "src/TestUtils.java", "src/b_test.go", "test/Test.java", "src/c.test.ts"];
    expect(verdicts(paths, ["src/a.py", "src/Utils.java", "src/b.ts", "src/.java", "src/c.js"])).toEqual({
      "src/a.py": false,
      "src/Utils.java": false,
      "src/b.ts": false,
      "src/.java": undefined,
      "src/c.js": true,
    });
  });

  it("ignores fixtures, vendored and generated files as tests", () => {
    const paths = ["tests/fixtures/a.ts", "vendor/b.test.ts", "dist/c.test.ts"];
    expect(verdicts(paths, ["src/a.ts", "src/b.ts", "src/c.ts"])).toEqual({
      "src/a.ts": false,
      "src/b.ts": false,
      "src/c.ts": false,
    });
  });

  it("does not judge files that are not source, or of no known family", () => {
    expect(verdicts(["README.test.md"], ["README.md", "config.json", "src/a.test.ts", "Makefile"])).toEqual({
      "README.md": undefined,
      "config.json": undefined,
      "src/a.test.ts": undefined,
      Makefile: undefined,
    });
  });
});
