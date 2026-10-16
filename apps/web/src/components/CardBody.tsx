"use client";
import {
  Building2,
  Fence,
  FileCode,
  Folder,
  LayoutGrid,
  Route,
  Sprout,
  Square,
  SquareDashed,
  Trees,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Card, CardKind } from "../card/describe";

/** One icon per kind of thing on the map. */
const ICON: Readonly<Record<CardKind, LucideIcon>> = {
  file: FileCode,
  vacant: SquareDashed,
  park: Trees,
  plaza: Square,
  green: Sprout,
  reserve: Fence,
  block: LayoutGrid,
  road: Route,
  highway: Waypoints,
  folder: Folder,
  town: Building2,
};

/** Text that may break after every slash and dot, so a long path wraps at its folders first. */
export function Breakable({ text }: { readonly text: string }): ReactNode {
  const parts = text.split(/(?<=[/.])/);
  return parts.map((part, i) => (
    // Parts of one text never reorder, so their place is their identity.
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}

export interface CardBodyProps {
  readonly card: Card;
  /** The title's element: a heading in the drawer, a paragraph on the hover card. */
  readonly titleAs?: "h3" | "p";
}

/** What a thing on the map is: its icon, kind, name and place, what it means, and its facts, all wrapping. */
export function CardBody({ card, titleAs: Title = "p" }: CardBodyProps) {
  const Icon = ICON[card.kind];
  return (
    <>
      <div className="hit-head">
        <span className="hit-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="hit-names">
          {card.eyebrow !== null && <p className="hit-kind">{card.eyebrow}</p>}
          <Title className="hit-name">
            <Breakable text={card.title} />
          </Title>
          {card.place.length > 0 && (
            <p className="hit-place">
              <span className="visually-hidden">In </span>
              {card.place.map((name, i) => (
                // A place may repeat a name (src › lib › src); its depth tells them apart.
                // oxlint-disable-next-line react/no-array-index-key
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden="true"> › </span>}
                  <span className="hit-place-name">
                    <Breakable text={name} />
                  </span>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </div>
      {card.meaning !== null && <p className="hit-meaning">{card.meaning}</p>}
      {card.rows.length > 0 && (
        <dl className="hit-rows">
          {card.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <Breakable text={row.value} />
                {row.note !== undefined && <small>{row.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
