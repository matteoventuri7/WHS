/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates all required environment variables before the server
 * accepts any request, so a missing var causes an immediate, clear error.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const required = [
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

    const missing = required.filter((name) => !process.env[name]);

    if (missing.length > 0) {
      throw new Error(
        `[WHS] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Check your .env.local (local dev) or docker-compose.yml (Docker).`,
      );
    }
  }
}
