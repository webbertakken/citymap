"use client";
import type { LandUse } from "@citymap/ground-plan";
import { KIND_COLOURS, WINDOW_LIT, rampOf, unknownColour, windowUnknown, type ColourBy } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { ChevronUp, Palette } from "lucide-react";
import { useId, useState } from "react";
import { LEGEND, USE } from "../card/words";
import { colourChoices, floorEnds, rampEnds, type CityBuildings } from "../view/buildings";
import type { Mode } from "../view/view";
import { Popover } from "./Popover";

/** The tint seed used for the legend's sample folder: any district number shows a folder's two tints. */
const SAMPLE_DISTRICT = 7;

/** Each choice's name in the legend. */
export const COLOUR_NAMES: Readonly<Record<ColourBy, string>> = {
  folder: "Folder",
  tested: "Tested",
  size: "Size",
  kind: "Kind",
  recency: "Recency",
  churn: "Churn",
  authors: "Authors",
};

/** What each measure's colour says, from its low end to its high end. */
const MEANS: Readonly<Record<Exclude<ColourBy, "folder" | "kind">, string>> = {
  tested: "How far tests exercise it",
  size: "How big it is",
  recency: "When it last changed",
  churn: "How many commits changed it",
  authors: "How many people changed it",
};

export interface LegendProps {
  readonly theme: Theme;
  readonly mode: Mode;
  readonly colourBy: ColourBy;
  readonly onColourBy: (by: ColourBy) => void;
  readonly city: CityBuildings;
  /** The land uses that have buildings in the city shown, for colour by kind. */
  readonly uses: readonly LandUse[];
}

/** What a folder's colours mean: its two tints, parks and reserve plots. */
function FolderScale({ theme }: { readonly theme: Theme }) {
  const [reserve, reserveLine] = theme.reserve(SAMPLE_DISTRICT);
  return (
    <ul>
      <li>
        <span className="swatch" style={{ background: theme.lot(SAMPLE_DISTRICT, true) }} />
        <span className="swatch" style={{ background: theme.lot(SAMPLE_DISTRICT, false) }} />
        {LEGEND.lot}
      </li>
      <li>
        <span className="swatch" style={{ background: theme.park }} />
        {LEGEND.park}
      </li>
      <li>
        <span className="swatch" style={{ background: reserve, borderColor: reserveLine, borderStyle: "dashed" }} />
        {LEGEND.reserve}
      </li>
    </ul>
  );
}

/** The scale of what the colour means now. */
function Scale({ theme, colourBy, city, uses }: Omit<LegendProps, "mode" | "onColourBy">) {
  if (colourBy === "folder") return <FolderScale theme={theme} />;
  if (colourBy === "kind")
    return (
      <ul>
        {uses.map((use) => (
          <li key={use}>
            <span className="swatch" style={{ background: KIND_COLOURS[use] }} />
            {USE[use].name}
          </li>
        ))}
      </ul>
    );
  const stops = rampOf(colourBy, theme);
  const ends = rampEnds(colourBy, city);
  return (
    <div className="scale">
      <p>{MEANS[colourBy]}</p>
      <span
        className="ramp"
        aria-hidden="true"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      {ends && (
        <p className="ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </p>
      )}
      <p>
        <span className="swatch" style={{ background: unknownColour(theme) }} />
        Not known
      </p>
    </div>
  );
}

/** Bottom left: what the map's colours mean, what they can mean instead, and in the Buildings view what height and
 * lit windows mean. On a phone it folds behind a button. */
export function Legend({ theme, mode, colourBy, onColourBy, city, uses }: LegendProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const choices = colourChoices(city.measures);
  const floors = floorEnds(city);
  const tested = city.measures?.tested === "coverage" ? "coverage report" : "by name: all or none";
  return (
    <>
      <button
        type="button"
        className="glass legend-button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronUp size={20} aria-hidden="true" /> : <Palette size={20} aria-hidden="true" />}
        <span>Legend</span>
      </button>
      <section id={id} className="glass legend" data-open={open} aria-label="Legend">
        <Popover
          label={`Colour by: ${COLOUR_NAMES[colourBy]}`}
          above
          buttonClass="colour-by"
          face={
            <>
              <span className="colour-by-label">Colour by</span> <strong>{COLOUR_NAMES[colourBy]}</strong>
            </>
          }
        >
          {(close) => (
            <fieldset className="choices">
              <legend>Colour by</legend>
              {choices.map(({ by, reason }) => (
                <label key={by} className={reason === null ? undefined : "unavailable"}>
                  <input
                    type="radio"
                    name={`${id}-colour`}
                    value={by}
                    checked={colourBy === by}
                    disabled={reason !== null}
                    aria-describedby={reason === null ? undefined : `${id}-${by}`}
                    onChange={() => {
                      onColourBy(by);
                      close();
                    }}
                  />
                  <span className="choice">
                    {COLOUR_NAMES[by]}
                    {reason !== null && (
                      <small id={`${id}-${by}`} className="reason">
                        {reason}
                      </small>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </Popover>
        <Scale theme={theme} colourBy={colourBy} city={city} uses={uses} />
        {mode === "buildings" && (
          <ul className="buildings-key">
            <li>
              Height: size, 1 to 12 floors{floors ? ` (${floors[0]} to ${floors[1]})` : ""}; a hatched roof, not known
            </li>
            <li>
              <span className="swatch" style={{ background: WINDOW_LIT }} />
              Lit windows: tested share ({tested})
            </li>
            <li>
              <span className="swatch" style={{ background: windowUnknown(theme) }} />
              Grey windows: not known
            </li>
          </ul>
        )}
      </section>
    </>
  );
}
