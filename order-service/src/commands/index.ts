import { PlaceOrderHandler } from './place-order.handler';
import { CancelOrderHandler } from './cancel-order.handler';
import { ResumeOrderHandler } from './resume-order.handler';
import { HandleInventoryAllocatedHandler } from './handle-inventory-allocated.handler';
import { HandleOutOfStockHandler } from './handle-out-of-stock.handler';
import { HandleItemStoredHandler } from './handle-item-stored.handler';
import { HandleShipmentAssignedHandler } from './handle-shipment-assigned.handler';
import { HandlePickingCompletedHandler } from './handle-picking-completed.handler';

export const CommandHandlers = [
  PlaceOrderHandler,
  CancelOrderHandler,
  ResumeOrderHandler,
  HandleInventoryAllocatedHandler,
  HandleOutOfStockHandler,
  HandleItemStoredHandler,
  HandleShipmentAssignedHandler,
  HandlePickingCompletedHandler,
];
