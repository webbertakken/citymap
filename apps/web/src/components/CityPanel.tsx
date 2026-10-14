"use client";
import type { City } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { useState } from "react";
import { describeHit } from "../view/hover";

/** The text alternative to the map: each town with its lot count and its largest districts. */
export interface CityPanelProps {
  readonly city: City | null;
  readonly selected: Hit | null;
  /** True while one town is shown alone. */
  readonly focused: boolean;
  readonly onDrill: (key: string) => void;
}

/** The button that shows one town alone; its accessible name starts with its visible text. */
function ShowOnly({ name, townKey, onDrill }: { name: string; townKey: string; onDrill: (key: string) => void }) {
  return (
    <button
      type="button"
      className="drill"
      aria-label={`Show only this town: ${name}`}
      onClick={() => onDrill(townKey)}
    >
      Show only this town
    </button>
  );
}

export function CityPanel({ city, selected, focused, onDrill }: CityPanelProps) {
  const [open, setOpen] = useState(false);
  const details = selected ? describeHit(selected) : null;
  return (
    <aside className="panel" data-open={open}>
      <button
        type="button"
        className="disclosure"
        aria-expanded={open}
        aria-controls="towns"
        onClick={() => setOpen(!open)}
      >
        Towns and districts
      </button>
      <section className="selected" aria-label="Selected" aria-live="polite">
        <h2>Selected</h2>
        {details ? (
          <>
            <p className="title">{details.title}</p>
            {details.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {!focused && selected?.townKey != null && (
              <ShowOnly name={selected.town!} townKey={selected.townKey} onDrill={onDrill} />
            )}
          </>
        ) : (
          <p>Nothing yet. Click the map to select what is there; Escape clears it.</p>
        )}
      </section>
      <section id="towns" aria-label="Towns and districts">
        {city === null || city.towns.length === 0 ? (
          <p>
            No city yet. Make one with <code>citymap &lt;repository&gt; --out=city.json</code> and open it here.
          </p>
        ) : (
          city.towns.map((town) => (
            <div key={town.key}>
              <h2>
                {town.name} <span className="count">{town.stats.lots.toLocaleString("en-GB")} lots</span>
              </h2>
              {!focused && <ShowOnly name={town.name} townKey={town.key} onDrill={onDrill} />}
              <ul>
                {town.districts
                  .filter((d) => d.depth === 1)
                  .toSorted((a, b) => b.massMille - a.massMille)
                  .slice(0, 12)
                  .map((d) => (
                    <li key={d.path}>{d.name}</li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
