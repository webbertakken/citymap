// The words the map speaks: every land use, block kind, road class and form, said once, for the cards and the legend.
import type { BlockKind, Form, LandUse, RoadClass } from "@citymap/ground-plan";

/** A file's kind: its name over the title, and what it means. */
export const USE: Readonly<Record<LandUse, { readonly name: string; readonly meaning: string }>> = {
  source: { name: "Source file", meaning: "Code the project is built from." },
  config: { name: "Configuration file", meaning: "Settings that tools and builds read." },
  assets: { name: "Asset file", meaning: "An image, font, sound or other media." },
  ci: { name: "Tooling file", meaning: "A script or setting that builds, checks or ships the project." },
  docs: { name: "Documentation file", meaning: "Written documentation; most of it is drawn as parks." },
  tests: { name: "Test file", meaning: "A test. Tests are kept off the map unless asked for." },
  examples: { name: "Example file", meaning: "An example of how to use the project." },
  fixtures: { name: "Test data file", meaning: "Data for tests, kept off the map unless asked for." },
  generated: { name: "Generated file", meaning: "Made by a tool, not written by hand." },
  vendored: { name: "Vendored file", meaning: "Code copied in from another project." },
};

/** Land without a file of its own: its name, and what it is for. */
export const BLOCK: Readonly<Record<BlockKind, { readonly name: string; readonly meaning: string }>> = {
  park: {
    name: "Park",
    meaning: "Open land for this folder's documentation: each document gives its folder half a lot of park.",
  },
  plaza: { name: "Plaza", meaning: "A square where a long road changes direction, its roads turning round it." },
  green: { name: "Green", meaning: "The open centre of a hamlet, a small settlement." },
  reserve: { name: "Reserve plot", meaning: "Land kept free for this folder's future files." },
  built: { name: "Block", meaning: "Land between streets, its lots back to back." },
};

export const VACANT = {
  name: "Empty lot",
  meaning: "A file was deleted here. The lot stays empty so its neighbours never move, until the neighbourhood renews.",
} as const;

/** What each road class is, by the land it divides. */
export const ROAD: Readonly<Record<RoadClass, string>> = {
  lane: "The smallest road, between blocks inside a neighbourhood.",
  street: "Runs between rows of blocks inside a neighbourhood.",
  collector: "Gathers the streets, between districts.",
  avenue: "A main road between large districts.",
  boulevard: "The main road through a city.",
  highway: "A road between towns.",
};

export const HIGHWAY = { name: "Highway", meaning: "A road across open country between towns." } as const;

/** A town's form, as its meaning. */
export const TOWN_FORM: Readonly<Record<Form, string>> = {
  hamlet: "A hamlet: a few blocks round a green.",
  "street-village": "A street village: blocks along one high street.",
  neighbourhood: "A single neighbourhood: one grid of blocks.",
  radial: "A radial town: districts round a centre.",
  twin: "A twin town: two halves facing each other across a river.",
  polycentric: "A polycentric town: districts side by side between roads.",
  corridor: "A corridor: a road through a small edge quarter leads to the one folder that holds nearly everything.",
  archipelago: "An archipelago: each package an island, with canals and bridges between them.",
  quarters: "A town of quarters: many small folders gathered into tidy quarters of straight streets.",
};

/** A folder's form, as its layout. */
export const LAYOUT: Readonly<Record<Form, string>> = {
  hamlet: "A hamlet round a green",
  "street-village": "A street village along a high street",
  neighbourhood: "One grid of blocks",
  radial: "Its folders round a centre",
  twin: "Two halves across a river",
  polycentric: "Its folders side by side between roads",
  corridor: "A gateway through to the folder that holds nearly all of it",
  archipelago: "Its packages as islands between canals",
  quarters: "Its small folders gathered into quarters",
};

export const OLD = "Kept whole as it stood before its layout changed; the new town grows beside it.";

/** The legend, in the cards' words. */
export const LEGEND = {
  lot: "Lot: a file's land, tinted by folder; source stronger",
  park: "Park: land for a folder's documentation",
  reserve: "Reserve plot: room to grow; empty lots too",
} as const;
