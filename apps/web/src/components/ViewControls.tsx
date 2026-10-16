"use client";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { Ellipsis, FolderOpen, Palette } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import type { CityEntry } from "../cities";
import type { Mode } from "../view/view";
import { LocalMenu } from "./LocalMenu";
import { Popover } from "./Popover";
import type { LocalRepository } from "./useLocalRepository";

export interface ViewControlsProps {
  readonly mode: Mode;
  readonly theme: ThemeName;
  readonly cities: readonly CityEntry[];
  /** The bundled city shown, by file; empty for any other. */
  readonly selected: string;
  readonly onMode: (mode: Mode) => void;
  readonly onTheme: (theme: ThemeName) => void;
  readonly onCity: (entry: CityEntry) => void;
  readonly onFile: (file: File) => void;
  /** Opening a local repository, offered in More after the city file. */
  readonly local?: LocalRepository;
}

/** Top right: the view switch, the map's theme, and More (the bundled cities, a city file, a local repository). */
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
          Plan
        </button>
        <button type="button" aria-pressed={props.mode === "dimetric"} onClick={() => props.onMode("dimetric")}>
          3D
        </button>
      </fieldset>
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
      <Popover label="More" face={<Ellipsis size={20} aria-hidden="true" />}>
        {(close) => (
          <>
            <p className="popover-heading">Example cities</p>
            <ul className="menu">
              {props.cities.map((c) => (
                <li key={c.file}>
                  <button
                    type="button"
                    aria-current={c.file === props.selected ? "true" : undefined}
                    onClick={() => {
                      close();
                      props.onCity(c);
                    }}
                  >
                    <span>{c.name}</span> <span className="count">{c.lots.toLocaleString("en-GB")} lots</span>
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
