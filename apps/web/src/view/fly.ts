// Flying the view to a place: where it ends, and the eased steps between.
import { NO_INSETS, framed, type Insets, type View, type Viewport } from "./view";

/** A place flown to fills this share of the map's shorter side. */
export const FLY_SHARE = 0.4;
/** A place smaller than this many scene units (a block's worth) is shown as if it were this large, with neighbours. */
export const FLY_MIN_EXTENT = 6;
/** How long a flight takes, in milliseconds; none under reduced motion. */
export const FLY_MS = 300;

/** The view centring a place in the free map, zoomed so it fills its share, never further out than the fitted view. */
export function flyTo(
  view: View,
  viewport: Viewport,
  place: { readonly x: number; readonly z: number; readonly extent: number },
  fitted: View,
  insets: Insets = NO_INSETS,
): View {
  const free = Math.min(viewport.width - insets.left - insets.right, viewport.height - insets.top - insets.bottom);
  const zoom = (Math.max(1, free) * FLY_SHARE) / Math.max(place.extent, FLY_MIN_EXTENT);
  return framed({ mode: view.mode, centre: { x: place.x, z: place.z }, zoom: Math.max(zoom, fitted.zoom) }, insets);
}

/** Cubic ease in and out: still at both ends. */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The view a share `t` of the way: the centre in step, the zoom by equal ratios, so the scale changes evenly. */
export const between = (from: View, to: View, t: number): View => ({
  mode: to.mode,
  centre: {
    x: from.centre.x + (to.centre.x - from.centre.x) * t,
    z: from.centre.z + (to.centre.z - from.centre.z) * t,
  },
  zoom: from.zoom * (to.zoom / from.zoom) ** t,
});
