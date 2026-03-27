import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema()
class OrderItem {
    @Prop({ required: true })
    productId: string;

    @Prop({ required: true })
    quantity: number;
}

@Schema()
export class Order {
    @Prop({ required: true, default: () => new Date().getTime().toString() })
    orderId: string;

    @Prop({ type: [OrderItem], required: true })
    items: OrderItem[];

    @Prop({ required: true, enum: ['PENDING', 'SUSPENDED', 'ALLOCATED', 'SHIPPED', 'CANCELLED'], default: 'PENDING' })
    status: string;

    @Prop()
    allocations: any[]; // Salva allocazioni specifiche quando InventoryAllocated arriva
}

export const OrderSchema = SchemaFactory.createForClass(Order);
