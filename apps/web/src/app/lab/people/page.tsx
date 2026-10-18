"use client";
import dynamic from "next/dynamic";

// The people lab reads the address and draws with WebGL: it runs in the browser only.
const PeopleLabPage = dynamic(() => import("../../../explore/lab/PeopleLabPage"), { ssr: false });

export default function Page() {
  return <PeopleLabPage />;
}
