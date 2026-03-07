import { Controller, Get, Param, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('picking')
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('tasks')
  async getTasks() {
    return this.appService.getAllTasks();
  }

  @Post('tasks/:taskId/complete')
  async completeTask(@Param('taskId') taskId: string) {
    return this.appService.completePickingTask(taskId);
  }

  @EventPattern('OrderReadyForPicking')
  async handleOrderReadyForPicking(@Payload() message: any) {
    if (message && message.orderId) {
      await this.appService.handleOrderReadyForPicking(message);
    }
  }
}
