import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('dispatch')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('status')
  getStatus() {
    return this.appService.getStatus();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'dispatch' };
  }

  @Post('start')
  startSimulation(@Body() body?: { intervalMs?: number }) {
    return this.appService.startSimulation(body?.intervalMs);
  }

  @Post('stop')
  stopSimulation() {
    return this.appService.stopSimulation();
  }

  @Post('truck')
  generateTruck() {
    return this.appService.generateTruck();
  }
}
