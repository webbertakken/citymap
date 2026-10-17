import { describe, expect, it } from "vitest";
import { languageOf, nameParts } from "./language";
import { BINARY_PROBE, countText } from "./text";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("languageOf", () => {
  it("knows a language by its extension in any case, or by its file name", () => {
    expect(languageOf("src/a.TS")).toEqual({ name: "TypeScript", syntax: "c" });
    expect(languageOf("Dockerfile")).toEqual({ name: "Dockerfile", syntax: "hash" });
    expect(languageOf("cmake/CMakeLists.txt")).toEqual({ name: "CMake", syntax: "hash" });
    expect(languageOf("data.json")?.syntax).toBe("none");
    expect(languageOf("notes.txt")).toBeNull();
    expect(languageOf(".bashrc")).toBeNull();
    expect(languageOf("LICENSE")).toBeNull();
  });
});

describe("nameParts", () => {
  it("splits a name at its last dot, unless that dot starts it", () => {
    expect(nameParts("a/b/foo.test.ts")).toEqual({ file: "foo.test.ts", stem: "foo.test", ext: "ts" });
    expect(nameParts(".env")).toEqual({ file: ".env", stem: ".env", ext: "" });
    expect(nameParts("Makefile")).toEqual({ file: "Makefile", stem: "Makefile", ext: "" });
  });
});

describe("countText", () => {
  it("counts lines, the last one with or without its newline", () => {
    expect(countText(bytes(""), "a.txt")).toEqual({ bytes: 0, lines: 0 });
    expect(countText(bytes("a\nb"), "a.txt")).toEqual({ bytes: 3, lines: 2 });
    expect(countText(bytes("a\nb\n"), "a.txt")).toEqual({ bytes: 4, lines: 2 });
  });

  it("gives a binary file only its bytes, judged by its first 8,000 bytes", () => {
    expect(countText(new Uint8Array([1, 0, 10]), "a.ts")).toEqual({ bytes: 3 });
    const late = new Uint8Array(BINARY_PROBE + 1).fill(0x61);
    late[BINARY_PROBE] = 0;
    expect(countText(late, "a.txt").lines).toBe(1);
  });

  it("counts line comments, blocks and their marks in C-like code", () => {
    const code = [
      "// TODO: one",
      "const a = 1; // FIXME not a comment line",
      "  /* a block",
      "   XXX and TODO_LIST and MYTODO */",
      "// 1TODO aTODO zTODO TODO9 :TODO: [TODO] {TODO} @TODO`",
      "/* one line */ code();",
      "x = 2; /* opens",
      "closes */",
      "\t//\tFIXME-ish\r",
      "return;  ",
    ].join("\n");
    expect(countText(bytes(code), "a.ts")).toEqual({ bytes: code.length, lines: 10, comments: 7, todos: 7 });
  });

  it("reads each syntax's markers, and none where a language has none", () => {
    expect(countText(bytes("# a\nb # c\n"), "a.py")).toMatchObject({ comments: 1 });
    expect(countText(bytes("# a\n// b\n/* c */\n"), "a.php")).toMatchObject({ comments: 3 });
    expect(countText(bytes("-- a\n"), "a.sql")).toMatchObject({ comments: 1 });
    expect(countText(bytes("<!-- a\nb -->\nc\n"), "a.html")).toMatchObject({ comments: 2 });
    expect(countText(bytes("; a\n"), "a.ini")).toMatchObject({ comments: 1 });
    expect(countText(bytes("% a\n"), "a.tex")).toMatchObject({ comments: 1 });
    expect(countText(bytes("/* a */\n// b\n"), "a.css")).toMatchObject({ comments: 1 });
    expect(countText(bytes('{"a": "// b"}\n'), "a.json")).toEqual({ bytes: 14, lines: 1, comments: 0, todos: 0 });
  });

  it("keeps a block open to the end of a file that never closes it", () => {
    expect(countText(bytes("/*\na\n\nb"), "a.c")).toMatchObject({ lines: 4, comments: 4 });
  });
});
