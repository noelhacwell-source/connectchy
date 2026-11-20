import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // An updated copy runs from its own folder inside the runtime directory, so it
  // has no git repository of its own. Point tracing at the source checkout that
  // pulled those dependencies in, which keeps builds quiet and complete.
  outputFileTracingRoot: process.env.CONNECTCHY_DATA_DIR
    ? path.resolve(process.env.CONNECTCHY_DATA_DIR, "..")
    : undefined,
  // Allow the Arena live-preview origin to talk to this dev server.
  allowedDevOrigins: ["*.e2b.app", "**.e2b.app", "127.0.0.1", "192.168.178.74"],
};

export default nextConfig;
