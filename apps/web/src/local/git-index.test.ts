import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readIndex } from "./git-index";

const DIR = join(import.meta.dirname, "testing/indexes");
const bytes = (name: string) => new Uint8Array(readFileSync(join(DIR, `${name}.index`)));

interface Expected {
  readonly version: number;
  readonly refused?: string;
  readonly entries?: readonly { readonly mode: string; readonly stage: number; readonly path: string }[];
}
const expected = (name: string): Expected => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length));
const idBytes = (name: string) => (name === "sha256" ? 32 : 20);

const zeros = (length: number) => Array.from({ length }, () => 0);
const ascii = (text: string) => Array.from(new TextEncoder().encode(text));
/** An index's header: its signature, version and entry count (under 256). */
const header = (version: number, count: number) => [...ascii("DIRC"), 0, 0, 0, version, 0, 0, 0, count];

/** A copy of an index with its bytes changed. */
const patched = (source: Uint8Array, at: number, ...values: number[]) => {
  const copy = source.slice();
  copy.set(values, at);
  return copy;
};

describe("readIndex", () => {
  it("has a fixture for every version and extension the reader meets", () => {
    expect(FIXTURES.toSorted()).toEqual(
      ["busy", "conflict", "empty", "resolved", "sha256", "skip", "sparse", "split", "v2", "v3", "v4"].toSorted(),
    );
  });

  it.each(FIXTURES.filter((name) => !expected(name).refused))("reads %s as git lists it", (name) => {
    const want = expected(name);
    const entries = want.entries!;
    const tracked = [...new Set(entries.filter((e) => e.mode !== "160000").map((e) => e.path))];
    const submodules = new Set(entries.filter((e) => e.mode === "160000").map((e) => e.path)).size;
    const listing = readIndex(bytes(name), idBytes(name));
    expect(listing).toEqual({ version: want.version, paths: tracked, sizes: expect.any(Array), submodules });
    expect(listing.sizes).toHaveLength(tracked.length);
  });

  it.each(FIXTURES.filter((name) => expected(name).refused))("refuses %s by name", (name) => {
    expect(() => readIndex(bytes(name), idBytes(name))).toThrow(expected(name).refused);
  });

  it("keeps links and executables, leaves out submodules, and reads a path of 4,096 bytes", () => {
    const { paths, submodules } = readIndex(bytes("v2"), 20);
    expect(paths).toContain("link-to-readme");
    expect(paths).toContain("bin/run.sh");
    expect(paths).not.toContain("vendor/sub");
    expect(submodules).toBe(1);
    expect(paths.map((p) => new TextEncoder().encode(p).length)).toContain(4096);
    expect(paths).toContain("docs/naïve café.md");
    // Each path's size as git last saw it: the working tree's bytes.
    const { sizes } = readIndex(bytes("v2"), 20);
    expect(sizes[paths.indexOf("README.md")]).toBe("# fixture\n".length);
    // An entry git added without looking at the disk carries no size.
    expect(sizes[paths.indexOf("bin/run.sh")]).toBe(0);
  });

  it("lists a conflicted path once", () => {
    expect(readIndex(bytes("conflict"), 20).paths).toEqual(["both.txt", "other.txt"]);
  });

  it("names a damaged header, version, entry, extension and trailer", () => {
    const v2 = bytes("v2");
    expect(() => readIndex(v2.slice(0, 20), 20)).toThrow("local/bad-index");
    expect(() => readIndex(patched(v2, 0, 0x58), 20)).toThrow("local/bad-index");
    expect(() => readIndex(patched(v2, 4, 0, 0, 0, 5), 20)).toThrow(
      expect.objectContaining({ code: "local/index-version", detail: { version: 5 } }),
    );
    // The first entry's flags (at 12 + 40 + 20) marked extended, which version 2 cannot hold.
    expect(() => readIndex(patched(v2, 72, v2[72]! | 0x40), 20)).toThrow(
      expect.objectContaining({ code: "local/bad-index", detail: expect.objectContaining({ reason: "extended" }) }),
    );
    // More entries than the bytes hold: the last runs into the extensions and the end.
    expect(() => readIndex(patched(v2, 8, 0, 0, 1, 0), 20)).toThrow("local/bad-index");
    // The trailer cut short.
    expect(() => readIndex(v2.slice(0, -1), 20)).toThrow("local/bad-index");
    // Bytes after the extensions and before the checksum.
    const extra = new Uint8Array(v2.length + 3);
    extra.set(v2.slice(0, -20));
    extra.set(v2.slice(-20), v2.length - 17);
    expect(() => readIndex(extra, 20)).toThrow("local/bad-index");
  });

  it("names an entry that does not fit, and padding past the end", () => {
    // The empty index says it holds one entry: only its cache tree follows.
    expect(() => readIndex(patched(bytes("empty"), 8, 0, 0, 0, 1), 20)).toThrow(
      expect.objectContaining({ code: "local/bad-index", detail: expect.objectContaining({ reason: "entry" }) }),
    );
    // A path whose zero byte is the last before the checksum, so its padding would run into it.
    const short = new Uint8Array([...header(2, 1), ...zeros(62), ...ascii("aaaa"), 0, ...zeros(20)]);
    expect(() => readIndex(short, 20)).toThrow("local/bad-index");
    // A version 4 strip count whose bytes all say "more" up to the checksum.
    const endless = new Uint8Array([...header(4, 1), ...zeros(62), 0x80, 0x80, 0x80, ...zeros(20)]);
    expect(() => readIndex(endless, 20)).toThrow("local/bad-index");
  });

  it("refuses split and sparse indexes by their extensions alone", () => {
    const empty = bytes("empty");
    const named = (name: string) => patched(empty, 12, ...ascii(name));
    expect(() => readIndex(named("link"), 20)).toThrow("local/split-index");
    expect(() => readIndex(named("sdir"), 20)).toThrow("local/sparse-index");
  });

  it("names an unknown required extension, and one that overruns", () => {
    const empty = bytes("empty");
    // The empty index's only extension, TREE, starts at 12: renamed to lower case it is required and unknown.
    expect(() => readIndex(patched(empty, 12, 0x74), 20)).toThrow(
      expect.objectContaining({ code: "local/index-extension", detail: { name: "tREE" } }),
    );
    expect(() => readIndex(patched(empty, 16, 0x7f), 20)).toThrow(
      expect.objectContaining({ code: "local/bad-index", detail: expect.objectContaining({ reason: "extension" }) }),
    );
  });

  it("names a sparse folder entry even without its extension", () => {
    const v2 = bytes("v2");
    // The first entry's mode word, at 12 + 24, as 040000.
    expect(() => readIndex(patched(v2, 36, 0, 0, 0x40, 0), 20)).toThrow("local/sparse-index");
  });

  it("names a path without its end, and a version 4 path that strips too much", () => {
    // One entry whose path runs into the checksum without a zero byte.
    const unterminated = new Uint8Array([...header(2, 1), ...zeros(62), ...ascii("aaaa"), ...zeros(20)]);
    expect(() => readIndex(unterminated, 20)).toThrow(
      expect.objectContaining({ code: "local/bad-index", detail: expect.objectContaining({ reason: "entry" }) }),
    );
    const v4 = bytes("v4");
    // The first entry's strip count (after 62 bytes, or 64 when extended) as 9: there is no path before it.
    expect(() => readIndex(patched(v4, 12 + 62, 9), 20)).toThrow("local/bad-index");
  });

  it("reads a varint strip count of two bytes", () => {
    // One version 4 entry "ab", then one stripping 128 (0x80 0x00 in git's encoding) from a path of 128 + 2 bytes.
    const long = "x".repeat(128) + "ab";
    const entry = (strip: number[], suffix: string) => [...zeros(40 + 20), 0, 0, ...strip, ...ascii(suffix), 0];
    const body = [...entry([0], long), ...entry([0x80, 0x00], "cd")];
    const index = new Uint8Array([...header(4, 2), ...body, ...zeros(20)]);
    // Mode words stay zero: a plain entry. The second path keeps the first two bytes and adds "cd".
    expect(readIndex(index, 20).paths).toEqual([long, "xxcd"]);
  });
});
