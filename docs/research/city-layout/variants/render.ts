// Renders a plan to SVG in one of three styles (visual-style-and-rendering.md §5) and three cameras (§3).
import type { LandUse } from "./land-use";
import { fnv1a, type Plan, type Rect, type RoadClass } from "./layout";

export type Style = "paper-atlas" | "beck-schematic" | "nolli-noir";
export type Camera = "plan" | "dimetric" | "isometric";
export type Edges = "meaningful" | "aesthetic";

export interface Scene {
  plan: Plan;
  coasts: Rect[];
  edges: Edges;
  title: string;
  subtitle: string;
}

export interface RenderOptions {
  style: Style;
  camera: Camera;
  width: number;
}

type Point = [number, number];

// OKLCH to sRGB hex (Björn Ottosson's Oklab matrices).
export function oklch(l: number, c: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    linear
      .map((x) => {
        const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

// District hues skip the park greens (95° to 165°) so a tint never reads as a park.
const hueOf = (district: string) => {
  const h = district === "" ? 60 : fnv1a(district) % 290;
  return h >= 95 ? h + 70 : h;
};
const PARK_USES = new Set<LandUse>(["docs", "assets"]);
const GREY_USES = new Set<LandUse>(["fixtures", "generated", "vendored"]);

const PAPER = {
  ground: "#F2EEE6",
  water: "#A9CCE3",
  waterline: "#8DB6D1",
  park: "#C8DDB0",
  casing: "#C9C2B4",
  road: "#FFFFFF",
  label: "#1E1E24",
  boundary: "#8A8172",
};
const LABEL_PX: Record<RoadClass, number> = { boulevard: 22, avenue: 17, collector: 13, street: 11, lane: 10 };
const RANK: Record<RoadClass, number> = { boulevard: 4, avenue: 3, collector: 2, street: 1, lane: 0 };

const ELEVATION: Record<Camera, number> = { plan: 90, dimetric: 30, isometric: 35.264 };

function projector(camera: Camera): (p: Point) => Point {
  if (camera === "plan") return ([x, y]) => [x, -y];
  const squash = Math.sin((ELEVATION[camera] * Math.PI) / 180);
  const c = Math.SQRT1_2;
  return ([x, y]) => [(x - y) * c, -(x + y) * c * squash];
}

const corners = (r: Rect): Point[] => [
  [r.x0, r.y0],
  [r.x1, r.y0],
  [r.x1, r.y1],
  [r.x0, r.y1],
];

const hull = (points: Point[]): Point[] => {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function render(scene: Scene, options: RenderOptions): string {
  const project = projector(options.camera);
  const lift = options.camera === "plan" ? 0 : Math.cos((ELEVATION[options.camera] * Math.PI) / 180);
  const poly = (r: Rect, grow = 0): Point[] =>
    corners({ x0: r.x0 - grow, y0: r.y0 - grow, x1: r.x1 + grow, y1: r.y1 + grow }).map(project);

  // Screen bounds from coasts and plan bounds.
  const extents = [...scene.coasts, scene.plan.bounds].flatMap((r) => poly(r, 12));
  const minX = Math.min(...extents.map((p) => p[0]));
  const maxX = Math.max(...extents.map((p) => p[0]));
  const minY = Math.min(...extents.map((p) => p[1]));
  const maxY = Math.max(...extents.map((p) => p[1]));
  const scale = options.width / (maxX - minX);
  const header = 64;
  const height = Math.ceil((maxY - minY) * scale) + header;
  const toPx = ([x, y]: Point): Point => [(x - minX) * scale, (y - minY) * scale + header];
  const path = (points: Point[]) => "M" + points.map((p) => toPx(p).map(fmt).join(",")).join("L") + "Z";

  const out: string[] = [];
  const s = options.style;
  const ground = s === "beck-schematic" ? "#FFFFFF" : PAPER.ground;
  const water = s === "nolli-noir" ? "#DAD4C8" : s === "beck-schematic" ? "#CFE3F2" : PAPER.water;
  out.push(`<rect width="${options.width}" height="${height}" fill="${water}"/>`);

  // Land masses with atlas waterlines.
  for (const coast of scene.coasts) {
    if (s === "paper-atlas") {
      for (const [grow, opacity] of [
        [9, 0.35],
        [6, 0.6],
      ] as const)
        out.push(
          `<path d="${path(poly(coast, grow))}" fill="none" stroke="${PAPER.waterline}" stroke-width="${fmt(0.6 * scale)}" opacity="${opacity}"/>`,
        );
    }
    out.push(`<path d="${path(poly(coast, 3))}" fill="${ground}"/>`);
  }

  const tint = (district: string, l: number, c: number) => oklch(l, c, hueOf(district));

  // District grounds.
  if (s !== "nolli-noir")
    for (const d of scene.plan.districts)
      out.push(
        `<path d="${path(poly(d))}" fill="${s === "beck-schematic" ? tint(d.district, 0.86, 0.09) : tint(d.district, 0.95, 0.025)}"/>`,
      );
  else
    for (const d of scene.plan.districts)
      out.push(
        `<path d="${path(poly(d))}" fill="none" stroke="${PAPER.boundary}" stroke-width="${fmt(Math.max(0.6, 0.4 * scale))}"/>`,
      );

  // Blocks (pavement) in the atlas style.
  if (s === "paper-atlas")
    for (const b of scene.plan.blocks)
      out.push(`<path d="${path(poly(b, 0.6))}" fill="${tint(b.district, 0.9, 0.02)}"/>`);

  // Roads: casing then fill (atlas), white gaps (Beck), paper gaps (Nolli).
  const roads = [...scene.plan.roads].sort((a, b) => RANK[a.cls] - RANK[b.cls]);
  if (s === "paper-atlas") for (const r of roads) out.push(`<path d="${path(poly(r, 0.7))}" fill="${PAPER.casing}"/>`);
  for (const r of roads) out.push(`<path d="${path(poly(r))}" fill="${s === "nolli-noir" ? ground : PAPER.road}"/>`);

  // Lots, with plinths in the projected cameras.
  const lotFill = (lot: Plan["lots"][number]) => {
    if (s === "nolli-noir") return PAPER.label;
    if (scene.edges === "meaningful" && PARK_USES.has(lot.landUse))
      return s === "beck-schematic" ? "#9CCB8A" : PAPER.park;
    if (s === "beck-schematic") return tint(lot.district, 0.8, 0.11);
    if (GREY_USES.has(lot.landUse)) return oklch(0.8, 0.01, hueOf(lot.district));
    if (lot.landUse === "tests" || lot.landUse === "examples") return tint(lot.district, 0.84, 0.035);
    return tint(lot.district, 0.88, 0.045);
  };
  const lots = scene.plan.lots;
  const order = options.camera === "plan" ? lots : [...lots].sort((a, b) => b.x1 + b.y1 - (a.x1 + a.y1));
  if (lift > 0) {
    for (const lot of order) {
      const top = poly(lot, -0.15);
      const h = (1 + lot.lotClass * 0.5) * lift;
      const side = hull([...top, ...top.map(([x, y]) => [x, y + h] as Point)]);
      out.push(
        `<path d="${path(side)}" fill="${s === "nolli-noir" ? "#000000" : oklch(0.72, 0.03, hueOf(lot.district))}"/>`,
      );
    }
  }
  const lotStroke =
    s === "paper-atlas" ? ` stroke="${PAPER.ground}" stroke-width="${fmt(Math.min(1, 0.25 * scale))}"` : "";
  for (const lot of order) {
    const top = poly(lot, -0.15).map(([x, y]) => [x, y] as Point);
    out.push(`<path d="${path(top)}" fill="${lotFill(lot)}"${lotStroke}${lot.ghost ? ' opacity="0.25"' : ""}/>`);
  }

  // Stations (Beck): circles where major streets begin.
  if (s === "beck-schematic")
    for (const r of scene.plan.roads.filter((r) => RANK[r.cls] >= 2)) {
      const [x, y] = toPx(project([r.x0, (r.y0 + r.y1) / 2]));
      out.push(
        `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${RANK[r.cls] * 2 + 2}" fill="#FFFFFF" stroke="${PAPER.label}" stroke-width="2"/>`,
      );
    }

  // Labels: priority by mass, greedy collision avoidance in screen space.
  const placed: Rect[] = [];
  const candidates = [...scene.plan.labels].sort((a, b) => b.mass - a.mass || (a.path < b.path ? -1 : 1));
  let count = 0;
  for (const label of candidates) {
    if (count >= 40 || label.mass < 3) break;
    const size = LABEL_PX[label.cls];
    const [x, y] = toPx(project([label.x, label.y]));
    const vertical = options.camera === "plan" && !label.horizontal;
    const w = label.text.length * size * 0.56;
    const box = vertical
      ? { x0: x - size / 2, y0: y - w / 2, x1: x + size / 2, y1: y + w / 2 }
      : { x0: x - w / 2, y0: y - size / 2, x1: x + w / 2, y1: y + size / 2 };
    if (box.x0 < 0 || box.x1 > options.width || box.y0 < header || box.y1 > height) continue;
    if (placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1)) continue;
    placed.push(box);
    count++;
    const halo = s === "beck-schematic" ? "#FFFFFF" : PAPER.ground;
    const weight = RANK[label.cls] >= 3 ? 700 : 600;
    out.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" ${vertical ? `transform="rotate(-90 ${fmt(x)} ${fmt(y)})" ` : ""}font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="central" fill="${PAPER.label}" stroke="${halo}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${escapeXml(label.text)}</text>`,
    );
  }

  out.push(`<rect width="${options.width}" height="${header}" fill="#FFFFFF"/>`);
  out.push(
    `<text x="20" y="28" font-size="22" font-weight="700" fill="${PAPER.label}">${escapeXml(scene.title)}</text>`,
  );
  out.push(`<text x="20" y="52" font-size="15" fill="#4A4A55">${escapeXml(scene.subtitle)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${height}" viewBox="0 0 ${options.width} ${height}" font-family="Noto Sans, DejaVu Sans, sans-serif">${out.join("")}</svg>`;
}
