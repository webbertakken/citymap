"use client";
// The run lab: /lab/run?gait=before|after&phase=<0 to 1>&theme=<theme>. A research page, not linked: the walker's
// figure running at the walk's run speed, seen side on before a lined wall as Muybridge photographed his runners, at a
// phase of its stride: "before" the library's sprint as the walk played it (sped up to keep pace with the ground),
// "after" the gait laid over it.
import { THEMES, THEME_NAMES } from "@citymap/themes";
import { useEffect, useState } from "react";
import { log, reasonOf } from "../../log";
import { GLTF_MODELS, loadModel, type Loaded } from "../models/gltf";
import RunLab, { type RunAsked } from "./RunLab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function RunLabPage() {
  const [asked] = useState<RunAsked>(() => {
    const query = new URLSearchParams(window.location.search);
    const phase = Number(query.get("phase") ?? 0);
    return {
      gait: query.get("gait") === "before" ? "before" : "after",
      phase: Number.isFinite(phase) ? phase : 0,
      theme: THEME_NAMES.find((t) => t === query.get("theme")) ?? "night-atlas",
    };
  });
  const [person, setPerson] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    loadModel(base, GLTF_MODELS.figure).then(
      (loaded) => {
        log.info("lab/run-ready", { gait: asked.gait, phase: asked.phase });
        setPerson(loaded);
      },
      (error: unknown) => {
        log.error("lab/run-failed", { reason: reasonOf(error) });
        setFailure(String(error));
      },
    );
  }, [asked]);
  const theme = THEMES[asked.theme];
  return (
    <main className="viewer" style={{ background: theme.country }} data-ready={person !== null}>
      <div className="map">{person && <RunLab person={person} asked={asked} theme={theme} />}</div>
      <p className="glass" style={{ position: "absolute", left: 16, top: 16, margin: 0, padding: "8px 12px" }}>
        {failure || `${asked.gait}, ${asked.phase.toFixed(2)} of a stride`}
      </p>
    </main>
  );
}
