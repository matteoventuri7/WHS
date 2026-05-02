import { ReceiveGoodsHandler } from './receive-goods.handler';
import { HandleOrderPlacedHandler } from './handle-order-placed.handler';
import { HandleOrderCancelledHandler } from './handle-order-cancelled.handler';

export const CommandHandlers = [
  ReceiveGoodsHandler,
  HandleOrderPlacedHandler,
  HandleOrderCancelledHandler,
];
