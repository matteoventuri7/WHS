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
        `Nessun picking task trovato per l'ordine ${command.orderId}. Annullamento consentito.`,
      );
      return { success: true, message: 'Nessun picking task associato.' };
    }

    if (task.status === 'PENDING') {
      task.status = 'CANCELLED';
      await task.save();
      this.logger.log(
        `Picking Task ${task.taskId} annullato per ordine ${command.orderId}.`,
      );
      return { success: true, message: 'Picking task annullato.' };
    }

    this.logger.warn(
      `Impossibile annullare Picking Task ${task.taskId} per ordine ${command.orderId} (stato: ${task.status}).`,
    );
    throw new Error(
      `Impossibile annullare: il task di picking è in stato ${task.status}`,
    );
  }
}
