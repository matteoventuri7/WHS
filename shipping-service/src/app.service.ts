import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
  ) { }

  async onModuleInit() {
    this.logger.log('Connessione Kafka Producer per Shipping Service inizializzata.');
  }

  async getAllVehicles() {
    return this.vehicleModel.find().exec();
  }

  async registerVehicle(vehicleId: string, maxCapacity: number) {
    const v = new this.vehicleModel({ vehicleId, maxCapacity });
    await v.save();
    this.logger.log(`Veicolo ${vehicleId} registrato (capacità: ${maxCapacity}).`);
    this.kafkaClient.emit('VehicleRegistered', { vehicleId, maxCapacity });
    return v;
  }

  async handlePickingTaskCompleted(payload: { taskId: string, orderId: string, allocations: any[] }) {
    // Calcoliamo il volume come somma di quantità per semplicità didattica
    const totalItems = payload.allocations.reduce((sum, item) => sum + item.quantity, 0);

    const vehicles = await this.vehicleModel.find({ status: 'AVAILABLE' }).sort({ _id: 1 });
    let assigned = false;

    for (const v of vehicles) {
      if (v.maxCapacity - v.currentLoad >= totalItems) {
        v.currentLoad += totalItems;
        v.assignedTaskIds.push(payload.taskId);
        await v.save();
        this.logger.log(`Task ${payload.taskId} assegnato al veicolo ${v.vehicleId}.`);
        this.kafkaClient.emit('ShipmentAssigned', {
          taskId: payload.taskId,
          orderId: payload.orderId,
          vehicleId: v.vehicleId
        });
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      this.logger.warn(`Nessun veicolo con capienza sufficiente (${totalItems} items) per il Task ${payload.taskId}.`);
      // In ambiente reale, gestire in una coda di attesa Shipment 'PENDING'
    }
  }

  async dispatchVehicle(vehicleId: string) {
    const v = await this.vehicleModel.findOneAndUpdate(
      { vehicleId, status: 'AVAILABLE' },
      { $set: { status: 'DISPATCHED' } },
      { new: true }
    );

    if (v) {
      this.logger.log(`Veicolo ${vehicleId} partito!`);
      this.kafkaClient.emit('VehicleDispatched', { vehicleId, tasks: v.assignedTaskIds });
      return v;
    }
    throw new Error('Veicolo non trovato o non pronto');
  }
}
