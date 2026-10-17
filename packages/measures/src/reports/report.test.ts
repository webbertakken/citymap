import { describe, expect, it } from "vitest";
import { parseReport, type Report } from "./report";
import { attributesOf, decodeEntities, scanXml } from "./xml";

/** A report's files as plain data: path to [line, hits] pairs. */
const linesOf = (report: Report) =>
  Object.fromEntries(report.files.map((file) => [file.path, [...file.lines].toSorted((a, b) => a[0] - b[0])]));

describe("scanXml", () => {
  it("yields tags, attributes and text, skipping declarations, comments, doctypes and CDATA", () => {
    const tokens = [
      ...scanXml(
        "<?xml version='1.0'?><!DOCTYPE x SYSTEM 'x.dtd'><!-- <a> --><x a=\"1 &gt; 0\" b='&amp;lt;' c=\"a>b\"><![CDATA[<y>]]>t&#65;&#x42;</x ><z/>",
      ),
    ];
    expect(tokens).toEqual([
      {
        kind: "open",
        name: "x",
        attributes: new Map([
          ["a", "1 > 0"],
          ["b", "&lt;"],
          ["c", "a>b"],
        ]),
        empty: false,
      },
      { kind: "text", text: "tAB" },
      { kind: "close", name: "x" },
      { kind: "open", name: "z", attributes: new Map(), empty: true },
    ]);
  });

  it("ends at unterminated markup, and skips attributes without a quoted value", () => {
    expect([...scanXml("<a b c=d e='1'>x<!-- open")]).toEqual([
      { kind: "open", name: "a", attributes: new Map([["e", "1"]]), empty: false },
      { kind: "text", text: "x" },
    ]);
    expect([...scanXml("<a b='open>")]).toEqual([]);
    expect([...scanXml("<a b='1' c='open>")]).toEqual([]);
    expect([...scanXml("<a")]).toEqual([]);
  });

  it("decodes the five named entities and numeric ones, leaving others as written", () => {
    expect(decodeEntities("&lt;&gt;&amp;&quot;&apos;&#33;&#x1F600;&nbsp;&#xD800;&#99999999;&x;&;&#;&#xZ;a&b")).toBe(
      "<>&\"'!\u{1F600}&nbsp;&#xD800;&#99999999;&x;&;&#;&#xZ;a&b",
    );
    expect(decodeEntities("&constructor;&amp &lt;")).toBe("&constructor;&amp <");
  });
});

