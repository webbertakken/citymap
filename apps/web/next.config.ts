import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  // The workspace packages ship TypeScript sources.
  transpilePackages: ["@citymap/ground-plan", "@citymap/scene", "@citymap/themes"],
  // The repository's gate type-checks every project with TypeScript 7 (tsc --build); Next's own pass would repeat it.
  typescript: { ignoreBuildErrors: true },
};

export default config;
