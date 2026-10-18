// The viewer's camera and labels as plain maths: views, projection, fitting, keys and decluttering. No WebGL.
import type { Label, Scene } from "@citymap/scene";

type Vec = readonly [number, number, number];

/** How the map is seen: straight down (plan), or from 30° up and 45° round with buildings standing. */
export type Mode = "plan" | "buildings";

/** Where the camera looks from (a unit vector to the eye), and the world directions of screen right and screen up. */
export interface Basis {
  readonly eye: Vec;
  readonly up: Vec;
  readonly right: Vec;
  readonly screenUp: Vec;
}

/**
 * A view: the ground point at the centre of the screen, and pixels per street width; in the Buildings view also how far
 * round it looks from south (`yaw`) and how far up from the ground (`tilt`), 45° and 30° unless turned.
 */
export interface View {
  readonly centre: { readonly x: number; readonly z: number };
  readonly zoom: number;
  readonly yaw?: number;
  readonly tilt?: number;
}

/** How the Buildings view is turned: round from south, and up from the ground, in radians. */
export interface Turn {
  readonly yaw: number;
  readonly tilt: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec): Vec => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The Buildings view's camera: this far above the ground, and this far round from south. */
export const ELEVATION = (30 * Math.PI) / 180;
export const YAW = (45 * Math.PI) / 180;

/** The Buildings view tilts no lower than this over the ground, and no higher than nearly straight down. */
export const TILT_MIN = (15 * Math.PI) / 180;
export const TILT_MAX = (85 * Math.PI) / 180;
/** Q and E turn the Buildings view this far round; Page Up and Page Down tilt it this far. */
export const KEY_TURN = (15 * Math.PI) / 180;
export const KEY_TILT = (10 * Math.PI) / 180;
/** A drag turns the view this many radians a pixel. */
export const DRAG_TURN = 0.005;

const PLAN: Basis = { eye: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0], screenUp: [0, 0, -1] };

/** The Buildings view's directions, looking from `tilt` up and `yaw` round from south. */
function turnedBasis(yaw: number, tilt: number): Basis {
  const eye: Vec = [Math.cos(tilt) * Math.sin(yaw), Math.sin(tilt), Math.cos(tilt) * Math.cos(yaw)];
  const right = unit(cross([-eye[0], -eye[1], -eye[2]], [0, 1, 0]));
  return { eye, up: [0, 1, 0], right, screenUp: cross(right, [-eye[0], -eye[1], -eye[2]]) };
}
const BUILDINGS = turnedBasis(YAW, ELEVATION);

/**
 * The camera's directions: plan looks straight down with north up; the Buildings view from 30° up and 45° round, or as
 * the view is turned.
 */
export function basis(mode: Mode = "plan", turn?: Partial<Turn>): Basis {
  if (mode === "plan") return PLAN;
  const yaw = turn?.yaw ?? YAW;
  const tilt = turn?.tilt ?? ELEVATION;
  return yaw === YAW && tilt === ELEVATION ? BUILDINGS : turnedBasis(yaw, tilt);
}

/** The view turned round by `yaw` and tilted by `tilt` (radians), the tilt kept between its limits. */
export const turned = (view: View, yaw: number, tilt: number): View => ({
  ...view,
  yaw: (view.yaw ?? YAW) + yaw,
  tilt: Math.max(TILT_MIN, Math.min(TILT_MAX, (view.tilt ?? ELEVATION) + tilt)),
});

/** The view zoomed by a factor about a point on screen, which stays under the pointer. */
export function zoomAt(
  view: View,
  viewport: Viewport,
  screen: { x: number; y: number },
  factor: number,
  mode: Mode = "plan",
): View {
  const at = unproject(view, viewport, screen, mode);
  return {
    ...view,
    zoom: view.zoom * factor,
    centre: { x: at.x + (view.centre.x - at.x) / factor, z: at.z + (view.centre.z - at.z) / factor },
  };
}

