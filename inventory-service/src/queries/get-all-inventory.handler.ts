import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventory, InventoryDocument } from '../schemas/inventory.schema';
import { GetAllInventoryQuery } from './get-all-inventory.query';

@QueryHandler(GetAllInventoryQuery)
export class GetAllInventoryHandler
  implements IQueryHandler<GetAllInventoryQuery>
{
  constructor(
    @InjectModel(Inventory.name)
    private inventoryModel: Model<InventoryDocument>,
  ) {}

  async execute() {
    return this.inventoryModel.find().exec();
  }
}
