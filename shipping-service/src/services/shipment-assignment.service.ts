import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../schemas/vehicle.schema';
import {
  PendingShipment,
  PendingShipmentDocument,
} from '../schemas/pending-shipment.schema';

@Injectable()
export class ShipmentAssignmentService {
  private readonly logger = new Logger(ShipmentAssignmentService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(PendingShipment.name)
    private pendingShipmentModel: Model<PendingShipmentDocument>,
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
        this.logger.log(`Task ${taskId} assigned to vehicle ${v.vehicleId}.`);
        this.kafkaClient.emit('ShipmentAssigned', {
          taskId,
          orderId,
          vehicleId: v.vehicleId,
        });
        return true;
      }
    }

    this.logger.warn(
      `No vehicle with sufficient capacity (${totalItems} items) for Task ${taskId}.`,
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
      `Found ${pendingShipments.length} pending shipments. Attempting assignment...`,
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
          `Pending shipment for task ${pending.taskId} assigned and removed from queue.`,
        );
      } else {
        this.logger.log(
          `Unable to assign pending shipment for task ${pending.taskId}. Will be retried.`,
        );
        break;
      }
    }
  }
}
