"use client";
import type { Hit } from "@citymap/scene";
import { MousePointerClick } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { describeHit, hintFor, offersFor, type Card } from "../card/describe";
import { placeCard } from "../card/place";
import type { Viewport } from "../view/view";
import { CardBody } from "./CardBody";

export interface HoverCardProps {
  readonly hit: Hit;
  /** The pointer, in pixels within the map. */
  readonly pointer: { readonly x: number; readonly y: number };
  readonly map: Viewport;
  /** One town is shown alone, so selecting offers no town to show. */
  readonly focused: boolean;
  /** The city came from GitHub, so a file or folder can be opened there. */
  readonly github: boolean;
}

/** Before its first measure: the narrowest card, a few lines tall. */
const FIRST_SIZE = { width: 280, height: 160 };

interface PlacedProps {
  readonly card: Card;
  readonly hint: string;
  readonly pointer: HoverCardProps["pointer"];
  readonly map: Viewport;
}

/** One card's words, measured once when they first show and placed again before paint, then following the pointer. */
function Placed({ card, hint, pointer, map }: PlacedProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FIRST_SIZE);
  useLayoutEffect(() => {
    const element = box.current!;
    setSize((was) => ({ width: element.offsetWidth || was.width, height: element.offsetHeight || was.height }));
  }, []);
  const at = placeCard(pointer, size, map);
  return (
    <div ref={box} className="hover-card" role="tooltip" data-kind={card.kind} style={{ left: at.left, top: at.top }}>
      <CardBody card={card} />
      <p className="card-hint">
        <MousePointerClick size={16} aria-hidden="true" />
        <span>{hint}</span>
      </p>
    </div>
  );
}

/** Beside the pointer: what is there and what it means, placed by its measured size wholly inside the map. */
export function HoverCard({ hit, pointer, map, focused, github }: HoverCardProps) {
  const card = describeHit(hit);
  const hint = hintFor(offersFor(hit, card, { focused, github }));
  // New words, or a map of another size, are measured afresh.
  const words = `${JSON.stringify(card)}|${hint}|${map.width}x${map.height}`;
  return <Placed key={words} card={card} hint={hint} pointer={pointer} map={map} />;
}
