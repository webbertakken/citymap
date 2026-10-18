import type { NextConfig } from "next";

// The site's path under its host: "/citymap" on GitHub Pages, nothing locally.
const basePath = process.env.CITYMAP_BASE_PATH ?? "";

/** Hosts other than this machine allowed to load the dev server, comma-separated (a phone on the LAN); none by default. */
const devOrigins = (process.env.CITYMAP_DEV_ORIGINS ?? "").split(",").filter(Boolean);

const config: NextConfig = {
  output: "export",
  allowedDevOrigins: devOrigins,
  basePath,
  // The bundled cities are fetched at run time, so the page needs the path too.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The workspace packages ship TypeScript sources.
  transpilePackages: [
    "@citymap/ground-plan",
    "@citymap/history",
    "@citymap/scene",
    "@citymap/themes",
    "@citymap/world",
  ],
  // The repository's gate type-checks every project with TypeScript 7 (tsc --build); Next's own pass would repeat it.
  typescript: { ignoreBuildErrors: true },
  // The React Compiler memoises components and props, so moving the map re-renders only what the view feeds.
  reactCompiler: true,
};

export default config;
