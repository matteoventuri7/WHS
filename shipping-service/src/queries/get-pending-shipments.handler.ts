import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PendingShipment,
  PendingShipmentDocument,
} from '../schemas/pending-shipment.schema';
import { GetPendingShipmentsQuery } from './get-pending-shipments.query';

@QueryHandler(GetPendingShipmentsQuery)
export class GetPendingShipmentsHandler
  implements IQueryHandler<GetPendingShipmentsQuery>
{
  constructor(
    @InjectModel(PendingShipment.name)
    private pendingShipmentModel: Model<PendingShipmentDocument>,
  ) {}

  async execute() {
    return this.pendingShipmentModel.find().exec();
  }
}
