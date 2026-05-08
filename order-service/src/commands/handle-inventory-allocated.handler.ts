import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { HandleInventoryAllocatedCommand } from './handle-inventory-allocated.command';

@CommandHandler(HandleInventoryAllocatedCommand)
export class HandleInventoryAllocatedHandler
  implements ICommandHandler<HandleInventoryAllocatedCommand>
{
  private readonly logger = new Logger(HandleInventoryAllocatedHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: HandleInventoryAllocatedCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (order && order.status !== 'ALLOCATED') {
      order.status = 'ALLOCATED';
      order.allocations = command.allocations;
      await order.save();
      this.logger.log(`Order ${order.orderId} updated to ALLOCATED.`);

      this.kafkaClient.emit('OrderReadyForPicking', {
        orderId: order.orderId,
        allocations: order.allocations,
      });
    }
  }
}
