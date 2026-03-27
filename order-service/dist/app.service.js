"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const order_schema_1 = require("./schemas/order.schema");
const events_gateway_1 = require("./events.gateway");
let AppService = AppService_1 = class AppService {
    kafkaClient;
    orderModel;
    eventsGateway;
    logger = new common_1.Logger(AppService_1.name);
    constructor(kafkaClient, orderModel, eventsGateway) {
        this.kafkaClient = kafkaClient;
        this.orderModel = orderModel;
        this.eventsGateway = eventsGateway;
    }
    async onModuleInit() {
        this.logger.log('Connessione Kafka Producer per Order Service inizializzata.');
    }
    async placeOrder(items) {
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
    async cancelOrder(orderId) {
        const order = await this.orderModel.findOne({ orderId });
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        if (order.status === 'SHIPPED') {
            throw new Error(`Cannot cancel a shipped order`);
        }
        if (order.status === 'CANCELLED') {
            return order;
        }
        if (order.status === 'ALLOCATED') {
            try {
                const response = await fetch(`http://picking-service:3003/picking/tasks/order/${orderId}/cancel`, {
                    method: 'POST',
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Il task di picking è già in progress o completato.');
                }
            }
            catch (error) {
                this.logger.error(`Impossibile annullare picking task: ${error.message}`);
                throw new Error(`Impossibile annullare ordine: ${error.message}`);
            }
        }
        const previousStatus = order.status;
        order.status = 'CANCELLED';
        await order.save();
        this.logger.log(`Ordine ${order.orderId} annullato.`);
        this.kafkaClient.emit('OrderCancelled', {
            orderId: order.orderId,
            previousStatus,
            allocations: order.allocations
        });
        this.eventsGateway.notifyDataChanged();
        return order;
    }
    async resumeOrder(orderId) {
        const order = await this.orderModel.findOne({ orderId });
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        if (order.status !== 'SUSPENDED') {
            throw new Error(`Can only resume suspended orders`);
        }
        order.status = 'PENDING';
        await order.save();
        this.logger.log(`Ordine ${order.orderId} ripreso manualmente (RESUMED), in attesa di allocazione.`);
        this.kafkaClient.emit('OrderPlaced', {
            orderId: order.orderId,
            items: order.items,
        });
        this.eventsGateway.notifyDataChanged();
        return order;
    }
    async handleInventoryAllocated(payload) {
        const order = await this.orderModel.findOne({ orderId: payload.orderId });
        if (order && order.status !== 'ALLOCATED') {
            order.status = 'ALLOCATED';
            order.allocations = payload.allocations;
            await order.save();
            this.logger.log(`Ordine ${order.orderId} aggiornato a ALLOCATED.`);
            this.kafkaClient.emit('OrderReadyForPicking', {
                orderId: order.orderId,
                allocations: order.allocations
            });
            this.eventsGateway.notifyDataChanged();
        }
    }
    async handleOutOfStock(payload) {
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
        const suspendedOrders = await this.orderModel.find({ status: 'SUSPENDED' }).sort({ _id: 1 });
        for (const order of suspendedOrders) {
            this.logger.log(`Ripristino e ri-tentativo di allocazione per ordine sospeso ${order.orderId}`);
            this.kafkaClient.emit('OrderPlaced', {
                orderId: order.orderId,
                items: order.items,
            });
        }
    }
    async handleShipmentAssigned(payload) {
        const order = await this.orderModel.findOne({ orderId: payload.orderId });
        if (order) {
            order.status = 'SHIPPED';
            await order.save();
            this.logger.log(`Ordine ${order.orderId} aggiornato a SHIPPED.`);
            this.eventsGateway.notifyDataChanged();
        }
    }
};
exports.AppService = AppService;
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('KAFKA_CLIENT')),
    __param(1, (0, mongoose_1.InjectModel)(order_schema_1.Order.name)),
    __metadata("design:paramtypes", [microservices_1.ClientKafka,
        mongoose_2.Model,
        events_gateway_1.EventsGateway])
], AppService);
//# sourceMappingURL=app.service.js.map