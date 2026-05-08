import { NextResponse } from 'next/server';
import net from 'net';

type ServiceDef = {
  name: string;
  url: string;
  healthPath: string;
  type: 'http' | 'tcp';
};

const ENV_DEFAULTS: Record<string, string> = {
  INVENTORY_SERVICE_URL: 'http://inventory-service:3001',
  ORDER_SERVICE_URL: 'http://order-service:3002',
  PICKING_SERVICE_URL: 'http://picking-service:3003',
  SHIPPING_SERVICE_URL: 'http://shipping-service:3004',
  INBOUND_SIMULATOR_URL: 'http://inventory-simulator-service:3005',
  DISPATCH_SIMULATOR_URL: 'http://shipping-simulator-service:3006',
  ORDER_SIMULATOR_URL: 'http://order-simulator-service:3007',
  PICKING_SIMULATOR_URL: 'http://picking-simulator-service:3008',
  OPENOBSERVE_URL: 'http://openobserve:5080',
  KAFKA_HOST: 'kafka',
  KAFKA_PORT: '9092',
  FLUENTBIT_HOST: 'fluent-bit',
  FLUENTBIT_PORT: '24224',
};

function requireEnv(name: string): string {
  return process.env[name] || ENV_DEFAULTS[name] || '';
}

function getServiceDefinitions(): { services: ServiceDef[]; infrastructure: ServiceDef[] } {
  const services: ServiceDef[] = [
    {
      name: 'Inventory Service',
      url: requireEnv('INVENTORY_SERVICE_URL'),
      healthPath: '/inventory/health',
      type: 'http',
    },
    {
      name: 'Order Service',
      url: requireEnv('ORDER_SERVICE_URL'),
      healthPath: '/orders/health',
      type: 'http',
    },
    {
      name: 'Picking Service',
      url: requireEnv('PICKING_SERVICE_URL'),
      healthPath: '/picking/health',
      type: 'http',
    },
    {
      name: 'Shipping Service',
      url: requireEnv('SHIPPING_SERVICE_URL'),
      healthPath: '/shipping/health',
      type: 'http',
    },
    {
      name: 'Inventory Simulator',
      url: requireEnv('INBOUND_SIMULATOR_URL'),
      healthPath: '/inbound/health',
      type: 'http',
    },
    {
      name: 'Shipping Simulator',
      url: requireEnv('DISPATCH_SIMULATOR_URL'),
      healthPath: '/dispatch/health',
      type: 'http',
    },
    {
      name: 'Picking Simulator',
      url: requireEnv('PICKING_SIMULATOR_URL'),
      healthPath: '/picking-simulator/health',
      type: 'http',
    },
  ];

  const infrastructure: ServiceDef[] = [
    {
      name: 'OpenObserve',
      url: requireEnv('OPENOBSERVE_URL'),
      healthPath: '/',
      type: 'http',
    },
    {
      name: 'Kafka Broker',
      url: `tcp://${requireEnv('KAFKA_HOST')}:${requireEnv('KAFKA_PORT')}`,
      healthPath: '',
      type: 'tcp',
    },
    {
      name: 'Fluent-Bit',
      url: `tcp://${requireEnv('FLUENTBIT_HOST')}:${requireEnv('FLUENTBIT_PORT')}`,
      healthPath: '',
      type: 'tcp',
    },
  ];

  return { services, infrastructure };
}

function checkTcpPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function checkService(def: ServiceDef): Promise<{ name: string; status: 'online' | 'offline' }> {
  try {
    if (def.type === 'tcp') {
      const url = new URL(def.url);
      const online = await checkTcpPort(url.hostname, parseInt(url.port));
      return { name: def.name, status: online ? 'online' : 'offline' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${def.url}${def.healthPath}`, { signal: controller.signal });
    clearTimeout(timeout);
    return { name: def.name, status: res.ok ? 'online' : 'offline' };
  } catch {
    return { name: def.name, status: 'offline' };
  }
}

export async function GET() {
  const { services, infrastructure } = getServiceDefinitions();

  const [serviceResults, infraResults] = await Promise.all([
    Promise.all(services.map(checkService)),
    Promise.all(infrastructure.map(checkService)),
  ]);

  return NextResponse.json({ services: serviceResults, infrastructure: infraResults });
}
