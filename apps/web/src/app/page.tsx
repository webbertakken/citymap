"use client";
import dynamic from "next/dynamic";
import { Viewer } from "../components/Viewer";
import { rapierWalls } from "../explore/physics/rapier";

// WebGL runs in the browser only; the bar paints first, the scene after it.
const CityCanvas = dynamic(() => import("../components/CityCanvas"), { ssr: false });
// The city at eye height loads only once someone goes down into it.
const ExploreCanvas = dynamic(() => import("../components/ExploreCanvas"), { ssr: false });
const explore = { Canvas: ExploreCanvas, engine: "Rapier", raise: rapierWalls };

export default function Page() {
  return <Viewer Canvas={CityCanvas} explore={explore} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />;
}
