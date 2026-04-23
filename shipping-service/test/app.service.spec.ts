import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AppService } from '../src/app.service';
import { EventsGateway } from '../src/events.gateway';
import { Vehicle } from '../src/schemas/vehicle.schema';
import { PendingShipment } from '../src/schemas/pending-shipment.schema';

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

describe('AppService', () => {
  let service: AppService;
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
        AppService,
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

    service = module.get<AppService>(AppService);
    kafkaClient = module.get('KAFKA_CLIENT');
    eventsGateway = module.get(EventsGateway);

    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should log on init', async () => {
      const loggerSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();
      await service.onModuleInit();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Connessione Kafka Producer per Shipping Service inizializzata.',
      );
    });
  });

  describe('getAllVehicles', () => {
    it('should return all vehicles', async () => {
      mockQuery.exec.mockResolvedValueOnce([{ vehicleId: 'V1' }]);
      const result = await service.getAllVehicles();
      expect(result).toEqual([{ vehicleId: 'V1' }]);
      expect(MockVehicleModel.find).toHaveBeenCalled();
    });
  });

  describe('getPendingShipments', () => {
    it('should return pending shipments', async () => {
      mockQuery.exec.mockResolvedValueOnce([{ taskId: 'T1' }]);
      const result = await service.getPendingShipments();
      expect(result).toEqual([{ taskId: 'T1' }]);
      expect(MockPendingShipmentModel.find).toHaveBeenCalled();
    });
  });

  describe('registerVehicle', () => {
    it('should save vehicle and emit events', async () => {
      // Mock pending shipments empty to simplify
      mockQuery.sort.mockResolvedValueOnce([]);

      const result = await service.registerVehicle('V1', 10);
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

      // the processPendingShipments accesses vehicleModel.find()
      const mockVehicle = new MockVehicleModel({
        _id: '1',
        vehicleId: 'V1',
        maxCapacity: 10,
        currentLoad: 0,
        assignedTaskIds: [],
      });

      // Second sort is from vehicleModel.find()
      mockQuery.sort.mockResolvedValueOnce([mockVehicle]);

      await service.registerVehicle('V1', 10);

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

  describe('dispatchVehicle', () => {
    it('should dispatch successfully', async () => {
      const v = {
        vehicleId: 'V1',
        status: 'AVAILABLE',
        assignedTaskIds: ['T1'],
      };
      MockVehicleModel.findOneAndUpdate.mockResolvedValueOnce(v);

      const result = await service.dispatchVehicle('V1');
      expect(result).toEqual(v);
      expect(kafkaClient.emit).toHaveBeenCalledWith('VehicleDispatched', {
        vehicleId: 'V1',
        tasks: ['T1'],
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should throw an error if vehicle not found', async () => {
      MockVehicleModel.findOneAndUpdate.mockResolvedValueOnce(null);

      await expect(service.dispatchVehicle('V2')).rejects.toThrow(
        'Veicolo non trovato o non pronto',
      );
    });
  });

  describe('handlePickingTaskCompleted', () => {
    it('should save as pending shipment if no vehicle available', async () => {
      mockQuery.sort.mockResolvedValueOnce([]);
      MockPendingShipmentModel.findOne.mockResolvedValueOnce(null);

      const payload = {
        taskId: 'T1',
        orderId: 'O1',
        allocations: [{ quantity: 5 }],
      };
      await service.handlePickingTaskCompleted(payload);

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

      const payload = {
        taskId: 'T1',
        orderId: 'O1',
        allocations: [{ quantity: 5 }],
      };
      await service.handlePickingTaskCompleted(payload);

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
  });
});
