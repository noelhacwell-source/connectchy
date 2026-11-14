import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connectchy - connect an AI agent to Roblox Studio",
  description:
    "Install one plugin, share one link, and let an AI agent build inside your open Roblox Studio: parts, scripts, GUIs and assets.",
  // Connection pages carry a secret in the URL. Keep them out of search engines and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
