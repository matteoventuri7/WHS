import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PickingTask, PickingTaskDocument } from '../schemas/picking.schema';
import { GetAllTasksQuery } from './get-all-tasks.query';

@QueryHandler(GetAllTasksQuery)
export class GetAllTasksHandler implements IQueryHandler<GetAllTasksQuery> {
  constructor(
    @InjectModel(PickingTask.name)
    private taskModel: Model<PickingTaskDocument>,
  ) {}

  async execute() {
    return this.taskModel.find().exec();
  }
}
