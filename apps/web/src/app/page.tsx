"use client";
import dynamic from "next/dynamic";
import { Viewer } from "../components/Viewer";
import { bespokeWalls } from "../explore/physics/bespoke";
import type { RaiseWalls } from "../explore/physics/raise";
import { rapierWalls } from "../explore/physics/rapier";

// WebGL runs in the browser only; the bar paints first, the scene after it.
const CityCanvas = dynamic(() => import("../components/CityCanvas"), { ssr: false });
// The city at eye height loads only once someone goes down into it, while its walls rise, so it draws the moment they
// stand.
const loadExploreCanvas = () => import("../components/ExploreCanvas");
const ExploreCanvas = dynamic(loadExploreCanvas, { ssr: false });
/** Raises the walls with an engine while the canvas loads beside it; the walls are freed if the canvas fails. */
const withCanvas =
  (raise: RaiseWalls): RaiseWalls =>
  async (footprints, options) => {
    const canvas = loadExploreCanvas();
    const walls = await raise(footprints, options);
    try {
      await canvas;
    } catch (failure) {
      walls.dispose();
      throw failure;
    }
    return walls;
  };
// The walls are citymap's own; `?physics=rapier` walks with the Rapier prototype instead, to compare.
const rapier = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("physics") === "rapier";
const explore = rapier
  ? { Canvas: ExploreCanvas, engine: "Rapier", raise: withCanvas(rapierWalls) }
  : { Canvas: ExploreCanvas, engine: "bespoke 2.5D", raise: withCanvas(bespokeWalls) };

export default function Page() {
  return <Viewer Canvas={CityCanvas} explore={explore} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />;
}
