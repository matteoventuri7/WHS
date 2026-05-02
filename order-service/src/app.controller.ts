import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PlaceOrderCommand } from './commands/place-order.command';
import { CancelOrderCommand } from './commands/cancel-order.command';
import { ResumeOrderCommand } from './commands/resume-order.command';
import { HandleInventoryAllocatedCommand } from './commands/handle-inventory-allocated.command';
import { HandleOutOfStockCommand } from './commands/handle-out-of-stock.command';
import { HandleItemStoredCommand } from './commands/handle-item-stored.command';
import { HandleShipmentAssignedCommand } from './commands/handle-shipment-assigned.command';
import { HandlePickingCompletedCommand } from './commands/handle-picking-completed.command';
import { GetAllOrdersQuery } from './queries/get-all-orders.query';

@Controller('orders')
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async placeOrder(
    @Body() body: { items: { productId: string; quantity: number }[] },
  ) {
    return this.commandBus.execute(new PlaceOrderCommand(body.items));
  }

  @Get()
  async getOrders() {
    return this.queryBus.execute(new GetAllOrdersQuery());
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'order' };
  }

  @Patch(':id/cancel')
  async cancelOrder(@Param('id') id: string) {
    try {
      return await this.commandBus.execute(new CancelOrderCommand(id));
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id/resume')
  async resumeOrder(@Param('id') id: string) {
    try {
      return await this.commandBus.execute(new ResumeOrderCommand(id));
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @EventPattern('InventoryAllocated')
  async handleInventoryAllocated(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleInventoryAllocatedCommand(
          message.orderId,
          message.allocations,
        ),
      );
    }
  }

  @EventPattern('OutOfStock')
  async handleOutOfStock(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleOutOfStockCommand(message.orderId),
      );
    }
  }

  @EventPattern('ItemStored')
  async handleItemStored() {
    await this.commandBus.execute(new HandleItemStoredCommand());
  }

  @EventPattern('ShipmentAssigned')
  async handleShipmentAssigned(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleShipmentAssignedCommand(message.orderId),
      );
    }
  }

  @EventPattern('PickingTaskCompleted')
  async handlePickingTaskCompleted(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandlePickingCompletedCommand(message.orderId),
      );
    }
  }
}
