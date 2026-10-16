import { CitymapError } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { describeLocal } from "./describe";
import { LocalError, type LocalCode } from "./errors";

describe("describeLocal", () => {
  it.each<[LocalCode, Record<string, string | number>, string]>([
    ["local/denied", {}, "The browser did not allow reading repo."],
    [
      "local/split-index",
      {},
      'repo has a split index, which is not read here: run "git update-index --no-split-index", then try again.',
    ],
    [
      "local/sparse-index",
      {},
      'repo has a sparse index, which is not read here: run "git sparse-checkout reapply --no-sparse-index", then try again.',
    ],
    ["local/index-version", { version: 5 }, "repo's git index is version 5; versions 2 to 4 are read."],
    ["local/index-extension", { name: "zzzz" }, `repo's git index needs its "zzzz" extension, which is not read here.`],
    ["local/bad-index", {}, "repo's git index could not be read; it may be damaged."],
    ["local/no-index", {}, "repo has no git index yet: nothing is checked out or staged."],
    [
      "local/outside",
      {},
      "repo keeps its git data outside the folder (a linked worktree or a submodule): pick the main checkout.",
    ],
    ["local/bad-git-file", {}, "repo's .git file does not say where its git data is."],
    ["local/no-working-tree", {}, "repo is git's own data, not a working tree: pick the repository's folder."],
    ["local/vanished", {}, "A file in repo changed or vanished while it was read: try again."],
    ["local/too-large", { files: 2_000_001 }, "repo holds 2,000,001 files, more than the 2,000,000 a city holds."],
    ["local/too-large", {}, "repo holds 0 files, more than the 2,000,000 a city holds."],
    ["local/long-path", {}, "repo holds a path longer than 4,096 bytes."],
    ["local/empty", {}, "There are no files to lay in repo."],
  ])("says %s in one sentence", (code, detail, sentence) => {
    expect(describeLocal(new LocalError(code, "x", detail), "repo")).toBe(sentence);
  });

  it("says any other failure as laying that failed", () => {
    expect(describeLocal(new Error("the layout worker failed"), "repo")).toBe(
      "repo could not be laid: the layout worker failed.",
    );
    expect(describeLocal(new CitymapError("city/too-large", "far"), "repo")).toBe(
      "repo could not be laid: city/too-large: far.",
    );
    expect(describeLocal("odd", "repo")).toBe("repo could not be laid: odd.");
  });
});
