"use client";
import type { City } from "@citymap/ground-plan";
import type { Hit } from "@citymap/scene";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useId, useState } from "react";
import { describeHit } from "../card/describe";
import type { GitHubSource } from "../card/github";
import { Actions } from "./Actions";
import { CardBody } from "./CardBody";

/** The towns listed before "Show all": the largest by lots. */
export const TOWNS_SHOWN = 7;

export interface DrawerProps {
  readonly city: City | null;
  /** False while a city is on its way: the empty state waits until nothing is. */
  readonly settled: boolean;
  readonly selected: Hit | null;
  /** True while one town is shown alone. */
  readonly focused: boolean;
  /** Open or closed by the person; null until they choose, when the screen's width decides. */
  readonly open: boolean | null;
  readonly onOpen: (open: boolean) => void;
  readonly onDrill: (key: string) => void;
  /** The repository and commit the city was laid from, when it came from GitHub. */
  readonly github: GitHubSource | null;
  /** Says a failure of an action to the person. */
  readonly onFailure: (message: string) => void;
}

/** Right: what is selected, then the towns. Closes to a button; on a phone it is a sheet, closed at first. */
export function Drawer({ city, settled, selected, focused, open, onOpen, onDrill, github, onFailure }: DrawerProps) {
  const [all, setAll] = useState(false);
  const hint = useId();
  const card = selected ? describeHit(selected) : null;
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
          {selected && card ? (
            <div className="selection">
              <CardBody card={card} titleAs="h3" />
              <Actions
                // A new selection starts with its own, uncopied, actions.
                key={`${card.kind}:${card.title}:${card.place.join("/")}`}
                hit={selected}
                card={card}
                focused={focused}
                github={github}
                onDrill={onDrill}
                onFailure={onFailure}
              />
            </div>
          ) : (
            <p className="hint">Nothing yet. Click the map or search to select; Escape clears it.</p>
          )}
        </section>
        <section className="towns" aria-label="Towns">
          <h2>Towns</h2>
          {towns.length === 0 ? (
            settled && (
              <p className="hint">
                No city yet. Make one with <code>citymap &lt;repository&gt; --out=city.json</code> and open it from
                More, or type a GitHub repository as owner/name in the search.
              </p>
            )
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
