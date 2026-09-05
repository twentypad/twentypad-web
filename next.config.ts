import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    return [
      {
        source: "/guide",
        destination: "https://docs.twentypad.com/",
        permanent: true,
      },
      {
        source: "/about",
        destination: "https://docs.twentypad.com/",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
