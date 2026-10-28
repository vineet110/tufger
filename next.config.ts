import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // On Vercel, /api/py is routed to the FastAPI service before Next.js sees it.
  // Everywhere else (local dev, phones on your Wi-Fi) Next.js forwards it to uvicorn.
  async rewrites() {
    if (process.env.VERCEL) return [];
    const target = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8100";
    return [{ source: "/api/py/:path*", destination: `${target}/api/py/:path*` }];
  },
};

export default nextConfig;
