import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventsGateway } from '../src/events.gateway';
import { Vehicle } from '../src/schemas/vehicle.schema';
import { PendingShipment } from '../src/schemas/pending-shipment.schema';
import { RegisterVehicleHandler } from '../src/commands/register-vehicle.handler';
import { DispatchVehicleHandler } from '../src/commands/dispatch-vehicle.handler';
import { HandlePickingCompletedHandler } from '../src/commands/handle-picking-completed.handler';
import { GetAllVehiclesHandler } from '../src/queries/get-all-vehicles.handler';
import { GetPendingShipmentsHandler } from '../src/queries/get-pending-shipments.handler';
import { ShipmentAssignmentService } from '../src/services/shipment-assignment.service';
import { RegisterVehicleCommand } from '../src/commands/register-vehicle.command';
import { DispatchVehicleCommand } from '../src/commands/dispatch-vehicle.command';
import { HandlePickingCompletedCommand } from '../src/commands/handle-picking-completed.command';
import { GetAllVehiclesQuery } from '../src/queries/get-all-vehicles.query';
import { GetPendingShipmentsQuery } from '../src/queries/get-pending-shipments.query';

const mockSave = jest.fn();

class MockVehicleModel {
  currentLoad: number;
  maxCapacity: number;
  assignedTaskIds: string[];
  vehicleId: string;

  constructor(public data?: any) {
    if (data) {
      Object.assign(this, data);
    }
    this.currentLoad = this.data?.currentLoad || 0;
    this.maxCapacity = this.data?.maxCapacity || 0;
    this.assignedTaskIds = this.data?.assignedTaskIds || [];
    this.vehicleId = this.data?.vehicleId || 'V1';
  }

  save = mockSave;

  static find = jest.fn();
  static findOneAndUpdate = jest.fn();
}

class MockPendingShipmentModel {
  constructor(public data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }
  save = mockSave;
  static find = jest.fn();
  static findOne = jest.fn();
  static deleteOne = jest.fn();
}

