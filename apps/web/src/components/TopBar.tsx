"use client";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { useRef, type ChangeEvent } from "react";
import type { CityEntry } from "../cities";
import type { Mode } from "../view/view";

export interface TopBarProps {
  readonly title: string;
  readonly status: string;
  readonly cities: readonly CityEntry[];
  readonly selected: string;
  readonly mode: Mode;
  readonly theme: ThemeName;
  readonly onCity: (file: string) => void;
  readonly onFile: (file: File) => void;
  readonly onMode: (mode: Mode) => void;
  readonly onTheme: (theme: ThemeName) => void;
}

/** The slim bar: the city's name and every control, native and labelled. */
export function TopBar(props: TopBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) props.onFile(file);
    event.target.value = "";
  };
  return (
    <header className="bar">
      <h1>{props.title}</h1>
      <p className="status" aria-live="polite">
        {props.status}
      </p>
      <label>
        City
        <select value={props.selected} onChange={(e) => props.onCity(e.target.value)}>
          {props.cities.map((c) => (
            <option key={c.file} value={c.file}>
              {c.name} ({c.lots.toLocaleString("en-GB")} lots)
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => input.current?.click()}>
        Open a city file…
      </button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={picked} aria-label="City file" />
      <fieldset className="toggle">
        <legend>View</legend>
        <button type="button" aria-pressed={props.mode === "dimetric"} onClick={() => props.onMode("dimetric")}>
          Dimetric
        </button>
        <button type="button" aria-pressed={props.mode === "plan"} onClick={() => props.onMode("plan")}>
          Plan
        </button>
      </fieldset>
      <label>
        Theme
        <select
          value={props.theme}
          onChange={(e) => props.onTheme(THEME_NAMES.find((t) => t === e.target.value) ?? props.theme)}
        >
          {THEME_NAMES.map((t) => (
            <option key={t} value={t}>
              {THEMES[t].label}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
