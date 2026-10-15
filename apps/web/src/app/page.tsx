"use client";
import dynamic from "next/dynamic";
import { Viewer } from "../components/Viewer";

// WebGL runs in the browser only; the bar paints first, the scene after it.
const CityCanvas = dynamic(() => import("../components/CityCanvas"), { ssr: false });

export default function Page() {
  return <Viewer Canvas={CityCanvas} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ""} />;
}
