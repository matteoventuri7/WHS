import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterVehicleCommand } from '../src/commands/register-vehicle.command';
import { DispatchVehicleCommand } from '../src/commands/dispatch-vehicle.command';
import { HandlePickingCompletedCommand } from '../src/commands/handle-picking-completed.command';
import { GetAllVehiclesQuery } from '../src/queries/get-all-vehicles.query';
import { GetPendingShipmentsQuery } from '../src/queries/get-pending-shipments.query';

describe('AppController', () => {
  let appController: AppController;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };

  beforeEach(async () => {
    commandBus = { execute: jest.fn() };
    queryBus = { execute: jest.fn() };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('getVehicles', () => {
    it('should execute GetAllVehiclesQuery', async () => {
      const mockVehicles = [{ vehicleId: 'V1', maxCapacity: 10 }];
      queryBus.execute.mockResolvedValue(mockVehicles);

      const result = await appController.getVehicles();
      expect(result).toEqual(mockVehicles);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetAllVehiclesQuery());
    });
  });

  describe('getPendingShipments', () => {
    it('should execute GetPendingShipmentsQuery', async () => {
      const mockShipments = [{ taskId: 'T1' }];
      queryBus.execute.mockResolvedValue(mockShipments);

      const result = await appController.getPendingShipments();
      expect(result).toEqual(mockShipments);
      expect(queryBus.execute).toHaveBeenCalledWith(
        new GetPendingShipmentsQuery(),
      );
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toEqual({ status: 'ok', service: 'shipping' });
    });
  });

  describe('registerVehicle', () => {
    it('should execute RegisterVehicleCommand', async () => {
      const body = { vehicleId: 'V1', maxCapacity: 10 };
      commandBus.execute.mockResolvedValue(body);

      const result = await appController.registerVehicle(body);
      expect(result).toEqual(body);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new RegisterVehicleCommand('V1', 10),
      );
    });
  });

  describe('dispatchVehicle', () => {
    it('should execute DispatchVehicleCommand', async () => {
      const mockDispatched = { vehicleId: 'V1', status: 'DISPATCHED' };
      commandBus.execute.mockResolvedValue(mockDispatched);

      const result = await appController.dispatchVehicle('V1');
      expect(result).toEqual(mockDispatched);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new DispatchVehicleCommand('V1'),
      );
    });
  });

  describe('handlePickingTaskCompleted', () => {
    it('should execute HandlePickingCompletedCommand', async () => {
      const message = {
        taskId: 'T1',
        orderId: 'O1',
        allocations: [{ quantity: 3 }],
      };
      commandBus.execute.mockResolvedValue(undefined);

      await appController.handlePickingTaskCompleted(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandlePickingCompletedCommand('T1', 'O1', [{ quantity: 3 }]),
      );
    });

    it('should not execute command if message or taskId is absent', async () => {
      await appController.handlePickingTaskCompleted(null);
      await appController.handlePickingTaskCompleted({});
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });
});
