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

const isDev = process.env.NODE_ENV === "development";

// No nonce here on purpose: a nonce-based CSP requires every page to opt into
// dynamic rendering (see Next.js CSP guide), which would break this app's
// unstable_cache-based static/ISR pages (see page-state-cache.mdc). 'unsafe-inline'
// is required for the inline theme flash-prevention <script> in layout.tsx and
// for React's inline `style={{...}}` usage across the app.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? "" : "upgrade-insecure-requests;"}
`.replace(/\s{2,}/g, " ").trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
