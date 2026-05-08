import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingTask, PickingTaskDocument } from '../schemas/picking.schema';
import { CancelPickingTaskCommand } from './cancel-picking-task.command';

@CommandHandler(CancelPickingTaskCommand)
export class CancelPickingTaskHandler
  implements ICommandHandler<CancelPickingTaskCommand>
{
  private readonly logger = new Logger(CancelPickingTaskHandler.name);

  constructor(
    @InjectModel(PickingTask.name)
    private taskModel: Model<PickingTaskDocument>,
  ) {}

  async execute(command: CancelPickingTaskCommand) {
    const task = await this.taskModel.findOne({ orderId: command.orderId });
    if (!task) {
      this.logger.log(
        `No picking task found for order ${command.orderId}. Cancellation allowed.`,
      );
      return { success: true, message: 'No picking task associated.' };
    }

    if (task.status === 'PENDING') {
      task.status = 'CANCELLED';
      await task.save();
      this.logger.log(
        `Picking Task ${task.taskId} cancelled for order ${command.orderId}.`,
      );
      return { success: true, message: 'Picking task cancelled.' };
    }

    this.logger.warn(
      `Unable to cancel Picking Task ${task.taskId} for order ${command.orderId} (status: ${task.status}).`,
    );
    throw new Error(
      `Unable to cancel: the picking task is in status ${task.status}`,
    );
  }
}
