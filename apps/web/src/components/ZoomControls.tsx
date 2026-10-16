"use client";
import { Maximize, Minus, Plus } from "lucide-react";

export interface ZoomControlsProps {
  /** One of the map's keys: "+" zooms in, "-" out, "0" fits the city. */
  readonly onKey: (key: "+" | "-" | "0") => void;
}

/** Bottom right: the keyboard's zoom keys, as buttons. */
export function ZoomControls({ onKey }: ZoomControlsProps) {
  return (
    <fieldset className="glass zoom">
      <legend className="visually-hidden">Zoom</legend>
      <button type="button" className="icon-button" aria-label="Zoom in" onClick={() => onKey("+")}>
        <Plus size={20} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label="Zoom out" onClick={() => onKey("-")}>
        <Minus size={20} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label="Fit the city" onClick={() => onKey("0")}>
        <Maximize size={20} aria-hidden="true" />
      </button>
    </fieldset>
  );
}
