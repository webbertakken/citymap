"use client";
import dynamic from "next/dynamic";
import { Viewer } from "../components/Viewer";
import { descent } from "../explore/descent";
import { bespokeWalls } from "../explore/physics/bespoke";
import { openGarage } from "../explore/physics/garage";
import { loadRapier, rapierWalls } from "../explore/physics/rapier";

// WebGL runs in the browser only; the bar paints first, the scene after it.
const CityCanvas = dynamic(() => import("../components/CityCanvas"), { ssr: false });
// The city at eye height loads only once someone goes down into it, behind the loading card with everything else the
// walk needs, so it draws the moment the walls and streets stand.
const loadExploreCanvas = () => import("../components/ExploreCanvas");
const ExploreCanvas = dynamic(loadExploreCanvas, { ssr: false });
const address = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
// The walls are citymap's own; `?physics=rapier` walks with the Rapier prototype instead, to compare. Cars drive on
// Rapier either way. `?traffic=20` sets 20 parked cars driving themselves: a measuring aid.
const rapier = address.get("physics") === "rapier";
const explore = {
  Canvas: ExploreCanvas,
  engine: rapier ? "Rapier" : "bespoke 2.5D",
  goDown: descent({
    loadEngine: loadRapier,
    loadModels: async (onCount) => (await loadExploreCanvas()).loadModels(onCount),
    raise: rapier ? rapierWalls : bespokeWalls,
    openGarage,
    traffic: Number(address.get("traffic") ?? 0) || 0,
  }),
};

export default function Page() {
  return <Viewer Canvas={CityCanvas} explore={explore} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />;
}
