import { model, models } from 'mongoose';
import { PickingTask, PickingTaskSchema } from '../src/schemas/picking.schema';

describe('PickingTaskSchema', () => {
  it('should apply defaults for taskId and status', () => {
    const PickingTaskModel = models.PickingSchemaTest || model('PickingSchemaTest', PickingTaskSchema);

    const doc = new PickingTaskModel({
      orderId: 'O-1',
      allocations: [{ productId: 'P1', quantity: 1 }],
    }) as PickingTask;

    expect(doc.taskId).toBeDefined();
    expect(typeof doc.taskId).toBe('string');
    expect(doc.status).toBe('PENDING');
  });
});
