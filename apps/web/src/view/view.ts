// The viewer's camera and labels as plain maths: views, projection, fitting, keys and decluttering. No WebGL.
import type { Label, Scene } from "@citymap/scene";

type Vec = readonly [number, number, number];

/** Where the camera looks from (a unit vector to the eye), and the world directions of screen right and screen up. */
export interface Basis {
  readonly eye: Vec;
  readonly up: Vec;
  readonly right: Vec;
  readonly screenUp: Vec;
}

/** A view: the ground point at the centre of the screen, and pixels per street width. */
export interface View {
  readonly centre: { readonly x: number; readonly z: number };
  readonly zoom: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const PLAN: Basis = { eye: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0], screenUp: [0, 0, -1] };

/** The camera's directions: straight down with north up (the viewer shows plan view only). */
export const basis = (): Basis => PLAN;

/** A world point on screen, in pixels from the top left: east is right, south is down. */
export function project(view: View, viewport: Viewport, p: { x: number; y: number; z: number }) {
  return {
    x: viewport.width / 2 + (p.x - view.centre.x) * view.zoom,
    y: viewport.height / 2 + (p.z - view.centre.z) * view.zoom,
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
export const framed = (view: View, insets: Insets): View =>
  pan(view, (insets.right - insets.left) / 2, (insets.top - insets.bottom) / 2);

/** The view that centres the city in the map the cards leave free, and fills nine tenths of it. */
export function fit(bounds: Scene["bounds"], whole: Viewport, insets: Insets = NO_INSETS): View {
  const viewport = freeOf(whole, insets);
  const centre = { x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const wide = bounds.max.x - bounds.min.x;
  const tall = bounds.max.z - bounds.min.z;
  const zoom =
    wide === 0 && tall === 0
      ? 1
      : FIT_SHARE * Math.min(viewport.width / (wide || tall), viewport.height / (tall || wide));
  return framed({ centre, zoom }, insets);
}

/** A view moved along the ground by a screen distance in pixels (right and up). */
export function pan(view: View, dx: number, dy: number): View {
  return { ...view, centre: { x: view.centre.x + dx / view.zoom, z: view.centre.z - dy / view.zoom } };
}

/** An arrow pans this share of the view. */
export const PAN_SHARE = 0.1;
/** + and - zoom by this factor. */
export const KEY_ZOOM = 1.25;
/** A fitted city fills this share of the map, leaving a margin round it. */
export const FIT_SHARE = 0.9;

/** The view after a key: arrows pan by `PAN_SHARE`, + and - zoom by `KEY_ZOOM`, 0 fits; null for any other key. */
export function onKey(
  key: string,
  view: View,
  viewport: Viewport,
  bounds: Scene["bounds"],
  insets: Insets = NO_INSETS,
): View | null {
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
      return fit(bounds, viewport, insets);
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
export function declutter(labels: readonly Label[], view: View, viewport: Viewport): Placed[] {
  const kept: Placed[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const label of labels) {
    const at = project(view, viewport, { x: label.x, y: 0, z: label.z });
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

/** The ground point under a screen point. */
export function unproject(view: View, viewport: Viewport, screen: { x: number; y: number }) {
  return {
    x: view.centre.x + (screen.x - viewport.width / 2) / view.zoom,
    z: view.centre.z + (screen.y - viewport.height / 2) / view.zoom,
  };
}
