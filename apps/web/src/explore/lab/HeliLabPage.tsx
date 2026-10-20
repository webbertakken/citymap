"use client";
// The heli lab: /lab/heli?pose=ground|flight&view=front|side|above|behind|cabin&theme=<theme>&marks=1. A research page,
// not linked: the helicopter on a plain ground or flying, tilted, its pilot seated as the walk seats them, seen from a
// fixed side, so its glass and how the pilot sits in its cabin can be checked by eye.
import { THEMES, THEME_NAMES } from "@citymap/themes";
import { useEffect, useState } from "react";
import { log, reasonOf } from "../../log";
import { GLTF_MODELS, loadModel, type Loaded } from "../models/gltf";
import HeliLab, { HELI_POSES, HELI_VIEWS, type HeliAsked } from "./HeliLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface Ready {
  readonly person: Loaded;
  readonly helicopter: Loaded;
}

export default function HeliLabPage() {
  const [asked] = useState<HeliAsked>(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      pose: HELI_POSES.find((p) => p === query.get("pose")) ?? "ground",
      view: HELI_VIEWS.find((v) => v === query.get("view")) ?? "side",
      theme: THEME_NAMES.find((t) => t === query.get("theme")) ?? "night-atlas",
      marks: query.get("marks") === "1",
    };
  });
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    Promise.all([loadModel(base, GLTF_MODELS.figure), loadModel(base, GLTF_MODELS.helicopter)]).then(
      ([person, helicopter]) => {
        log.info("lab/heli-ready", { pose: asked.pose, view: asked.view });
        setReady({ person, helicopter });
      },
      (error: unknown) => {
        log.error("lab/heli-failed", { reason: reasonOf(error) });
        setFailure(String(error));
      },
    );
  }, [asked]);
  const theme = THEMES[asked.theme];
  return (
    <main className="viewer" style={{ background: theme.country }} data-ready={ready !== null}>
      <div className="map">{ready && <HeliLab {...ready} asked={asked} theme={theme} />}</div>
      <p className="glass" style={{ position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 12px" }}>
        {failure || `helicopter, ${asked.pose === "ground" ? "on the ground" : "in flight"}, from the ${asked.view}`}
      </p>
    </main>
  );
}
