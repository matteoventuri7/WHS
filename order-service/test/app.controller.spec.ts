import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<Partial<AppService>>;

  beforeEach(async () => {
    appService = {
      placeOrder: jest.fn(),
      getAllOrders: jest.fn(),
      cancelOrder: jest.fn(),
      resumeOrder: jest.fn(),
      handleInventoryAllocated: jest.fn(),
      handleOutOfStock: jest.fn(),
      handleItemStored: jest.fn(),
      handleShipmentAssigned: jest.fn(),
      handlePickingTaskCompleted: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  describe('placeOrder', () => {
    it('should place an order', async () => {
      const body = { items: [{ productId: 'p1', quantity: 2 }] };
      const expectedResult = { orderId: 'O1', items: body.items, status: 'PENDING' };
      (appService.placeOrder as jest.Mock).mockResolvedValue(expectedResult);

      expect(await appController.placeOrder(body)).toBe(expectedResult);
      expect(appService.placeOrder).toHaveBeenCalledWith(body.items);
    });
  });

  describe('getOrders', () => {
    it('should return all orders', async () => {
      const expectedResult = [{ orderId: 'O1', status: 'PENDING' }];
      (appService.getAllOrders as jest.Mock).mockResolvedValue(expectedResult);

      expect(await appController.getOrders()).toBe(expectedResult);
      expect(appService.getAllOrders).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok', service: 'order' });
    });
  });

  describe('cancelOrder', () => {
    it('should cancel the order', async () => {
      const orderId = 'O1';
      const expectedResult = { orderId, status: 'CANCELLED' };
      (appService.cancelOrder as jest.Mock).mockResolvedValue(expectedResult);

      expect(await appController.cancelOrder(orderId)).toBe(expectedResult);
      expect(appService.cancelOrder).toHaveBeenCalledWith(orderId);
    });

    it('should throw HttpException if cancelOrder fails', async () => {
      const orderId = 'O1';
      (appService.cancelOrder as jest.Mock).mockRejectedValue(new Error('Cannot cancel a shipped order'));

      await expect(appController.cancelOrder(orderId)).rejects.toThrow(HttpException);
      await expect(appController.cancelOrder(orderId)).rejects.toThrow('Cannot cancel a shipped order');
    });
  });

  describe('resumeOrder', () => {
    it('should resume the order', async () => {
      const orderId = 'O1';
      const expectedResult = { orderId, status: 'PENDING' };
      (appService.resumeOrder as jest.Mock).mockResolvedValue(expectedResult);

      expect(await appController.resumeOrder(orderId)).toBe(expectedResult);
      expect(appService.resumeOrder).toHaveBeenCalledWith(orderId);
    });

    it('should throw HttpException if resumeOrder fails', async () => {
      const orderId = 'O1';
      (appService.resumeOrder as jest.Mock).mockRejectedValue(new Error('Can only resume suspended orders'));

      await expect(appController.resumeOrder(orderId)).rejects.toThrow(HttpException);
      await expect(appController.resumeOrder(orderId)).rejects.toThrow('Can only resume suspended orders');
    });
  });

  describe('handleInventoryAllocated', () => {
    it('should handle inventory allocated if message has orderId', async () => {
      const message = { orderId: 'O1', allocations: [] };
      await appController.handleInventoryAllocated(message);
      expect(appService.handleInventoryAllocated).toHaveBeenCalledWith(message);
    });

    it('should not call service if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleInventoryAllocated(message);
      expect(appService.handleInventoryAllocated).not.toHaveBeenCalled();
    });
  });

  describe('handleOutOfStock', () => {
    it('should handle out of stock if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handleOutOfStock(message);
      expect(appService.handleOutOfStock).toHaveBeenCalledWith(message);
    });

    it('should not call service if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleOutOfStock(message);
      expect(appService.handleOutOfStock).not.toHaveBeenCalled();
    });
  });

  describe('handleItemStored', () => {
    it('should handle item stored', async () => {
      await appController.handleItemStored();
      expect(appService.handleItemStored).toHaveBeenCalled();
    });
  });

  describe('handleShipmentAssigned', () => {
    it('should handle shipment assigned if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handleShipmentAssigned(message);
      expect(appService.handleShipmentAssigned).toHaveBeenCalledWith(message);
    });

    it('should not call service if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handleShipmentAssigned(message);
      expect(appService.handleShipmentAssigned).not.toHaveBeenCalled();
    });
  });

  describe('handlePickingTaskCompleted', () => {
    it('should handle picking task completed if message has orderId', async () => {
      const message = { orderId: 'O1' };
      await appController.handlePickingTaskCompleted(message);
      expect(appService.handlePickingTaskCompleted).toHaveBeenCalledWith(message);
    });

    it('should not call service if message is missing orderId', async () => {
      const message = { other: 'data' };
      await appController.handlePickingTaskCompleted(message);
      expect(appService.handlePickingTaskCompleted).not.toHaveBeenCalled();
    });
  });
});
