import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { EventsGateway } from '../events.gateway';
import { HandleShipmentAssignedCommand } from './handle-shipment-assigned.command';

@CommandHandler(HandleShipmentAssignedCommand)
export class HandleShipmentAssignedHandler
  implements ICommandHandler<HandleShipmentAssignedCommand>
{
  private readonly logger = new Logger(HandleShipmentAssignedHandler.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(command: HandleShipmentAssignedCommand) {
    const order = await this.orderModel.findOne({ orderId: command.orderId });
    if (order) {
      order.status = 'SHIPPED';
      await order.save();
      this.logger.log(`Ordine ${order.orderId} aggiornato a SHIPPED.`);
      this.eventsGateway.notifyDataChanged();
    }
  }
}
