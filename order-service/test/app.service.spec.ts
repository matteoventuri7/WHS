import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from '../src/app.service';
import { getModelToken } from '@nestjs/mongoose';
import { Order } from '../src/schemas/order.schema';
import { EventsGateway } from '../src/events.gateway';

describe('AppService', () => {
  let appService: AppService;
  let kafkaClient: any;
  let orderModel: any;
  let eventsGateway: any;

  beforeEach(async () => {
    kafkaClient = {
      emit: jest.fn(),
    };

    eventsGateway = {
      notifyDataChanged: jest.fn(),
    };

    orderModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      orderId: 'O1',
      save: jest.fn().mockResolvedValue(true),
    }));

    orderModel.find = jest.fn();
    orderModel.findOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: 'KAFKA_CLIENT', useValue: kafkaClient },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: EventsGateway, useValue: eventsGateway },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(appService).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should log initialization message', async () => {
      const loggerSpy = jest.spyOn(appService['logger'], 'log').mockImplementation();
      await appService.onModuleInit();
      expect(loggerSpy).toHaveBeenCalledWith('Connessione Kafka Producer per Order Service inizializzata.');
    });
  });

  describe('placeOrder', () => {
    it('should place a new order and emit OrderPlaced event', async () => {
      const items = [{ productId: 'p1', quantity: 10 }];
      const result = await appService.placeOrder(items);

      expect(result.status).toBe('PENDING');
      expect(result.items).toEqual(items);
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: 'O1',
        items: items,
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });
  });

  describe('getAllOrders', () => {
    it('should return all orders', async () => {
      const orders = [{ orderId: 'O1', status: 'PENDING' }];
      orderModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(orders) });

      const result = await appService.getAllOrders();
      expect(result).toBe(orders);
      expect(orderModel.find).toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    let mockFetch: jest.SpyInstance;

    beforeEach(() => {
      mockFetch = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      mockFetch.mockRestore();
    });

    it('should throw Error if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await expect(appService.cancelOrder('O1')).rejects.toThrow('Order O1 not found');
    });

    it('should throw Error if order is shipped', async () => {
      orderModel.findOne.mockResolvedValue({ orderId: 'O1', status: 'SHIPPED' });
      await expect(appService.cancelOrder('O1')).rejects.toThrow('Cannot cancel a shipped order');
    });

    it('should return order immediately if already cancelled', async () => {
      const order = { orderId: 'O1', status: 'CANCELLED' };
      orderModel.findOne.mockResolvedValue(order);
      const result = await appService.cancelOrder('O1');
      expect(result).toBe(order);
      expect(order.status).toBe('CANCELLED');
    });

    it('should cancel pending order and emit OrderCancelled event', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        allocations: [],
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);

      const result = await appService.cancelOrder('O1');

      expect(order.status).toBe('CANCELLED');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderCancelled', {
        orderId: 'O1',
        previousStatus: 'PENDING',
        allocations: []
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(order);
    });

    it('should try to cancel picking task if order is ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        allocations: [],
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      });

      const result = await appService.cancelOrder('O1');

      expect(mockFetch).toHaveBeenCalledWith('http://picking-service:3003/picking/tasks/order/O1/cancel', {
        method: 'POST'
      });
      expect(order.status).toBe('CANCELLED');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderCancelled', {
        orderId: 'O1',
        previousStatus: 'ALLOCATED',
        allocations: []
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(order);
    });

    it('should throw Error if picking task cancellation fails for ALLOCATED order', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        allocations: [],
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);
      mockFetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Task already completed' })
      });

      await expect(appService.cancelOrder('O1')).rejects.toThrow('Impossibile annullare ordine: Task already completed');
    });
  });

  describe('resumeOrder', () => {
    it('should throw Error if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);
      await expect(appService.resumeOrder('O1')).rejects.toThrow('Order O1 not found');
    });

    it('should throw Error if order is not suspended', async () => {
      const order = { orderId: 'O1', status: 'PENDING' };
      orderModel.findOne.mockResolvedValue(order);
      await expect(appService.resumeOrder('O1')).rejects.toThrow('Can only resume suspended orders');
    });

    it('should resume order and emit OrderPlaced event', async () => {
      const order = {
        orderId: 'O1',
        status: 'SUSPENDED',
        items: [{ productId: 'p1', quantity: 1 }],
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);

      const result = await appService.resumeOrder('O1');

      expect(order.status).toBe('PENDING');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: 'O1',
        items: order.items
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
      expect(result).toBe(order);
    });
  });

  describe('handleInventoryAllocated', () => {
    it('should update order status to ALLOCATED and emit OrderReadyForPicking', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        allocations: [],
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);

      await appService.handleInventoryAllocated({ orderId: 'O1', allocations: ['a1'] });

      expect(order.status).toBe('ALLOCATED');
      expect(order.allocations).toEqual(['a1']);
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderReadyForPicking', {
        orderId: 'O1',
        allocations: ['a1']
      });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is already ALLOCATED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        save: jest.fn()
      };
      orderModel.findOne.mockResolvedValue(order);

      await appService.handleInventoryAllocated({ orderId: 'O1', allocations: ['a1'] });

      expect(order.save).not.toHaveBeenCalled();
    });
  });

  describe('handleOutOfStock', () => {
    it('should update order status to SUSPENDED and emit OrderSuspended', async () => {
      const order = {
        orderId: 'O1',
        status: 'PENDING',
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);

      await appService.handleOutOfStock({ orderId: 'O1' });

      expect(order.status).toBe('SUSPENDED');
      expect(order.save).toHaveBeenCalled();
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderSuspended', { orderId: 'O1' });
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is already SUSPENDED', async () => {
      const order = {
        orderId: 'O1',
        status: 'SUSPENDED',
        save: jest.fn()
      };
      orderModel.findOne.mockResolvedValue(order);

      await appService.handleOutOfStock({ orderId: 'O1' });

      expect(order.save).not.toHaveBeenCalled();
    });
  });

  describe('handleItemStored', () => {
    it('should re-emit OrderPlaced for all suspended orders', async () => {
      const order1 = { orderId: 'O1', items: [{ productId: 'p1', quantity: 1 }], status: 'SUSPENDED' };
      const order2 = { orderId: 'O2', items: [{ productId: 'p2', quantity: 2 }], status: 'SUSPENDED' };

      const findResult = {
        sort: jest.fn().mockResolvedValue([order1, order2])
      };
      orderModel.find.mockReturnValue(findResult);

      await appService.handleItemStored();

      expect(orderModel.find).toHaveBeenCalledWith({ status: 'SUSPENDED' });
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: order1.orderId,
        items: order1.items
      });
      expect(kafkaClient.emit).toHaveBeenCalledWith('OrderPlaced', {
        orderId: order2.orderId,
        items: order2.items
      });
    });
  });

  describe('handleShipmentAssigned', () => {
    it('should update order status to SHIPPED', async () => {
      const order = {
        orderId: 'O1',
        status: 'ALLOCATED',
        save: jest.fn().mockResolvedValue(true)
      };
      orderModel.findOne.mockResolvedValue(order);

      await appService.handleShipmentAssigned({ orderId: 'O1' });

      expect(order.status).toBe('SHIPPED');
      expect(order.save).toHaveBeenCalled();
      expect(eventsGateway.notifyDataChanged).toHaveBeenCalled();
    });

    it('should do nothing if order is not found', async () => {
      orderModel.findOne.mockResolvedValue(null);

      await appService.handleShipmentAssigned({ orderId: 'O1' });
    });
  });
});
