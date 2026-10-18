"use client";
import dynamic from "next/dynamic";

// The ride lab reads the address and draws with WebGL: it runs in the browser only.
const RideLabPage = dynamic(() => import("../../../explore/lab/RideLabPage"), { ssr: false });

export default function Page() {
  return <RideLabPage />;
}
