import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingTask, PickingTaskDocument } from './schemas/picking.schema';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(PickingTask.name) private taskModel: Model<PickingTaskDocument>,
  ) { }

  async onModuleInit() {
    this.logger.log('Connessione Kafka Producer per Picking Service inizializzata.');
  }

  async getAllTasks() {
    return this.taskModel.find().exec();
  }

  async handleOrderReadyForPicking(payload: { orderId: string, allocations: any[] }) {
    // Verifichiamo di non aver già creato il task
    let task = await this.taskModel.findOne({ orderId: payload.orderId });
    if (!task) {
      task = new this.taskModel({
        orderId: payload.orderId,
        allocations: payload.allocations,
        status: 'PENDING',
      });
      await task.save();
      this.logger.log(`Picking Task ${task.taskId} creato per ordine ${task.orderId}`);

      this.kafkaClient.emit('PickingTaskCreated', {
        taskId: task.taskId,
        orderId: task.orderId,
        allocations: task.allocations
      });
    }
  }

  async completePickingTask(taskId: string) {
    const task = await this.taskModel.findOne({ taskId });
    if (task && task.status === 'PENDING') {
      task.status = 'COMPLETED';
      await task.save();
      this.logger.log(`Picking Task ${task.taskId} COMPLETATO!`);

      this.kafkaClient.emit('PickingTaskCompleted', {
        taskId: task.taskId,
        orderId: task.orderId,
        allocations: task.allocations
      });
      return task;
    }
    throw new Error('Task non trovato o già completato');
  }
}
