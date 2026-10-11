import { ROAD_WIDTH, UNIT, centroid, area2, type City, type Pt, type RoadClass } from "@citymap/ground-plan";
import { THEMES, type ThemeName } from "./themes";

export type Camera = "plan" | "dimetric";

export interface RenderOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly theme?: ThemeName;
  readonly camera?: Camera;
  /** Width of the sheet in pixels; the height follows the city. */
  readonly width?: number;
  /** Lots painted in the alarm colour: for example the lots that moved since the previous frame. */
  readonly highlight?: ReadonlySet<string>;
  /** Colour lots and blocks by their district form instead of by district. */
  readonly colourBy?: "district" | "form";
}

const ORDER: readonly RoadClass[] = ["lane", "street", "collector", "avenue", "boulevard", "highway"];
const HEADER = 64;
const PAD = 40 * (UNIT / 8);

/** Text as SVG character data: repository names and paths are untrusted. */
export const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Draws a city as one SVG document in a theme, in plan or 2:1 dimetric view. */
export function renderCity(city: City, options: RenderOptions): string {
  const theme = THEMES[options.theme ?? "paper-atlas"];
  const dimetric = options.camera === "dimetric";
  const byForm = options.colourBy === "form";
  const project = (p: Pt) =>
    dimetric ? { x: (p.x - p.y) * Math.SQRT1_2, y: -(p.x + p.y) * Math.SQRT1_2 * 0.5 } : { x: p.x, y: -p.y };
  const extent = city.towns.flatMap((t) => t.outline.map(project));
  const xs = extent.map((p) => p.x);
  const ys = extent.map((p) => p.y);
  const minX = (xs.length ? Math.min(...xs) : 0) - PAD;
  const maxX = (xs.length ? Math.max(...xs) : 0) + PAD;
  const minY = (ys.length ? Math.min(...ys) : 0) - PAD;
  const maxY = (ys.length ? Math.max(...ys) : 0) + PAD;
  const width = options.width ?? 1600;
  const scale = width / (maxX - minX);
  const height = Math.ceil((maxY - minY) * scale) + HEADER;
  const px = (p: Pt) => {
    const q = project(p);
    return `${((q.x - minX) * scale).toFixed(1)},${((q.y - minY) * scale + HEADER).toFixed(1)}`;
  };
  const poly = (pts: readonly Pt[]) => `M${pts.map(px).join("L")}Z`;
  const line = (pts: readonly Pt[]) => `M${pts.map(px).join("L")}`;
  const sw = (w: number) => (w * scale * (dimetric ? 0.85 : 1)).toFixed(2);
  const thin = (w: number) => Math.max(0.5, w * scale * (UNIT / 8)).toFixed(2);
  const roadPath = (pts: readonly Pt[], cls: RoadClass, casing: boolean) =>
    `<path d="${line(pts)}" fill="none" stroke="${casing ? theme.casing : theme.road}" stroke-width="${sw(ROAD_WIDTH[cls] + (casing ? 16 : 0))}" stroke-linecap="butt" stroke-linejoin="round"/>`;
  const out: string[] = [`<rect width="${width}" height="${height}" fill="${theme.country}"/>`];

  city.towns.forEach((town, ti) => {
    const dash = town.old ? ` stroke-dasharray="${sw(80)} ${sw(48)}"` : "";
    out.push(`<clipPath id="town${ti}"><path d="${poly(town.outline)}"/></clipPath>`);
    out.push(
      `<path d="${poly(town.outline)}" fill="${theme.ground}" stroke="${theme.outline}" stroke-width="${sw(32)}"${dash}/>`,
    );
    out.push(`<g clip-path="url(#town${ti})">`);
    for (const b of town.blocks) {
      if (b.kind === "reserve") {
        const [fill, stroke] = theme.reserve(b.district);
        out.push(
          `<path d="${poly(b.pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${thin(0.8)}" stroke-dasharray="${thin(3)} ${thin(2)}"/>`,
        );
        continue;
      }
      const fill =
        b.kind === "park" || b.kind === "green"
          ? theme.park
          : b.kind === "plaza"
            ? theme.plaza
            : byForm
              ? theme.form(b.form ?? "polycentric", false)
              : theme.block(b.district);
      out.push(`<path d="${poly(b.pts)}" fill="${fill}"/>`);
    }
    for (const w of town.water)
      out.push(`<path d="${poly(w)}" fill="${theme.water}" stroke="${theme.waterline}" stroke-width="${thin(0.6)}"/>`);
    // Roads: every casing, then every fill, smallest class first, so junctions merge.
    const roads = [...town.roads].sort((a, b) => ORDER.indexOf(a.cls) - ORDER.indexOf(b.cls));
    for (const r of roads) out.push(roadPath(r.pts, r.cls, true));
    for (const r of roads) out.push(roadPath(r.pts, r.cls, false));
    const lots = dimetric
      ? [...town.lots].sort((a, b) => {
          const ca = centroid(a.pts);
          const cb = centroid(b.pts);
          return cb.x + cb.y - (ca.x + ca.y);
        })
      : town.lots;
    for (const lot of lots) {
      if (lot.vacant) {
        // A vacant lot keeps its place until renewal: an empty plot with a dashed edge.
        const [fill, stroke] = theme.reserve(lot.district);
        out.push(
          `<path d="${poly(lot.pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${thin(0.5)}" stroke-dasharray="${thin(1.5)} ${thin(1)}"/>`,
        );
        continue;
      }
      const marked = options.highlight?.has(lot.key) ?? false;
      const fill = marked
        ? "#E4572E"
        : byForm
          ? theme.form(lot.form ?? "polycentric", true)
          : theme.lot(lot.district, lot.use === "source");
      if (dimetric)
        out.push(
          `<path d="${poly(lot.pts)}" transform="translate(0 ${(24 * scale).toFixed(2)})" fill="${theme.plinth(lot.district)}"/>`,
        );
      out.push(
        `<path d="${poly(lot.pts)}" fill="${fill}" stroke="${marked ? "#5A1A0A" : theme.ground}" stroke-width="${Math.min(0.8, 2.8 * scale).toFixed(2)}"/>`,
      );
    }
    out.push("</g>");
  });
  // Highways continue the roads they join: same class, same casing and fill, over the town edges.
  for (const h of city.highways) out.push(roadPath(h.pts, h.cls, true));
  for (const h of city.highways) out.push(roadPath(h.pts, h.cls, false));

  // Labels: towns, then districts by mass; a label that would overlap one already placed is left out.
  const placed: [number, number, number, number][] = [];
  const named = new Set<string>();
  const label = (at: Pt, text: string, size: number, weight: number, spacing: number) => {
    const [x, y] = px(at).split(",").map(Number) as [number, number];
    const w = text.length * size * (0.6 + spacing / size);
    const box: [number, number, number, number] = [x - w / 2, y - size / 2, x + w / 2, y + size / 2];
    if (box[0] < 0 || box[2] > width || box[1] < HEADER || named.has(text.toLowerCase())) return;
    if (placed.some((p) => p[0] < box[2] && box[0] < p[2] && p[1] < box[3] && box[1] < p[3])) return;
    placed.push(box);
    named.add(text.toLowerCase());
    out.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="middle" dominant-baseline="central" fill="${theme.text}" stroke="${theme.halo}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${escapeText(text)}</text>`,
    );
  };
  for (const town of city.towns) label(centroid(town.outline), town.name.toUpperCase(), 24, 800, 3);
  const districts = city.towns.flatMap((t) => t.districts).sort((a, b) => b.massMille - a.massMille);
  const heaviest = Math.max(1, ...districts.map((d) => d.massMille));
  const largest = Math.max(1, ...city.towns.map((t) => area2(t.outline)));
  for (const d of districts.slice(0, 60)) {
    const a2 = area2(d.pts);
    if (a2 * 1000 < largest * 8 || (a2 / 2) * scale * scale < 3000) continue;
    const major = d.depth === 1 || d.massMille * 100 >= 8 * heaviest;
    label(centroid(d.pts), major ? d.name.toUpperCase() : d.name, major ? 14 : 11, major ? 700 : 600, major ? 1.5 : 0);
  }
  out.push(`<rect width="${width}" height="${HEADER}" fill="${theme.header}"/>`);
  out.push(
    `<text x="20" y="28" font-size="22" font-weight="700" fill="${theme.headerText}">${escapeText(options.title)}</text>`,
  );
  out.push(`<text x="20" y="52" font-size="15" fill="${theme.subText}">${escapeText(options.subtitle)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Noto Sans, DejaVu Sans, sans-serif">${out.join("")}</svg>`;
}
