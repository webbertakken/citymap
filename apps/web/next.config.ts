import type { NextConfig } from "next";

// The site's path under its host: "/citymap" on GitHub Pages, nothing locally.
const basePath = process.env.CITYMAP_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  basePath,
  // The bundled cities are fetched at run time, so the page needs the path too.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The workspace packages ship TypeScript sources.
  transpilePackages: ["@citymap/ground-plan", "@citymap/history", "@citymap/scene", "@citymap/themes"],
  // The repository's gate type-checks every project with TypeScript 7 (tsc --build); Next's own pass would repeat it.
  typescript: { ignoreBuildErrors: true },
  // The React Compiler memoises components and props, so moving the map re-renders only what the view feeds.
  reactCompiler: true,
};

export default config;
