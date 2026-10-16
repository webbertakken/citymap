// The viewer's camera and labels as plain maths: views, projection, fitting, keys and decluttering. No WebGL.
import type { Label, Scene } from "@citymap/scene";

export type Mode = "dimetric" | "plan";
type Vec = readonly [number, number, number];

/** Where the camera looks from (a unit vector to the eye), and the world directions of screen right and screen up. */
export interface Basis {
  readonly eye: Vec;
  readonly up: Vec;
  readonly right: Vec;
  readonly screenUp: Vec;
}

/** A view: plan or dimetric, the ground point at the centre of the screen, and pixels per street width. */
export interface View {
  readonly mode: Mode;
  readonly centre: { readonly x: number; readonly z: number };
  readonly zoom: number;
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

const ELEVATION = (30 * Math.PI) / 180;
const YAW = (45 * Math.PI) / 180;

/** The camera's directions: plan looks straight down with north up; dimetric from 30° up and 45° round. */
export function basis(mode: Mode): Basis {
  if (mode === "plan") return { eye: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0], screenUp: [0, 0, -1] };
  const eye: Vec = [Math.cos(ELEVATION) * Math.sin(YAW), Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.cos(YAW)];
  const forward: Vec = [-eye[0], -eye[1], -eye[2]];
  const right = unit(cross(forward, [0, 1, 0]));
  return { eye, up: [0, 1, 0], right, screenUp: cross(right, forward) };
}

/** A world point on screen, in pixels from the top left. */
export function project(view: View, viewport: Viewport, p: { x: number; y: number; z: number }) {
  const b = basis(view.mode);
  const d: Vec = [p.x - view.centre.x, p.y, p.z - view.centre.z];
  return {
    x: viewport.width / 2 + dot(d, b.right) * view.zoom,
    y: viewport.height / 2 - dot(d, b.screenUp) * view.zoom,
  };
}

/** The view that centres the city and fills nine tenths of the viewport with it. */
export function fit(bounds: Scene["bounds"], mode: Mode, viewport: Viewport): View {
  const centre = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const b = basis(mode);
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
  return { mode, centre, zoom };
}

/** A view moved along the ground by a screen distance in pixels (right and up). */
export function pan(view: View, dx: number, dy: number): View {
  const b = basis(view.mode);
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

/** The view after a key: arrows pan by `PAN_SHARE`, + and - zoom by `KEY_ZOOM`, 0 fits; null for any other key. */
export function onKey(key: string, view: View, viewport: Viewport, bounds: Scene["bounds"]): View | null {
  switch (key) {
    case "ArrowRight":
      return pan(view, viewport.width * PAN_SHARE, 0);
    case "ArrowLeft":
      return pan(view, -viewport.width * PAN_SHARE, 0);
    case "ArrowUp":
      return pan(view, 0, viewport.height * PAN_SHARE);
    case "ArrowDown":
      return pan(view, 0, -viewport.height * PAN_SHARE);
    case "+":
    case "=":
      return { ...view, zoom: view.zoom * KEY_ZOOM };
    case "-":
      return { ...view, zoom: view.zoom / KEY_ZOOM };
    case "0":
      return fit(bounds, view.mode, viewport);
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

/** A district's name shows once its land on screen is at least this share of the name's width. */
export const LABEL_FIT = 0.6;
/** A name is not shown again within this many pixels of where it already is. */
export const REPEAT_PX = 240;

/**
 * The labels that fit, in order: each kept only if it lies inside the viewport, a district's land is wide enough on
 * screen for its name, the same name is not already shown nearby, and it is clear of every one kept before.
 */
export function declutter(labels: readonly Label[], view: View, viewport: Viewport): Placed[] {
  const kept: Placed[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const label of labels) {
    const at = project(view, viewport, { x: label.x, y: 0, z: label.z });
    const size = FONT[label.size];
    const width = label.text.length * size * 0.62;
    const half = (width + 8) / 2;
    const box: [number, number, number, number] = [at.x - half, at.y - size / 2 - 3, at.x + half, at.y + size / 2 + 3];
    if (box[0] < 0 || box[1] < 0 || box[2] > viewport.width || box[3] > viewport.height) continue;
    if (label.size !== "town" && label.extent * view.zoom < width * LABEL_FIT) continue;
    if (kept.some((k) => k.text === label.text && Math.hypot(k.left - at.x, k.top - at.y) < REPEAT_PX)) continue;
    if (boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
    boxes.push(box);
    kept.push({ ...label, left: at.x, top: at.y });
  }
  return kept;
}

/** The map point under a screen point: where the view ray meets the plane at the given height. */
export function unproject(view: View, viewport: Viewport, screen: { x: number; y: number }, height: number) {
  const b = basis(view.mode);
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
