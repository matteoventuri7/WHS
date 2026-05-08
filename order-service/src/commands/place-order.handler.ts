import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { PlaceOrderCommand } from './place-order.command';

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: PlaceOrderCommand) {
    const order = new this.orderModel({
      items: command.items,
      status: 'PENDING',
    });
    await order.save();

    this.logger.log(`Ordine ${order.orderId} creato in stato PENDING.`);

    this.kafkaClient.emit('OrderPlaced', {
      orderId: order.orderId,
      items: order.items,
    });

    return order;
  }
}
