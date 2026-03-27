import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('orders')
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Post()
  async placeOrder(@Body() body: { items: { productId: string, quantity: number }[] }) {
    return this.appService.placeOrder(body.items);
  }

  @Get()
  async getOrders() {
    return this.appService.getAllOrders();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'order' };
  }

  @Patch(':id/cancel')
  async cancelOrder(@Param('id') id: string) {
    return this.appService.cancelOrder(id);
  }

  @EventPattern('InventoryAllocated')
  async handleInventoryAllocated(@Payload() message: any) {
    if (message && message.orderId) {
      await this.appService.handleInventoryAllocated(message);
    }
  }

  @EventPattern('OutOfStock')
  async handleOutOfStock(@Payload() message: any) {
    if (message && message.orderId) {
      await this.appService.handleOutOfStock(message);
    }
  }

  @EventPattern('ItemStored')
  async handleItemStored() {
    await this.appService.handleItemStored();
  }

  @EventPattern('ShipmentAssigned')
  async handleShipmentAssigned(@Payload() message: any) {
    if (message && message.orderId) {
      // Potrebbe essere implementato.
      await this.appService.handleShipmentAssigned(message);
    }
  }
}
