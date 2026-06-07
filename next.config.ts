import type { NextConfig } from "next";
import os from "node:os";

function devOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        origins.add(net.address);
      }
    }
  }
  const extra = process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim());
  for (const host of extra ?? []) {
    if (host) origins.add(host);
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
