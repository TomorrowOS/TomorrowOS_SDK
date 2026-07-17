const internalUrl =
  process.env.TOMORROWOS_INTERNAL_URL || "http://127.0.0.1:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: "/:path*",
          destination: `${internalUrl}/:path*`
        }
      ]
    };
  }
};

export default nextConfig;
