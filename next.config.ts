import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['discord.js', 'mongodb', 'sharp', 'zlib-sync', 'bufferutil', 'utf-8-validate'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'raw.githubusercontent.com' }],
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828],
    formats: ['image/webp'],
    minimumCacheTTL: 604800,
  },
};
export default config;
