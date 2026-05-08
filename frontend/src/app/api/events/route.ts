import { NextRequest } from 'next/server';
import { Kafka } from 'kafkajs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getKafka() {
  const broker = process.env.KAFKA_BROKER;
  if (!broker) {
    throw new Error('Missing required environment variable: KAFKA_BROKER');
  }
  return new Kafka({
    clientId: 'nexus-frontend-dashboard',
    brokers: [broker],
  });
}

export async function GET(req: NextRequest) {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId: `dashboard-consumer-${Date.now()}` });

  try {
    await consumer.connect();
  } catch (error: any) {
    console.error('Failed to connect to Kafka:', error?.message || error);
    return new Response(
      JSON.stringify({ error: 'Failed to connect to Kafka', details: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const topics = [
    'GoodsArriving', 'OrderPlaced', 'OrderCancelled', 'OrderReadyForPicking',
    'OrderSuspended', 'InventoryAllocated', 'OutOfStock', 'ItemStored',
    'PickingTaskCreated', 'PickingTaskCompleted', 'ShipmentAssigned',
    'VehicleDispatched', 'VehicleRegistered'
  ];

  try {
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
  } catch (error: any) {
    console.error('Failed to subscribe to Kafka topics:', error?.message || error);
    await consumer.disconnect();
    return new Response(
      JSON.stringify({ error: 'Failed to subscribe to topics', details: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial SSE comment to flush the connection and trigger onopen
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Periodic heartbeat to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      consumer.run({
        eachMessage: async ({ topic, message }) => {
          const value = message.value?.toString() || '';
          try {
            const data = JSON.stringify({ topic, payload: JSON.parse(value) });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            const data = JSON.stringify({ topic, payload: value });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        },
      });

      // Cleanup when the client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        consumer.disconnect().catch(() => {});
        controller.close();
      });
    },
    cancel() {
      consumer.disconnect().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
