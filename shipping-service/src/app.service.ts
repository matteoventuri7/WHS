import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';
import { PendingShipment, PendingShipmentDocument } from './schemas/pending-shipment.schema';
import { EventsGateway } from './events.gateway';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(PendingShipment.name) private pendingShipmentModel: Model<PendingShipmentDocument>,
    private readonly eventsGateway: EventsGateway,
  ) { }

  async onModuleInit() {
    this.logger.log('Connessione Kafka Producer per Shipping Service inizializzata.');
  }

  async getAllVehicles() {
    return this.vehicleModel.find().exec();
  }

  async getPendingShipments() {
    return this.pendingShipmentModel.find().exec();
  }

  async registerVehicle(vehicleId: string, maxCapacity: number) {
    const v = new this.vehicleModel({ vehicleId, maxCapacity });
    await v.save();
    this.logger.log(`Veicolo ${vehicleId} registrato (capacità: ${maxCapacity}).`);
    this.kafkaClient.emit('VehicleRegistered', { vehicleId, maxCapacity });
    this.eventsGateway.notifyDataChanged();

    // Dopo la registrazione, prova ad assegnare spedizioni pendenti
    await this.processPendingShipments();

    return v;
  }

  async handlePickingTaskCompleted(payload: { taskId: string, orderId: string, allocations: any[] }) {
    const totalItems = payload.allocations.reduce((sum, item) => sum + item.quantity, 0);

    const assigned = await this.tryAssignToVehicle(payload.taskId, payload.orderId, totalItems);

    if (!assigned) {
      // Salva come spedizione pendente per ritentare quando un veicolo sarà disponibile
      const existing = await this.pendingShipmentModel.findOne({ taskId: payload.taskId });
      if (!existing) {
        const pending = new this.pendingShipmentModel({
          taskId: payload.taskId,
          orderId: payload.orderId,
          allocations: payload.allocations,
          totalItems,
        });
        await pending.save();
        this.logger.warn(`Nessun veicolo disponibile. Task ${payload.taskId} salvato come spedizione pendente.`);
      }
    }
    this.eventsGateway.notifyDataChanged();
  }

  /**
   * Tenta di assegnare un task a un veicolo disponibile.
   * Ritorna true se l'assegnazione è avvenuta, false altrimenti.
   */
  private async tryAssignToVehicle(taskId: string, orderId: string, totalItems: number): Promise<boolean> {
    const vehicles = await this.vehicleModel.find({ status: 'AVAILABLE' }).sort({ _id: 1 });

    for (const v of vehicles) {
      if (v.maxCapacity - v.currentLoad >= totalItems) {
        v.currentLoad += totalItems;
        v.assignedTaskIds.push(taskId);
        await v.save();
        this.logger.log(`Task ${taskId} assegnato al veicolo ${v.vehicleId}.`);
        this.kafkaClient.emit('ShipmentAssigned', {
          taskId,
          orderId,
          vehicleId: v.vehicleId
        });
        return true;
      }
    }

    this.logger.warn(`Nessun veicolo con capienza sufficiente (${totalItems} items) per il Task ${taskId}.`);
    return false;
  }

  /**
   * Processa tutte le spedizioni pendenti, tentando di assegnarle ai veicoli disponibili.
   * Chiamato dopo la registrazione di un nuovo veicolo.
   */
  private async processPendingShipments() {
    const pendingShipments = await this.pendingShipmentModel.find().sort({ createdAt: 1 });

    if (pendingShipments.length === 0) {
      return;
    }

    this.logger.log(`Trovate ${pendingShipments.length} spedizioni pendenti. Tentativo di assegnazione...`);

    for (const pending of pendingShipments) {
      const assigned = await this.tryAssignToVehicle(pending.taskId, pending.orderId, pending.totalItems);
      if (assigned) {
        await this.pendingShipmentModel.deleteOne({ _id: pending._id });
        this.logger.log(`Spedizione pendente per task ${pending.taskId} assegnata e rimossa dalla coda.`);
        this.eventsGateway.notifyDataChanged();
      } else {
        // Se non riesce ad assegnare questo, i successivi probabilmente non avranno capienza
        this.logger.log(`Impossibile assegnare spedizione pendente per task ${pending.taskId}. Verrà riprovata.`);
        break;
      }
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
      this.eventsGateway.notifyDataChanged();
      return v;
    }
    throw new Error('Veicolo non trovato o non pronto');
  }
}
