import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { HandlePickingCompletedCommand } from './handle-picking-completed.command';

@CommandHandler(HandlePickingCompletedCommand)
export class HandlePickingCompletedHandler
  implements ICommandHandler<HandlePickingCompletedCommand>
{
  private readonly logger = new Logger(HandlePickingCompletedHandler.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: HandlePickingCompletedCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (!order) {
      return;
    }

    if (order.status !== 'ALLOCATED') {
      return;
    }

    order.status = 'PICKING_COMPLETED';
    await order.save();
    this.logger.log(`Order ${order.orderId} updated to PICKING_COMPLETED.`);
  }
}
