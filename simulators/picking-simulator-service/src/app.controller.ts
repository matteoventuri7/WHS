import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('picking-simulator')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('status')
  getStatus() {
    return this.appService.getStatus();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'picking-simulator' };
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