/** A world point on screen, in pixels from the top left: in plan, east is right and south is down. */
export function project(view: View, viewport: Viewport, p: { x: number; y: number; z: number }, mode: Mode = "plan") {
  const b = basis(mode, view);
  const d: Vec = [p.x - view.centre.x, p.y, p.z - view.centre.z];
  return {
    x: viewport.width / 2 + dot(d, b.right) * view.zoom,
    y: viewport.height / 2 - dot(d, b.screenUp) * view.zoom,
  };
}

/** How far, in pixels, the cards over the map reach in from each edge. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The part of the map the cards leave free. */
const freeOf = (viewport: Viewport, insets: Insets): Viewport => ({
  width: Math.max(1, viewport.width - insets.left - insets.right),
  height: Math.max(1, viewport.height - insets.top - insets.bottom),
});

/** A view shifted so what was at the viewport's centre sits at the centre of the free part. */
export const framed = (view: View, insets: Insets, mode: Mode = "plan"): View =>
  pan(view, (insets.right - insets.left) / 2, (insets.top - insets.bottom) / 2, mode);

/** The view that centres the city in the map the cards leave free, and fills nine tenths of it, turned as asked. */
export function fit(
  bounds: Scene["bounds"],
  whole: Viewport,
  insets: Insets = NO_INSETS,
  mode: Mode = "plan",
  turn: Partial<Turn> = {},
): View {
  const viewport = freeOf(whole, insets);
  const centre = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const b = basis(mode, turn);
  let wide = 0;
  let tall = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const z of [bounds.min.z, bounds.max.z]) {
      const d: Vec = [x - centre.x, 0, z - centre.z];
      wide = Math.max(wide, 2 * Math.abs(dot(d, b.right)));
      tall = Math.max(tall, 2 * Math.abs(dot(d, b.screenUp)));
    }
  const zoom =
    wide === 0 && tall === 0
      ? 1
      : FIT_SHARE * Math.min(viewport.width / (wide || tall), viewport.height / (tall || wide));
  // Only the turn is kept: a view passed as one brings its own centre and zoom, which fitting replaces.
  const kept = {
    ...(turn.yaw === undefined ? {} : { yaw: turn.yaw }),
    ...(turn.tilt === undefined ? {} : { tilt: turn.tilt }),
  };
  return framed({ centre, zoom, ...kept }, insets, mode);
}

/** A view moved along the ground by a screen distance in pixels (right and up). */
export function pan(view: View, dx: number, dy: number, mode: Mode = "plan"): View {
  const b = basis(mode, view);
  const ground = unit([b.screenUp[0], 0, b.screenUp[2]]);
  // Moving the centre along the ground's up shifts the screen by this much per unit.
  const along = dot(ground, b.screenUp);
  const right = dx / view.zoom;
  const up = dy / view.zoom / along;
  return {
    ...view,
    centre: {
      x: view.centre.x + b.right[0] * right + ground[0] * up,
      z: view.centre.z + b.right[2] * right + ground[2] * up,
    },
  };
}

/** An arrow pans this share of the view. */
export const PAN_SHARE = 0.1;
/** + and - zoom by this factor. */
export const KEY_ZOOM = 1.25;
/** A fitted city fills this share of the map, leaving a margin round it. */
export const FIT_SHARE = 0.9;

/**
 * The view after a key: arrows pan by `PAN_SHARE`, + and - zoom by `KEY_ZOOM`, 0 fits; in the Buildings view Q and E turn
 * it by `KEY_TURN` and Page Up and Page Down tilt it by `KEY_TILT`; null for any other key.
 */
