// What the pointer is over, and the words that say so.
import { LOT_HEIGHT, pick, type Hit, type PickIndex } from "@citymap/scene";
import { unproject, type View, type Viewport } from "./view";

/** The height of a lot's top, where lots are drawn in the dimetric view. */
const LOT_TOP = 0.03 + LOT_HEIGHT;

/** The topmost thing under a screen point: lots where their tops are drawn, the rest on the ground. */
export function hitAt(index: PickIndex, view: View, viewport: Viewport, screen: { x: number; y: number }): Hit | null {
  const top = unproject(view, viewport, screen, LOT_TOP);
  const lot = pick(index, top.x, top.z);
  if (lot?.kind === "lot") return lot;
  const ground = unproject(view, viewport, screen, 0);
  return pick(index, ground.x, ground.z);
}

const USE: Readonly<Record<string, string>> = {
  source: "Source",
  config: "Configuration",
  assets: "Assets",
  ci: "CI and tools",
  docs: "Documentation",
  tests: "Tests",
  examples: "Examples",
  fixtures: "Fixtures",
  generated: "Generated",
  vendored: "Vendored",
};
const BLOCK: Readonly<Record<string, [string, string]>> = {
  reserve: ["Reserve plot", "Room to grow"],
  park: ["Park", "Documentation"],
  green: ["Green", "A hamlet's green"],
  plaza: ["Plaza", "Where a long road jogs"],
  built: ["Block", "Lots back to back"],
};

const where = (district: string | null, town: string) => (district ? `${district} · ${town}` : town);

/** A hit as a title and a few lines, for the hover card and the selection. */
export function describeHit(hit: Hit): { title: string; lines: string[] } {
  switch (hit.kind) {
    case "lot":
      return hit.vacant
        ? {
            title: "Vacant lot",
            lines: [
              "A deleted file's lot, kept until renewal",
              `Address ${hit.address}`,
              where(hit.district, hit.town),
            ],
          }
        : { title: hit.path, lines: [USE[hit.use]!, `Address ${hit.address}`, where(hit.district, hit.town)] };
    case "block": {
      const [title, line] = BLOCK[hit.block]!;
      return { title, lines: [line, where(hit.district, hit.town)] };
    }
    case "road":
      return { title: hit.cls[0]!.toUpperCase() + hit.cls.slice(1), lines: [hit.town ?? "A highway between towns"] };
    case "district":
      return { title: hit.district, lines: [`District of ${hit.town}`] };
  }
  return { title: hit.town, lines: ["Town"] };
}
