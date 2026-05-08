import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { HandleItemStoredCommand } from './handle-item-stored.command';

@CommandHandler(HandleItemStoredCommand)
export class HandleItemStoredHandler
  implements ICommandHandler<HandleItemStoredCommand>
{
  private readonly logger = new Logger(HandleItemStoredHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute() {
    const suspendedOrders = await this.orderModel
      .find({ status: 'SUSPENDED' })
      .sort({ _id: 1 });
    for (const order of suspendedOrders) {
      this.logger.log(
        `Restoring and retrying allocation for suspended order ${order.orderId}`,
      );
      this.kafkaClient.emit('OrderPlaced', {
        orderId: order.orderId,
        items: order.items,
      });
    }
  }
}
