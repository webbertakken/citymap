// Where the floating cards cover the map, so a fitted city or a found place lands in the part left free.
// The sizes follow the stylesheet (globals.css): its breakpoints, gaps, card heights and the drawer's width.
import type { Insets, Viewport } from "./view";

/** At or below this width the drawer is a bottom sheet (the stylesheet's phone layout). */
export const NARROW = 760;
/** At or below this width the search sits under the title card. */
export const MEDIUM = 1100;
/** The title row: 16 px gap, a 76 px title card, 8 px clear. */
const TITLE_ROW = 100;
/** The title row with the search under it: 16 + 76 + 8 + 48 px, and 8 px clear. */
const SEARCH_ROW = 156;
/** On a phone: 8 + 68 px title, 8 + 48 px search, 8 px clear. */
const PHONE_TOP = 140;
/** On a phone: the details button and its gaps. */
const PHONE_BOTTOM = 64;
/** The drawer: 320 px and a 16 px gap either side. */
const DRAWER = 352;

/** How far the cards reach in, given the map's size and the drawer: open, closed, or null for the screen's default. */
export function insetsFor(viewport: Viewport, drawer: boolean | null): Insets {
  if (viewport.width <= NARROW)
    return { top: PHONE_TOP, right: 0, bottom: drawer === true ? viewport.height / 2 : PHONE_BOTTOM, left: 0 };
  return {
    top: viewport.width <= MEDIUM ? SEARCH_ROW : TITLE_ROW,
    right: drawer === false ? 0 : DRAWER,
    bottom: 0,
    left: 0,
  };
}
