import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    placeOrder(body: {
        items: {
            productId: string;
            quantity: number;
        }[];
    }): Promise<import("mongoose").Document<unknown, {}, import("./schemas/order.schema").OrderDocument, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/order.schema").Order & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    }>;
    getOrders(): Promise<(import("mongoose").Document<unknown, {}, import("./schemas/order.schema").OrderDocument, {}, import("mongoose").DefaultSchemaOptions> & import("./schemas/order.schema").Order & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    } & {
        id: string;
    })[]>;
    handleInventoryAllocated(message: any): Promise<void>;
    handleOutOfStock(message: any): Promise<void>;
    handleItemStored(): Promise<void>;
    handleShipmentAssigned(message: any): Promise<void>;
}
