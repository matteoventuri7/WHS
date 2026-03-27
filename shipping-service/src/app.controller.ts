import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('shipping')
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('vehicles')
  async getVehicles() {
    return this.appService.getAllVehicles();
  }

  @Get('pending')
  async getPendingShipments() {
    return this.appService.getPendingShipments();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'shipping' };
  }

  @Post('vehicles')
  async registerVehicle(@Body() body: { vehicleId: string, maxCapacity: number }) {
    return this.appService.registerVehicle(body.vehicleId, Number(body.maxCapacity));
  }

  @Post('vehicles/:id/dispatch')
  async dispatchVehicle(@Param('id') vehicleId: string) {
    return this.appService.dispatchVehicle(vehicleId);
  }

  @EventPattern('PickingTaskCompleted')
  async handlePickingTaskCompleted(@Payload() message: any) {
    if (message && message.taskId) {
      await this.appService.handlePickingTaskCompleted(message);
    }
  }
}
