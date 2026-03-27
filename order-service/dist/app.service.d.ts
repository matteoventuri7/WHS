import { OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
export declare class AppService implements OnModuleInit {
    private readonly kafkaClient;
    private orderModel;
    private readonly logger;
    constructor(kafkaClient: ClientKafka, orderModel: Model<OrderDocument>);
    onModuleInit(): Promise<void>;
    placeOrder(items: {
        productId: string;
        quantity: number;
    }[]): Promise<import("mongoose").Document<unknown, {}, OrderDocument, {}, import("mongoose").DefaultSchemaOptions> & Order & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    getAllOrders(): Promise<(import("mongoose").Document<unknown, {}, OrderDocument, {}, import("mongoose").DefaultSchemaOptions> & Order & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    handleInventoryAllocated(payload: {
        orderId: string;
        allocations: any[];
    }): Promise<void>;
    handleOutOfStock(payload: {
        orderId: string;
    }): Promise<void>;
    handleItemStored(): Promise<void>;
    handleShipmentAssigned(payload: {
        orderId: string;
    }): Promise<void>;
}
