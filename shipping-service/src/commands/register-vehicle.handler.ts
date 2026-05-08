import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../schemas/vehicle.schema';
import { ShipmentAssignmentService } from '../services/shipment-assignment.service';
import { RegisterVehicleCommand } from './register-vehicle.command';

@CommandHandler(RegisterVehicleCommand)
export class RegisterVehicleHandler
  implements ICommandHandler<RegisterVehicleCommand>
{
  private readonly logger = new Logger(RegisterVehicleHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    private readonly shipmentAssignment: ShipmentAssignmentService,
  ) {}

  async execute(command: RegisterVehicleCommand) {
    const v = new this.vehicleModel({
      vehicleId: command.vehicleId,
      maxCapacity: command.maxCapacity,
    });
    await v.save();
    this.logger.log(
      `Veicolo ${command.vehicleId} registrato (capacità: ${command.maxCapacity}).`,
    );
    this.kafkaClient.emit('VehicleRegistered', {
      vehicleId: command.vehicleId,
      maxCapacity: command.maxCapacity,
    });

    await this.shipmentAssignment.processPendingShipments();

    return v;
  }
}
