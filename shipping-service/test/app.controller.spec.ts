import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  const mockAppService = {
    getAllVehicles: jest.fn(),
    getPendingShipments: jest.fn(),
    registerVehicle: jest.fn(),
    dispatchVehicle: jest.fn(),
    handlePickingTaskCompleted: jest.fn(),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
    jest.clearAllMocks();
  });

  describe('getVehicles', () => {
    it('should return all vehicles', async () => {
      const mockVehicles = [{ vehicleId: 'V1', maxCapacity: 10 }];
      mockAppService.getAllVehicles.mockResolvedValue(mockVehicles);

      const result = await appController.getVehicles();
      expect(result).toEqual(mockVehicles);
      expect(mockAppService.getAllVehicles).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPendingShipments', () => {
    it('should return all pending shipments', async () => {
      const mockShipments = [{ taskId: 'T1' }];
      mockAppService.getPendingShipments.mockResolvedValue(mockShipments);

      const result = await appController.getPendingShipments();
      expect(result).toEqual(mockShipments);
      expect(mockAppService.getPendingShipments).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toEqual({ status: 'ok', service: 'shipping' });
    });
  });

  describe('registerVehicle', () => {
    it('should register a new vehicle', async () => {
      const body = { vehicleId: 'V1', maxCapacity: 10 };
      mockAppService.registerVehicle.mockResolvedValue(body);

      const result = await appController.registerVehicle(body);
      expect(result).toEqual(body);
      expect(mockAppService.registerVehicle).toHaveBeenCalledWith('V1', 10);
    });
  });

  describe('dispatchVehicle', () => {
    it('should dispatch an existing vehicle', async () => {
      const mockDispatched = { vehicleId: 'V1', status: 'DISPATCHED' };
      mockAppService.dispatchVehicle.mockResolvedValue(mockDispatched);

      const result = await appController.dispatchVehicle('V1');
      expect(result).toEqual(mockDispatched);
      expect(mockAppService.dispatchVehicle).toHaveBeenCalledWith('V1');
    });
  });

  describe('handlePickingTaskCompleted', () => {
    it('should handle picking task completed event', async () => {
      const message = { taskId: 'T1', orderId: 'O1', allocations: [] };

      await appController.handlePickingTaskCompleted(message);
      expect(mockAppService.handlePickingTaskCompleted).toHaveBeenCalledWith(
        message,
      );
    });

    it('should not call service if message or taskId is absent', async () => {
      await appController.handlePickingTaskCompleted(null);
      await appController.handlePickingTaskCompleted({});
      expect(mockAppService.handlePickingTaskCompleted).not.toHaveBeenCalled();
    });
  });
});
