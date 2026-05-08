import type { NextConfig } from "next";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // During `next build` in CI, env vars are not available — validation
    // happens at server startup via src/instrumentation.ts before any request.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return `http://unset-${name.toLowerCase().replace(/_/g, '-')}`;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/inventory/:path*",
        destination: `${requireEnv("INVENTORY_SERVICE_URL")}/inventory/:path*`,
      },
      {
        source: "/api/orders/:path*",
        destination: `${requireEnv("ORDER_SERVICE_URL")}/orders/:path*`,
      },
      {
        source: "/api/picking/:path*",
        destination: `${requireEnv("PICKING_SERVICE_URL")}/picking/:path*`,
      },
      {
        source: "/api/shipping/:path*",
        destination: `${requireEnv("SHIPPING_SERVICE_URL")}/shipping/:path*`,
      },
      {
        source: "/api/inbound/:path*",
        destination: `${requireEnv("INBOUND_SIMULATOR_URL")}/inbound/:path*`,
      },
      {
        source: "/api/dispatch/:path*",
        destination: `${requireEnv("DISPATCH_SIMULATOR_URL")}/dispatch/:path*`,
      },
      {
        source: "/api/order-simulator/:path*",
        destination: `${requireEnv("ORDER_SIMULATOR_URL")}/order-simulator/:path*`,
      },
      {
        source: "/api/picking-simulator/:path*",
        destination: `${requireEnv("PICKING_SIMULATOR_URL")}/picking-simulator/:path*`,
      },
    ];
  },
};

export default nextConfig;
