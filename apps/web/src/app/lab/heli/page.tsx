"use client";
import dynamic from "next/dynamic";

// The heli lab reads the address and draws with WebGL: it runs in the browser only.
const HeliLabPage = dynamic(() => import("../../../explore/lab/HeliLabPage"), { ssr: false });

export default function Page() {
  return <HeliLabPage />;
}
