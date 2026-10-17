import { describe, expect, it } from "vitest";
import { stateSnapshot } from "./state";

describe("stateSnapshot", () => {
  it("makes every file and every folder of one tree born together, sorted, with its declared members", () => {
    const snap = stateSnapshot("demo", "abc", ["b/c/x.ts", "a.ts", "b/y.ts"], ["b"]);
    expect(snap).toMatchObject({ repository: "demo", commit: "abc", index: 0, workspaces: ["b"] });
    expect(snap.files.map((f) => [f.path, f.identity, f.firstSeen])).toEqual([
      ["a.ts", "a.ts@0", 0],
      ["b/c/x.ts", "b/c/x.ts@0", 0],
      ["b/y.ts", "b/y.ts@0", 0],
    ]);
    expect([...snap.folderFirstSeen]).toEqual([
      ["", 0],
      ["b", 0],
      ["b/c", 0],
    ]);
  });

  it("leaves workspaces out when none are declared", () => {
    expect(stateSnapshot("demo", "abc", ["a.ts"])).not.toHaveProperty("workspaces");
  });

  it("keeps the submodules' folders, sorted, and leaves them out when there are none", () => {
    expect(stateSnapshot("demo", "abc", ["x/.gitlink", "a/b.ts"], undefined, ["x", "a"]).submodules).toEqual([
      "a",
      "x",
    ]);
    expect(stateSnapshot("demo", "abc", ["a.ts"], undefined, [])).not.toHaveProperty("submodules");
  });
});
