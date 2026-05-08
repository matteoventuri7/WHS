import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventory, InventoryDocument } from '../schemas/inventory.schema';
import { HandleOrderPlacedCommand } from './handle-order-placed.command';

@CommandHandler(HandleOrderPlacedCommand)
export class HandleOrderPlacedHandler
  implements ICommandHandler<HandleOrderPlacedCommand>
{
  private readonly logger = new Logger(HandleOrderPlacedHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Inventory.name)
    private inventoryModel: Model<InventoryDocument>,
  ) {}

  async execute(command: HandleOrderPlacedCommand) {
    this.logger.log(
      `Ricevuto evento OrderPlaced per ordine ${command.orderId}`,
    );
    const allocations: {
      productId: string;
      quantity: number;
      location: string;
    }[] = [];
    let canAllocate = true;

    for (const reqItem of command.items) {
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
          break;
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
        canAllocate = false;
        break;
      }
    }

    if (canAllocate) {
      this.logger.log(`Ordine ${command.orderId} allocato correttamente.`);
      this.kafkaClient.emit('InventoryAllocated', {
        orderId: command.orderId,
        allocations,
      });
    } else {
      this.logger.warn(
        `OutOfStock per ordine ${command.orderId}. Reverting eventuali prenotazioni parziali.`,
      );
      for (const alloc of allocations) {
        await this.inventoryModel.updateOne(
          { productId: alloc.productId, location: alloc.location },
          { $inc: { reservedQuantity: -alloc.quantity } },
        );
      }
      this.kafkaClient.emit('OutOfStock', { orderId: command.orderId });
    }
  }
}
