"use client";
import { OVERRIDDEN, SEPARATIONS, TOGGLES, type Separation, type Toggle } from "@citymap/ground-plan";
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

/** Each separation's name. */
export const SEPARATION_LABELS: Readonly<Record<Separation, string>> = {
  workspaces: "Workspaces",
  submodules: "Submodules",
  apps: "Apps",
  packages: "Packages",
  libs: "Libs",
  crates: "Crates",
  services: "Services",
  modules: "Modules",
  extensions: "Extensions",
  plugins: "Plugins",
};

/** Each separation's tooltip, word for word as the spec says it. */
export const SEPARATION_TOOLTIPS: Readonly<Record<Separation, string>> = {
  workspaces:
    "every workspace member the root manifests declare is a town of its own; the manifests decide apps and packages.",
  submodules: "every submodule is a town of its own, laid from the commit it is pinned to.",
  apps: "each folder in apps/ is a town of its own.",
  packages: "each folder in packages/ is a town of its own.",
  libs: "each folder in libs/ is a town of its own.",
  crates: "each folder in crates/ is a town of its own.",
  services: "each folder in services/ is a town of its own.",
  modules: "each folder in modules/ is a town of its own.",
  extensions: "each folder in extensions/ is a town of its own.",
  plugins: "each folder in any plugins/ folder is a town of its own.",
};

/** The line shown while declared workspaces decide apps and packages. */
export const DECIDED_NOTE = "Declared workspaces decide; turn Workspaces off to choose.";

export interface TogglesProps {
  /** The toggles on. */
  readonly toggles: readonly Toggle[];
  /** A city file's layout cannot change: the switches are shown, but not used. */
  readonly fixed: boolean;
  readonly onToggle: (toggle: Toggle, on: boolean) => void;
  /** The separations on. */
  readonly separate: readonly Separation[];
  /** The separations the city shown records as changing its layout; none shows no group. */
  readonly separable: readonly Separation[];
  /** Whether the city shown declares workspaces, which then decide apps and packages. */
  readonly declared: boolean;
  readonly onSeparate: (separation: Separation, on: boolean) => void;
}

interface SwitchProps {
  readonly id: string;
  readonly label: string;
  readonly tooltip: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly shown: boolean;
  readonly onChange: (on: boolean) => void;
  readonly onTip: (shown: boolean) => void;
}

/** One switch, its tooltip beside it while it is hovered or focused, until Escape hides it. */
function Switch({ id, label, tooltip, on, disabled, shown, onChange, onTip }: SwitchProps) {
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !shown) return;
    // The first Escape hides the tooltip and stops there; the next closes the popover. The page's root may be the
    // document the popover listens on, so the Escape is marked as answered rather than only stopped.
    event.preventDefault();
    event.stopPropagation();
    onTip(false);
  };
  return (
    <li onPointerEnter={() => onTip(true)} onPointerLeave={() => onTip(false)}>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          aria-checked={on}
          disabled={disabled}
          aria-describedby={id}
          onChange={(event) => onChange(event.target.checked)}
          onFocus={() => onTip(true)}
          onBlur={() => onTip(false)}
          onKeyDown={escape}
        />
        {label}
      </label>
      <p id={id} role="tooltip" className="tooltip" hidden={!shown}>
        {tooltip}
      </p>
    </li>
  );
}

/** The layout toggles, then the separations the city records: a switch each, its tooltip beside it. */
export function Toggles(props: TogglesProps) {
  const { toggles, fixed, onToggle, separate, separable, declared, onSeparate } = props;
  const id = useId();
  // The switch whose tooltip shows: the one hovered, or the one with focus, until Escape hides it.
  const [tip, setTip] = useState<string | null>(null);
  const tipFor = (name: string) => (shown: boolean) => setTip(shown ? name : null);
  const decided = declared && separate.includes("workspaces");
  const offered = SEPARATIONS.filter((s) => separable.includes(s));
  return (
    <>
      <fieldset className="choices toggles" disabled={fixed}>
        <legend>City layout</legend>
        {fixed && <p className="toggles-note">A city file keeps the layout it was laid with.</p>}
        <ul>
          {TOGGLES.map((toggle) => (
            <Switch
              key={toggle}
              id={`${id}-${toggle}`}
              label={LABELS[toggle]}
              tooltip={TOOLTIPS[toggle]}
              on={toggles.includes(toggle)}
              disabled={fixed}
              shown={tip === toggle}
              onChange={(on) => onToggle(toggle, on)}
              onTip={tipFor(toggle)}
            />
          ))}
        </ul>
      </fieldset>
      {offered.length > 0 && (
        <fieldset className="choices toggles" disabled={fixed}>
          <legend>Separate towns</legend>
          {decided && !fixed && <p className="toggles-note">{DECIDED_NOTE}</p>}
          <ul>
            {offered.map((s) => (
              <Switch
                key={s}
                id={`${id}-${s}`}
                label={SEPARATION_LABELS[s]}
                tooltip={SEPARATION_TOOLTIPS[s]}
                on={separate.includes(s)}
                disabled={fixed || (decided && OVERRIDDEN.includes(s))}
                shown={tip === s}
                onChange={(on) => onSeparate(s, on)}
                onTip={tipFor(s)}
              />
            ))}
          </ul>
        </fieldset>
      )}
    </>
  );
}
