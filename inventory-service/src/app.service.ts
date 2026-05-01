import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventory, InventoryDocument } from './schemas/inventory.schema';
import { EventsGateway } from './events.gateway';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Inventory.name)
    private inventoryModel: Model<InventoryDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.log('Connessione Kafka Producer inizializzata.');
  }

  async receiveGoods(productId: string, quantity: number, location: string) {
    const item = await this.inventoryModel.findOneAndUpdate(
      { productId, location },
      { $inc: { quantity: quantity }, $setOnInsert: { reservedQuantity: 0 } },
      { returnDocument: 'after', upsert: true },
    );

    this.logger.log(
      `Ricevute ${quantity} unità di ${productId} nella locazione ${location}.`,
    );

    // Emette l'evento che nuova merce è stata immagazzinata
    this.kafkaClient.emit('ItemStored', {
      productId,
      location,
      addedQuantity: quantity,
      totalQuantity: item.quantity,
    });

    this.eventsGateway.notifyDataChanged();
    return item;
  }

  async getAllInventory() {
    return this.inventoryModel.find().exec();
  }

  async handleOrderPlaced(payload: {
    orderId: string;
    items: { productId: string; quantity: number }[];
  }) {
    this.logger.log(
      `Ricevuto evento OrderPlaced per ordine ${payload.orderId}`,
    );
    const allocations: {
      productId: string;
      quantity: number;
      location: string;
    }[] = [];
    let canAllocate = true;

    for (const reqItem of payload.items) {
      let required = reqItem.quantity;

      while (required > 0) {
        const stockDocument = await this.inventoryModel.findOne({
          productId: reqItem.productId,
          quantity: { $gt: 0 },
          $expr: {
            $gt: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0],
          },
        });

        if (!stockDocument) {
          break; // Nessuna locazione con stock disponibile
        }

        const available =
          stockDocument.quantity - stockDocument.reservedQuantity;
        const toReserve = Math.min(required, available);

        const updatedStock = await this.inventoryModel.findOneAndUpdate(
          {
            _id: stockDocument._id,
            $expr: {
              $gte: [
                { $subtract: ['$quantity', '$reservedQuantity'] },
                toReserve,
              ],
            },
          },
          { $inc: { reservedQuantity: toReserve } },
          { returnDocument: 'after' },
        );

        if (updatedStock) {
          allocations.push({
            productId: reqItem.productId,
            quantity: toReserve,
            location: stockDocument.location,
          });
          required -= toReserve;
        }
      }

      if (required > 0) {
        canAllocate = false; // Impossibile allocare l'intera quantità richiesta per questo articolo
        break;
      }
    }

    if (canAllocate) {
      this.logger.log(`Ordine ${payload.orderId} allocato correttamente.`);
      this.kafkaClient.emit('InventoryAllocated', {
        orderId: payload.orderId,
        allocations,
      });
    } else {
      this.logger.warn(
        `OutOfStock per ordine ${payload.orderId}. Reverting eventuali prenotazioni parziali.`,
      );
      // Rollback delle riserve parziali in modo atomico
      for (const alloc of allocations) {
        await this.inventoryModel.updateOne(
          { productId: alloc.productId, location: alloc.location },
          { $inc: { reservedQuantity: -alloc.quantity } },
        );
      }
      this.kafkaClient.emit('OutOfStock', { orderId: payload.orderId });
    }
    this.eventsGateway.notifyDataChanged();
  }

  async handleOrderCancelled(payload: {
    orderId: string;
    previousStatus: string;
    allocations?: any[];
  }) {
    this.logger.log(
      `Ricevuto evento OrderCancelled per ordine ${payload.orderId}`,
    );
    if (payload.allocations && payload.allocations.length > 0) {
      this.logger.log(
        `Annullamento allocazioni per ordine ${payload.orderId}. Ripristino stock...`,
      );
      for (const alloc of payload.allocations) {
        await this.inventoryModel.updateOne(
          { productId: alloc.productId, location: alloc.location },
          { $inc: { reservedQuantity: -alloc.quantity } },
        );
      }
      this.logger.log(
        `Stock liberato con successo per ordine ${payload.orderId}`,
      );
    }
    this.eventsGateway.notifyDataChanged();
  }
}
