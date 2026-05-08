import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { CancelOrderCommand } from './cancel-order.command';

@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand> {
  private readonly logger = new Logger(CancelOrderHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: CancelOrderCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (!order) {
      throw new Error(`Order ${command.orderId} not found`);
    }
    if (order.status === 'SHIPPED') {
      throw new Error(`Cannot cancel a shipped order`);
    }
    if (order.status === 'PICKING_COMPLETED') {
      throw new Error(`Cannot cancel an order with completed picking task`);
    }
    if (order.status === 'CANCELLED') {
      return order;
    }

    if (order.status === 'ALLOCATED') {
      this.kafkaClient.emit('CancelPickingTask', { orderId: order.orderId });
    }

    const previousStatus = order.status;
    order.status = 'CANCELLED';
    await order.save();

    this.logger.log(`Order ${order.orderId} cancelled.`);

    this.kafkaClient.emit('OrderCancelled', {
      orderId: order.orderId,
      previousStatus,
      allocations: order.allocations,
    });

    return order;
  }
}
