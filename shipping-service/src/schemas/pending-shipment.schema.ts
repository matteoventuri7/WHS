import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingShipmentDocument = PendingShipment & Document;

@Schema()
export class PendingShipment {
  @Prop({ required: true })
  taskId: string;

  @Prop({ required: true })
  orderId: string;

  @Prop({ type: Array, default: [] })
  allocations: any[];

  @Prop({ required: true })
  totalItems: number;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const PendingShipmentSchema =
  SchemaFactory.createForClass(PendingShipment);
