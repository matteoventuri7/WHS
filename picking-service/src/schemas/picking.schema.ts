import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PickingTaskDocument = PickingTask & Document;

@Schema()
export class PickingTask {
    @Prop({ required: true, default: () => new Date().getTime().toString() })
    taskId: string;

    @Prop({ required: true })
    orderId: string;

    @Prop()
    allocations: any[];

    @Prop({ required: true, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' })
    status: string;
}

export const PickingTaskSchema = SchemaFactory.createForClass(PickingTask);
