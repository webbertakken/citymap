import { describe, expect, it } from "vitest";
import type { Snapshot } from "../snapshot/snapshot";
import { files, snapshotOf } from "../testing/fixtures";
import {
  DEFAULT_SEPARATIONS,
  SEPARATIONS,
  declaresWorkspaces,
  isSeparation,
  separable,
  separateMembers,
  separationList,
  type Separation,
} from "./separate";

const repo = (folders: readonly string[], extra: Partial<Snapshot> = {}): Snapshot => ({
  ...snapshotOf(folders.flatMap((f) => files(f, 2))),
  ...extra,
});
const members = (snapshot: Snapshot, separate?: readonly Separation[]) =>
  separateMembers(snapshot, separate).map((m) => `${m.by}:${m.folder}`);

describe("separations", () => {
  it("are ten, in the spec's order, with workspaces, submodules and apps on by default", () => {
    expect(SEPARATIONS).toEqual([
      "workspaces",
      "submodules",
      "apps",
      "packages",
      "libs",
      "crates",
      "services",
      "modules",
      "extensions",
      "plugins",
    ]);
    expect(DEFAULT_SEPARATIONS).toEqual(["workspaces", "submodules", "apps"]);
    expect(isSeparation("plugins")).toBe(true);
    expect(isSeparation("split")).toBe(false);
  });

  it("lists the separations named once each in canonical order, the defaults when none are named", () => {
    expect(separationList(["plugins", "apps", "plugins"])).toEqual(["apps", "plugins"]);
    expect(separationList(undefined)).toEqual(DEFAULT_SEPARATIONS);
    expect(separationList([])).toEqual([]);
  });
});

describe("separateMembers", () => {
  it("lays each child folder of a root folder kind apart, and nothing of the same name deeper down", () => {
    const snapshot = repo(["apps/web", "apps/api", "packages/a", "libs/x", "crates/c", "services/s", "modules/m"]);
    expect(members(snapshot, ["apps", "packages", "libs", "crates", "services", "modules", "extensions"])).toEqual([
      "apps:apps/api",
      "apps:apps/web",
      "crates:crates/c",
      "libs:libs/x",
      "modules:modules/m",
      "packages:packages/a",
      "services:services/s",
    ]);
    expect(members(repo(["src/apps/web", "tools/extensions/e"]), ["apps", "extensions"])).toEqual([]);
  });

  it("lays each folder in any plugins folder apart, at any depth", () => {
    const snapshot = repo(["plugins/git", "lib/plugins/zsh", "deep/a/plugins/b/c", "pluginsx/y"]);
    expect(members(snapshot, ["plugins"])).toEqual([
      "plugins:deep/a/plugins/b",
      "plugins:lib/plugins/zsh",
      "plugins:plugins/git",
    ]);
  });

  it("keeps the folder kind's own files where they lie", () => {
    const snapshot = { ...snapshotOf([...files("apps", 3), ...files("apps/web", 2)]) };
    expect(members(snapshot, ["apps"])).toEqual(["apps:apps/web"]);
  });

  it("lays every declared workspace member apart, and none without a declaration", () => {
    const snapshot = repo(["website", "packages/a", "packages/a/inner"], { workspaces: ["packages/a", "website"] });
    expect(members(snapshot, ["workspaces"])).toEqual(["workspaces:packages/a", "workspaces:website"]);
    expect(members(repo(["packages/a"]), ["workspaces"])).toEqual([]);
    expect(members(repo(["packages/a"], { workspaces: [] }), ["workspaces"])).toEqual([]);
  });

  it("lets declared workspaces decide apps and packages while the workspaces separation is on", () => {
    const snapshot = repo(["apps/web", "apps/admin", "packages/a", "libs/x"], { workspaces: ["apps/web"] });
    expect(members(snapshot, ["workspaces", "apps", "packages", "libs"])).toEqual([
      "workspaces:apps/web",
      "libs:libs/x",
    ]);
    expect(members(snapshot, ["apps", "packages"])).toEqual([
      "apps:apps/admin",
      "apps:apps/web",
      "packages:packages/a",
    ]);
    // Nothing declared: apps and packages act as set.
    expect(members(repo(["apps/web"]), ["workspaces", "apps"])).toEqual(["apps:apps/web"]);
  });

  it("lays every submodule apart, read or not", () => {
    const snapshot = {
      ...snapshotOf([
        ...files("vendor/lib", 2),
        { path: "ext/x/.gitlink", identity: "ext/x/.gitlink@0", firstSeen: 0 },
      ]),
      submodules: ["ext/x", "vendor/lib"],
    };
    expect(members(snapshot, ["submodules"])).toEqual(["submodules:ext/x", "submodules:vendor/lib"]);
  });

  it("keeps the outermost member within a separation, nests members of different ones, and names a folder once", () => {
    const snapshot = repo(["plugins/a", "plugins/a/plugins/b", "apps/web", "apps/web/plugins/p"], {
      workspaces: ["apps/web"],
      submodules: ["apps/web/plugins/p", "plugins/a/plugins/b"],
    });
    expect(members(snapshot, ["workspaces", "submodules", "plugins"])).toEqual([
      "workspaces:apps/web",
      "submodules:apps/web/plugins/p",
      "plugins:plugins/a",
      "submodules:plugins/a/plugins/b",
    ]);
  });

  it("names no folder that holds no file now", () => {
    const snapshot = {
      ...repo(["apps/web"], { workspaces: ["gone"], submodules: ["empty"] }),
      folderFirstSeen: new Map([["apps/old", 0]]),
    };
    expect(members(snapshot, ["workspaces", "submodules"])).toEqual([]);
    expect(members(snapshot, ["apps"])).toEqual(["apps:apps/web"]);
  });

  it("lays the defaults when no separations are named", () => {
    expect(members(repo(["apps/web", "packages/a"]))).toEqual(["apps:apps/web"]);
  });
});

describe("separable and declared", () => {
  it("records the separations that, each alone, lay something apart", () => {
    const snapshot = repo(["apps/web", "packages/a", "lib/plugins/p"], { workspaces: ["packages/a"] });
    expect(separable(snapshot)).toEqual(["workspaces", "apps", "packages", "plugins"]);
    expect(separable(repo(["src"]))).toEqual([]);
  });

  it("says whether the snapshot declares workspaces", () => {
    expect(declaresWorkspaces(repo(["a"], { workspaces: ["a"] }))).toBe(true);
    expect(declaresWorkspaces(repo(["a"], { workspaces: [] }))).toBe(false);
    expect(declaresWorkspaces(repo(["a"]))).toBe(false);
  });
});
