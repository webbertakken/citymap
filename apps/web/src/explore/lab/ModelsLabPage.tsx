"use client";
// The model lab: /lab/models?style=procedural|gltf|mixed&shot=street|lineup&city=<name>&theme=<theme>.
// A research page, not linked: one bundled city's longest street, with the cast in the style asked for.
import { DEFAULT_TOGGLES } from "@citymap/ground-plan";
import { buildScene, type Scene } from "@citymap/scene";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { useEffect, useState } from "react";
import { loadCity, loadIndex } from "../../cities";
import { log, reasonOf } from "../../log";
import { cityBuildings, tableFor } from "../../view/buildings";
import { loadGltfModels, type GltfName, type Loaded } from "../models/gltf";
import { longestStreet, type Street } from "../street";
import ModelsLab, { type Shot, type Style } from "./ModelsLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const fetcher = (url: string, init?: RequestInit) => fetch(url, init);
const STYLES: readonly Style[] = ["procedural", "gltf", "mixed"];
const LABELS: Readonly<Record<Style, string>> = {
  procedural: "A: procedural low-poly, theme colours",
  gltf: "B: glTF models (Kenney CC0, poly.pizza CC-BY and CC0)",
  mixed: "C: procedural vehicles, Kenney CC0 people",
};

interface Asked {
  readonly style: Style;
  readonly shot: Shot;
  readonly theme: ThemeName;
  readonly city: string;
}

const askedIn = (search: string): Asked => {
  const query = new URLSearchParams(search);
  return {
    style: STYLES.find((s) => s === query.get("style")) ?? "procedural",
    shot: query.get("shot") === "lineup" ? "lineup" : "street",
    theme: THEME_NAMES.find((t) => t === query.get("theme")) ?? "paper-atlas",
    city: query.get("city") ?? "",
  };
};

interface Ready {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly street: Street;
  readonly gltf: Record<GltfName, Loaded> | null;
}

/** Loads the city and, unless the style is procedural, the glTF models; then shows the shot. */
async function prepare(asked: Asked): Promise<Ready> {
  const index = await loadIndex(fetcher, base);
  const entry = index.find((e) => e.name === asked.city) ?? index[0]!;
  const file = await loadCity(fetcher, entry, DEFAULT_TOGGLES, base);
  const theme = THEMES[asked.theme];
  const scene = buildScene(file.city, theme);
  const { table } = tableFor(scene, cityBuildings(file.measures), "folder", theme);
  const street = longestStreet(file.city);
  if (!street) throw new Error("lab/no-street");
  const gltf = asked.style === "procedural" ? null : await loadGltfModels(`${base}/lab/models`);
  log.info("lab/models-ready", { style: asked.style, city: entry.name, street: street.length.toFixed(1) });
  return { scene, table, street, gltf };
}

export default function ModelsLabPage() {
  const [asked] = useState(() => askedIn(window.location.search));
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    prepare(asked).then(setReady, (error: unknown) => {
      log.error("lab/models-failed", { reason: reasonOf(error) });
      setFailure(String(error));
    });
  }, [asked]);
  const theme = THEMES[asked.theme];
  return (
    <main className="viewer" style={{ background: theme.country }} data-ready={ready !== null}>
      <div className="map">
        {ready && (
          <ModelsLab
            scene={ready.scene}
            table={ready.table}
            theme={theme}
            street={ready.street}
            style={asked.style}
            shot={asked.shot}
            gltf={ready.gltf}
          />
        )}
      </div>
      <p className="glass" style={{ position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 12px" }}>
        {failure || LABELS[asked.style]}
      </p>
    </main>
  );
}
