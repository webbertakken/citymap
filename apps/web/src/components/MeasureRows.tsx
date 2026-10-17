"use client";
import type { Hit } from "@citymap/scene";
import { createContext, useContext } from "react";
import type { CardRow } from "../card/describe";

/** The measure rows of whatever is hit: a lot's building's, else none. */
export type RowsOf = (hit: Hit) => readonly CardRow[];

const none: RowsOf = () => [];

/** The shown city's measure rows, for every card that describes a hit: the hover card and the drawer's selection. */
export const MeasureRows = createContext<RowsOf>(none);

export const useMeasureRows = (): RowsOf => useContext(MeasureRows);