describe("parseReport", () => {
  it("reads LCOV records, joining repeated files and lines, counting odd hits as 0", () => {
    const lcov = [
      "TN:",
      "SF:/ci/repo/src/a.ts",
      "DA:1,3",
      "DA:2,0",
      "DA:2,4,checksum",
      "DA:3,-1",
      "DA:x,1",
      "end_of_record",
      "SF:src/empty.ts\r",
      "end_of_record",
      "DA:9,9",
      "SF:/ci/repo/src/a.ts",
      "DA:4,1.5",
      "DA:5,99999999999999999999",
      "end_of_record",
    ].join("\n");
    const report = parseReport(lcov, "lcov.info");
    expect(report.format).toBe("lcov");
    expect(linesOf(report)).toEqual({
      "/ci/repo/src/a.ts": [
        [1, 3],
        [2, 4],
        [3, 0],
        [4, 0],
        [5, 0],
      ],
    });
  });

  it("reads Istanbul JSON, by each statement's first line, wrapped or not", () => {
    const json = JSON.stringify({
      "/ci/a.js": {
        path: "/ci/a.js",
        statementMap: { 0: { start: { line: 1 } }, 1: { start: { line: 1 } }, 2: { start: { line: 2 } } },
        s: { 0: 0, 1: 5, 2: -1 },
      },
      "/ci/b.js": { data: { statementMap: { 0: { start: { line: 3 } }, 1: { start: {} } }, s: { 0: 1.5 } } },
      "/ci/c.js": { path: "/ci/c.js", statementMap: {}, s: {} },
      "/ci/d.js": { statementMap: null },
    });
    const report = parseReport(`\uFEFF ${json}`, "coverage-final.json");
    expect(report.format).toBe("istanbul");
    expect(linesOf(report)).toEqual({
      "/ci/a.js": [
        [1, 5],
        [2, 0],
      ],
      "/ci/b.js": [[3, 0]],
    });
  });

  it("rejects JSON that is not an object of files", () => {
    expect(() => parseReport("{", "x.json")).toThrow(
      "coverage/unreadable: x.json is not a coverage report this reads (not JSON)",
    );
    expect(() => parseReport("{}x", "x.json")).toThrow("(not JSON)");
    expect(() => parseReport("[]", "x.json")).toThrow("(not an object of files)");
    expect(parseReport("{}", "x.json").files).toEqual([]);
    expect(() => parseReport('{"a":1}', "x.json")).not.toThrow();
  });

  it("reads Cobertura classes' own lines, not their methods', joining classes of one file", () => {
    const xml = `<?xml version="1.0" ?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="0.5"><sources><source>/ci/repo</source><source> src </source></sources>
<packages><package name="p"><classes>
  <class name="A" filename="pkg/a.py"><methods><method name="m"><lines><line number="9" hits="7"/></lines></method></methods>
    <lines><line number="1" hits="1"/><line number="2" hits="0" branch="true"><conditions><condition/></conditions></line></lines>
  </class>
  <class name="A$Inner" filename="pkg/a.py"><lines><line number="2" hits="3"/></lines></class>
  <class name="Empty" filename="pkg/b.py"/>
  <class name="Nameless"><lines><line number="1" hits="1"/></lines></class>
</classes></package></packages></coverage>`;
    const report = parseReport(xml, "coverage.xml");
    expect(report.format).toBe("cobertura");
    expect(report.roots).toEqual(["/ci/repo", "src"]);
    expect(linesOf(report)).toEqual({
      "pkg/a.py": [
        [1, 1],
        [2, 3],
      ],
    });
  });

  it("reads JaCoCo source files by package, lines with instructions only", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">
<report name="x"><package name="com/x"><class name="com/x/Foo"><method name="a" line="3"/></class>
<sourcefile name="Foo.java"><line nr="3" mi="0" ci="4" mb="0" cb="0"/><line nr="4" mi="2" ci="0"/><line nr="5" mi="0" ci="0"/></sourcefile>
<sourcefile name="Empty.java"/><sourcefile><line nr="1" mi="0" ci="1"/></sourcefile></package>
<package><sourcefile name="Top.java"><line nr="1" mi="1" ci="1"/></sourcefile></package></report>`;
    const report = parseReport(xml, "jacoco.xml");
    expect(report.format).toBe("jacoco");
    expect(linesOf(report)).toEqual({
      "com/x/Foo.java": [
        [3, 4],
        [4, 0],
      ],
      "com/x/": [[1, 1]],
      "Top.java": [[1, 1]],
    });
  });

  it("rejects other XML, and text of no format", () => {
    expect(() => parseReport("<svg/>", "a.xml")).toThrow("an XML document of <svg>");
    expect(() => parseReport("<!-- only -->", "a.xml")).toThrow("an XML document of <nothing>");
    expect(() => parseReport("<>", "a.xml")).toThrow("an XML document of <>");
    expect(() => parseReport("< x", "a.xml")).toThrow("an XML document of <nothing>");
    expect(() => parseReport("<!-- a --> text <x/>", "a.xml")).toThrow("of <nothing>");
    expect(() => parseReport("</x>", "a.xml")).toThrow("of <nothing>");
    expect(() => parseReport("mode: set\n", "coverage.out")).toThrow("coverage/unreadable");
  });
});

describe("scanXml's edges", () => {
  it("yields text after the last tag, and reads no value from an unclosed quote", () => {
    expect([...scanXml("<a/>tail")]).toEqual([
      { kind: "open", name: "a", attributes: new Map(), empty: true },
      { kind: "text", text: "tail" },
    ]);
    expect(attributesOf(" b='open")).toEqual(new Map());
    expect(attributesOf(' b = "1"')).toEqual(new Map([["b", "1"]]));
  });
});
