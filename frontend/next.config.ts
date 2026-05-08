import type { NextConfig } from "next";

function requireEnv(name: string, defaultValue?: string): string {
  return process.env[name] ?? defaultValue ?? `http://missing-env-${name.toLowerCase().replace(/_/g, '-')}`;
}

const DEFAULTS: Record<string, string> = {
  INVENTORY_SERVICE_URL: 'http://inventory-service:3001',
  ORDER_SERVICE_URL: 'http://order-service:3002',
  PICKING_SERVICE_URL: 'http://picking-service:3003',
  SHIPPING_SERVICE_URL: 'http://shipping-service:3004',
  INBOUND_SIMULATOR_URL: 'http://inventory-simulator-service:3005',
  DISPATCH_SIMULATOR_URL: 'http://shipping-simulator-service:3006',
  ORDER_SIMULATOR_URL: 'http://order-simulator-service:3007',
  PICKING_SIMULATOR_URL: 'http://picking-simulator-service:3008',
};

const nextConfig: NextConfig = {
  output: 'standalone',
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
        destination: `${requireEnv("INVENTORY_SERVICE_URL", DEFAULTS.INVENTORY_SERVICE_URL)}/inventory/:path*`,
      },
      {
        source: "/api/orders/:path*",
        destination: `${requireEnv("ORDER_SERVICE_URL", DEFAULTS.ORDER_SERVICE_URL)}/orders/:path*`,
      },
      {
        source: "/api/picking/:path*",
        destination: `${requireEnv("PICKING_SERVICE_URL", DEFAULTS.PICKING_SERVICE_URL)}/picking/:path*`,
      },
      {
        source: "/api/shipping/:path*",
        destination: `${requireEnv("SHIPPING_SERVICE_URL", DEFAULTS.SHIPPING_SERVICE_URL)}/shipping/:path*`,
      },
      {
        source: "/api/inbound/:path*",
        destination: `${requireEnv("INBOUND_SIMULATOR_URL", DEFAULTS.INBOUND_SIMULATOR_URL)}/inbound/:path*`,
      },
      {
        source: "/api/dispatch/:path*",
        destination: `${requireEnv("DISPATCH_SIMULATOR_URL", DEFAULTS.DISPATCH_SIMULATOR_URL)}/dispatch/:path*`,
      },
      {
        source: "/api/order-simulator/:path*",
        destination: `${requireEnv("ORDER_SIMULATOR_URL", DEFAULTS.ORDER_SIMULATOR_URL)}/order-simulator/:path*`,
      },
      {
        source: "/api/picking-simulator/:path*",
        destination: `${requireEnv("PICKING_SIMULATOR_URL", DEFAULTS.PICKING_SIMULATOR_URL)}/picking-simulator/:path*`,
      },
    ];
  },
};

export default nextConfig;
