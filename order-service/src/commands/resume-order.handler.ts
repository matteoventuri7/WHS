import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { ResumeOrderCommand } from './resume-order.command';

@CommandHandler(ResumeOrderCommand)
export class ResumeOrderHandler implements ICommandHandler<ResumeOrderCommand> {
  private readonly logger = new Logger(ResumeOrderHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  async execute(command: ResumeOrderCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (!order) {
      throw new Error(`Order ${command.orderId} not found`);
    }
    if (order.status !== 'SUSPENDED') {
      throw new Error(`Can only resume suspended orders`);
    }

    order.status = 'PENDING';
    await order.save();

    this.logger.log(
      `Ordine ${order.orderId} ripreso manualmente (RESUMED), in attesa di allocazione.`,
    );

    this.kafkaClient.emit('OrderPlaced', {
      orderId: order.orderId,
      items: order.items,
    });

    return order;
  }
}
