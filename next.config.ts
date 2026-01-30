import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    "http://192.168.1.4:3000",
    "http://169.254.5.254:3000",
    "http://localhost:3000",
  ],
};

export default nextConfig;
