import { Body, Controller, Get, Post, OnModuleInit, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ClientKafka } from '@nestjs/microservices';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReceiveGoodsCommand } from './commands/receive-goods.command';
import { HandleOrderPlacedCommand } from './commands/handle-order-placed.command';
import { HandleOrderCancelledCommand } from './commands/handle-order-cancelled.command';
import { GetAllInventoryQuery } from './queries/get-all-inventory.query';

@Controller('inventory')
export class AppController implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  @Post('receive')
  async receiveGoods(
    @Body() body: { productId: string; quantity: number; location: string },
  ) {
    return this.commandBus.execute(
      new ReceiveGoodsCommand(body.productId, Number(body.quantity), body.location),
    );
  }

  @Get()
  async getInventory() {
    return this.queryBus.execute(new GetAllInventoryQuery());
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'inventory' };
  }

  @EventPattern('OrderPlaced')
  async handleOrderPlaced(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleOrderPlacedCommand(message.orderId, message.items),
      );
    }
  }

  @EventPattern('OrderCancelled')
  async handleOrderCancelled(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleOrderCancelledCommand(
          message.orderId,
          message.previousStatus,
          message.allocations,
        ),
      );
    }
  }
}
