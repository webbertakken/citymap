import type { Hit } from "@citymap/scene";
import { describe, expect, it } from "vitest";
import { addressWords, count, describeHit, hintFor, offersFor, placeOf, type Card } from "./describe";
import { BLOCK, HIGHWAY, LAYOUT, OLD, ROAD, TOWN_FORM, USE, VACANT } from "./words";

const linux = { town: "linux", townKey: "linux", root: "" };
const member = { town: "apps/live", townKey: "demo/apps/live", root: "apps/live" };

const highway = (joins: string[]): Hit => ({
  kind: "road",
  town: null,
  townKey: null,
  root: null,
  cls: "street",
  joins,
});

/** Every word a card shows, in reading order. */
const words = (card: Card) =>
  [
    card.eyebrow,
    card.title,
    ...card.place,
    card.meaning,
    ...card.rows.flatMap((row) => [row.label, row.value, row.note]),
  ].filter((word) => word !== null && word !== undefined);

describe("describeHit", () => {
  it("says a file's name, kind, place, its folder's lots and its address, each once", () => {
    const hit: Hit = {
      kind: "lot",
      ...linux,
      path: "drivers/phy/intel/phy-intel-keembay-usb.c",
      use: "source",
      address: "drivers/phy/intel:0.0.0.3",
      vacant: false,
      folder: "drivers/phy/intel",
      folderLots: 6,
    };
    expect(describeHit(hit)).toEqual({
      kind: "file",
      eyebrow: "Source file",
      title: "phy-intel-keembay-usb.c",
      place: ["linux", "drivers", "phy", "intel"],
      meaning: USE.source.meaning,
      rows: [
        { label: "In this folder", value: "6 lots" },
        { label: "Address", value: "No. 4 on drivers/phy/intel", note: "Block 0.0, side 1; kept for life" },
      ],
      target: { path: "drivers/phy/intel/phy-intel-keembay-usb.c", type: "blob" },
    });
  });

  it("says a test file is kept off the map unless asked for, and places a member town's file below its root", () => {
    const hit: Hit = {
      kind: "lot",
      ...member,
      path: "apps/live/lib/a.test.ts",
      use: "tests",
      address: "apps/live/lib#lots:1.2.1.0",
      vacant: false,
      folder: "apps/live/lib",
      folderLots: 1,
    };
    const card = describeHit(hit);
    expect(card.eyebrow).toBe("Test file");
    expect(card.meaning).toContain("Tests are kept off the map unless asked for");
    expect(card.place).toEqual(["apps/live", "lib"]);
    expect(card.rows[0]).toEqual({ label: "In this folder", value: "1 lot" });
    expect(card.rows[1]!.value).toBe("No. 1 on apps/live/lib");
  });

  it("says why a lot is empty, and where it is by its address", () => {
    const hit: Hit = {
      kind: "lot",
      ...linux,
      path: "",
      use: "source",
      address: "src:-2.-1.0.6",
      vacant: true,
      folder: "src",
      folderLots: 4,
    };
    expect(describeHit(hit)).toEqual({
      kind: "vacant",
      eyebrow: null,
      title: "Empty lot",
      place: ["linux", "src"],
      meaning: VACANT.meaning,
      rows: [{ label: "Address", value: "No. 7 on src", note: "Block -2.-1, side 1; kept for life" }],
      target: null,
    });
  });

  it("names the folder of a park once: Documentation is the place, never a description too", () => {
    const hit: Hit = { kind: "block", ...linux, block: "park", folder: "Documentation" };
    const card = describeHit(hit);
    expect(card).toEqual({
      kind: "park",
      eyebrow: null,
      title: "Park",
      place: ["linux", "Documentation"],
      meaning: BLOCK.park.meaning,
      rows: [],
      target: null,
    });
    expect(words(card).filter((word) => word.includes("Documentation"))).toEqual(["Documentation"]);
  });

  it.each([
    ["plaza", "plaza", "Plaza"],
    ["green", "green", "Green"],
    ["reserve", "reserve", "Reserve plot"],
    ["built", "block", "Block"],
  ] as const)("says what a %s block is for", (block, kind, title) => {
    const card = describeHit({ kind: "block", ...member, block, folder: "apps/live/lib/ui" });
    expect(card).toMatchObject({ kind, title, place: ["apps/live", "lib", "ui"], meaning: BLOCK[block].meaning });
  });

  it("says a road's class and what it divides", () => {
    expect(describeHit({ kind: "road", ...linux, cls: "avenue", joins: [] })).toEqual({
      kind: "road",
      eyebrow: null,
      title: "Avenue",
      place: ["linux"],
      meaning: ROAD.avenue,
      rows: [],
      target: null,
    });
  });

  it("says which towns a highway joins, once each", () => {
    expect(describeHit(highway(["linux", "apps/live"]))).toEqual({
      kind: "highway",
      eyebrow: null,
      title: HIGHWAY.name,
      place: [],
      meaning: HIGHWAY.meaning,
      rows: [{ label: "Joins", value: "linux and apps/live" }],
      target: null,
    });
    expect(describeHit(highway(["linux"])).rows).toEqual([{ label: "Joins", value: "linux" }]);
    expect(describeHit(highway([])).rows).toEqual([]);
  });

  it("says what a folder holds and how it is laid out", () => {
    const hit: Hit = {
      kind: "district",
      ...member,
      district: "ui",
      path: "apps/live/lib/ui",
      form: "radial",
      lots: 1204,
      folders: 1,
    };
    expect(describeHit(hit)).toEqual({
      kind: "folder",
      eyebrow: "Folder",
      title: "ui",
      place: ["apps/live", "lib"],
      meaning: null,
      rows: [
        { label: "Holds", value: "1,204 lots and 1 folder" },
        { label: "Layout", value: LAYOUT.radial },
      ],
      target: { path: "apps/live/lib/ui", type: "tree" },
    });
    expect(describeHit({ ...hit, form: null, folders: 0, lots: 0 }).rows).toEqual([
      { label: "Holds", value: "no lots" },
    ]);
  });

  it("says a town's form in words, its lots and districts, and what an old town is", () => {
    const town: Hit = { kind: "town", ...linux, form: "radial", old: false, lots: 75123, districts: 24 };
    expect(describeHit(town)).toEqual({
      kind: "town",
      eyebrow: "Town",
      title: "linux",
      place: [],
      meaning: TOWN_FORM.radial,
      rows: [
        { label: "Lots", value: "75,123" },
        { label: "Districts", value: "24" },
      ],
      target: { path: "", type: "tree" },
    });
    const old = describeHit({ ...town, ...member, town: "apps/live old town", old: true, form: "neighbourhood" });
    expect(old).toMatchObject({
      eyebrow: "Old town",
      title: "live old town",
      meaning: `${TOWN_FORM.neighbourhood} ${OLD}`,
      target: { path: "apps/live", type: "tree" },
    });
    // A town named by a path is titled by its last folder, the whole path its folder.
    expect(old.rows).toContainEqual({ label: "Folder", value: "apps/live old town" });
    expect(describeHit(town).rows.some((r) => r.label === "Folder")).toBe(false);
  });
});

