import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 92],
    localPatterns: [{ pathname: "/**" }],
  },
};

export default nextConfig;
