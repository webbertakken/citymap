"use client";
// The ride lab: /lab/ride?ride=bicycle|motorbike&pose=parked|stopped|riding|steering&view=side|front|above|behind
// &theme=<theme>&rolled=<metres>&crank=<radians>&marks=1. A research page, not linked: one ride on a plain ground, its rider
// seated as the walk seats them, seen from a fixed side, so how the rider meets the machine can be checked by eye.
import { THEMES, THEME_NAMES } from "@citymap/themes";
import { useEffect, useState } from "react";
import { log, reasonOf } from "../../log";
import { GLTF_MODELS, loadModel, type Loaded } from "../models/gltf";
import RideLab, { POSES, VIEWS, type RideAsked } from "./RideLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface Ready {
  readonly person: Loaded;
  readonly ride: Loaded;
}

/** A number from the address, else a default. */
const numberOf = (query: URLSearchParams, name: string, otherwise: number) => {
  const value = Number(query.get(name) ?? Number.NaN);
  return Number.isFinite(value) ? value : otherwise;
};

export default function RideLabPage() {
  const [asked] = useState<RideAsked>(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      ride: query.get("ride") === "motorbike" ? "motorbike" : "bicycle",
      pose: POSES.find((p) => p === query.get("pose")) ?? "riding",
      view: VIEWS.find((v) => v === query.get("view")) ?? "side",
      theme: THEME_NAMES.find((t) => t === query.get("theme")) ?? "night-atlas",
      rolled: numberOf(query, "rolled", 0),
      crank: numberOf(query, "crank", 0.6),
      marks: query.get("marks") === "1",
    };
  });
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    Promise.all([loadModel(base, GLTF_MODELS.figure), loadModel(base, GLTF_MODELS[asked.ride])]).then(
      ([person, ride]) => {
        log.info("lab/ride-ready", { ride: asked.ride, pose: asked.pose, view: asked.view });
        setReady({ person, ride });
      },
      (error: unknown) => {
        log.error("lab/ride-failed", { reason: reasonOf(error) });
        setFailure(String(error));
      },
    );
  }, [asked]);
  const theme = THEMES[asked.theme];
  return (
    <main className="viewer" style={{ background: theme.country }} data-ready={ready !== null}>
      <div className="map">{ready && <RideLab {...ready} asked={asked} theme={theme} />}</div>
      <p className="glass" style={{ position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 12px" }}>
        {failure || `${asked.ride}, ${asked.pose}, from the ${asked.view}`}
      </p>
    </main>
  );
}