export function onKey(
  key: string,
  view: View,
  viewport: Viewport,
  bounds: Scene["bounds"],
  insets: Insets = NO_INSETS,
  mode: Mode = "plan",
): View | null {
  switch (key) {
    case "ArrowRight":
      return pan(view, viewport.width * PAN_SHARE, 0, mode);
    case "ArrowLeft":
      return pan(view, -viewport.width * PAN_SHARE, 0, mode);
    case "ArrowUp":
      return pan(view, 0, viewport.height * PAN_SHARE, mode);
    case "ArrowDown":
      return pan(view, 0, -viewport.height * PAN_SHARE, mode);
    case "+":
    case "=":
      return { ...view, zoom: view.zoom * KEY_ZOOM };
    case "-":
      return { ...view, zoom: view.zoom / KEY_ZOOM };
    case "0":
      return fit(bounds, viewport, insets, mode, view);
    case "q":
    case "Q":
      return mode === "buildings" ? turned(view, -KEY_TURN, 0) : null;
    case "e":
    case "E":
      return mode === "buildings" ? turned(view, KEY_TURN, 0) : null;
    case "PageUp":
      return mode === "buildings" ? turned(view, 0, KEY_TILT) : null;
    case "PageDown":
      return mode === "buildings" ? turned(view, 0, -KEY_TILT) : null;
    default:
      return null;
  }
}

/** A label placed on screen: its centre in pixels. */
export interface Placed extends Label {
  readonly left: number;
  readonly top: number;
}

const FONT: Readonly<Record<Label["size"], number>> = { town: 20, district: 13, minor: 11 };
/** A character's width in ems: the face's average, plus the label's letter spacing (globals.css). */
const ADVANCE: Readonly<Record<Label["size"], number>> = { town: 0.62 + 0.15, district: 0.62 + 0.08, minor: 0.62 };

/** A district's name shows once its land on screen is at least this share of the name's width. */
export const LABEL_FIT = 0.6;
/** A name is not shown again within this many pixels of where it already is. */
export const REPEAT_PX = 240;

/**
 * The labels that fit, in order: each kept only if it lies inside the viewport, a district's land is wide enough on
 * screen for its name, the same name (in any letter case) is not already shown nearby, and it is clear of every one kept
 * before.
 */
export function declutter(labels: readonly Label[], view: View, viewport: Viewport, mode: Mode = "plan"): Placed[] {
  const kept: Placed[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const label of labels) {
    const at = project(view, viewport, { x: label.x, y: 0, z: label.z }, mode);
    const size = FONT[label.size];
    const width = label.text.length * size * ADVANCE[label.size];
    const half = (width + 8) / 2;
    const box: [number, number, number, number] = [at.x - half, at.y - size / 2 - 3, at.x + half, at.y + size / 2 + 3];
    if (box[0] < 0 || box[1] < 0 || box[2] > viewport.width || box[3] > viewport.height) continue;
    if (label.size !== "town" && label.extent * view.zoom < width * LABEL_FIT) continue;
    const name = label.text.toLowerCase();
    if (kept.some((k) => k.text.toLowerCase() === name && Math.hypot(k.left - at.x, k.top - at.y) < REPEAT_PX))
      continue;
    if (boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
    boxes.push(box);
    kept.push({ ...label, left: at.x, top: at.y });
  }
  return kept;
}

/** The map point under a screen point: where the view ray meets the plane at a height (the ground by default). */
export function unproject(
  view: View,
  viewport: Viewport,
  screen: { x: number; y: number },
  mode: Mode = "plan",
  height = 0,
) {
  const b = basis(mode, view);
  const sx = (screen.x - viewport.width / 2) / view.zoom;
  const sy = (viewport.height / 2 - screen.y) / view.zoom;
  // The point on the camera's plane through the centre, then along the view ray down to the height.
  const p = [
    view.centre.x + b.right[0] * sx + b.screenUp[0] * sy,
    b.right[1] * sx + b.screenUp[1] * sy,
    view.centre.z + b.right[2] * sx + b.screenUp[2] * sy,
  ] as const;
  const t = (p[1] - height) / b.eye[1];
  return { x: p[0] - b.eye[0] * t, z: p[2] - b.eye[2] * t };
}
