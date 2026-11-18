import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Allow the Arena live-preview origin to talk to this dev server.
  allowedDevOrigins: ["*.e2b.app", "**.e2b.app", "127.0.0.1", "192.168.178.74"],
};

export default nextConfig;