describe("placeOf", () => {
  it("lists the town, then the folders below its root", () => {
    expect(placeOf("linux", "", "drivers/phy")).toEqual(["linux", "drivers", "phy"]);
    expect(placeOf("linux", "", "")).toEqual(["linux"]);
    expect(placeOf("apps/web", "apps/web", "apps/web")).toEqual(["apps/web"]);
    expect(placeOf("apps/web", "apps/web", "apps/web/src")).toEqual(["apps/web", "src"]);
    // A folder outside the town's root (never laid so) keeps its whole path.
    expect(placeOf("apps/web", "apps/web", "lib/x")).toEqual(["apps/web", "lib", "x"]);
  });
});

describe("addressWords", () => {
  it("numbers from 1, names the top folder, and shows an address it cannot read as it is", () => {
    expect(addressWords(":0.0.1.0")).toEqual({
      label: "Address",
      value: "No. 1 on the top folder",
      note: "Block 0.0, side 2; kept for life",
    });
    expect(addressWords("a")).toEqual({ label: "Address", value: "a" });
  });
});

describe("count", () => {
  it("says none, one and many, grouped in thousands", () => {
    expect([count(0, "lot"), count(1, "lot"), count(2048, "lot")]).toEqual(["no lots", "1 lot", "2,048 lots"]);
  });
});

describe("hintFor", () => {
  it("says what selecting offers, in a list a person reads aloud", () => {
    expect(hintFor({ town: false, copy: false, github: false })).toBe("Click to select");
    expect(hintFor({ town: true, copy: false, github: false })).toBe("Click to select; then show only this town");
    expect(hintFor({ town: false, copy: true, github: true })).toBe(
      "Click to select; then copy the path or open it on GitHub",
    );
    expect(hintFor({ town: true, copy: true, github: true })).toBe(
      "Click to select; then show only this town, copy the path or open it on GitHub",
    );
  });
});

describe("offersFor", () => {
  const file: Hit = {
    kind: "lot",
    ...linux,
    path: "a.ts",
    use: "source",
    address: ":0.0.0.0",
    vacant: false,
    folder: "",
    folderLots: 1,
  };
  const between = highway([]);
  const main: Hit = { kind: "town", ...linux, form: "radial", old: false, lots: 1, districts: 0 };

  it("offers the town, the path and GitHub for a file of a city from GitHub", () => {
    expect(offersFor(file, describeHit(file), { focused: false, github: true })).toEqual({
      town: true,
      copy: true,
      github: true,
    });
  });

  it("offers no town while one is shown alone, nor for a highway; no path for a main town's root", () => {
    expect(offersFor(file, describeHit(file), { focused: true, github: false })).toEqual({
      town: false,
      copy: true,
      github: false,
    });
    expect(offersFor(between, describeHit(between), { focused: false, github: true })).toEqual({
      town: false,
      copy: false,
      github: false,
    });
    expect(offersFor(main, describeHit(main), { focused: false, github: true })).toEqual({
      town: true,
      copy: false,
      github: true,
    });
  });
});
