import { describe, expect, it } from "vitest";
import { CARD_GAP, CARD_MARGIN, placeCard } from "./place";

const map = { width: 1000, height: 800 };
const card = { width: 360, height: 220 };

/** The card's box lies wholly inside the map, within its margins. */
const inside = (at: { left: number; top: number }, size = card) =>
  at.left >= CARD_MARGIN &&
  at.top >= CARD_MARGIN &&
  at.left + size.width <= map.width - CARD_MARGIN &&
  at.top + size.height <= map.height - CARD_MARGIN;

/** The pointer lies on the card's box. */
const covers = (pointer: { x: number; y: number }, at: { left: number; top: number }, size = card) =>
  pointer.x >= at.left && pointer.x <= at.left + size.width && pointer.y >= at.top && pointer.y <= at.top + size.height;

describe("placeCard", () => {
  it("sits right of and below the pointer where there is room", () => {
    expect(placeCard({ x: 100, y: 100 }, card, map)).toEqual({ left: 100 + CARD_GAP, top: 100 + CARD_GAP });
  });

  it("flips left near the right edge and above near the bottom", () => {
    expect(placeCard({ x: 900, y: 100 }, card, map)).toEqual({ left: 900 - CARD_GAP - 360, top: 116 });
    expect(placeCard({ x: 100, y: 700 }, card, map)).toEqual({ left: 116, top: 700 - CARD_GAP - 220 });
    expect(placeCard({ x: 990, y: 790 }, card, map)).toEqual({ left: 990 - CARD_GAP - 360, top: 790 - CARD_GAP - 220 });
  });

  it("lies wholly inside the map and never over the pointer, at every edge and corner", () => {
    const xs = [0, 4, 200, 500, 640, 800, 996, 1000];
    const ys = [0, 4, 120, 400, 580, 700, 796, 800];
    for (const x of xs)
      for (const y of ys) {
        const at = placeCard({ x, y }, card, map);
        expect(inside(at), `inside at ${x},${y}`).toBe(true);
        expect(covers({ x, y }, at), `clear of the pointer at ${x},${y}`).toBe(false);
      }
  });

  it("is nudged inside when flipping alone would cross the other edge", () => {
    // Near the top, a tall card flipped above would leave the map: it is nudged down, beside the pointer.
    const tall = { width: 300, height: 700 };
    const at = placeCard({ x: 500, y: 400 }, tall, map);
    expect(at).toEqual({ left: 516, top: CARD_MARGIN });
    expect(inside(at, tall)).toBe(true);
  });

  it("moves beside the pointer when nudging would put it over the pointer", () => {
    // A map barely wider than the card: neither side holds it, so it goes above or below the pointer.
    const narrow = { width: 400, height: 800 };
    const at = placeCard({ x: 200, y: 600 }, card, narrow);
    expect(at.left).toBe(CARD_MARGIN);
    expect(at.top).toBe(600 - CARD_GAP - 220);
    expect(placeCard({ x: 200, y: 100 }, card, narrow)).toEqual({ left: CARD_MARGIN, top: 100 + CARD_GAP });
  });

  it("puts a card larger than the map at the top left margin", () => {
    expect(placeCard({ x: 50, y: 50 }, { width: 2000, height: 2000 }, map)).toEqual({
      left: CARD_MARGIN,
      top: CARD_MARGIN,
    });
  });

  it("stays where nudging put it when no side holds it whole", () => {
    const small = { width: 380, height: 260 };
    const at = placeCard({ x: 190, y: 130 }, card, small);
    expect(at).toEqual({ left: CARD_MARGIN, top: CARD_MARGIN });
  });
});
