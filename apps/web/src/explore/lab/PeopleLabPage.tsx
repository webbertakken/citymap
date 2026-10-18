"use client";
import { DEFAULT_TOGGLES } from "@citymap/ground-plan";
// The people lab page: one bundled city's longest street, and the two casts in the motion asked for.
import { parseCityFile } from "@citymap/measures";
import { buildScene, type Scene } from "@citymap/scene";
import { THEMES, THEME_NAMES, type ThemeName } from "@citymap/themes";
import { useEffect, useState } from "react";
import type { AnimationClip, Object3D } from "three";
import { loadCity, loadIndex } from "../../cities";
import { log, reasonOf } from "../../log";
import { cityBuildings, tableFor } from "../../view/buildings";
import { loadModel, readGltfWithThree, type Loaded } from "../models/gltf";
import { longestStreet, type Street } from "../street";
import PeopleLab, { type Motion } from "./PeopleLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const fetcher = (url: string, init?: RequestInit) => fetch(url, init);
const MOTIONS: readonly Motion[] = ["walk", "run", "jump"];

interface Ready {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly street: Street;
  readonly wobble: Loaded;
  readonly quaternius: Loaded;
  readonly library: { readonly scene: Object3D; readonly clips: readonly AnimationClip[] };
}

async function prepare(theme: ThemeName): Promise<Ready> {
  const index = await loadIndex(fetcher, base);
  const file = parseCityFile(await loadCity(fetcher, index[0]!, DEFAULT_TOGGLES, base));
  const scene = buildScene(file.city, THEMES[theme]);
  const table = tableFor(scene.buildings.order, cityBuildings(file.measures), "folder", THEMES[theme]);
  const street = longestStreet(file.city);
  if (!street) throw new Error("lab/no-street");
  const [wobble, quaternius, library] = await Promise.all([
    loadModel(base, { url: "lab/models/gta/ps2-man.glb", metres: 1.78, measure: "height", yaw: Math.PI / 2 }),
    loadModel(base, { url: "lab/models/gta/quaternius-man.glb", metres: 1.78, measure: "height", yaw: Math.PI / 2 }),
    readGltfWithThree(`${base}/lab/models/gta/ual-clips.glb`),
  ]);
  log.info("lab/people-ready", { clips: library.animations.length });
  return { scene, table, street, wobble, quaternius, library: { scene: library.scene, clips: library.animations } };
}

export default function PeopleLabPage() {
  const [asked] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      motion: MOTIONS.find((m) => m === query.get("motion")) ?? "walk",
      theme: THEME_NAMES.find((t) => t === query.get("theme")) ?? "paper-atlas",
    };
  });
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    prepare(asked.theme).then(setReady, (error: unknown) => {
      log.error("lab/people-failed", { reason: reasonOf(error) });
      setFailure(String(error));
    });
  }, [asked]);
  const theme = THEMES[asked.theme];
  return (
    <main className="viewer" style={{ background: theme.country }} data-ready={ready !== null}>
      <div className="map">{ready && <PeopleLab {...ready} theme={theme} motion={asked.motion} />}</div>
      <p className="glass" style={{ position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 12px" }}>
        {failure ||
          `${asked.motion}: left, Wobble Blocks on the Universal Animation Library; right, Quaternius on his own clips`}
      </p>
    </main>
  );
}
