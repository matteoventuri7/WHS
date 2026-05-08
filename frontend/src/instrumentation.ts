/**
 * Next.js instrumentation hook — runs once at server startup.
 * Warns about missing environment variables. Services will use
 * Docker-network defaults from next.config.ts if not explicitly set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const recommended = [
      'INVENTORY_SERVICE_URL',
      'ORDER_SERVICE_URL',
      'PICKING_SERVICE_URL',
      'SHIPPING_SERVICE_URL',
      'INBOUND_SIMULATOR_URL',
      'DISPATCH_SIMULATOR_URL',
      'ORDER_SIMULATOR_URL',
      'PICKING_SIMULATOR_URL',
      'KAFKA_BROKER',
      'OPENOBSERVE_URL',
      'KAFKA_HOST',
      'KAFKA_PORT',
      'FLUENTBIT_HOST',
      'FLUENTBIT_PORT',
    ];

    const missing = recommended.filter((name) => !process.env[name]);

    if (missing.length > 0) {
      console.warn(
        `[WHS] Missing environment variables (using defaults where available):\n  ${missing.join('\n  ')}\n` +
        `Set them in .env.local (local dev) or docker-compose.yml (Docker) for explicit configuration.`,
      );
    }
  }
}
