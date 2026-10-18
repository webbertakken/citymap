"use client";
import type { Toggle } from "@citymap/ground-plan";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { Building2, Ellipsis, FolderOpen, Footprints, Map as MapIcon, Palette, Settings } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { variantOf, type CityEntry } from "../cities";
import type { Mode } from "../view/view";
import { LocalMenu } from "./LocalMenu";
import { Popover } from "./Popover";
import { Toggles } from "./Toggles";
import type { LocalRepository } from "./useLocalRepository";

export interface ViewControlsProps {
  /** How the map is seen, and a change of it. */
  readonly mode: Mode;
  readonly onMode: (mode: Mode) => void;
  readonly theme: ThemeName;
  readonly cities: readonly CityEntry[];
  /** The bundled city shown, by name; empty for any other. */
  readonly selected: string;
  readonly onTheme: (theme: ThemeName) => void;
  readonly onCity: (entry: CityEntry) => void;
  readonly onFile: (file: File) => void;
  /** Opening a local repository, offered in More after the city file. */
  readonly local?: LocalRepository;
  /** The layout toggles on, whether the city shown can change with them, and a change. */
  readonly toggles: readonly Toggle[];
  readonly fixed: boolean;
  readonly onToggle: (toggle: Toggle, on: boolean) => void;
  /** Walking in the city: whether a walk is under way, and going down into the city or back to the map. */
  readonly walk?: { readonly walking: boolean; readonly onWalk: () => void };
}

/** Top right: the view switch, walking, the map's theme, the layout toggles, and More (the bundled cities, a city file, a local
 * repository). */
export function ViewControls(props: ViewControlsProps) {
  const input = useRef<HTMLInputElement>(null);
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) props.onFile(file);
    event.target.value = "";
  };
  return (
    <div className="controls">
      <fieldset className="glass segmented">
        <legend className="visually-hidden">View</legend>
        <button type="button" aria-pressed={props.mode === "plan"} onClick={() => props.onMode("plan")}>
          <MapIcon size={18} aria-hidden="true" />
          <span>Plan</span>
        </button>
        {/* On a phone only this button shows: it switches between the two views. */}
        <button
          type="button"
          aria-pressed={props.mode === "buildings"}
          onClick={() => props.onMode(props.mode === "buildings" ? "plan" : "buildings")}
        >
          <Building2 size={18} aria-hidden="true" />
          <span>Buildings</span>
        </button>
      </fieldset>
      {props.walk && (
        <button
          type="button"
          className="glass icon-button walk"
          aria-label="Walk"
          title="Walk: go down into the city on foot"
          aria-pressed={props.walk.walking}
          onClick={props.walk.onWalk}
        >
          <Footprints size={20} aria-hidden="true" />
        </button>
      )}
      <Popover label="Theme" face={<Palette size={20} aria-hidden="true" />}>
        {(close) => (
          <fieldset className="choices">
            <legend>Map theme</legend>
            {THEME_NAMES.map((name) => (
              <label key={name}>
                <input
                  type="radio"
                  name="theme"
                  value={name}
                  checked={props.theme === name}
                  onChange={() => {
                    props.onTheme(name);
                    close();
                  }}
                />
                {THEMES[name].label}
              </label>
            ))}
          </fieldset>
        )}
      </Popover>
      <Popover label="Layout" face={<Settings size={20} aria-hidden="true" />}>
        {() => <Toggles toggles={props.toggles} fixed={props.fixed} onToggle={props.onToggle} />}
      </Popover>
      <Popover label="More" face={<Ellipsis size={20} aria-hidden="true" />}>
        {(close) => (
          <>
            <p className="popover-heading">Example cities</p>
            <ul className="menu">
              {props.cities.map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    aria-current={c.name === props.selected ? "true" : undefined}
                    onClick={() => {
                      close();
                      props.onCity(c);
                    }}
                  >
                    <span>{c.name}</span>{" "}
                    <span className="count">{variantOf(c, props.toggles).lots.toLocaleString("en-GB")} lots</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    input.current?.click();
                  }}
                >
                  <FolderOpen size={20} aria-hidden="true" />
                  <span>Open a city file…</span>
                </button>
              </li>
            </ul>
            {props.local && <LocalMenu local={props.local} close={close} />}
          </>
        )}
      </Popover>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={picked} aria-label="City file" />
    </div>
  );
}
