import { CompletePickingTaskHandler } from './complete-picking-task.handler';
import { HandleOrderReadyForPickingHandler } from './handle-order-ready-for-picking.handler';
import { CancelPickingTaskHandler } from './cancel-picking-task.handler';

export const CommandHandlers = [
  CompletePickingTaskHandler,
  HandleOrderReadyForPickingHandler,
  CancelPickingTaskHandler,
];
