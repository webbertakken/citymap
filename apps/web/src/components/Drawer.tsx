"use client";
import type { City } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useId, useState } from "react";
import { describeHit } from "../view/hover";

/** The towns listed before "Show all": the largest by lots. */
export const TOWNS_SHOWN = 7;

export interface DrawerProps {
  readonly city: City | null;
  readonly selected: Hit | null;
  /** True while one town is shown alone. */
  readonly focused: boolean;
  /** Open or closed by the person; null until they choose, when the screen's width decides. */
  readonly open: boolean | null;
  readonly onOpen: (open: boolean) => void;
  readonly onDrill: (key: string) => void;
}

/** Right: what is selected, then the towns. Closes to a button; on a phone it is a sheet, closed at first. */
export function Drawer({ city, selected, focused, open, onOpen, onDrill }: DrawerProps) {
  const [all, setAll] = useState(false);
  const hint = useId();
  const details = selected ? describeHit(selected) : null;
  const towns = (city?.towns ?? []).toSorted((a, b) => b.stats.lots - a.stats.lots);
  const shown = all ? towns : towns.slice(0, TOWNS_SHOWN);
  const state = open === null ? "auto" : String(open);
  return (
    <>
      <button
        type="button"
        className="glass details-button"
        data-open={state}
        aria-label="Details"
        aria-controls="drawer"
        aria-expanded={false}
        onClick={() => onOpen(true)}
      >
        <PanelRightOpen size={20} aria-hidden="true" />
        <span>Details</span>
      </button>
      <aside id="drawer" className="glass drawer" data-open={state} aria-label="Details">
        <button
          type="button"
          className="icon-button close"
          aria-label="Hide details"
          aria-controls="drawer"
          aria-expanded={true}
          onClick={() => onOpen(false)}
        >
          <PanelRightClose size={20} aria-hidden="true" />
        </button>
        <section className="selected" aria-label="Selected" aria-live="polite">
          <h2>Selected</h2>
          {details ? (
            <div className="selection">
              <p className="title" title={details.title}>
                {details.title}
              </p>
              {details.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {!focused && selected?.townKey != null && (
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Show only this town: ${selected.town!}`}
                  onClick={() => onDrill(selected.townKey!)}
                >
                  Show only this town
                </button>
              )}
            </div>
          ) : (
            <p className="hint">Nothing yet. Click the map or search to select; Escape clears it.</p>
          )}
        </section>
        <section className="towns" aria-label="Towns">
          <h2>Towns</h2>
          {towns.length === 0 ? (
            <p className="hint">
              No city yet. Make one with <code>citymap &lt;repository&gt; --out=city.json</code> and open it from More,
              or type a GitHub repository as owner/name in the search.
            </p>
          ) : (
            <>
              <p id={hint} hidden>
                Shows only this town
              </p>
              <ul>
                {shown.map((town) => (
                  <li key={town.key}>
                    {focused ? (
                      <span className="name">{town.name}</span>
                    ) : (
                      <button type="button" aria-describedby={hint} onClick={() => onDrill(town.key)}>
                        {town.name}
                      </button>
                    )}
                    <span className="count">{town.stats.lots.toLocaleString("en-GB")} lots</span>
                  </li>
                ))}
              </ul>
              {towns.length > TOWNS_SHOWN && (
                <button type="button" className="text-button" aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? "Show fewer towns" : `Show all ${towns.length} towns`}
                </button>
              )}
            </>
          )}
        </section>
      </aside>
    </>
  );
}
