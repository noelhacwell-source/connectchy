import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./studio.css";
import "./workspace-design.css";

export const metadata: Metadata = {
  title: "Connectchy · Agent workspace",
  description:
    "Collaborate with AI agents in Roblox Studio or VS Code. Share rooms, run surveys and connect your own models.",
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
