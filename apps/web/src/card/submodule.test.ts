import type { City } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { city as cityNamed } from "../components/testing/fixtures";
import { UNREAD_SUBMODULE, submoduleRows, unreadFolders } from "./submodule";

/** A city whose one town holds these files' lots. */
function cityOf(paths: readonly string[]): City {
  const base = cityNamed("demo");
  const town = base.towns[0]!;
  const lot = town.lots[0]!;
  return { ...base, towns: [{ ...town, lots: paths.map((path, i) => ({ ...lot, key: `l${i}`, path })) }] };
}

const where = { town: "demo", townKey: "demo", root: "" };
const lot = (path: string): Hit => ({
  kind: "lot",
  ...where,
  key: "l0",
  path,
  use: "source",
  address: "#lots:0.0.0.0",
  vacant: false,
  folder: path.slice(0, Math.max(0, path.lastIndexOf("/"))),
  folderLots: 1,
});
const district = (path: string): Hit => ({
  kind: "district",
  ...where,
  district: path.slice(path.lastIndexOf("/") + 1),
  path,
  form: null,
  lots: 1,
  folders: 0,
});
const town = (root: string): Hit => ({
  kind: "town",
  ...where,
  root,
  form: "radial",
  old: false,
  lots: 1,
  districts: 1,
});

describe("unreadFolders", () => {
  it("names every folder holding a submodule's .gitlink lot", () => {
    const folders = unreadFolders(cityOf(["src/a.ts", "vendor/lib/.gitlink", "ext/x/.gitlink", "docs/.gitlinks"]));
    expect([...folders].toSorted()).toEqual(["ext/x", "vendor/lib"]);
    expect(unreadFolders(cityOf(["src/a.ts"])).size).toBe(0);
  });
});

const row = (via: "clone" | "github") => [{ label: "Submodule", value: "Not read", note: UNREAD_SUBMODULE[via] }];

describe("submoduleRows", () => {
  const folders = unreadFolders(cityOf(["vendor/lib/.gitlink", "src/a.ts"]));

  it("says on the lot, the folder and the town of an unread submodule why its files are not there", () => {
    expect(submoduleRows(lot("vendor/lib/.gitlink"), folders, "clone")).toEqual(row("clone"));
    expect(submoduleRows(district("vendor/lib"), folders, "clone")).toEqual(row("clone"));
    expect(submoduleRows(town("vendor/lib"), folders, "github")).toEqual(row("github"));
    expect(UNREAD_SUBMODULE).toEqual({
      clone: "This submodule's files are not in this clone",
      github: "This submodule's files could not be read from GitHub",
    });
  });

  it("adds nothing anywhere else", () => {
    expect(submoduleRows(lot("src/a.ts"), folders, "clone")).toEqual([]);
    expect(submoduleRows(lot("other/.gitlink"), folders, "clone")).toEqual([]);
    expect(submoduleRows(district("vendor"), folders, "clone")).toEqual([]);
    expect(submoduleRows(town(""), folders, "clone")).toEqual([]);
    expect(submoduleRows({ kind: "road", ...where, cls: "street", joins: [] }, folders, "clone")).toEqual([]);
  });
});
