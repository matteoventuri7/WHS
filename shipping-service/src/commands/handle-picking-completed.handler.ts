import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PendingShipment,
  PendingShipmentDocument,
} from '../schemas/pending-shipment.schema';
import { EventsGateway } from '../events.gateway';
import { ShipmentAssignmentService } from '../services/shipment-assignment.service';
import { HandlePickingCompletedCommand } from './handle-picking-completed.command';

@CommandHandler(HandlePickingCompletedCommand)
export class HandlePickingCompletedHandler
  implements ICommandHandler<HandlePickingCompletedCommand>
{
  private readonly logger = new Logger(HandlePickingCompletedHandler.name);

  constructor(
    @InjectModel(PendingShipment.name)
    private pendingShipmentModel: Model<PendingShipmentDocument>,
    private readonly eventsGateway: EventsGateway,
    private readonly shipmentAssignment: ShipmentAssignmentService,
  ) {}

  async execute(command: HandlePickingCompletedCommand) {
    const totalItems = command.allocations.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const assigned = await this.shipmentAssignment.tryAssignToVehicle(
      command.taskId,
      command.orderId,
      totalItems,
    );

    if (!assigned) {
      const existing = await this.pendingShipmentModel.findOne({
        taskId: command.taskId,
      });
      if (!existing) {
        const pending = new this.pendingShipmentModel({
          taskId: command.taskId,
          orderId: command.orderId,
          allocations: command.allocations,
          totalItems,
        });
        await pending.save();
        this.logger.warn(
          `Nessun veicolo disponibile. Task ${command.taskId} salvato come spedizione pendente.`,
        );
      }
    }
    this.eventsGateway.notifyDataChanged();
  }
}
