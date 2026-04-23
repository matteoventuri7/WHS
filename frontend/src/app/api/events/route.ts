import { NextRequest } from 'next/server';
import { Kafka } from 'kafkajs';

export const dynamic = 'force-dynamic';

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:29092';

const kafka = new Kafka({
  clientId: 'nexus-frontend-dashboard',
  brokers: [KAFKA_BROKER],
});

// Helper per gestire l'SSE stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      if (typeof iterator.return === 'function') {
        iterator.return();
      }
    },
  });
}

export async function GET(req: NextRequest) {
  const consumer = kafka.consumer({ groupId: `dashboard-consumer-${Date.now()}` });

  await consumer.connect();
  
  const topics = [
    'GoodsArriving', 'OrderPlaced', 'OrderCancelled', 'OrderReadyForPicking',
    'OrderSuspended', 'InventoryAllocated', 'OutOfStock', 'ItemStored',
    'PickingTaskCreated', 'PickingTaskCompleted', 'ShipmentAssigned',
    'VehicleDispatched', 'VehicleRegistered'
  ];

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  const encoder = new TextEncoder();
  
  const iterator = (async function* () {
    let messageQueue: { topic: string, value: string }[] = [];
    let resolveNext: (() => void) | null = null;

    consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const value = message.value?.toString() || '';
        messageQueue.push({ topic, value });
        if (resolveNext) {
          resolveNext();
        }
      },
    });

    try {
      while (true) {
        if (messageQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
          resolveNext = null;
        }

        const msg = messageQueue.shift();
        if (msg) {
          const data = JSON.stringify({ topic: msg.topic, payload: JSON.parse(msg.value) });
          yield encoder.encode(`data: ${data}\n\n`);
        }
      }
    } finally {
      await consumer.disconnect();
    }
  })();

  req.signal.addEventListener('abort', () => {
    consumer.disconnect();
  });

  const stream = iteratorToStream(iterator);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
