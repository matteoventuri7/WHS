import { Controller, Get, Param, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CompletePickingTaskCommand } from './commands/complete-picking-task.command';
import { HandleOrderReadyForPickingCommand } from './commands/handle-order-ready-for-picking.command';
import { CancelPickingTaskCommand } from './commands/cancel-picking-task.command';
import { GetAllTasksQuery } from './queries/get-all-tasks.query';

@Controller('picking')
export class AppController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('tasks')
  async getTasks() {
    return this.queryBus.execute(new GetAllTasksQuery());
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'picking' };
  }

  @Post('tasks/:taskId/complete')
  async completeTask(@Param('taskId') taskId: string) {
    return this.commandBus.execute(new CompletePickingTaskCommand(taskId));
  }

  @EventPattern('OrderReadyForPicking')
  async handleOrderReadyForPicking(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new HandleOrderReadyForPickingCommand(
          message.orderId,
          message.allocations,
        ),
      );
    }
  }

  @EventPattern('CancelPickingTask')
  async handleCancelPickingTask(@Payload() message: any) {
    if (message && message.orderId) {
      await this.commandBus.execute(
        new CancelPickingTaskCommand(message.orderId),
      );
    }
  }
}
