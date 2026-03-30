import { model, models } from 'mongoose';
import { Order, OrderSchema } from '../src/schemas/order.schema';

describe('OrderSchema', () => {
  it('should apply defaults for orderId and status', () => {
    const OrderModel = models.OrderSchemaTest || model('OrderSchemaTest', OrderSchema);

    const doc = new OrderModel({
      items: [{ productId: 'P1', quantity: 2 }],
    }) as Order;

    expect(doc.orderId).toBeDefined();
    expect(typeof doc.orderId).toBe('string');
    expect(doc.status).toBe('PENDING');
  });
});
