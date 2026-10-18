// What a building's colour means: its folder's tint, or one measure on a ramp of its theme. Ramps change in lightness
// as well as hue, so they read without colour vision; unknown is a grey of its own, never a ramp's end.
import type { LandUse } from "@citymap/ground-plan";
import { floorsOf, shareOf, type Building, type Range, type Scales } from "@citymap/measures";
import type { Theme } from "@citymap/themes";
import type { LotLook, LotRef } from "./buildings";

export const COLOUR_BY = ["folder", "tested", "size", "kind", "recency", "churn", "authors"] as const;
export type ColourBy = (typeof COLOUR_BY)[number];
export type RampMeasure = "tested" | "size" | "recency" | "churn" | "authors";

/** Five stops per ramp, for light themes and dark ones (research: Okabe and Ito, viridis, cividis, magma). */
export const RAMPS: Readonly<
  Record<RampMeasure, { readonly light: readonly string[]; readonly dark: readonly string[] }>
> = {
  tested: {
    light: ["#B84A00", "#E69F00", "#F0E442", "#56B4A0", "#00785A"],
    dark: ["#E8743B", "#F0B341", "#F0E442", "#5CC8A8", "#2FB98A"],
  },
  size: {
    light: ["#440154", "#414487", "#2A788E", "#22A884", "#7AD151"],
    dark: ["#414487", "#2A788E", "#22A884", "#7AD151", "#FDE725"],
  },
  recency: {
    light: ["#00204C", "#31446B", "#666970", "#958F78", "#CBBA69"],
    dark: ["#31446B", "#666970", "#958F78", "#CBBA69", "#FFE945"],
  },
  churn: {
    light: ["#000004", "#3B0F70", "#8C2981", "#DE4968", "#FE9F6D"],
    dark: ["#3B0F70", "#8C2981", "#DE4968", "#FE9F6D", "#FCFDBF"],
  },
  authors: {
    light: ["#000004", "#3B0F70", "#8C2981", "#DE4968", "#FE9F6D"],
    dark: ["#3B0F70", "#8C2981", "#DE4968", "#FE9F6D", "#FCFDBF"],
  },
};

/** Each land use's colour when colour is by kind: Okabe and Ito's eight, and greys. */
export const KIND_COLOURS: Readonly<Record<LandUse, string>> = {
  source: "#0072B2",
  config: "#E69F00",
  assets: "#CC79A7",
  ci: "#56B4E9",
  examples: "#009E73",
  generated: "#999999",
  vendored: "#8C6D31",
  tests: "#D55E00",
  fixtures: "#F0E442",
  docs: "#B5B5B5",
};

/** The colour of a measure that is not known, per theme brightness. */
export const unknownColour = (theme: Theme) => (theme.dark ? "#6E6E6E" : "#9A9A9A");

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();

/** A ramp's colour at a share from 0 to 1, linear between its stops in sRGB. */
export function rampColour(stops: readonly string[], share: number): string {
  const at = Math.min(1, Math.max(0, share)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(at));
  const t = at - i;
  const [a, b] = [stops[i]!, stops[i + 1]!];
  return `#${[1, 3, 5].map((k) => hex2(channel(a, k) + (channel(b, k) - channel(a, k)) * t)).join("")}`;
}

/** The stops of a measure's ramp in a theme. */
export const rampOf = (measure: RampMeasure, theme: Theme) => RAMPS[measure][theme.dark ? "dark" : "light"];

/** A value's share of a range, or null when either is not known. */
const placed = (value: number | null, range: Range | null, scale: "log" | "linear") =>
  value === null || range === null ? null : shareOf(value, range, scale);

/** Where a building lies on each measure's ramp, from 0 to 1; null when the measure is not known for it. */
const SHARES: Readonly<Record<RampMeasure, (building: Building, scales: Scales) => number | null>> = {
  tested: (b) => b.tested,
  size: (b, s) => placed(b.size, s.size, "log"),
  recency: (b, s) => placed(b.changed, s.recency, "linear"),
  churn: (b, s) => placed(b.commits, s.churn, "log"),
  authors: (b, s) => placed(b.authors, s.authors, "log"),
};

/** Where a building lies on a measure's ramp, from 0 to 1; null when the measure is not known for it. */
export const shareFor = (measure: RampMeasure, building: Building, scales: Scales): number | null =>
  SHARES[measure](building, scales);

/** How a building looks: its floors from its size, its lit windows from tested, its colour by the choice. */
export function lookOf(
  ref: LotRef,
  building: Building | undefined,
  scales: Scales,
  by: ColourBy,
  theme: Theme,
): LotLook {
  const size = building?.size ?? null;
  const colour = (): string => {
    if (by === "folder") return theme.lot(ref.district, ref.use === "source");
    if (by === "kind") return KIND_COLOURS[ref.use];
    const share = building ? shareFor(by, building, scales) : null;
    return share === null ? unknownColour(theme) : rampColour(rampOf(by, theme), share);
  };
  return {
    floors: floorsOf(size, scales.size),
    lit: building?.tested ?? -1,
    colour: colour(),
    unknownSize: size === null,
  };
}

/** A lit window's warm light, the same on every theme. */
export const WINDOW_LIT = "#FFD27A";

/** A window whose building's tested share is not known: a neutral grey, distinct from an unlit one. */
export const windowUnknown = (theme: Theme) => (theme.dark ? "#8A8F98" : "#B8BCC2");
