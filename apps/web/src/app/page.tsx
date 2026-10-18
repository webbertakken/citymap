"use client";
import dynamic from "next/dynamic";
import { Viewer, type RaiseWalls } from "../components/Viewer";
import { rapierWalls } from "../explore/physics/rapier";

// WebGL runs in the browser only; the bar paints first, the scene after it.
const CityCanvas = dynamic(() => import("../components/CityCanvas"), { ssr: false });
// The city at eye height loads only once someone goes down into it, while its walls rise, so it draws the moment they
// stand.
const loadExploreCanvas = () => import("../components/ExploreCanvas");
const ExploreCanvas = dynamic(loadExploreCanvas, { ssr: false });
const raise: RaiseWalls = async (footprints, options) => {
  const canvas = loadExploreCanvas();
  const walls = await rapierWalls(footprints, options);
  try {
    await canvas;
  } catch (failure) {
    walls.dispose();
    throw failure;
  }
  return walls;
};
const explore = { Canvas: ExploreCanvas, engine: "Rapier", raise };

export default function Page() {
  return <Viewer Canvas={CityCanvas} explore={explore} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />;
}
