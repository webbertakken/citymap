"use client";
import { TOGGLES, type Toggle } from "@citymap/ground-plan";
import { useId, useState, type KeyboardEvent } from "react";

/** Each toggle's name. */
export const LABELS: Readonly<Record<Toggle, string>> = {
  corridor: "Corridor",
  archipelago: "Archipelago",
  quarters: "Quarters",
  tiers: "Tiers",
};

/** Each toggle's tooltip, word for word as the owner wrote it. */
export const TOOLTIPS: Readonly<Record<Toggle, string>> = {
  corridor:
    "when one folder holds nearly everything, the small folders beside it gather into one corner quarter behind a short avenue, instead of thin strips round the edge.",
  archipelago:
    "a folder of packages becomes islands, one per package, with canals and bridges between them instead of roads.",
  quarters:
    "many similar small folders are grouped into planned quarters, each a tidy grid of blocks square to its own outline, so you get neighbourhoods rather than stripes.",
  tiers:
    "a town's size sets its widest road, and only one road per town gets that class; every other road is at least one class narrower.",
};

export interface TogglesProps {
  /** The toggles on. */
  readonly toggles: readonly Toggle[];
  /** A city file's layout cannot change: the switches are shown, but not used. */
  readonly fixed: boolean;
  readonly onToggle: (toggle: Toggle, on: boolean) => void;
}

/** The layout toggles: a switch each, its tooltip beside it while it is hovered or focused. */
export function Toggles({ toggles, fixed, onToggle }: TogglesProps) {
  const id = useId();
  // The toggle whose tooltip shows: the one hovered, or the one with focus, until Escape hides it.
  const [tip, setTip] = useState<Toggle | null>(null);
  const escape = (toggle: Toggle) => (event: KeyboardEvent) => {
    if (event.key !== "Escape" || tip !== toggle) return;
    // The first Escape hides the tooltip and stops there; the next closes the popover. The page's root may be the
    // document the popover listens on, so the Escape is marked as answered rather than only stopped.
    event.preventDefault();
    event.stopPropagation();
    setTip(null);
  };
  return (
    <fieldset className="choices toggles" disabled={fixed}>
      <legend>City layout</legend>
      {fixed && <p className="toggles-note">A city file keeps the layout it was laid with.</p>}
      <ul>
        {TOGGLES.map((toggle) => (
          <li key={toggle} onPointerEnter={() => setTip(toggle)} onPointerLeave={() => setTip(null)}>
            <label>
              <input
                type="checkbox"
                role="switch"
                checked={toggles.includes(toggle)}
                aria-checked={toggles.includes(toggle)}
                disabled={fixed}
                aria-describedby={`${id}-${toggle}`}
                onChange={(event) => onToggle(toggle, event.target.checked)}
                onFocus={() => setTip(toggle)}
                onBlur={() => setTip(null)}
                onKeyDown={escape(toggle)}
              />
              {LABELS[toggle]}
            </label>
            <p id={`${id}-${toggle}`} role="tooltip" className="tooltip" hidden={tip !== toggle}>
              {TOOLTIPS[toggle]}
            </p>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
