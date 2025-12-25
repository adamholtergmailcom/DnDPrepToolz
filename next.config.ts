import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images from fal.ai
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.fal.ai',
      },
      {
        protocol: 'https',
        hostname: 'fal.media',
      },
      {
        protocol: 'https',
        hostname: '**.fal.media',
      },
    ],
  },
  // Handle Playwright as server-side only
  serverExternalPackages: ['playwright'],
};

export default nextConfig;
