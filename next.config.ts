import type { NextConfig } from "next";

// Static HTML export: the site needs no server features in phase 1.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
