import { Body, Controller, Get, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('inventory')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('receive')
  async receiveGoods(
    @Body() body: { productId: string; quantity: number; location: string },
  ) {
    return this.appService.receiveGoods(
      body.productId,
      Number(body.quantity),
      body.location,
    );
  }

  @Get()
  async getInventory() {
    return this.appService.getAllInventory();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'inventory' };
  }

  @EventPattern('OrderPlaced')
  async handleOrderPlaced(@Payload() message: any) {
    if (message && message.orderId) {
      await this.appService.handleOrderPlaced(message);
    }
  }

  @EventPattern('OrderCancelled')
  async handleOrderCancelled(@Payload() message: any) {
    if (message && message.orderId) {
      await this.appService.handleOrderCancelled(message);
    }
  }
}
