import { model, models } from 'mongoose';
import { PendingShipment, PendingShipmentSchema } from '../src/schemas/pending-shipment.schema';
import { Vehicle, VehicleSchema } from '../src/schemas/vehicle.schema';

describe('Shipping schemas', () => {
  it('should apply createdAt default in PendingShipment schema', () => {
    const PendingShipmentModel = models.PendingShipmentSchemaTest || model('PendingShipmentSchemaTest', PendingShipmentSchema);

    const doc = new PendingShipmentModel({
      taskId: 'T-1',
      orderId: 'O-1',
      totalItems: 3,
    }) as PendingShipment;

    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.allocations).toEqual([]);
  });

  it('should apply default values in Vehicle schema', () => {
    const VehicleModel = models.VehicleSchemaTest || model('VehicleSchemaTest', VehicleSchema);

    const doc = new VehicleModel({
      vehicleId: 'V-1',
      maxCapacity: 100,
    }) as Vehicle;

    expect(doc.currentLoad).toBe(0);
    expect(doc.assignedTaskIds).toEqual([]);
    expect(doc.status).toBe('AVAILABLE');
  });
});
