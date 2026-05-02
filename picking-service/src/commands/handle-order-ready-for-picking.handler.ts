import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingTask, PickingTaskDocument } from '../schemas/picking.schema';
import { EventsGateway } from '../events.gateway';
import { HandleOrderReadyForPickingCommand } from './handle-order-ready-for-picking.command';

@CommandHandler(HandleOrderReadyForPickingCommand)
export class HandleOrderReadyForPickingHandler
  implements ICommandHandler<HandleOrderReadyForPickingCommand>
{
  private readonly logger = new Logger(HandleOrderReadyForPickingHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(PickingTask.name)
    private taskModel: Model<PickingTaskDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async execute(command: HandleOrderReadyForPickingCommand) {
    let task = await this.taskModel.findOne({ orderId: command.orderId });
    if (!task) {
      task = new this.taskModel({
        orderId: command.orderId,
        allocations: command.allocations,
        status: 'PENDING',
      });
      await task.save();
      this.logger.log(
        `Picking Task ${task.taskId} creato per ordine ${task.orderId}`,
      );

      this.kafkaClient.emit('PickingTaskCreated', {
        taskId: task.taskId,
        orderId: task.orderId,
        allocations: task.allocations,
      });
      this.eventsGateway.notifyDataChanged();
    }
  }
}
