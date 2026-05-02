import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../schemas/vehicle.schema';
import {
  PendingShipment,
  PendingShipmentDocument,
} from '../schemas/pending-shipment.schema';
import { EventsGateway } from '../events.gateway';

@Injectable()
export class ShipmentAssignmentService {
  private readonly logger = new Logger(ShipmentAssignmentService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(PendingShipment.name)
    private pendingShipmentModel: Model<PendingShipmentDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async tryAssignToVehicle(
    taskId: string,
    orderId: string,
    totalItems: number,
  ): Promise<boolean> {
    const vehicles = await this.vehicleModel
      .find({ status: 'AVAILABLE' })
      .sort({ _id: 1 });

    for (const v of vehicles) {
      if (v.maxCapacity - v.currentLoad >= totalItems) {
        v.currentLoad += totalItems;
        v.assignedTaskIds.push(taskId);
        await v.save();
        this.logger.log(`Task ${taskId} assegnato al veicolo ${v.vehicleId}.`);
        this.kafkaClient.emit('ShipmentAssigned', {
          taskId,
          orderId,
          vehicleId: v.vehicleId,
        });
        return true;
      }
    }

    this.logger.warn(
      `Nessun veicolo con capienza sufficiente (${totalItems} items) per il Task ${taskId}.`,
    );
    return false;
  }

  async processPendingShipments() {
    const pendingShipments = await this.pendingShipmentModel
      .find()
      .sort({ createdAt: 1 });

    if (pendingShipments.length === 0) {
      return;
    }

    this.logger.log(
      `Trovate ${pendingShipments.length} spedizioni pendenti. Tentativo di assegnazione...`,
    );

    for (const pending of pendingShipments) {
      const assigned = await this.tryAssignToVehicle(
        pending.taskId,
        pending.orderId,
        pending.totalItems,
      );
      if (assigned) {
        await this.pendingShipmentModel.deleteOne({ _id: pending._id });
        this.logger.log(
          `Spedizione pendente per task ${pending.taskId} assegnata e rimossa dalla coda.`,
        );
        this.eventsGateway.notifyDataChanged();
      } else {
        this.logger.log(
          `Impossibile assegnare spedizione pendente per task ${pending.taskId}. Verrà riprovata.`,
        );
        break;
      }
    }
  }
}
