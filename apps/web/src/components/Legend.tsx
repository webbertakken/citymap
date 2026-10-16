"use client";
import type { Theme } from "@citymap/themes";

/** The tint seed used for the legend's sample folder: any district number shows a folder's two tints. */
const SAMPLE_DISTRICT = 7;

/** Bottom left: what the map's colours mean, in the map's theme. */
export function Legend({ theme }: { readonly theme: Theme }) {
  const [reserve, reserveLine] = theme.reserve(SAMPLE_DISTRICT);
  return (
    <section className="glass legend" aria-label="Legend">
      <ul>
        <li>
          <span className="swatch" style={{ background: theme.lot(SAMPLE_DISTRICT, true) }} />
          <span className="swatch" style={{ background: theme.lot(SAMPLE_DISTRICT, false) }} />
          A folder&apos;s files, source stronger
        </li>
        <li>
          <span className="swatch" style={{ background: theme.park }} />
          Park: documentation
        </li>
        <li>
          <span className="swatch" style={{ background: reserve, borderColor: reserveLine, borderStyle: "dashed" }} />
          Room to grow, and deleted files&apos; lots
        </li>
      </ul>
    </section>
  );
}
