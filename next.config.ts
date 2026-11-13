import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One image containing the server and its pruned dependency tree.
  output: "standalone",
  // Keeps `next dev` from writing its own agent block into AGENTS.md, a one-line pointer to CLAUDE.md.
  agentRules: false,
  // Lets two builds run side by side in one checkout without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // sharp is a native module; bundling it breaks its binary lookup.
  serverExternalPackages: ["sharp", "@node-rs/argon2"],
  async redirects() {
    // "Things" became "Fixtures" and "People" became "Contacts"; keep old bookmarks working.
    return [
      { source: "/things", destination: "/fixtures", permanent: true },
      {
        source: "/things/:path*",
        destination: "/fixtures/:path*",
        permanent: true,
      },
      { source: "/people", destination: "/contacts", permanent: true },
      {
        source: "/people/:path*",
        destination: "/contacts/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // The house guide is reached by a bearer link. Nothing about it should
        // leak through a Referer, be cached by an intermediary, or be indexed.
        source: "/g/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
