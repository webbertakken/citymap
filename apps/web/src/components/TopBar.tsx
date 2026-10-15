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
  /** The name of the one town shown, or null for the whole city. */
  readonly town: string | null;
  readonly onWhole: () => void;
  readonly onCity: (file: string) => void;
  readonly onFile: (file: File) => void;
  readonly onRepository: (input: string) => void;
  readonly onMode: (mode: Mode) => void;
  readonly onTheme: (theme: ThemeName) => void;
}

/** The slim bar: the city's name and every control, native and labelled. */
export function TopBar(props: TopBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const repository = useRef<HTMLInputElement>(null);
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) props.onFile(file);
    event.target.value = "";
  };
  return (
    <header className="bar">
      {/* The place (name, breadcrumb, status) stacks on the left; the controls sit right, so neither moves the other. */}
      <div className="place">
        <div className="title">
          <h1>{props.title}</h1>
          {props.town !== null && (
            <nav aria-label="Breadcrumb" className="crumbs">
              <ol>
                <li>
                  <button type="button" onClick={props.onWhole}>
                    {props.title}
                  </button>
                </li>
                <li aria-current="page">{props.town}</li>
              </ol>
            </nav>
          )}
        </div>
        <p className="status" aria-live="polite">
          {props.status}
        </p>
      </div>
      <div className="controls">
        <span className="field">
          <label htmlFor="city">City</label>
          <select id="city" value={props.selected} onChange={(e) => props.onCity(e.target.value)}>
            {props.cities.map((c) => (
              <option key={c.file} value={c.file}>
                {c.name} ({c.lots.toLocaleString("en-GB")} lots)
              </option>
            ))}
          </select>
        </span>
        <search className="field">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              props.onRepository(repository.current!.value);
            }}
          >
            <label htmlFor="repository">GitHub repository</label>
            <input
              ref={repository}
              id="repository"
              name="repository"
              placeholder="owner/name"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">Lay</button>
          </form>
        </search>
        <button type="button" onClick={() => input.current?.click()}>
          Open a city file…
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={picked}
          aria-label="City file"
        />
        <fieldset className="toggle">
          <legend>View</legend>
          <button type="button" aria-pressed={props.mode === "dimetric"} onClick={() => props.onMode("dimetric")}>
            Dimetric
          </button>
          <button type="button" aria-pressed={props.mode === "plan"} onClick={() => props.onMode("plan")}>
            Plan
          </button>
        </fieldset>
        <span className="field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={props.theme}
            onChange={(e) => props.onTheme(THEME_NAMES.find((t) => t === e.target.value) ?? props.theme)}
          >
            {THEME_NAMES.map((t) => (
              <option key={t} value={t}>
                {THEMES[t].label}
              </option>
            ))}
          </select>
        </span>
      </div>
    </header>
  );
}
