import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingTask, PickingTaskDocument } from '../schemas/picking.schema';
import { EventsGateway } from '../events.gateway';
import { CompletePickingTaskCommand } from './complete-picking-task.command';

@CommandHandler(CompletePickingTaskCommand)
export class CompletePickingTaskHandler
  implements ICommandHandler<CompletePickingTaskCommand>
{
  private readonly logger = new Logger(CompletePickingTaskHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(PickingTask.name)
    private taskModel: Model<PickingTaskDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(command: CompletePickingTaskCommand) {
    const task = await this.taskModel.findOne({ taskId: command.taskId });
    if (task && task.status === 'PENDING') {
      task.status = 'COMPLETED';
      await task.save();
      this.logger.log(`Picking Task ${task.taskId} COMPLETATO!`);

      this.kafkaClient.emit('PickingTaskCompleted', {
        taskId: task.taskId,
        orderId: task.orderId,
        allocations: task.allocations,
      });
      this.eventsGateway.notifyDataChanged();
      return task;
    }
    throw new Error('Task non trovato o già completato');
  }
}
