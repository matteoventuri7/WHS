import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../schemas/vehicle.schema';
import { DispatchVehicleCommand } from './dispatch-vehicle.command';

@CommandHandler(DispatchVehicleCommand)
export class DispatchVehicleHandler
  implements ICommandHandler<DispatchVehicleCommand>
{
  private readonly logger = new Logger(DispatchVehicleHandler.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
  ) {}

  async execute(command: DispatchVehicleCommand) {
    const v = await this.vehicleModel.findOneAndUpdate(
      { vehicleId: command.vehicleId, status: 'AVAILABLE' },
      { $set: { status: 'DISPATCHED' } },
      { returnDocument: 'after' },
    );

    if (v) {
      this.logger.log(`Veicolo ${command.vehicleId} partito!`);
      this.kafkaClient.emit('VehicleDispatched', {
        vehicleId: command.vehicleId,
        tasks: v.assignedTaskIds,
      });
      return v;
    }
    throw new Error('Veicolo non trovato o non pronto');
  }
}
