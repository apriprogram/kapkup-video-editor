import type { NextConfig } from "next";

// Kapkup berjalan lokal dan semua datanya dibaca dari disk saat diminta,
// jadi fitur cache/prerender bawaan template tidak dipakai.
const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
