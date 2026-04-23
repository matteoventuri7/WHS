import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema()
export class Vehicle {
  @Prop({ required: true })
  vehicleId: string;

  @Prop({ required: true })
  maxCapacity: number;

  @Prop({ required: true, default: 0 })
  currentLoad: number;

  @Prop({ type: [String], default: [] })
  assignedTaskIds: string[];

  @Prop({
    required: true,
    enum: ['AVAILABLE', 'DISPATCHED'],
    default: 'AVAILABLE',
  })
  status: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
