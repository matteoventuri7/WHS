import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('order-simulator')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('status')
  getStatus() {
    return this.appService.getStatus();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'order-simulator' };
  }

  @Post('start')
  startSimulation(@Body() body?: { intervalMs?: number }) {
    return this.appService.startSimulation(body?.intervalMs);
  }

  @Post('stop')
  stopSimulation() {
    return this.appService.stopSimulation();
  }
}
