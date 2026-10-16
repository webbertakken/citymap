import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "citymap",
  description: "Your repository, laid out as a city that stays put as the code changes.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
