"use client";
import { DEFAULT_TOGGLES } from "@citymap/ground-plan";
// The model lab: /lab/models?style=procedural|gltf|mixed&shot=street|lineup&city=<name>&theme=<theme>.
// A research page, not linked: one bundled city's longest street, with the cast in the style asked for.
import { parseCityFile } from "@citymap/measures";
import { buildScene, type Scene } from "@citymap/scene";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { useEffect, useState } from "react";
import { loadCity, loadIndex } from "../../cities";
import { log, reasonOf } from "../../log";
import { cityBuildings, tableFor } from "../../view/buildings";
import { GLTF_MODELS, loadGltfModels, type GltfName, type Loaded, type ModelFile } from "../models/gltf";
import { longestStreet, type Street } from "../street";
import ModelsLab, { type Shot, type Style } from "./ModelsLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const fetcher = (url: string, init?: RequestInit) => fetch(url, init);
const STYLES: readonly Style[] = ["procedural", "gltf", "mixed", "gta-clean", "gta-ps2"];
const LABELS: Readonly<Record<Style, string>> = {
  procedural: "A: procedural low-poly, theme colours",
  gltf: "B: glTF models (Kenney CC0, poly.pizza CC-BY and CC0)",
  mixed: "C: procedural vehicles, Kenney CC0 people",
  "gta-clean":
    "GTA, clean people: Quaternius (CC0); PSX bicycle, sedan, pickup (heyheythere), chopper (Duhgless), GGBot car",
  "gta-ps2":
    "GTA, PS2 people: Wobble Blocks (CC0); PSX bicycle, sedan, pickup (heyheythere), chopper (Duhgless), GGBot car",
};

/**
 * The GTA candidates from docs/research/gta-style-models, by the lab's names: two people, the bicycle, the motorbike,
 * a car, and the pickup in the helicopter's place. Fetched by hand into public/lab/models/gta (gitignored).
 */
const gtaModels = (style: Style): Readonly<Record<GltfName, ModelFile>> => {
  const people: Pick<Record<GltfName, ModelFile>, "figure" | "walker"> = style === "gta-ps2"
    ? {
        figure: { url: "lab/models/gta/ps2-pair.glb", metres: 1.78, measure: "height", yaw: Math.PI / 2 },
        walker: { url: "lab/models/gta/ps2-pair.glb", metres: 1.78, measure: "height", yaw: -Math.PI / 2 },
      }
    : {
        figure: { url: "lab/models/gta/quaternius-man.glb", metres: 1.78, measure: "height", yaw: Math.PI / 2 },
        walker: { url: "lab/models/gta/quaternius-woman.glb", metres: 1.68, measure: "height", yaw: Math.PI / 2 },
      };
  return {
    ...people,
    bicycle: { url: "lab/models/gta/bicycle.glb", metres: 1.75, measure: "length", yaw: Math.PI / 2 },
    motorbike: { url: "lab/models/gta/chopper.glb", metres: 2.4, measure: "length", yaw: 0 },
    car: { url: "lab/models/gta/ggbot-car2.glb", metres: 4.8, measure: "length", yaw: Math.PI / 2 },
    pickup: { url: "lab/models/gta/pickup.glb", metres: 5.2, measure: "length", yaw: Math.PI / 2 },
    helicopter: { url: "lab/models/gta/pickup.glb", metres: 5.2, measure: "length", yaw: Math.PI / 2 },
  };
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
    shot: query.get("shot") === "lineup" ? "lineup" : query.get("shot") === "people" ? "people" : "street",
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
  const file = parseCityFile(await loadCity(fetcher, entry, { toggles: DEFAULT_TOGGLES }, base));
  const theme = THEMES[asked.theme];
  const scene = buildScene(file.city, theme);
  const table = tableFor(scene.buildings.order, cityBuildings(file.measures), "folder", theme);
  const street = longestStreet(file.city);
  if (!street) throw new Error("lab/no-street");
  const gltf =
    asked.style === "procedural"
      ? null
      : await loadGltfModels(base, undefined, asked.style.startsWith("gta") ? gtaModels(asked.style) : GLTF_MODELS);
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
