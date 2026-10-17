import { stateSnapshot } from "@citymap/ground-plan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../log";
import { CONTENTS_LIMIT, localFacts } from "./contents";
import { LocalError } from "./errors";
import { handleFolder, type Folder } from "./folder";
import type { LocalPhase } from "./phases";
import type { LocalRead } from "./read";
import { fakeHandle, type Tree } from "./testing/folders";

afterEach(() => vi.restoreAllMocks());

const LCOV = "SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n";

/** A local read of these tracked paths, with sizes from the index (or none for a walked folder). */
const readOf = (paths: string[], sizes: Record<string, number> | null): LocalRead => ({
  snapshot: stateSnapshot("widgets", "worktree", paths),
  sizes: new Map(Object.entries(sizes ?? {})),
  source: sizes ? "index" : "walk",
  index: null,
  head: null,
  unread: [],
});

const tree: Tree = {
  src: { "a.ts": "// TODO\nexport const a = 1;\n", "b.ts": "b\n" },
  "package.json": "{}\n",
  coverage: { "lcov.info": LCOV },
  "coverage.xml": "<html/>",
};

describe("localFacts", () => {
  it("reads the contents of a small folder, and its coverage at the usual paths", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const phases: LocalPhase[] = [];
    const facts = await localFacts(
      handleFolder(fakeHandle("widgets", tree)),
      readOf(["package.json", "src/a.ts", "src/b.ts"], { "package.json": 3, "src/a.ts": 28, "src/b.ts": 2 }),
      (p) => phases.push(p),
    );
    expect(facts).toMatchObject({ source: "folder", size: "lines", comments: true });
    expect(facts.files.get("src/a.ts")).toEqual({ bytes: 28, lines: 2, comments: 1, todos: 1 });
    expect(facts.coverage).toEqual(new Map([["src/a.ts", { covered: 1, executable: 2 }]]));
    expect(phases).toEqual([
      { phase: "contents", done: 0, of: 3 },
      { phase: "contents", done: 3, of: 3 },
      { phase: "coverage" },
    ]);
    const lines = info.mock.calls.map(([event, detail]) => `${event} ${JSON.stringify(detail)}`);
    expect(lines).toContain('viewer/local-contents {"files":3,"bytes":33,"read":"yes","unread":0}');
    expect(lines).toContain('viewer/local-coverage-skipped {"path":"coverage.xml","reason":"coverage/unreadable"}');
    expect(lines).toContain(
      'viewer/local-coverage {"path":"coverage/lcov.info","format":"lcov","files":1,"matched":1}',
    );
  });

  it("keeps to the index's sizes when the tracked files pass 50 MB", async () => {
    vi.spyOn(log, "info").mockImplementation(() => {});
    const folder = handleFolder(fakeHandle("widgets", tree));
    const read = vi.spyOn(folder, "read");
    const facts = await localFacts(
      folder,
      readOf(["src/a.ts", "src/b.ts"], { "src/a.ts": CONTENTS_LIMIT, "src/b.ts": 2 }),
      () => {},
    );
    expect(facts).toMatchObject({ size: "bytes", comments: false });
    expect(facts.files.get("src/a.ts")).toEqual({ bytes: CONTENTS_LIMIT });
    // Only the reports are read: the coverage at its usual paths.
    expect(read.mock.calls.map(([path]) => path)).toEqual(["coverage/lcov.info", "coverage.xml"]);
  });

  it("reads a walked folder until it passes the limit, and skips a vanished file or a report too large", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => {});
    const big = new Uint8Array(CONTENTS_LIMIT);
    const reads: string[] = [];
    const folder: Folder = {
      name: "widgets",
      kind: async (path) => (path === "lcov.info" || path === "coverage/lcov.info" ? "file" : null),
      list: async () => [],
      read: async (path) => {
        reads.push(path);
        if (path === "gone.ts") throw new LocalError("local/vanished", "gone");
        if (path === "lcov.info") return new Uint8Array(300 * 1024 * 1024);
        if (path === "coverage/lcov.info") throw new LocalError("local/vanished", "gone");
        return path === "big.bin" ? big : new TextEncoder().encode("x\n");
      },
    };
    const paths = ["a.ts", "big.bin", "gone.ts", ...Array.from({ length: 20 }, (_, i) => `z${i}.ts`)];
    const facts = await localFacts(folder, readOf(paths, null), () => {});
    expect(facts).toMatchObject({ size: "bytes", comments: false });
    expect(facts.files.has("a.ts")).toBe(true);
    // The first batch of eight passed the limit: nothing after it is read.
    expect(facts.files.has("z19.ts")).toBe(false);
    expect(reads.filter((p) => p.startsWith("z"))).toHaveLength(5);
    expect(info.mock.calls.map(([event, detail]) => `${event} ${JSON.stringify(detail)}`)).toContain(
      'viewer/local-coverage-skipped {"path":"lcov.info","reason":"too-large"}',
    );
  });

  it("passes on a failure that is not a vanished file", async () => {
    const folder: Folder = {
      name: "widgets",
      kind: async () => null,
      list: async () => [],
      read: async () => {
        throw new LocalError("local/denied", "no");
      },
    };
    await expect(localFacts(folder, readOf(["a.ts"], null), () => {})).rejects.toThrow("no");
  });
});
