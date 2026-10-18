// A hit, said in plain words: the one description the hover card and the drawer's selection both show.
import { folderOf, parseAddress, shortTownName, type Hit } from "@citymap/scene";
import { BLOCK, HIGHWAY, LAYOUT, OLD, ROAD, TOWN_FORM, USE, VACANT } from "./words";

export type CardKind =
  | "file"
  | "vacant"
  | "park"
  | "plaza"
  | "green"
  | "reserve"
  | "block"
  | "road"
  | "highway"
  | "folder"
  | "town";

/** One fact: its label, its value, and a quieter note under the value. */
export interface CardRow {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

/** What a selection can copy and open: a file (blob) or a folder (tree), by its path in the repository. */
export interface Target {
  readonly path: string;
  readonly type: "blob" | "tree";
}

export interface Card {
  readonly kind: CardKind;
  /** The kind, over a name; null when the title is the kind. */
  readonly eyebrow: string | null;
  readonly title: string;
  /** Where it is: the town, then the folders down to it. Empty when it lies in no one town. */
  readonly place: readonly string[];
  readonly meaning: string | null;
  readonly rows: readonly CardRow[];
  readonly target: Target | null;
}

/** "1 lot", "2,048 lots", "no lots". */
export const count = (n: number, one: string): string =>
  n === 0 ? `no ${one}s` : `${n.toLocaleString("en-GB")} ${n === 1 ? one : `${one}s`}`;

/** The town's name, then the folder's names below the town's root. */
export function placeOf(town: string, root: string, folder: string): string[] {
  const below =
    root === ""
      ? folder
      : folder === root
        ? ""
        : folder.startsWith(`${root}/`)
          ? folder.slice(root.length + 1)
          : folder;
  return [town, ...below.split("/").filter((name) => name !== "")];
}

/** An address in words: "No. 4 on drivers/phy/intel", noting its block and side; as it is when it does not parse. */
export function addressWords(address: string): CardRow {
  const parsed = parseAddress(address);
  if (!parsed) return { label: "Address", value: address };
  return {
    label: "Address",
    value: `No. ${parsed.index + 1} on ${parsed.folder || "the top folder"}`,
    note: `Block ${parsed.row}.${parsed.block}, side ${parsed.side + 1}; kept for life`,
  };
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A hit as a card: what it is, where it is, and what it means, with nothing said twice; a file's building adds its
 * measures as `extra` rows. */
export function describeHit(hit: Hit, extra: readonly CardRow[] = []): Card {
  const plain = { eyebrow: null, rows: [], target: null };
  switch (hit.kind) {
    case "lot": {
      const place = placeOf(hit.town, hit.root, hit.folder);
      if (hit.vacant)
        return {
          ...plain,
          kind: "vacant",
          title: VACANT.name,
          place,
          meaning: VACANT.meaning,
          rows: [addressWords(hit.address)],
        };
      return {
        kind: "file",
        eyebrow: USE[hit.use].name,
        title: nameOf(hit.path),
        place,
        meaning: USE[hit.use].meaning,
        rows: [{ label: "In this folder", value: count(hit.folderLots, "lot") }, addressWords(hit.address), ...extra],
        target: { path: hit.path, type: "blob" },
      };
    }
    case "block": {
      const kind = hit.block === "built" ? "block" : hit.block;
      const words = BLOCK[hit.block];
      return {
        ...plain,
        kind,
        title: words.name,
        place: placeOf(hit.town, hit.root, hit.folder),
        meaning: words.meaning,
      };
    }
    case "road":
      return hit.town === null
        ? {
            ...plain,
            kind: "highway",
            title: HIGHWAY.name,
            place: [],
            meaning: HIGHWAY.meaning,
            rows: hit.joins.length > 0 ? [{ label: "Joins", value: hit.joins.join(" and ") }] : [],
          }
        : { ...plain, kind: "road", title: capital(hit.cls), place: [hit.town], meaning: ROAD[hit.cls] };
    case "district": {
      const holds =
        hit.folders > 0 ? `${count(hit.lots, "lot")} and ${count(hit.folders, "folder")}` : count(hit.lots, "lot");
      return {
        kind: "folder",
        eyebrow: "Folder",
        title: hit.district,
        place: placeOf(hit.town, hit.root, folderOf(hit.path)),
        meaning: null,
        rows: [{ label: "Holds", value: holds }, ...(hit.form ? [{ label: "Layout", value: LAYOUT[hit.form] }] : [])],
        target: { path: hit.path, type: "tree" },
      };
    }
  }
  return {
    kind: "town",
    eyebrow: hit.old ? "Old town" : "Town",
    title: shortTownName(hit.town),
    place: [],
    meaning: hit.old ? `${TOWN_FORM[hit.form]} ${OLD}` : TOWN_FORM[hit.form],
    rows: [
      ...(shortTownName(hit.town) === hit.town ? [] : [{ label: "Folder", value: hit.town }]),
      { label: "Lots", value: hit.lots.toLocaleString("en-GB") },
      { label: "Districts", value: hit.districts.toLocaleString("en-GB") },
    ],
    target: { path: hit.root, type: "tree" },
  };
}

/** What a selection offers, as the hover card's foot: "Click to select; then copy the path or open it on GitHub". */
export function hintFor(offers: { readonly town: boolean; readonly copy: boolean; readonly github: boolean }): string {
  const then = [
    offers.town ? "show only this town" : null,
    offers.copy ? "copy the path" : null,
    offers.github ? "open it on GitHub" : null,
  ].filter((offer) => offer !== null);
  if (then.length === 0) return "Click to select";
  const listed = then.length === 1 ? then[0]! : `${then.slice(0, -1).join(", ")} or ${then.at(-1)!}`;
  return `Click to select; then ${listed}`;
}

/** What selecting a hit offers: its town alone (unless shown already), its path to copy, and its page on GitHub. */
export function offersFor(
  hit: Hit,
  card: Card,
  context: { readonly focused: boolean; readonly github: boolean },
): { town: boolean; copy: boolean; github: boolean } {
  return {
    town: !context.focused && hit.townKey !== null,
    copy: card.target !== null && card.target.path !== "",
    github: context.github && card.target !== null,
  };
}
