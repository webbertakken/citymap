"use client";
import dynamic from "next/dynamic";

// The run lab reads the address and draws with WebGL: it runs in the browser only.
const RunLabPage = dynamic(() => import("../../../explore/lab/RunLabPage"), { ssr: false });

export default function Page() {
  return <RunLabPage />;
}