describe('Shipping Handlers', () => {
  let registerVehicleHandler: RegisterVehicleHandler;
  let dispatchVehicleHandler: DispatchVehicleHandler;
  let handlePickingCompletedHandler: HandlePickingCompletedHandler;
  let getAllVehiclesHandler: GetAllVehiclesHandler;
  let getPendingShipmentsHandler: GetPendingShipmentsHandler;
  let shipmentAssignment: ShipmentAssignmentService;
  let kafkaClient: any;
  let eventsGateway: any;

  const mockQuery = {
    exec: jest.fn(),
    sort: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    mockSave.mockClear();
    mockSave.mockResolvedValue(true);
    MockVehicleModel.find.mockReturnValue(mockQuery);
    MockVehicleModel.findOneAndUpdate.mockReturnValue(mockQuery);
    MockPendingShipmentModel.find.mockReturnValue(mockQuery);
    MockPendingShipmentModel.findOne.mockReturnValue(mockQuery);
    MockPendingShipmentModel.deleteOne.mockReturnValue(mockQuery);

    const mockKafkaClient = { emit: jest.fn() };
    const mockEventsGateway = { notifyDataChanged: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterVehicleHandler,
        DispatchVehicleHandler,
        HandlePickingCompletedHandler,
        GetAllVehiclesHandler,
        GetPendingShipmentsHandler,
        ShipmentAssignmentService,
        {
          provide: getModelToken(Vehicle.name),
          useValue: MockVehicleModel,
        },
        {
          provide: getModelToken(PendingShipment.name),
          useValue: MockPendingShipmentModel,
        },
        {
          provide: 'KAFKA_CLIENT',
          useValue: mockKafkaClient,
        },
        {
          provide: EventsGateway,
          useValue: mockEventsGateway,
        },
      ],
    }).compile();

    registerVehicleHandler = module.get(RegisterVehicleHandler);
    dispatchVehicleHandler = module.get(DispatchVehicleHandler);
    handlePickingCompletedHandler = module.get(HandlePickingCompletedHandler);
    getAllVehiclesHandler = module.get(GetAllVehiclesHandler);
    getPendingShipmentsHandler = module.get(GetPendingShipmentsHandler);
    shipmentAssignment = module.get(ShipmentAssignmentService);
    kafkaClient = module.get('KAFKA_CLIENT');
    eventsGateway = module.get(EventsGateway);

    jest.clearAllMocks();
  });

  describe('GetAllVehiclesHandler', () => {
    it('should return all vehicles', async () => {
      mockQuery.exec.mockResolvedValueOnce([{ vehicleId: 'V1' }]);
      const result = await getAllVehiclesHandler.execute(
        new GetAllVehiclesQuery(),
      );
      expect(result).toEqual([{ vehicleId: 'V1' }]);
      expect(MockVehicleModel.find).toHaveBeenCalled();
    });
  });

  describe('GetPendingShipmentsHandler', () => {
    it('should return pending shipments', async () => {
      mockQuery.exec.mockResolvedValueOnce([{ taskId: 'T1' }]);
      const result = await getPendingShipmentsHandler.execute(
        new GetPendingShipmentsQuery(),
      );
      expect(result).toEqual([{ taskId: 'T1' }]);
      expect(MockPendingShipmentModel.find).toHaveBeenCalled();
    });
  });

  describe('RegisterVehicleHandler', () => {
    it('should save vehicle and emit events', async () => {
      // Mock pending shipments empty to simplify
      mockQuery.sort.mockResolvedValueOnce([]);

      const result = await registerVehicleHandler.execute(
        new RegisterVehicleCommand('V1', 10),
      );
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(kafkaClient.emit).toHaveBeenCalledWith('VehicleRegistered', {
        vehicleId: 'V1',
        maxCapacity: 10,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result.vehicleId).toEqual('V1');
    });

    it('should assign pending shipments if registered vehicle has capacity', async () => {
      const mockPending = {
        taskId: 'T1',
        orderId: 'O1',
        totalItems: 5,
        _id: '123',
      };
      mockQuery.sort.mockResolvedValueOnce([mockPending]); // from pending ship

      const mockVehicle = new MockVehicleModel({
        _id: '1',
        vehicleId: 'V1',
        maxCapacity: 10,
        currentLoad: 0,
        assignedTaskIds: [],
      });

      // Second sort is from vehicleModel.find()
      mockQuery.sort.mockResolvedValueOnce([mockVehicle]);

      await registerVehicleHandler.execute(
        new RegisterVehicleCommand('V1', 10),
      );

      expect(mockVehicle.currentLoad).toBe(5);
      expect(MockPendingShipmentModel.deleteOne).toHaveBeenCalledWith({
        _id: '123',
      });
      expect(kafkaClient.emit).toHaveBeenCalledWith('ShipmentAssigned', {
        taskId: 'T1',
        orderId: 'O1',
        vehicleId: 'V1',
      });
    });
  });

  describe('DispatchVehicleHandler', () => {
    it('should dispatch successfully', async () => {
      const v = {
        vehicleId: 'V1',
        status: 'AVAILABLE',
        assignedTaskIds: ['T1'],
      };
      MockVehicleModel.findOneAndUpdate.mockResolvedValueOnce(v);

      const result = await dispatchVehicleHandler.execute(
        new DispatchVehicleCommand('V1'),
      );
      expect(result).toEqual(v);
      expect(kafkaClient.emit).toHaveBeenCalledWith('VehicleDispatched', {
        vehicleId: 'V1',
        tasks: ['T1'],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should throw an error if vehicle not found', async () => {
      MockVehicleModel.findOneAndUpdate.mockResolvedValueOnce(null);

      await expect(
        dispatchVehicleHandler.execute(new DispatchVehicleCommand('V2')),
      ).rejects.toThrow('Veicolo non trovato o non pronto');
    });
  });

  describe('HandlePickingCompletedHandler', () => {
    it('should save as pending shipment if no vehicle available', async () => {
      mockQuery.sort.mockResolvedValueOnce([]);
      MockPendingShipmentModel.findOne.mockResolvedValueOnce(null);

      await handlePickingCompletedHandler.execute(
        new HandlePickingCompletedCommand('T1', 'O1', [{ quantity: 5 }]),
      );

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should assign to vehicle if one is available', async () => {
      const mockVehicle = new MockVehicleModel({
        _id: '1',
        vehicleId: 'V1',
        maxCapacity: 10,
        currentLoad: 0,
        assignedTaskIds: [],
      });
      mockQuery.sort.mockResolvedValueOnce([mockVehicle]);

      await handlePickingCompletedHandler.execute(
        new HandlePickingCompletedCommand('T1', 'O1', [{ quantity: 5 }]),
      );

      expect(mockVehicle.currentLoad).toBe(5);
      expect(mockVehicle.assignedTaskIds).toContain('T1');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(kafkaClient.emit).toHaveBeenCalledWith('ShipmentAssigned', {
        taskId: 'T1',
        orderId: 'O1',
        vehicleId: 'V1',
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should break assignment if a pending shipment cannot be assigned', async () => {
      const mockPending1 = { taskId: 'T1', orderId: 'O1', totalItems: 5, _id: '123' };
      const mockPending2 = { taskId: 'T2', orderId: 'O2', totalItems: 50, _id: '124' };
      
      const mockVehicle = new MockVehicleModel({
        _id: '1', vehicleId: 'V1', maxCapacity: 10, currentLoad: 0, assignedTaskIds: [],
      });

      // pendingShipments.find().sort()
      mockQuery.sort.mockResolvedValueOnce([mockPending1, mockPending2]);
      
      // vehicleModel.find().sort() per ogni pending
      mockQuery.sort.mockResolvedValueOnce([mockVehicle]);
      mockQuery.sort.mockResolvedValueOnce([mockVehicle]);

      await shipmentAssignment.processPendingShipments();
      
      expect(MockPendingShipmentModel.deleteOne).toHaveBeenCalledWith({ _id: '123' });
      expect(MockPendingShipmentModel.deleteOne).not.toHaveBeenCalledWith({ _id: '124' });
    });
  });
});
