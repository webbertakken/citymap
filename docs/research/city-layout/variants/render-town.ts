// Paper atlas rendering of a region: plan view or 2:1 dimetric with low lot plinths.
import { area, centroid, fnv1a, type Pt } from "./geometry";
import { oklch } from "./render";
import type { Region } from "./region";
import type { RoadClass } from "./town";
import { ROAD_WIDTH } from "./town";

export type TownCamera = "plan" | "dimetric";

const PAPER = {
  country: "#E4E6D6",
  ground: "#F2EEE6",
  park: "#BFD8A6",
  open: "#D7E4C4",
  casing: "#C3BBAC",
  road: "#FFFFFF",
  label: "#1E1E24",
  highway: "#F6E7C4",
  water: "#A9CCE3",
};
const ORDER: RoadClass[] = ["lane", "street", "collector", "avenue", "boulevard"];

const hueOf = (key: string) => {
  const h = key === "" ? 60 : fnv1a(key) % 290;
  return h >= 95 ? h + 70 : h;
};

export function renderRegion(
  region: Region,
  options: { camera: TownCamera; width: number; title: string; subtitle: string; scale?: number },
): string {
  const squash = options.camera === "plan" ? 1 : 0.5;
  const project = (p: Pt): Pt =>
    options.camera === "plan"
      ? { x: p.x, y: -p.y }
      : { x: (p.x - p.y) * Math.SQRT1_2, y: -(p.x + p.y) * Math.SQRT1_2 * squash };
  const all = region.towns.flatMap((t) => t.outline.map(project));
  const pad = 40;
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const maxY = Math.max(...all.map((p) => p.y)) + pad;
  // A shared scale (units per pixel) keeps sheets comparable; the canvas then grows to fit.
  const scale = options.scale ?? options.width / (maxX - minX);
  const header = 64;
  const width = Math.max(options.width, Math.ceil((maxX - minX) * scale));
  const height = Math.ceil((maxY - minY) * scale) + header;
  const px = (p: Pt) => {
    const q = project(p);
    return `${((q.x - minX) * scale).toFixed(1)},${((q.y - minY) * scale + header).toFixed(1)}`;
  };
  const poly = (pts: Pt[]) => `M${pts.map(px).join("L")}Z`;
  const line = (pts: Pt[]) => `M${pts.map(px).join("L")}`;
  const out: string[] = [`<rect width="${width}" height="${height}" fill="${PAPER.country}"/>`];
  const sw = (w: number) => (w * scale * (options.camera === "plan" ? 1 : 0.85)).toFixed(2);

  for (const h of region.highways) {
    out.push(
      `<path d="${line(h.pts)}" fill="none" stroke="${PAPER.casing}" stroke-width="${sw(ROAD_WIDTH.highway + 3)}" stroke-linecap="round"/>`,
    );
    out.push(
      `<path d="${line(h.pts)}" fill="none" stroke="${PAPER.highway}" stroke-width="${sw(ROAD_WIDTH.highway)}" stroke-linecap="round"/>`,
    );
  }
  region.towns.forEach((town, ti) => {
    out.push(`<clipPath id="town${ti}"><path d="${poly(town.outline)}"/></clipPath>`);
    out.push(`<path d="${poly(town.outline)}" fill="${PAPER.ground}" stroke="#D3CCBD" stroke-width="${sw(4)}"/>`);
    out.push(`<g clip-path="url(#town${ti})">`);
    for (const b of town.blocks) {
      if (b.kind === "open") {
        // Reserve land: an empty plot in the district tint, outlined, ready for growth.
        out.push(
          `<path d="${poly(b.pts)}" fill="${oklch(0.94, 0.018, hueOf(b.district))}" stroke="${oklch(0.86, 0.03, hueOf(b.district))}" stroke-width="${Math.max(0.6, 0.8 * scale).toFixed(2)}" stroke-dasharray="${(3 * scale).toFixed(1)} ${(2 * scale).toFixed(1)}"/>`,
        );
        continue;
      }
      const fill = b.kind === "park" ? PAPER.park : oklch(0.915, 0.025, hueOf(b.district));
      out.push(`<path d="${poly(b.pts)}" fill="${fill}"/>`);
    }
    // Roads: all casings, then all fills, smallest class first, so junctions merge.
    const roads = [...town.roads].sort((a, b) => ORDER.indexOf(a.cls) - ORDER.indexOf(b.cls));
    for (const r of roads)
      out.push(
        `<path d="${line(r.pts)}" fill="none" stroke="${PAPER.casing}" stroke-width="${sw(ROAD_WIDTH[r.cls] + 2)}" stroke-linecap="butt" stroke-linejoin="round"/>`,
      );
    for (const r of roads)
      out.push(
        `<path d="${line(r.pts)}" fill="none" stroke="${PAPER.road}" stroke-width="${sw(ROAD_WIDTH[r.cls])}" stroke-linecap="butt" stroke-linejoin="round"/>`,
      );
    // Lots, with a low plinth in the dimetric view.
    const lots =
      options.camera === "plan"
        ? town.lots
        : [...town.lots].sort(
            (a, b) => centroid(b.pts).x + centroid(b.pts).y - (centroid(a.pts).x + centroid(a.pts).y),
          );
    for (const lot of lots) {
      const fill = oklch(
        lot.landUse === "source" ? 0.84 : 0.87,
        lot.landUse === "source" ? 0.05 : 0.025,
        hueOf(lot.district),
      );
      if (options.camera === "dimetric") {
        const lift = 3 * scale;
        out.push(
          `<path d="${poly(lot.pts)}" transform="translate(0 ${lift.toFixed(2)})" fill="${oklch(0.7, 0.04, hueOf(lot.district))}"/>`,
        );
      }
      out.push(
        `<path d="${poly(lot.pts)}" fill="${fill}" stroke="${PAPER.ground}" stroke-width="${Math.min(0.8, 0.35 * scale).toFixed(2)}"/>`,
      );
    }
    out.push("</g>");
  });

  // Labels: town names, then districts by mass; greedy collision avoidance.
  const placed: [number, number, number, number][] = [];
  const named = new Set<string>();
  const label = (at: Pt, text: string, size: number, weight: number, spacing: number) => {
    const [x, y] = px(at).split(",").map(Number);
    const w = text.length * size * (0.6 + spacing / size);
    const box: [number, number, number, number] = [x - w / 2, y - size / 2, x + w / 2, y + size / 2];
    if (box[0] < 0 || box[2] > width || box[1] < header) return;
    if (named.has(text.toLowerCase())) return;
    if (placed.some((p) => p[0] < box[2] && box[0] < p[2] && p[1] < box[3] && box[1] < p[3])) return;
    placed.push(box);
    named.add(text.toLowerCase());
    out.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="middle" dominant-baseline="central" fill="${PAPER.label}" stroke="${PAPER.ground}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`,
    );
  };
  for (const town of region.towns) label(centroid(town.outline), town.name.toUpperCase(), 24, 800, 3);
  const districts = region.towns.flatMap((t) => t.districts).sort((a, b) => b.mass - a.mass);
  const largestMass = Math.max(1, ...districts.map((d) => d.mass));
  const townArea = new Map(region.towns.map((t) => [t.name, area(t.outline)]));
  const largest = Math.max(...townArea.values());
  for (const d of districts.slice(0, 60)) {
    if (area(d.pts) < largest * 0.008 || area(d.pts) * scale * scale < 3000) continue;
    const major = d.depth === 1 || d.mass >= 0.08 * largestMass;
    label(centroid(d.pts), major ? d.name.toUpperCase() : d.name, major ? 14 : 11, major ? 700 : 600, major ? 1.5 : 0);
  }

  out.push(`<rect width="${width}" height="${header}" fill="#FFFFFF"/>`);
  out.push(`<text x="20" y="28" font-size="22" font-weight="700" fill="${PAPER.label}">${options.title}</text>`);
  out.push(`<text x="20" y="52" font-size="15" fill="#4A4A55">${options.subtitle}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Noto Sans, DejaVu Sans, sans-serif">${out.join("")}</svg>`;
}
