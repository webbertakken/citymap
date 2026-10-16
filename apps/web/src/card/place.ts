// Where the hover card goes: beside the pointer, by its measured size, wholly inside the map and never over the pointer.

/** The card's distance from the pointer, in pixels. */
export const CARD_GAP = 16;
/** The card keeps this far inside the map's edges, in pixels. */
export const CARD_MARGIN = 8;

interface Point {
  readonly x: number;
  readonly y: number;
}
interface Size {
  readonly width: number;
  readonly height: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * Right of and below the pointer; flipped to the left or above where it would cross an edge; nudged inside the map;
 * and, when nudging puts it over the pointer, moved to whichever side of the pointer holds it whole.
 */
export function placeCard(pointer: Point, card: Size, map: Size): { left: number; top: number } {
  const { width: w, height: h } = card;
  const right = map.width - CARD_MARGIN;
  const bottom = map.height - CARD_MARGIN;
  let left = pointer.x + CARD_GAP;
  if (left + w > right) left = pointer.x - CARD_GAP - w;
  let top = pointer.y + CARD_GAP;
  if (top + h > bottom) top = pointer.y - CARD_GAP - h;
  left = clamp(left, CARD_MARGIN, right - w);
  top = clamp(top, CARD_MARGIN, bottom - h);
  // Too large for the map: the top left margin.
  left = Math.max(CARD_MARGIN, left);
  top = Math.max(CARD_MARGIN, top);
  const near = CARD_GAP / 2;
  const covers =
    pointer.x >= left - near && pointer.x <= left + w + near && pointer.y >= top - near && pointer.y <= top + h + near;
  if (!covers) return { left, top };
  const whole = (at: { left: number; top: number }) =>
    at.left >= CARD_MARGIN && at.left + w <= right && at.top >= CARD_MARGIN && at.top + h <= bottom;
  const beside = [
    { left: pointer.x - CARD_GAP - w, top },
    { left: pointer.x + CARD_GAP, top },
    { left, top: pointer.y - CARD_GAP - h },
    { left, top: pointer.y + CARD_GAP },
  ].find(whole);
  return beside ?? { left, top };
}
