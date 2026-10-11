import { describe, expect, it } from "vitest";
import { gitEnvironment } from "./env";

describe("gitEnvironment", () => {
  it("drops what a git hook sets to name its repository, and never fetches blobs", () => {
    const env = gitEnvironment({
      GIT_DIR: "/hook/.git",
      GIT_INDEX_FILE: "/hook/index",
      GIT_WORK_TREE: "/hook",
      HOME: "/home/x",
    });
    expect(env).toEqual({ HOME: "/home/x", GIT_NO_LAZY_FETCH: "1" });
  });
});
