import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { EventsGateway } from './events.gateway';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Connessione Kafka Producer per Order Service inizializzata.',
    );
  }

  async placeOrder(items: { productId: string; quantity: number }[]) {
    const order = new this.orderModel({ items, status: 'PENDING' });
    await order.save();

    this.logger.log(`Ordine ${order.orderId} creato in stato PENDING.`);

    this.kafkaClient.emit('OrderPlaced', {
      orderId: order.orderId,
      items: order.items,
    });

    this.eventsGateway.notifyDataChanged();
    return order;
  }

  async getAllOrders() {
    return this.orderModel.find().exec();
  }

  async cancelOrder(orderId: string) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status === 'SHIPPED') {
      throw new Error(`Cannot cancel a shipped order`);
    }
    if (order.status === 'PICKING_COMPLETED') {
      throw new Error(`Cannot cancel an order with completed picking task`);
    }
    if (order.status === 'CANCELLED') {
      return order; // Already cancelled
    }

    if (order.status === 'ALLOCATED') {
      this.kafkaClient.emit('CancelPickingTask', { orderId: order.orderId });
    }

    const previousStatus = order.status;
    order.status = 'CANCELLED';
    await order.save();

    this.logger.log(`Ordine ${order.orderId} annullato.`);

    this.kafkaClient.emit('OrderCancelled', {
      orderId: order.orderId,
      previousStatus,
      allocations: order.allocations,
    });

    this.eventsGateway.notifyDataChanged();
    return order;
  }

  async resumeOrder(orderId: string) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status !== 'SUSPENDED') {
      throw new Error(`Can only resume suspended orders`);
    }

    order.status = 'PENDING';
    await order.save();

    this.logger.log(
      `Ordine ${order.orderId} ripreso manualmente (RESUMED), in attesa di allocazione.`,
    );

    this.kafkaClient.emit('OrderPlaced', {
      orderId: order.orderId,
      items: order.items,
    });

    this.eventsGateway.notifyDataChanged();
    return order;
  }

  async handleInventoryAllocated(payload: {
    orderId: string;
    allocations: any[];
  }) {
    const order = await this.orderModel.findOne({ orderId: payload.orderId });
    if (order && order.status !== 'ALLOCATED') {
      order.status = 'ALLOCATED';
      order.allocations = payload.allocations;
      await order.save();
      this.logger.log(`Ordine ${order.orderId} aggiornato a ALLOCATED.`);

      this.kafkaClient.emit('OrderReadyForPicking', {
        orderId: order.orderId,
        allocations: order.allocations,
      });
      this.eventsGateway.notifyDataChanged();
    }
  }

  async handleOutOfStock(payload: { orderId: string }) {
    const order = await this.orderModel.findOne({ orderId: payload.orderId });
    if (order && order.status !== 'SUSPENDED') {
      order.status = 'SUSPENDED';
      await order.save();
      this.logger.log(`Ordine ${order.orderId} sospeso (OutOfStock).`);
      this.kafkaClient.emit('OrderSuspended', { orderId: order.orderId });
      this.eventsGateway.notifyDataChanged();
    }
  }

  async handleItemStored() {
    // Riprova ad allocare tutti gli ordini sospesi in ordine di arrivo
    const suspendedOrders = await this.orderModel
      .find({ status: 'SUSPENDED' })
      .sort({ _id: 1 });
    for (const order of suspendedOrders) {
      this.logger.log(
        `Ripristino e ri-tentativo di allocazione per ordine sospeso ${order.orderId}`,
      );
      this.kafkaClient.emit('OrderPlaced', {
        orderId: order.orderId,
        items: order.items,
      });
    }
  }

  async handleShipmentAssigned(payload: { orderId: string }) {
    const order = await this.orderModel.findOne({ orderId: payload.orderId });
    if (order) {
      order.status = 'SHIPPED';
      await order.save();
      this.logger.log(`Ordine ${order.orderId} aggiornato a SHIPPED.`);
      this.eventsGateway.notifyDataChanged();
    }
  }

  async handlePickingTaskCompleted(payload: { orderId: string }) {
    const order = await this.orderModel.findOne({ orderId: payload.orderId });
    if (!order) {
      return;
    }

    if (order.status !== 'ALLOCATED') {
      return;
    }

    order.status = 'PICKING_COMPLETED';
    await order.save();
    this.logger.log(`Ordine ${order.orderId} aggiornato a PICKING_COMPLETED.`);
    this.eventsGateway.notifyDataChanged();
  }
}
