import {
  Controller,
  Get,
  Param,
  Post,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('picking')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('tasks')
  async getTasks() {
    return this.appService.getAllTasks();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'picking' };
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

  @Post('tasks/order/:orderId/cancel')
  async cancelTaskForOrder(@Param('orderId') orderId: string) {
    try {
      return await this.appService.cancelPickingTask(orderId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
