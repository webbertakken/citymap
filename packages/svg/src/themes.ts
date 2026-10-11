import { fnv1a, type DistrictForm } from "@citymap/ground-plan";
import { mix, oklch } from "./colour";

export const THEME_NAMES = ["paper-atlas", "night-atlas", "beck", "nolli", "dracula"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** A theme is data over the model: every colour the renderers use. Districts arrive as tint seeds. */
export interface Theme {
  readonly label: string;
  readonly dark: boolean;
  readonly country: string;
  readonly ground: string;
  readonly outline: string;
  readonly park: string;
  readonly plaza: string;
  readonly water: string;
  readonly waterline: string;
  readonly casing: string;
  readonly road: string;
  readonly text: string;
  readonly halo: string;
  readonly header: string;
  readonly headerText: string;
  readonly subText: string;
  readonly block: (district: number) => string;
  readonly lot: (district: number, source: boolean) => string;
  readonly plinth: (district: number) => string;
  readonly reserve: (district: number) => readonly [fill: string, stroke: string];
  readonly form: (form: DistrictForm, lot: boolean) => string;
}

/** The root district (the empty key) takes a warm neutral; other districts spread over hues clear of park green. */
const ROOT = fnv1a("");
export const hueOf = (district: number) => {
  if (district === ROOT) return 60;
  const h = district % 290;
  return h >= 95 ? h + 70 : h;
};

const FORM_HUE: Readonly<Record<DistrictForm, number>> = { radial: 55, twin: 235, polycentric: 15 };
const FORM_ACCENT: Readonly<Record<DistrictForm, string>> = {
  radial: "#FFB86C",
  twin: "#8BE9FD",
  polycentric: "#FF79C6",
};

// Dracula (draculatheme.com): background, current line, foreground, comment and the seven accents.
const DRACULA = { background: "#282A36", line: "#44475A", foreground: "#F8F8F2", comment: "#6272A4", deep: "#191A21" };
const DRACULA_ACCENTS = ["#BD93F9", "#FF79C6", "#8BE9FD", "#50FA7B", "#FFB86C", "#F1FA8C", "#FF5555"] as const;
const accent = (district: number) => DRACULA_ACCENTS[district % DRACULA_ACCENTS.length]!;

// Beck: the flat, saturated fields of a transit diagram.
const BECK = [
  "#E32017",
  "#FFD300",
  "#00782A",
  "#003688",
  "#0098D4",
  "#95CDBA",
  "#EE7C0E",
  "#9B0056",
  "#A0A5A9",
] as const;
const beck = (district: number) => BECK[district % BECK.length]!;

export const THEMES: Readonly<Record<ThemeName, Theme>> = {
  "paper-atlas": {
    label: "Paper atlas",
    dark: false,
    country: "#E4E6D6",
    ground: "#F2EEE6",
    outline: "#D3CCBD",
    park: "#BFD8A6",
    plaza: "#E9DFCB",
    water: "#A9CCE3",
    waterline: "#7FAFD0",
    casing: "#C3BBAC",
    road: "#FFFFFF",
    text: "#1E1E24",
    halo: "#F2EEE6",
    header: "#FFFFFF",
    headerText: "#1E1E24",
    subText: "#4A4A55",
    block: (d) => oklch(0.915, 0.025, hueOf(d)),
    lot: (d, source) => oklch(source ? 0.84 : 0.87, source ? 0.05 : 0.025, hueOf(d)),
    plinth: (d) => oklch(0.7, 0.04, hueOf(d)),
    reserve: (d) => [oklch(0.94, 0.018, hueOf(d)), oklch(0.86, 0.03, hueOf(d))],
    form: (f, lot) => oklch(lot ? 0.82 : 0.92, lot ? 0.08 : 0.03, FORM_HUE[f]),
  },
  "night-atlas": {
    label: "Night atlas",
    dark: true,
    country: "#11151C",
    ground: "#1B212B",
    outline: "#2C3440",
    park: oklch(0.36, 0.05, 140),
    plaza: "#2A303A",
    water: "#22384D",
    waterline: "#34536F",
    casing: "#0D1117",
    road: "#59606B",
    text: "#ECEAE4",
    halo: "#1B212B",
    header: "#0D1117",
    headerText: "#ECEAE4",
    subText: "#B4B8C0",
    block: (d) => oklch(0.25, 0.025, hueOf(d)),
    lot: (d, source) => oklch(source ? 0.4 : 0.34, source ? 0.06 : 0.03, hueOf(d)),
    plinth: (d) => oklch(0.18, 0.03, hueOf(d)),
    reserve: (d) => [oklch(0.22, 0.015, hueOf(d)), oklch(0.32, 0.03, hueOf(d))],
    form: (f, lot) => oklch(lot ? 0.45 : 0.26, lot ? 0.09 : 0.03, FORM_HUE[f]),
  },
  beck: {
    label: "Beck schematic",
    dark: false,
    country: "#FFFFFF",
    ground: "#F7F7F2",
    outline: "#E2E2DC",
    park: "#C7E3B5",
    plaza: "#F7F7F2",
    water: "#B9DCF2",
    waterline: "#B9DCF2",
    casing: "#FFFFFF",
    road: "#FFFFFF",
    text: "#10141A",
    halo: "#FFFFFF",
    header: "#FFFFFF",
    headerText: "#10141A",
    subText: "#4A4E57",
    block: (d) => mix("#FFFFFF", beck(d), 0.18),
    lot: (d, source) => mix("#FFFFFF", beck(d), source ? 0.62 : 0.4),
    plinth: (d) => mix("#10141A", beck(d), 0.55),
    reserve: (d) => [mix("#FFFFFF", beck(d), 0.08), mix("#FFFFFF", beck(d), 0.3)],
    form: (f, lot) => mix("#FFFFFF", FORM_ACCENT[f], lot ? 0.7 : 0.2),
  },
  nolli: {
    label: "Nolli noir",
    dark: false,
    country: "#E9E5DC",
    ground: "#F4F1EA",
    outline: "#2A2A2A",
    park: "#D9D6CF",
    plaza: "#F4F1EA",
    water: "#CFCBC2",
    waterline: "#B3AEA4",
    casing: "#F4F1EA",
    road: "#F4F1EA",
    text: "#111111",
    halo: "#F4F1EA",
    header: "#F4F1EA",
    headerText: "#111111",
    subText: "#3A3A3A",
    block: () => "#F4F1EA",
    lot: (_, source) => (source ? "#111111" : "#3A3A3A"),
    plinth: () => "#000000",
    reserve: () => ["#F4F1EA", "#C9C4B8"],
    form: (f, lot) => (lot ? mix("#111111", FORM_ACCENT[f], 0.35) : "#F4F1EA"),
  },
  dracula: {
    label: "Dracula",
    dark: true,
    country: "#1E1F29",
    ground: DRACULA.background,
    outline: DRACULA.line,
    park: mix(DRACULA.background, "#50FA7B", 0.28),
    plaza: mix(DRACULA.background, DRACULA.foreground, 0.16),
    water: mix(DRACULA.background, "#8BE9FD", 0.3),
    waterline: mix(DRACULA.background, "#8BE9FD", 0.6),
    casing: DRACULA.deep,
    road: DRACULA.line,
    text: DRACULA.foreground,
    halo: DRACULA.background,
    header: DRACULA.deep,
    headerText: DRACULA.foreground,
    subText: "#BFC1D0",
    block: (d) => mix(DRACULA.background, accent(d), 0.1),
    lot: (d, source) => mix(DRACULA.background, accent(d), source ? 0.5 : 0.32),
    plinth: (d) => mix(DRACULA.deep, accent(d), 0.3),
    reserve: (d) => [mix(DRACULA.background, accent(d), 0.05), mix(DRACULA.background, accent(d), 0.3)],
    form: (f, lot) => mix(DRACULA.background, FORM_ACCENT[f], lot ? 0.5 : 0.12),
  },
};
