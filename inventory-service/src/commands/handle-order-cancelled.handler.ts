import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventory, InventoryDocument } from '../schemas/inventory.schema';
import { HandleOrderCancelledCommand } from './handle-order-cancelled.command';

@CommandHandler(HandleOrderCancelledCommand)
export class HandleOrderCancelledHandler
  implements ICommandHandler<HandleOrderCancelledCommand>
{
  private readonly logger = new Logger(HandleOrderCancelledHandler.name);

  constructor(
    @InjectModel(Inventory.name)
    private inventoryModel: Model<InventoryDocument>,
  ) {}

  async execute(command: HandleOrderCancelledCommand) {
    this.logger.log(
      `Received OrderCancelled event for order ${command.orderId}`,
    );
    if (command.allocations && command.allocations.length > 0) {
      this.logger.log(
        `Cancelling allocations for order ${command.orderId}. Restoring stock...`,
      );
      for (const alloc of command.allocations) {
        await this.inventoryModel.updateOne(
          { productId: alloc.productId, location: alloc.location },
          { $inc: { reservedQuantity: -alloc.quantity } },
        );
      }
      this.logger.log(
        `Stock successfully freed for order ${command.orderId}`,
      );
    }
  }
}
