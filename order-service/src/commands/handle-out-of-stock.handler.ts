import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { HandleOutOfStockCommand } from './handle-out-of-stock.command';

@CommandHandler(HandleOutOfStockCommand)
export class HandleOutOfStockHandler
  implements ICommandHandler<HandleOutOfStockCommand>
{
  private readonly logger = new Logger(HandleOutOfStockHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: HandleOutOfStockCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (order && order.status !== 'SUSPENDED') {
      order.status = 'SUSPENDED';
      await order.save();
      this.logger.log(`Order ${order.orderId} suspended (OutOfStock).`);
      this.kafkaClient.emit('OrderSuspended', { orderId: order.orderId });
    }
  }
}
