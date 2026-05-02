import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventory, InventoryDocument } from '../schemas/inventory.schema';
import { EventsGateway } from '../events.gateway';
import { ReceiveGoodsCommand } from './receive-goods.command';

@CommandHandler(ReceiveGoodsCommand)
export class ReceiveGoodsHandler
  implements ICommandHandler<ReceiveGoodsCommand>
{
  private readonly logger = new Logger(ReceiveGoodsHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Inventory.name)
    private inventoryModel: Model<InventoryDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(command: ReceiveGoodsCommand) {
    const item = await this.inventoryModel.findOneAndUpdate(
      { productId: command.productId, location: command.location },
      {
        $inc: { quantity: command.quantity },
        $setOnInsert: { reservedQuantity: 0 },
      },
      { returnDocument: 'after', upsert: true },
    );

    this.logger.log(
      `Ricevute ${command.quantity} unità di ${command.productId} nella locazione ${command.location}.`,
    );

    this.kafkaClient.emit('ItemStored', {
      productId: command.productId,
      location: command.location,
      addedQuantity: command.quantity,
      totalQuantity: item.quantity,
    });

    this.eventsGateway.notifyDataChanged();
    return item;
  }
}
