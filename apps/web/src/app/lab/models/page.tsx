"use client";
import dynamic from "next/dynamic";

// The model lab reads the address and draws with WebGL: it runs in the browser only.
const ModelsLabPage = dynamic(() => import("../../../explore/lab/ModelsLabPage"), { ssr: false });

export default function Page() {
  return <ModelsLabPage />;
}
