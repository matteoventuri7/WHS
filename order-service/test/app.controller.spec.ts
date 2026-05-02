import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { HttpException } from '@nestjs/common';
import { PlaceOrderCommand } from '../src/commands/place-order.command';
import { CancelOrderCommand } from '../src/commands/cancel-order.command';
import { ResumeOrderCommand } from '../src/commands/resume-order.command';
import { HandleInventoryAllocatedCommand } from '../src/commands/handle-inventory-allocated.command';
import { HandleOutOfStockCommand } from '../src/commands/handle-out-of-stock.command';
import { HandleItemStoredCommand } from '../src/commands/handle-item-stored.command';
import { HandleShipmentAssignedCommand } from '../src/commands/handle-shipment-assigned.command';
import { HandlePickingCompletedCommand } from '../src/commands/handle-picking-completed.command';
import { GetAllOrdersQuery } from '../src/queries/get-all-orders.query';

describe('AppController', () => {
  let appController: AppController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  beforeEach(async () => {
    commandBus = { execute: jest.fn() } as any;
    queryBus = { execute: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  describe('placeOrder', () => {
    it('should execute PlaceOrderCommand', async () => {
      const body = { items: [{ productId: 'p1', quantity: 2 }] };
      const expectedResult = {
        orderId: 'O1',
        items: body.items,
        status: 'PENDING',
      };
      commandBus.execute.mockResolvedValue(expectedResult);

      expect(await appController.placeOrder(body)).toBe(expectedResult);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new PlaceOrderCommand(body.items),
      );
    });
  });

  describe('getOrders', () => {
    it('should execute GetAllOrdersQuery', async () => {
      const expectedResult = [{ orderId: 'O1', status: 'PENDING' }];
      queryBus.execute.mockResolvedValue(expectedResult);

      expect(await appController.getOrders()).toBe(expectedResult);
      expect(queryBus.execute).toHaveBeenCalledWith(new GetAllOrdersQuery());
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'order',
      });
    });
  });

  describe('cancelOrder', () => {
    it('should execute CancelOrderCommand', async () => {
      const orderId = 'O1';
      const expectedResult = { orderId, status: 'CANCELLED' };
      commandBus.execute.mockResolvedValue(expectedResult);

      expect(await appController.cancelOrder(orderId)).toBe(expectedResult);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new CancelOrderCommand(orderId),
      );
    });

    it('should throw HttpException if command fails', async () => {
      const orderId = 'O1';
      commandBus.execute.mockRejectedValue(
        new Error('Cannot cancel a shipped order'),
      );

      await expect(appController.cancelOrder(orderId)).rejects.toThrow(
        HttpException,
      );
      await expect(appController.cancelOrder(orderId)).rejects.toThrow(
        'Cannot cancel a shipped order',
      );
    });
  });

  describe('resumeOrder', () => {
    it('should execute ResumeOrderCommand', async () => {
      const orderId = 'O1';
      const expectedResult = { orderId, status: 'PENDING' };
      commandBus.execute.mockResolvedValue(expectedResult);

      expect(await appController.resumeOrder(orderId)).toBe(expectedResult);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new ResumeOrderCommand(orderId),
      );
    });

    it('should throw HttpException if command fails', async () => {
      const orderId = 'O1';
      commandBus.execute.mockRejectedValue(
        new Error('Can only resume suspended orders'),
      );

      await expect(appController.resumeOrder(orderId)).rejects.toThrow(
        HttpException,
      );
      await expect(appController.resumeOrder(orderId)).rejects.toThrow(
        'Can only resume suspended orders',
      );
    });
  });

  describe('handleInventoryAllocated', () => {
    it('should execute HandleInventoryAllocatedCommand if message has orderId', async () => {
      const message = { orderId: 'O1', allocations: [] };
      await appController.handleInventoryAllocated(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandleInventoryAllocatedCommand('O1', []),
      );
    });

    it('should not execute command if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleInventoryAllocated(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleOutOfStock', () => {
    it('should execute HandleOutOfStockCommand if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handleOutOfStock(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandleOutOfStockCommand('O1'),
      );
    });

    it('should not execute command if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleOutOfStock(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleItemStored', () => {
    it('should execute HandleItemStoredCommand', async () => {
      await appController.handleItemStored();
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandleItemStoredCommand(),
      );
    });
  });

  describe('handleShipmentAssigned', () => {
    it('should execute HandleShipmentAssignedCommand if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handleShipmentAssigned(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandleShipmentAssignedCommand('O1'),
      );
    });

    it('should not execute command if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleShipmentAssigned(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('handlePickingTaskCompleted', () => {
    it('should execute HandlePickingCompletedCommand if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handlePickingTaskCompleted(message);
      expect(commandBus.execute).toHaveBeenCalledWith(
        new HandlePickingCompletedCommand('O1'),
      );
    });

    it('should not execute command if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handlePickingTaskCompleted(message);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });
});
